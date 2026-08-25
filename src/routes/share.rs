use crate::db;
use crate::error::{AppError, AppResult};
use crate::files::serve_file_with_range;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use std::path::Path as FsPath;

fn check_media_share(state: &AppState, token: &str) -> AppResult<(db::ShareLink, db::MediaItem)> {
    let link = state
        .db
        .with_conn(|c| Ok(db::get_share_link(c, token)?))?
        .ok_or(AppError::NotFound)?;
    if db::is_share_expired(&link.expires_at) {
        return Err(AppError::NotFound);
    }
    let media = state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &link.media_id)?))?
        .ok_or(AppError::NotFound)?;
    Ok((link, media))
}

fn check_album_share(state: &AppState, token: &str) -> AppResult<(db::AlbumShareLink, db::AlbumWithMedia)> {
    let link = state
        .db
        .with_conn(|c| Ok(db::get_album_share_link(c, token)?))?
        .ok_or(AppError::NotFound)?;
    if db::is_share_expired(&link.expires_at) {
        return Err(AppError::NotFound);
    }
    let album = state
        .db
        .with_conn(|c| Ok(db::get_album_with_media(c, &link.album_id)?))?
        .ok_or(AppError::NotFound)?;
    Ok((link, album))
}

pub async fn meta(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Json<Value>> {
    let (link, media) = check_media_share(&state, &token)?;
    Ok(Json(json!({
        "id": media.id,
        "type": media.media_type,
        "title": media.title,
        "description": media.description,
        "url": media.url,
        "uploader": media.uploader,
        "duration": media.duration,
        "width": media.width,
        "height": media.height,
        "format": media.format,
        "file_size": media.file_size,
        "has_thumbnail": media.thumbnail_path.is_some(),
        "created_at": media.created_at,
        "allow_download": link.allow_download == 1,
        "expires_at": link.expires_at,
    })))
}

pub async fn file(
    State(state): State<AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let (link, media) = check_media_share(&state, &token).map_err(|_| StatusCode::NOT_FOUND)?;
    let _ = link;
    serve_file_with_range(FsPath::new(&media.file_path), &headers, false).await
}

pub async fn thumbnail(
    State(state): State<AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let (_link, media) = check_media_share(&state, &token).map_err(|_| StatusCode::NOT_FOUND)?;
    let path = media.thumbnail_path.ok_or(StatusCode::NOT_FOUND)?;
    serve_file_with_range(FsPath::new(&path), &headers, false).await
}

pub async fn album_media(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Json<Value>> {
    let (_link, album) = check_album_share(&state, &token)?;
    let items: Vec<Value> = album
        .media
        .iter()
        .map(|m| {
            json!({
                "id": m.media.id,
                "type": m.media.media_type,
                "title": m.media.title,
                "width": m.media.width,
                "height": m.media.height,
                "has_thumbnail": m.media.thumbnail_path.is_some(),
            })
        })
        .collect();
    Ok(Json(Value::Array(items)))
}

pub async fn album_file(
    State(state): State<AppState>,
    Path((token, media_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let (_link, album) = check_album_share(&state, &token).map_err(|_| StatusCode::NOT_FOUND)?;
    let media = album
        .media
        .iter()
        .find(|m| m.media.id == media_id)
        .ok_or(StatusCode::NOT_FOUND)?;
    serve_file_with_range(FsPath::new(&media.media.file_path), &headers, false).await
}

pub async fn album_thumbnail(
    State(state): State<AppState>,
    Path((token, media_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let (_link, album) = check_album_share(&state, &token).map_err(|_| StatusCode::NOT_FOUND)?;
    let media = album
        .media
        .iter()
        .find(|m| m.media.id == media_id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let path = media
        .media
        .thumbnail_path
        .as_ref()
        .ok_or(StatusCode::NOT_FOUND)?;
    serve_file_with_range(FsPath::new(path), &headers, false).await
}
