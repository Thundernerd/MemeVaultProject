use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct CreateBody {
    pub url: String,
    pub downloader: Option<String>,
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> AppResult<(StatusCode, Json<db::QueueItem>)> {
    let url = body.url.trim();
    if url.is_empty() {
        return Err(AppError::bad_request("url required"));
    }
    let downloader = body.downloader.as_deref().unwrap_or("ytdlp");
    if downloader != "ytdlp" && downloader != "gallery-dl" {
        return Err(AppError::bad_request("downloader must be ytdlp or gallery-dl"));
    }
    let item = state
        .db
        .with_conn(|c| Ok(db::insert_queue_item(c, url, downloader, "web", None)?))?;
    Ok((StatusCode::CREATED, Json(item)))
}
