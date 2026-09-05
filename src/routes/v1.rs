use crate::auth;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::files::serve_file_with_range;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use rand::seq::SliceRandom;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path as FsPath;

fn require_read(state: &AppState, headers: &HeaderMap) -> AppResult<auth::ApiKeyContext> {
    let key = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok());
    let ctx = auth::validate_api_key(&state.db, &state.config, key).ok_or(AppError::Unauthorized)?;
    if !ctx.has_read() {
        return Err(AppError::Unauthorized);
    }
    Ok(ctx)
}

fn require_write(state: &AppState, headers: &HeaderMap) -> AppResult<auth::ApiKeyContext> {
    let ctx = require_read(state, headers)?;
    if !ctx.has_write() {
        return Err(AppError::Unauthorized);
    }
    Ok(ctx)
}

#[derive(Deserialize)]
pub struct SubmitBody {
    pub url: String,
    #[serde(rename = "type")]
    pub media_type: String,
    #[serde(default, rename = "includeInRandom")]
    pub include_in_random: bool,
}

pub async fn submit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SubmitBody>,
) -> AppResult<(StatusCode, Json<Value>)> {
    let ctx = require_write(&state, &headers)?;
    let url = body.url.trim();
    if url.is_empty() {
        return Err(AppError::bad_request("url required"));
    }
    let downloader = match body.media_type.as_str() {
        "video" => "ytdlp",
        "image" => "gallery-dl",
        _ => return Err(AppError::bad_request("type must be video or image")),
    };
    let label = ctx.name.trim();
    let label = if label.is_empty() { None } else { Some(label) };
    let item = state.db.with_conn(|c| {
        Ok(db::insert_queue_item(c, url, downloader, "api", label, body.include_in_random)?)
    })?;
    Ok((StatusCode::CREATED, Json(json!({ "id": item.id }))))
}

pub async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<Value>> {
    require_read(&state, &headers)?;
    let item = state
        .db
        .with_conn(|c| Ok(db::get_queue_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let media_ids: Vec<String> = state
        .db
        .with_conn(|c| Ok(db::get_media_by_queue_item(c, &id)?))?
        .into_iter()
        .map(|m| m.id)
        .collect();
    Ok(Json(json!({
        "id": item.id,
        "url": item.url,
        "downloader": item.downloader,
        "status": item.status,
        "progress": item.progress,
        "error": item.error,
        "created_at": item.created_at,
        "completed_at": item.completed_at,
        "media_ids": media_ids,
    })))
}

pub async fn download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    require_read(&state, &headers).map_err(|_| StatusCode::UNAUTHORIZED)?;
    let item = state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    if !FsPath::new(&item.file_path).exists() {
        return Err(StatusCode::NOT_FOUND);
    }
    serve_file_with_range(FsPath::new(&item.file_path), &headers, true).await
}

pub async fn random(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    require_read(&state, &headers)?;
    let mode = state
        .db
        .with_conn(|c| Ok(db::get_setting(c, "random_mode")))?
        .unwrap_or_else(|| "flag".into());
    let candidates = state.db.with_conn(|c| {
        Ok(if mode == "shared" {
            db::list_shared_media_with_tags(c)?
        } else {
            db::list_random_candidates_with_tags(c)?
        })
    })?;
    let item = candidates
        .choose(&mut rand::thread_rng())
        .ok_or_else(|| AppError::NotFound)?;
    let tags: Vec<&str> = item.tags.iter().map(|t| t.name.as_str()).collect();
    Ok(Json(json!({
        "id": item.media.id,
        "url": item.media.url,
        "type": item.media.media_type,
        "title": item.media.title,
        "description": item.media.description,
        "uploader": item.media.uploader,
        "duration": item.media.duration,
        "file_size": item.media.file_size,
        "format": item.media.format,
        "width": item.media.width,
        "height": item.media.height,
        "created_at": item.media.created_at,
        "tags": tags,
        "download_url": format!("/api/v1/download/{}", item.media.id),
    })))
}
