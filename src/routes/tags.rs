use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;

pub async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<db::TagWithCount>>> {
    let tags = state.db.with_conn(|c| Ok(db::list_all_tags(c)?))?;
    Ok(Json(tags))
}

#[derive(Deserialize)]
pub struct DeleteBody {
    pub id: String,
}

pub async fn delete(
    State(state): State<AppState>,
    Json(body): Json<DeleteBody>,
) -> AppResult<StatusCode> {
    if body.id.trim().is_empty() {
        return Err(AppError::bad_request("id required"));
    }
    state.db.with_conn(|c| {
        db::delete_tag(c, &body.id)?;
        Ok(())
    })?;
    Ok(StatusCode::NO_CONTENT)
}
