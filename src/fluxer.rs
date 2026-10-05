//! Optional Fluxer chat bot (downloads to Fluxer, not the vault).
//!
//! Fluxer (<https://fluxer.app>) is a self-hostable, Discord-like platform with
//! its own protocol. Unlike Discord it has no slash commands or interactions:
//! bots receive `MESSAGE_CREATE` gateway events and reply with messages. The bot
//! therefore listens for a configurable message command (prefix + name) and
//! posts the downloaded media back to the channel, optionally under the
//! command sender's identity via a channel webhook.

use crate::config::Config;
use crate::db::{self, Db};
use crate::gallerydl;
use crate::queue::{spawn_progress_persister, QueueHandle};
use crate::state::{AppState, FluxerControl};
use crate::ytdlp;
use futures::{SinkExt, StreamExt};
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message;

const WEBHOOK_NAME: &str = "MemeVault";
const MAX_FILES: usize = 10;
const MAX_CAPTION_CHARS: usize = 2000;
/// Uploads can carry large videos, so allow more than the client-wide timeout.
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(300);

/// Resolved settings snapshot for one bot run.
#[derive(Clone)]
struct FluxerSettings {
    token: String,
    command_name: String,
    command_prefix: String,
    post_as_user: bool,
    delete_command: bool,
}

/// Base URLs discovered from `/.well-known/fluxer`.
#[derive(Clone)]
struct Endpoints {
    /// `endpoints.api_public`, without a trailing slash.
    api: String,
    /// `endpoints.gateway` WebSocket URL.
    gateway: String,
    /// `endpoints.media`, without a trailing slash.
    media: String,
}

#[derive(Clone)]
struct Webhook {
    id: String,
    token: String,
}

pub async fn start_if_configured(state: AppState) {
    restart_fluxer_bot(state).await;
}

pub async fn restart_fluxer_bot(state: AppState) {
    // Stop previous instance.
    {
        let mut guard = state.fluxer.lock().await;
        if let Some(ctrl) = guard.take() {
            tracing::info!("stopping previous Fluxer bot instance");
            let _ = ctrl.shutdown.send(true);
        }
    }

    let enabled = get_setting(&state.db, "fluxer_enabled").as_deref() == Some("true");
    let token = get_setting(&state.db, "fluxer_bot_token").filter(|s| !s.is_empty());
    let instance_url = get_setting(&state.db, "fluxer_instance_url").filter(|s| !s.is_empty());

    if !enabled || token.is_none() || instance_url.is_none() {
        tracing::info!("Fluxer bot not started (disabled or missing credentials)");
        return;
    }

    let token = token.unwrap();
    let instance_url = instance_url.unwrap();
    let command_name = get_setting(&state.db, "fluxer_command_name")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "get".into());
    let command_prefix = get_setting(&state.db, "fluxer_command_prefix")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "!".into());
    let post_as_user = get_setting(&state.db, "fluxer_post_as_user").as_deref() == Some("true");
    // Enabled by default; requires Manage Messages to remove another user's message.
    let delete_command = get_setting(&state.db, "fluxer_delete_command_message")
        .map(|v| v != "false")
        .unwrap_or(true);

    let settings = FluxerSettings {
        token,
        command_name,
        command_prefix,
        post_as_user,
        delete_command,
    };

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    {
        let mut guard = state.fluxer.lock().await;
        *guard = Some(FluxerControl {
            shutdown: shutdown_tx,
        });
    }

    tracing::info!(
        instance = %instance_url,
        command = %format!("{}{}", settings.command_prefix, settings.command_name),
        post_as_user,
        delete_command,
        "starting Fluxer bot"
    );

    let db = state.db.clone();
    let config = state.config.clone();
    let queue = state.queue.clone();
    tokio::spawn(async move {
        if let Err(e) =
            run_bot(settings, instance_url, db, config, queue, shutdown_rx).await
        {
            tracing::error!("Fluxer bot error: {e:#}");
        }
    });
}

fn get_setting(db: &Db, key: &str) -> Option<String> {
    db.with_conn(|c| Ok(db::get_setting(c, key)))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
}

