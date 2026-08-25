use crate::binaries;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use serde_json::{json, Value};

pub async fn list(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let ytdlp = binaries::check_binary(&state.db, &state.config, "ytdlp").await;
    let gallery = binaries::check_binary(&state.db, &state.config, "gallery-dl").await;
    let ffmpeg = binaries::check_binary(&state.db, &state.config, "ffmpeg").await;
    Ok(Json(json!({
        "ytdlp": ytdlp,
        "gallery-dl": gallery,
        "ffmpeg": ffmpeg,
    })))
}

pub async fn download(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> AppResult<Json<Value>> {
    if name != "ytdlp" && name != "gallery-dl" && name != "ffmpeg" {
        return Err(AppError::bad_request("invalid binary name"));
    }
    match binaries::download_binary(&state.db, &state.config, &name).await {
        Ok(status) => Ok(Json(json!({ "ok": true, "name": status.name, "path": status.path, "exists": status.exists, "version": status.version }))),
        Err(e) => Err(AppError::internal(e.to_string())),
    }
}
