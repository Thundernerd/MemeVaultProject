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
mod fluxer;
mod gallerydl;
mod oidc;
mod process_tree;
mod queue;
mod routes;
mod state;
#[cfg(test)]
// Only the version-check tests run on Windows; the download tests are Unix-only.
#[cfg_attr(windows, allow(dead_code))]
mod test_support;
mod ytdlp;

use crate::config::Config;
use crate::db::Db;
use crate::queue::QueueHandle;
use crate::state::AppState;
use axum::extract::Request;
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::any;
use axum::Router;
use std::path::Path;
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
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&config.log_level)),
        )
        .init();

    tracing::info!(
        log_level = %config.log_level,
        bind = %config.bind,
        data_dir = %config.data_dir.display(),
        oidc_enabled = config.oidc_enabled(),
        static_frontend = config.static_dir.join("index.html").exists(),
        "starting MemeVault"
    );

    std::fs::create_dir_all(&config.data_dir)?;
    std::fs::create_dir_all(config.bin_dir())?;
    std::fs::create_dir_all(config.cookies_dir())?;

    let db = Db::open(&config)?;
    let queue = Arc::new(QueueHandle::new());
    queue::start_queue_processor(db.clone(), config.clone(), queue.clone());
    tracing::info!("download queue processor started");

    let state = AppState {
        db: db.clone(),
        config: config.clone(),
        queue,
        discord: Arc::new(Mutex::new(None)),
        fluxer: Arc::new(Mutex::new(None)),
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
    fluxer::start_if_configured(state.clone()).await;

    let oidc = match oidc::try_build_oidc(&config).await {
        Ok(o) => o.map(Arc::new),
        Err(e) => {
            tracing::warn!("OIDC init failed: {e:#}");
            None
        }
    };

    let app = app_router(routes::api_router(oidc.clone()), &config.static_dir)
        .layer(middleware::from_fn_with_state(state.clone(), oidc_gate))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.bind).await?;
    tracing::info!("listening on http://{}", config.bind);
    axum::serve(listener, app).await?;
    Ok(())
}

/// The API routes plus the frontend: the built SPA from `static_dir` when it
/// has an `index.html`, otherwise a "Frontend not built" page.
///
/// Paths that aren't files in `static_dir` are client-side routes, so they get
/// `index.html` with 200 (#104); that includes missing assets. Unknown `/api` paths are not, so they get the
/// API's own 404 instead.
fn app_router<S>(api: Router<S>, static_dir: &Path) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    let index = static_dir.join("index.html");
    let spa = if index.exists() {
        Router::new().fallback_service(ServeDir::new(static_dir).fallback(ServeFile::new(&index)))
    } else {
        Router::new().fallback(|| async {
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/html")],
                "<!doctype html><html><body><p>Frontend not built. Run <code>npm run build</code> in frontend/ or use Vite dev server.</p></body></html>",
            )
        })
    };
    let api_not_found = || async { crate::error::AppError::NotFound };
    api.route("/api", any(api_not_found))
        .route("/api/", any(api_not_found))
        .route("/api/{*rest}", any(api_not_found))
        .merge(spa)
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
    let callback = urlencoding::encode(
        req.uri()
            .path_and_query()
            .map(|p| p.as_str())
            .unwrap_or("/"),
    );
    Redirect::temporary(&format!("/auth/login?callbackUrl={callback}")).into_response()
}

#[cfg(test)]
mod tests {
    use super::app_router;
    use axum::body::{to_bytes, Body};
    use axum::http::{Request, StatusCode};
    use axum::Router;
    use tower::ServiceExt;

    const INDEX: &str = "<!doctype html><title>spa</title>";

    fn static_dir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), INDEX).unwrap();
        dir
    }

    async fn get(app: Router, path: &str) -> (StatusCode, String) {
        let res = app
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = res.status();
        let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
        (status, String::from_utf8(body.to_vec()).unwrap())
    }

    #[tokio::test]
    async fn client_route_deep_link_serves_index_with_200() {
        let dir = static_dir();
        let app = app_router(Router::new(), dir.path());

        let (status, body) = get(app, "/settings/binaries").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, INDEX);
    }

    #[tokio::test]
    async fn unknown_api_path_is_404_not_the_spa() {
        let dir = static_dir();
        let api = Router::new().route("/api/ping", axum::routing::get(|| async { "pong" }));
        let app = app_router(api, dir.path());

        let (status, body) = get(app.clone(), "/api/does-not-exist").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_ne!(body, INDEX);

        for path in ["/api", "/api/"] {
            assert_eq!(
                get(app.clone(), path).await.0,
                StatusCode::NOT_FOUND,
                "{path}"
            );
        }

        assert_eq!(get(app, "/api/ping").await, (StatusCode::OK, "pong".into()));
    }

    #[tokio::test]
    async fn existing_asset_is_served_as_is() {
        let dir = static_dir();
        std::fs::create_dir(dir.path().join("assets")).unwrap();
        std::fs::write(dir.path().join("assets/app.js"), "console.log(1)").unwrap();
        let app = app_router(Router::new(), dir.path());

        assert_eq!(
            get(app, "/assets/app.js").await,
            (StatusCode::OK, "console.log(1)".into())
        );
    }

    /// Route registration panics on a conflict, so building the app with the
    /// real API router checks the `/api` catch-alls sit beside its routes.
    #[test]
    fn api_catch_alls_compose_with_the_real_api_router() {
        let dir = static_dir();
        let _ = app_router(crate::routes::api_router(None), dir.path());
    }
}
