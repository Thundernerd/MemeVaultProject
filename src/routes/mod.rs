mod albums;
mod api_keys;
mod binaries;
mod cookies;
mod downloads;
mod media;
mod queue;
mod settings;
mod share;
mod share_page;
mod tags;
mod upload;
mod v1;

use crate::oidc::{self, OidcState};
use crate::state::AppState;
use axum::routing::{delete, get, post};
use axum::Router;
use std::sync::Arc;

pub fn api_router(oidc: Option<Arc<OidcState>>) -> Router<AppState> {
    let mut router = Router::new()
        // Queue
        .route("/api/queue", get(queue::list))
        .route(
            "/api/queue/{id}",
            get(queue::get).patch(queue::patch).delete(queue::delete),
        )
        // Downloads
        .route("/api/downloads", post(downloads::create))
        // Media
        .route("/api/media", get(media::list))
        .route("/api/media/upload", post(upload::upload))
        .route(
            "/api/media/{id}",
            get(media::get).patch(media::patch).delete(media::delete),
        )
        .route("/api/media/{id}/file", get(media::file))
        .route("/api/media/{id}/thumbnail", get(media::thumbnail))
        .route(
            "/api/media/{id}/tags",
            get(media::get_tags)
                .put(media::put_tags)
                .post(media::post_tag),
        )
        .route(
            "/api/media/{id}/share",
            get(media::list_shares).post(media::create_share),
        )
        .route(
            "/api/media/{id}/share/{token}",
            delete(media::delete_share),
        )
        // Albums
        .route("/api/albums", get(albums::list))
        .route("/api/albums/{id}", delete(albums::delete))
        .route(
            "/api/albums/{id}/share",
            get(albums::list_shares).post(albums::create_share),
        )
        .route(
            "/api/albums/{id}/share/{token}",
            delete(albums::delete_share),
        )
        // Tags / settings / keys / binaries / cookies
        .route("/api/tags", get(tags::list).delete(tags::delete))
        .route("/api/settings", get(settings::get).put(settings::put))
        .route("/api/api-keys", get(api_keys::list).post(api_keys::create))
        .route("/api/api-keys/{id}", delete(api_keys::delete))
        .route("/api/binaries", get(binaries::list))
        .route("/api/binaries/{name}", post(binaries::download))
        .route(
            "/api/cookies/{tool}",
            get(cookies::get).post(cookies::upload).delete(cookies::delete),
        )
        // Public share API
        .route("/api/share/{token}", get(share::meta))
        .route("/api/share/{token}/file", get(share::file))
        .route("/api/share/{token}/thumbnail", get(share::thumbnail))
        .route("/api/share/{token}/media", get(share::album_media))
        .route(
            "/api/share/{token}/media/{media_id}/file",
            get(share::album_file),
        )
        .route(
            "/api/share/{token}/media/{media_id}/thumbnail",
            get(share::album_thumbnail),
        )
        // External v1 API
        .route("/api/v1/submit", post(v1::submit))
        .route("/api/v1/status/{id}", get(v1::status))
        .route("/api/v1/download/{id}", get(v1::download))
        .route("/api/v1/random", get(v1::random))
        // Session helper
        .route("/api/auth/session", get(oidc::session_info))
        .route("/api/auth/logout", get(oidc::logout).post(oidc::logout))
        // Share HTML page
        .route("/share/{token}", get(share_page::page));

    if let Some(oidc_state) = oidc {
        router = router
            .route(
                "/api/auth/login",
                get({
                    let o = oidc_state.clone();
                    move |state, q| oidc::login_start(state, o.clone(), q)
                }),
            )
            .route(
                "/api/auth/callback/oidc",
                get({
                    let o = oidc_state.clone();
                    move |state, q| oidc::oidc_callback(state, o.clone(), q)
                }),
            );
    }

    router
}