/// Fetch and resolve the deployed endpoints for an instance URL.
async fn discover(http: &reqwest::Client, instance_url: &str) -> anyhow::Result<Endpoints> {
    let base = instance_url.trim_end_matches('/');
    let url = format!("{base}/.well-known/fluxer");
    let resp = http.get(&url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("instance discovery returned {}", resp.status());
    }
    let v: Value = resp.json().await?;
    let ep = &v["endpoints"];
    let api = ep["api_public"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow::anyhow!("discovery missing endpoints.api_public"))?;
    let gateway = ep["gateway"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow::anyhow!("discovery missing endpoints.gateway"))?;
    let media = ep["media"].as_str().filter(|s| !s.is_empty()).unwrap_or(base);
    Ok(Endpoints {
        api: api.trim_end_matches('/').to_string(),
        gateway: gateway.to_string(),
        media: media.trim_end_matches('/').to_string(),
    })
}

async fn run_bot(
    settings: FluxerSettings,
    instance_url: String,
    db: Db,
    config: Config,
    queue: Arc<QueueHandle>,
    mut shutdown: watch::Receiver<bool>,
) -> anyhow::Result<()> {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()?;

    // Discover endpoints, retrying with backoff until we succeed or shut down.
    let mut backoff = 2u64;
    let endpoints = loop {
        match discover(&http, &instance_url).await {
            Ok(ep) => break ep,
            Err(e) => {
                tracing::warn!("Fluxer discovery failed ({e:#}); retrying in {backoff}s");
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(backoff)) => {}
                    _ = shutdown.changed() => { return Ok(()); }
                }
                backoff = (backoff * 2).min(60);
            }
        }
    };

    tracing::info!(
        api = %endpoints.api,
        gateway = %endpoints.gateway,
        "Fluxer endpoints discovered"
    );

    let mut backoff = 2u64;
    loop {
        if *shutdown.borrow() {
            break;
        }
        let started = Instant::now();
        let result = gateway_session(
            &http, &settings, &endpoints, &db, &config, &queue, &mut shutdown,
        )
        .await;
        if let Err(e) = result {
            tracing::warn!("Fluxer gateway disconnected: {e:#}");
        }
        if *shutdown.borrow() {
            break;
        }
        // Reset the backoff once a session has been healthy for a while.
        if started.elapsed() > Duration::from_secs(30) {
            backoff = 2;
        }
        tracing::info!("Fluxer reconnecting in {backoff}s");
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(backoff)) => {}
            _ = shutdown.changed() => { break; }
        }
        backoff = (backoff * 2).min(60);
    }

    tracing::info!("Fluxer bot stopped");
    Ok(())
}

