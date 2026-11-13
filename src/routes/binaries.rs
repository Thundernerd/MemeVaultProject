use crate::binaries::{self, Binary};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use serde_json::{json, Map, Value};

pub async fn list(State(state): State<AppState>) -> AppResult<Json<Value>> {
    // Concurrently, so binaries that hang cost one version timeout, not three.
    let statuses = futures::future::join_all(
        Binary::ALL.map(|binary| binaries::check_binary(&state.db, &state.config, binary)),
    )
    .await;
    let out: Map<String, Value> = Binary::ALL
        .into_iter()
        .zip(statuses)
        .map(|(binary, status)| (binary.name().to_string(), json!(status)))
        .collect();
    Ok(Json(Value::Object(out)))
}

pub async fn download(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> AppResult<Json<Value>> {
    let binary: Binary = name
        .parse()
        .map_err(|_| AppError::bad_request("invalid binary name"))?;
    if let Some(why) = binary.auto_download_unsupported() {
        return Err(AppError::bad_request(why));
    }
    match binaries::download_binary(&state.db, &state.config, binary).await {
        Ok(status) => Ok(Json(
            json!({ "ok": true, "name": status.name, "path": status.path, "exists": status.exists, "version": status.version }),
        )),
        Err(e) => Err(AppError::internal(e.to_string())),
    }
}
