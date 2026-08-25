use crate::db;
use crate::discord;
use crate::error::AppResult;
use crate::state::AppState;
use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};
use std::collections::HashMap;

const ALLOWED: &[&str] = &[
    "download_path",
    "ytdlp_extra_args",
    "gallerydl_extra_args",
    "ytdlp_bin",
    "gallerydl_bin",
    "ffmpeg_bin",
    "share_default_expiry_days",
    "share_default_allow_download",
    "share_base_url",
    "random_mode",
    "discord_enabled",
    "discord_bot_token",
    "discord_client_id",
    "discord_command_name",
    "discord_post_as_user",
];

pub async fn get(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let mut settings = state.db.with_conn(|c| Ok(db::get_all_settings(c)?))?;
    let overridden = db::get_env_overridden_keys();
    let mut obj = serde_json::Map::new();
    for (k, v) in settings.drain() {
        obj.insert(k, Value::String(v));
    }
    obj.insert(
        "_overridden_by_env".into(),
        json!(overridden),
    );
    Ok(Json(Value::Object(obj)))
}

pub async fn put(
    State(state): State<AppState>,
    Json(body): Json<HashMap<String, Value>>,
) -> AppResult<Json<Value>> {
    let mut discord_changed = false;
    state.db.with_conn(|c| {
        for (key, value) in &body {
            if key == "regenerate_api_key" {
                continue;
            }
            if !ALLOWED.contains(&key.as_str()) {
                continue;
            }
            let s = match value {
                Value::String(s) => s.clone(),
                Value::Bool(b) => b.to_string(),
                Value::Number(n) => n.to_string(),
                Value::Null => String::new(),
                _ => value.to_string(),
            };
            if key.starts_with("discord_") {
                discord_changed = true;
            }
            db::set_setting(c, key, &s)?;
        }
        Ok(())
    })?;

    if discord_changed {
        tracing::info!("discord settings changed; restarting Discord bot");
        discord::restart_discord_bot(state.clone()).await;
    }

    get(State(state)).await
}