async fn gateway_session(
    http: &reqwest::Client,
    settings: &FluxerSettings,
    endpoints: &Endpoints,
    db: &Db,
    config: &Config,
    queue: &Arc<QueueHandle>,
    shutdown: &mut watch::Receiver<bool>,
) -> anyhow::Result<()> {
    let sep = if endpoints.gateway.contains('?') { '&' } else { '?' };
    let ws_url = format!("{}{sep}v=1&encoding=json", endpoints.gateway);
    let (ws, _) = tokio_tungstenite::connect_async(ws_url.as_str()).await?;
    let (mut sink, mut stream) = ws.split();

    // 1. Hello
    let hello = loop {
        let msg = stream
            .next()
            .await
            .ok_or_else(|| anyhow::anyhow!("gateway closed before Hello"))??;
        if let Message::Text(text) = msg {
            let v: Value = serde_json::from_str(&text)?;
            if v["op"].as_i64() == Some(10) {
                break v;
            }
        }
    };
    let heartbeat_ms = hello["d"]["heartbeat_interval"]
        .as_u64()
        .filter(|n| *n > 0)
        .unwrap_or(41250);

    // 2. Identify
    let identify = json!({
        "op": 2,
        "d": {
            "token": settings.token,
            "properties": {
                "os": std::env::consts::OS,
                "browser": "MemeVault",
                "device": "MemeVault",
            }
        }
    });
    sink.send(Message::Text(identify.to_string())).await?;

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Message>();
    let mut writer = tokio::spawn(async move {
        while let Some(m) = out_rx.recv().await {
            if sink.send(m).await.is_err() {
                break;
            }
        }
    });

    // 3. Heartbeats
    let seq = Arc::new(AtomicI64::new(-1));
    let hb_tx = out_tx.clone();
    let hb_seq = seq.clone();
    let heartbeat = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_millis(heartbeat_ms));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        ticker.tick().await; // immediate first tick
        loop {
            ticker.tick().await;
            let s = hb_seq.load(Ordering::Relaxed);
            let d = if s < 0 { Value::Null } else { json!(s) };
            let payload = json!({ "op": 1, "d": d }).to_string();
            if hb_tx.send(Message::Text(payload)).is_err() {
                break;
            }
        }
    });

    // 4. Read dispatches
    let result: anyhow::Result<()> = 'session: loop {
        let incoming = tokio::select! {
            _ = shutdown.changed() => break 'session Ok(()),
            incoming = stream.next() => incoming,
        };
        let Some(msg) = incoming else {
            break 'session Err(anyhow::anyhow!("gateway stream ended"));
        };
        let msg = match msg {
            Ok(m) => m,
            Err(e) => break 'session Err(anyhow::anyhow!(e)),
        };
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break 'session Ok(()),
            _ => continue 'session,
        };
        let v: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue 'session,
        };
        match v["op"].as_i64() {
            Some(0) => {
                if let Some(s) = v["s"].as_i64() {
                    seq.store(s, Ordering::Relaxed);
                }
                if v["t"].as_str() == Some("MESSAGE_CREATE") {
                    let http = http.clone();
                    let settings = settings.clone();
                    let endpoints = endpoints.clone();
                    let db = db.clone();
                    let config = config.clone();
                    let queue = queue.clone();
                    let d = v["d"].clone();
                    tokio::spawn(async move {
                        if let Err(e) =
                            handle_message(&http, &settings, &endpoints, &db, &config, &queue, &d)
                                .await
                        {
                            tracing::warn!("Fluxer command failed: {e:#}");
                        }
                    });
                }
            }
            // Server requests an immediate heartbeat.
            Some(1) => {
                let s = seq.load(Ordering::Relaxed);
                let d = if s < 0 { Value::Null } else { json!(s) };
                let _ = out_tx.send(Message::Text(json!({ "op": 1, "d": d }).to_string()));
            }
            // Reconnect / invalid session: start a fresh session.
            Some(7) | Some(9) => break 'session Ok(()),
            _ => {}
        }
    };

    heartbeat.abort();
    drop(out_tx);
    writer.abort();
    let _ = (&mut writer).await;
    result
}

// ── Command handling ─────────────────────────────────────────────────────────

/// Parse `prefix + command [image|video] <url> [caption]`.
fn parse_command(content: &str, settings: &FluxerSettings) -> Option<(&'static str, String, Option<String>)> {
    let rest = content
        .trim()
        .strip_prefix(settings.command_prefix.as_str())?
        .trim_start();
    let rest = rest.strip_prefix(settings.command_name.as_str())?;
    if !(rest.is_empty() || rest.starts_with(char::is_whitespace)) {
        return None;
    }

    let mut s = rest.trim_start();
    let mut media_type = "video";
    if let Some(r) = s.strip_prefix("image") {
        if r.is_empty() || r.starts_with(char::is_whitespace) {
            media_type = "image";
            s = r.trim_start();
        }
    } else if let Some(r) = s.strip_prefix("video") {
        if r.is_empty() || r.starts_with(char::is_whitespace) {
            s = r.trim_start();
        }
    }

    if !(s.starts_with("http://") || s.starts_with("https://")) {
        return None;
    }
    let end = s.find(char::is_whitespace).unwrap_or(s.len());
    let url = s[..end].to_string();
    if url.len() < 8 {
        return None;
    }
    let caption: String = s[end..].trim().chars().take(MAX_CAPTION_CHARS).collect();
    let caption = (!caption.is_empty()).then_some(caption);
    Some((media_type, url, caption))
}

