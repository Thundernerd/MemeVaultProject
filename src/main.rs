mod auth;
mod autotag;
mod binaries;
mod config;
mod cookies;
mod db;
mod discord;
mod error;
mod ffprobe;
mod files;
mod gallerydl;
mod oidc;
mod queue;
mod routes;
mod state;
mod ytdlp;

use crate::config::Config;
use crate::db::Db;
use crate::queue::QueueHandle;
use crate::state::AppState;
use axum::extract::Request;
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Redirect, Response};
use axum::Router;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let config = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&config.log_level)),
        )
        .init();

    std::fs::create_dir_all(&config.data_dir)?;
    std::fs::create_dir_all(config.bin_dir())?;
    std::fs::create_dir_all(config.cookies_dir())?;

    let db = Db::open(&config)?;
    let queue = Arc::new(QueueHandle::new());
    queue::start_queue_processor(db.clone(), config.clone(), queue.clone());

    let state = AppState {
        db: db.clone(),
        config: config.clone(),
        queue,
        discord: Arc::new(Mutex::new(None)),
    };

    // Background binary bootstrap
    {
        let db = db.clone();
        let cfg = config.clone();
        tokio::spawn(async move {
            binaries::ensure_binaries(&db, &cfg).await;
        });
    }

    discord::start_if_configured(state.clone()).await;

    let oidc = match oidc::try_build_oidc(&config).await {
        Ok(o) => o.map(Arc::new),
        Err(e) => {
            tracing::warn!("OIDC init failed: {e:#}");
            None
        }
    };

    let static_dir = config.static_dir.clone();
    let index = static_dir.join("index.html");

    let api = routes::api_router(oidc.clone());

    let spa = if index.exists() {
        Router::new().fallback_service(
            ServeDir::new(&static_dir).not_found_service(ServeFile::new(&index)),
        )
    } else {
        Router::new().fallback(|| async {
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/html")],
                "<!doctype html><html><body><p>Frontend not built. Run <code>npm run build</code> in frontend/ or use Vite dev server.</p></body></html>",
            )
        })
    };

    let app = Router::new()
        .merge(api)
        .merge(spa)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            oidc_gate,
        ))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.bind).await?;
    tracing::info!("listening on http://{}", config.bind);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn oidc_gate(
    axum::extract::State(state): axum::extract::State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    if !state.config.oidc_enabled() {
        return next.run(req).await;
    }
    let path = req.uri().path();
    if oidc::is_exempt_path(path) {
        return next.run(req).await;
    }
    if oidc::session_valid(&state.config, req.headers()) {
        return next.run(req).await;
    }
    let is_api = path.starts_with("/api/");
    if is_api {
        return (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({ "error": "Unauthorized" })),
        )
            .into_response();
    }
    let callback = urlencoding::encode(req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/"));
    Redirect::temporary(&format!("/auth/login?callbackUrl={callback}")).into_response()
}
