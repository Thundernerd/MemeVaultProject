use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;

pub async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<db::QueueItem>>> {
    let items = state.db.with_conn(|c| Ok(db::list_queue_items(c)?))?;
    Ok(Json(items))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<db::QueueItem>> {
    let item = state
        .db
        .with_conn(|c| Ok(db::get_queue_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    Ok(Json(item))
}

#[derive(Deserialize)]
pub struct PatchBody {
    pub action: String,
}

pub async fn patch(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PatchBody>,
) -> AppResult<StatusCode> {
    if body.action != "cancel" {
        return Err(AppError::bad_request("Unknown action"));
    }
    let item = state
        .db
        .with_conn(|c| Ok(db::get_queue_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    if item.status != "pending" && item.status != "downloading" {
        return Err(AppError::Conflict("Item cannot be cancelled".into()));
    }
    if item.status == "downloading" {
        let cancelled = state.queue.cancel(&id).await;
        if !cancelled {
            // Still mark cancelled in DB
        }
    }
    let _ = state.db.with_conn(|c| {
        db::update_queue_item(
            c,
            &id,
            Some("cancelled"),
            None,
            Some(Some("cancelled")),
            Some(Some(&chrono::Utc::now().to_rfc3339())),
        )?;
        Ok(())
    })?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let item = state
        .db
        .with_conn(|c| Ok(db::get_queue_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let _ = item;
    state.db.with_conn(|c| {
        db::delete_queue_item(c, &id)?;
        Ok(())
    })?;
    Ok(StatusCode::NO_CONTENT)
}