async fn handle_message(
    http: &reqwest::Client,
    settings: &FluxerSettings,
    endpoints: &Endpoints,
    db: &Db,
    config: &Config,
    queue: &Arc<QueueHandle>,
    d: &Value,
) -> anyhow::Result<()> {
    // Ignore bots (including ourselves) and webhook-authored messages.
    if d["author"]["bot"].as_bool() == Some(true) || d["webhook_id"].as_str().is_some() {
        return Ok(());
    }
    let content = d["content"].as_str().unwrap_or("");
    let channel_id = d["channel_id"].as_str().unwrap_or("");
    if channel_id.is_empty() {
        return Ok(());
    }
    let Some((media_type, url, caption)) = parse_command(content, settings) else {
        return Ok(());
    };
    let guild_id = d["guild_id"].as_str().map(|s| s.to_string());
    let message_id = d["id"].as_str().unwrap_or("").to_string();
    let author = d["author"].clone();

    tracing::info!(
        command = %format!("{}{}", settings.command_prefix, settings.command_name),
        user = %author["username"].as_str().unwrap_or("?"),
        channel_id = %channel_id,
        url = %url,
        media_type = %media_type,
        post_as_user = settings.post_as_user,
        "fluxer command received"
    );

    // Remove the sender's command message (guild only; another user's message
    // needs Manage Messages, and private-channel messages cannot be deleted).
    if settings.delete_command && guild_id.is_some() && !message_id.is_empty() {
        delete_message(http, &endpoints.api, &settings.token, channel_id, &message_id).await;
    }

    let downloader = if media_type == "image" { "gallery-dl" } else { "ytdlp" };
    let queue_item = db.with_conn(|c| {
        Ok(db::insert_queue_item(c, &url, downloader, "fluxer", Some("Fluxer"), false)?)
    })?;
    let item_id = queue_item.id.clone();

    let tmp = tempfile::tempdir()?;
    let (cancel_tx, cancel_rx) = watch::channel(false);
    queue.register(&item_id, cancel_tx).await;
    let (progress_tx, progress_rx) = watch::channel(0.0f64);
    spawn_progress_persister(db.clone(), item_id.clone(), progress_rx);
    let _ = db.with_conn(|c| {
        db::update_queue_item(c, &item_id, Some("downloading"), Some(0.0), None, None)?;
        Ok(())
    });

    let placeholder = create_text_message(http, &endpoints.api, &settings.token, channel_id, "⏳ Downloading…")
        .await
        .ok();

    let result = if media_type == "image" {
        gallerydl::run_gallery_dl(
            db,
            config,
            &url,
            Some(progress_tx),
            cancel_rx,
            Some(tmp.path().to_path_buf()),
        )
        .await
        .map(|files| files.into_iter().map(|f| f.file_path).collect::<Vec<_>>())
    } else {
        ytdlp::run_ytdlp(
            db,
            config,
            &url,
            Some(progress_tx),
            cancel_rx,
            Some(tmp.path().to_path_buf()),
        )
        .await
        .map(|r| vec![r.file_path])
    };

    queue.unregister(&item_id).await;

    match &result {
        Ok(paths) if !paths.is_empty() => {
            finalize_fluxer_queue(db, &item_id, "completed", None);
        }
        Ok(_) => finalize_fluxer_queue(db, &item_id, "failed", Some("No files downloaded")),
        Err(e) => {
            let msg = e.to_string();
            let status = if msg.contains("cancelled") { "cancelled" } else { "failed" };
            finalize_fluxer_queue(db, &item_id, status, Some(&msg));
        }
    }

    match result {
        Ok(paths) if !paths.is_empty() => {
            tracing::info!(
                item_id = %item_id,
                file_count = paths.len(),
                url = %url,
                "fluxer download succeeded"
            );
            post_result(
                http,
                settings,
                endpoints,
                channel_id,
                placeholder.as_deref(),
                &paths,
                caption.as_deref(),
                guild_id.as_deref(),
                &author,
            )
            .await;
        }
        Ok(_) => {
            tracing::warn!(url = %url, "fluxer download returned no files");
            set_status(http, endpoints, &settings.token, channel_id, placeholder.as_deref(), "No files downloaded").await;
        }
        Err(e) => {
            let msg = e.to_string();
            let text = if msg.contains("cancelled") {
                "Download cancelled".to_string()
            } else {
                tracing::error!(url = %url, error = %format!("{e:#}"), "fluxer download failed");
                format!("Download failed: {e}")
            };
            set_status(http, endpoints, &settings.token, channel_id, placeholder.as_deref(), &text).await;
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn post_result(
    http: &reqwest::Client,
    settings: &FluxerSettings,
    endpoints: &Endpoints,
    channel_id: &str,
    placeholder: Option<&str>,
    files: &[PathBuf],
    caption: Option<&str>,
    guild_id: Option<&str>,
    author: &Value,
) {
    let as_user = settings.post_as_user && guild_id.is_some();
    if as_user {
        match post_via_webhook(http, &settings.token, endpoints, channel_id, files, caption, author).await {
            Ok(()) => {
                tracing::info!(file_count = files.len().min(MAX_FILES), "fluxer posted as user via webhook");
                if let Some(id) = placeholder {
                    delete_message(http, &endpoints.api, &settings.token, channel_id, id).await;
                }
                return;
            }
            Err(e) => {
                tracing::warn!(error = %format!("{e:#}"), "fluxer post-as-user failed; falling back to bot");
            }
        }
    }
    finalize_as_bot(http, &endpoints.api, &settings.token, channel_id, placeholder, files, caption).await;
    tracing::info!(file_count = files.len().min(MAX_FILES), "fluxer posted as bot");
}

async fn post_via_webhook(
    http: &reqwest::Client,
    token: &str,
    endpoints: &Endpoints,
    channel_id: &str,
    files: &[PathBuf],
    caption: Option<&str>,
    author: &Value,
) -> anyhow::Result<()> {
    let wh = get_or_create_webhook(http, &endpoints.api, token, channel_id).await?;
    let name = display_name(author);
    let avatar = avatar_url(&endpoints.media, author);
    // First attempt with the sender identity; fall back to the webhook's own
    // identity if the instance rejects the override.
    match execute_webhook(http, &endpoints.api, &wh, Some(&name), avatar.as_deref(), caption, files).await {
        Ok(()) => Ok(()),
        Err(first) => {
            tracing::warn!("webhook identity override failed ({first:#}); retrying without it");
            execute_webhook(http, &endpoints.api, &wh, None, None, caption, files).await
        }
    }
}

// ── Shared message helpers ───────────────────────────────────────────────────

fn display_name(author: &Value) -> String {
    let name = author["global_name"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| author["username"].as_str())
        .unwrap_or("User");
    let name: String = name.chars().take(80).collect();
    if name.chars().count() < 2 {
        "User".into()
    } else {
        name
    }
}

fn avatar_url(media: &str, author: &Value) -> Option<String> {
    let id = author["id"].as_str()?;
    let hash = author["avatar"].as_str()?;
    if hash.is_empty() {
        return None;
    }
    let ext = if hash.starts_with("a_") { "gif" } else { "png" };
    Some(format!("{media}/avatars/{id}/{hash}.{ext}"))
}

fn finalize_fluxer_queue(db: &Db, item_id: &str, status: &str, error: Option<&str>) {
    let completed = chrono::Utc::now().to_rfc3339();
    let progress = (status == "completed").then_some(100.0);
    let _ = db.with_conn(|c| {
        db::update_queue_item(
            c,
            item_id,
            Some(status),
            progress,
            Some(error),
            Some(Some(&completed)),
        )?;
        Ok(())
    });
}

// ── REST helpers ─────────────────────────────────────────────────────────────

/// Build a multipart message form. `force_content` always sends the `content`
/// field (empty string when there is no caption), which an edit needs in order
/// to clear a previous value — Fluxer keeps omitted fields on modify.
async fn build_form(
    content: Option<&str>,
    files: &[PathBuf],
    force_content: bool,
) -> anyhow::Result<reqwest::multipart::Form> {
    let mut payload = Map::new();
    if force_content {
        payload.insert("content".into(), json!(content.unwrap_or("")));
    } else if let Some(c) = content.filter(|c| !c.is_empty()) {
        payload.insert("content".into(), json!(c));
    }
    let mut form = reqwest::multipart::Form::new()
        .text("payload_json", Value::Object(payload).to_string());
    for (i, p) in files.iter().take(MAX_FILES).enumerate() {
        let bytes = tokio::fs::read(p).await?;
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .to_string();
        let part = reqwest::multipart::Part::bytes(bytes).file_name(name);
        form = form.part(format!("files[{i}]"), part);
    }
    Ok(form)
}

async fn create_text_message(
    http: &reqwest::Client,
    api: &str,
    token: &str,
    channel_id: &str,
    content: &str,
) -> anyhow::Result<String> {
    let url = format!("{api}/v1/channels/{channel_id}/messages");
    let resp = http
        .post(&url)
        .header("Authorization", format!("Bot {token}"))
        .json(&json!({ "content": content }))
        .send()
        .await?;
    let status = resp.status();
    let v: Value = resp.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        anyhow::bail!("create message failed: {status} {v}");
    }
    v["id"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow::anyhow!("create message response missing id"))
}

async fn edit_message(
    http: &reqwest::Client,
    api: &str,
    token: &str,
    channel_id: &str,
    message_id: &str,
    content: Option<&str>,
    files: &[PathBuf],
) -> anyhow::Result<()> {
    let url = format!("{api}/v1/channels/{channel_id}/messages/{message_id}");
    let form = build_form(content, files, true).await?;
    let resp = http
        .patch(&url)
        .header("Authorization", format!("Bot {token}"))
        .timeout(UPLOAD_TIMEOUT)
        .multipart(form)
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("edit message failed: {status} {body}");
    }
    Ok(())
}

async fn create_message_with_files(
    http: &reqwest::Client,
    api: &str,
    token: &str,
    channel_id: &str,
    content: Option<&str>,
    files: &[PathBuf],
) -> anyhow::Result<()> {
    let url = format!("{api}/v1/channels/{channel_id}/messages");
    let form = build_form(content, files, false).await?;
    let resp = http
        .post(&url)
        .header("Authorization", format!("Bot {token}"))
        .timeout(UPLOAD_TIMEOUT)
        .multipart(form)
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("create message failed: {status} {body}");
    }
    Ok(())
}

