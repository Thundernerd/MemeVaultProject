use crate::cookies;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Multipart, Path, State};
use axum::Json;

fn validate_tool(tool: &str) -> AppResult<()> {
    if tool == "ytdlp" || tool == "gallerydl" {
        Ok(())
    } else {
        Err(AppError::bad_request("tool must be ytdlp or gallerydl"))
    }
}

pub async fn get(
    State(state): State<AppState>,
    Path(tool): Path<String>,
) -> AppResult<Json<cookies::CookieStatus>> {
    validate_tool(&tool)?;
    let status = cookies::cookie_status(&state.config, &tool)
        .ok_or_else(|| AppError::bad_request("invalid tool"))?;
    Ok(Json(status))
}

pub async fn upload(
    State(state): State<AppState>,
    Path(tool): Path<String>,
    mut multipart: Multipart,
) -> AppResult<Json<cookies::CookieStatus>> {
    validate_tool(&tool)?;
    let mut data: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::bad_request(e.to_string()))?
    {
        if field.name() == Some("file") {
            data = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| AppError::bad_request(e.to_string()))?
                    .to_vec(),
            );
        }
    }
    let data = data.ok_or_else(|| AppError::bad_request("file required"))?;
    let status = cookies::save_cookies(&state.config, &tool, &data)
        .map_err(|e| AppError::internal(e.to_string()))?;
    Ok(Json(status))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(tool): Path<String>,
) -> AppResult<Json<cookies::CookieStatus>> {
    validate_tool(&tool)?;
    let status = cookies::delete_cookies(&state.config, &tool)
        .map_err(|e| AppError::internal(e.to_string()))?;
    Ok(Json(status))
}
