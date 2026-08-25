use crate::db;
use crate::error::{AppError, AppResult};
use crate::files;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;

pub async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<db::AlbumWithMedia>>> {
    let albums = state.db.with_conn(|c| Ok(db::list_albums_with_media(c)?))?;
    Ok(Json(albums))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let album = state.db.with_conn(|c| Ok(db::delete_album(c, &id)?))?;
    let Some(album) = album else {
        return Err(AppError::NotFound);
    };
    for m in &album.media {
        files::delete_job_dir(&m.media.file_path);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_shares(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<db::AlbumShareLink>>> {
    state
        .db
        .with_conn(|c| Ok(db::get_album(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let links = state
        .db
        .with_conn(|c| Ok(db::get_album_share_links_for_album(c, &id)?))?;
    Ok(Json(links))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareBody {
    pub allow_download: Option<bool>,
    pub expires_at: Option<String>,
}

pub async fn create_share(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CreateShareBody>,
) -> AppResult<(StatusCode, Json<db::AlbumShareLink>)> {
    state
        .db
        .with_conn(|c| Ok(db::get_album(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let allow = body.allow_download.unwrap_or(true);
    let link = state.db.with_conn(|c| {
        Ok(db::create_album_share_link(
            c,
            &id,
            allow,
            body.expires_at.as_deref(),
        )?)
    })?;
    Ok((StatusCode::CREATED, Json(link)))
}

pub async fn delete_share(
    State(state): State<AppState>,
    Path((_id, token)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    state.db.with_conn(|c| {
        db::delete_album_share_link(c, &token)?;
        Ok(())
    })?;
    Ok(StatusCode::NO_CONTENT)
}