async fn delete_message(
    http: &reqwest::Client,
    api: &str,
    token: &str,
    channel_id: &str,
    message_id: &str,
) {
    let url = format!("{api}/v1/channels/{channel_id}/messages/{message_id}");
    match http
        .delete(&url)
        .header("Authorization", format!("Bot {token}"))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {}
        Ok(resp) => tracing::warn!(status = %resp.status(), "fluxer failed to delete message"),
        Err(e) => tracing::warn!(error = %e, "fluxer failed to delete message"),
    }
}

/// Replace a placeholder (or create a new message) with the downloaded files.
async fn finalize_as_bot(
    http: &reqwest::Client,
    api: &str,
    token: &str,
    channel_id: &str,
    placeholder: Option<&str>,
    files: &[PathBuf],
    caption: Option<&str>,
) {
    if let Some(id) = placeholder {
        match edit_message(http, api, token, channel_id, id, caption, files).await {
            Ok(()) => return,
            Err(e) => {
                tracing::warn!(error = %format!("{e:#}"), "fluxer failed to edit placeholder; posting new message");
                if create_message_with_files(http, api, token, channel_id, caption, files)
                    .await
                    .is_ok()
                {
                    delete_message(http, api, token, channel_id, id).await;
                    return;
                }
            }
        }
        // Last resort: leave an error note on the placeholder.
        let _ = edit_message(http, api, token, channel_id, id, Some("Download finished but posting failed"), &[]).await;
    } else {
        let _ = create_message_with_files(http, api, token, channel_id, caption, files).await;
    }
}

