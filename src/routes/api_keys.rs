use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

pub async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<Value>>> {
    let keys = state.db.with_conn(|c| Ok(db::list_api_keys(c)?))?;
    Ok(Json(keys))
}

#[derive(Deserialize)]
pub struct CreateBody {
    pub name: String,
    pub permission: String,
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBody>,
) -> AppResult<(StatusCode, Json<db::ApiKey>)> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::bad_request("name required"));
    }
    if body.permission != "read" && body.permission != "read_write" {
        return Err(AppError::bad_request("permission must be read or read_write"));
    }
    let key = state
        .db
        .with_conn(|c| Ok(db::create_api_key(c, name, &body.permission)?))?;
    Ok((StatusCode::CREATED, Json(key)))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    state.db.with_conn(|c| {
        db::delete_api_key(c, &id)?;
        Ok(())
    })?;
    Ok(StatusCode::NO_CONTENT)
}