async fn set_status(
    http: &reqwest::Client,
    endpoints: &Endpoints,
    token: &str,
    channel_id: &str,
    placeholder: Option<&str>,
    text: &str,
) {
    if let Some(id) = placeholder {
        let _ = edit_message(http, &endpoints.api, token, channel_id, id, Some(text), &[]).await;
    } else {
        let _ = create_text_message(http, &endpoints.api, token, channel_id, text).await;
    }
}

async fn get_or_create_webhook(
    http: &reqwest::Client,
    api: &str,
    token: &str,
    channel_id: &str,
) -> anyhow::Result<Webhook> {
    let list_url = format!("{api}/v1/channels/{channel_id}/webhooks");
    if let Ok(resp) = http
        .get(&list_url)
        .header("Authorization", format!("Bot {token}"))
        .send()
        .await
    {
        if resp.status().is_success() {
            let hooks: Vec<Value> = resp.json().await.unwrap_or_default();
            if let Some(w) = hooks.iter().find(|w| {
                w["name"].as_str() == Some(WEBHOOK_NAME)
                    && w["token"].as_str().is_some_and(|t| !t.is_empty())
                    && w["type"].as_i64() == Some(1)
            }) {
                return Ok(Webhook {
                    id: w["id"].as_str().unwrap_or_default().to_string(),
                    token: w["token"].as_str().unwrap_or_default().to_string(),
                });
            }
        }
    }

    let resp = http
        .post(&list_url)
        .header("Authorization", format!("Bot {token}"))
        .json(&json!({ "name": WEBHOOK_NAME }))
        .send()
        .await?;
    let status = resp.status();
    let v: Value = resp.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        anyhow::bail!("create webhook failed: {status} {v}");
    }
    Ok(Webhook {
        id: v["id"].as_str().unwrap_or_default().to_string(),
        token: v["token"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("webhook response missing token"))?,
    })
}

async fn execute_webhook(
    http: &reqwest::Client,
    api: &str,
    wh: &Webhook,
    username: Option<&str>,
    avatar_url: Option<&str>,
    content: Option<&str>,
    files: &[PathBuf],
) -> anyhow::Result<()> {
    let mut payload = Map::new();
    if let Some(c) = content.filter(|c| !c.is_empty()) {
        payload.insert("content".into(), json!(c));
    }
    if let Some(u) = username {
        payload.insert("username".into(), json!(u));
    }
    if let Some(a) = avatar_url {
        payload.insert("avatar_url".into(), json!(a));
    }
    let mut form = reqwest::multipart::Form::new()
        .text("payload_json", Value::Object(payload).to_string());
    for (i, p) in files.iter().take(MAX_FILES).enumerate() {
        let bytes = tokio::fs::read(p).await?;
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .to_string();
        let part = reqwest::multipart::Part::bytes(bytes).file_name(name);
        form = form.part(format!("files[{i}]"), part);
    }

    let url = format!("{api}/v1/webhooks/{}/{}", wh.id, wh.token);
    let resp = http
        .post(&url)
        .timeout(UPLOAD_TIMEOUT)
        .multipart(form)
        .send()
        .await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("execute webhook failed: {status} {body}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> FluxerSettings {
        FluxerSettings {
            token: "app.secret".into(),
            command_name: "get".into(),
            command_prefix: "!".into(),
            post_as_user: false,
            delete_command: false,
        }
    }

    #[test]
    fn parses_basic_command() {
        let s = settings();
        let (kind, url, caption) = parse_command("!get https://example.com/a", &s).unwrap();
        assert_eq!(kind, "video");
        assert_eq!(url, "https://example.com/a");
        assert!(caption.is_none());
    }

    #[test]
    fn parses_image_and_caption() {
        let s = settings();
        let (kind, url, caption) =
            parse_command("!get image https://example.com/a.png look at this", &s).unwrap();
        assert_eq!(kind, "image");
        assert_eq!(url, "https://example.com/a.png");
        assert_eq!(caption.as_deref(), Some("look at this"));
    }

    #[test]
    fn ignores_non_commands() {
        let s = settings();
        assert!(parse_command("hello there https://example.com/a", &s).is_none());
        assert!(parse_command("!getting https://example.com/a", &s).is_none());
        assert!(parse_command("!get not-a-url", &s).is_none());
    }
}
