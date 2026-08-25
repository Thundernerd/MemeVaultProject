//! In-process download queue (2s poll, concurrency 1).

use crate::autotag;
use crate::config::Config;
use crate::db::{self, Db, NewMedia};
use crate::gallerydl;
use crate::ytdlp;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{watch, Mutex};

pub struct QueueHandle {
    cancel_map: Arc<Mutex<HashMap<String, watch::Sender<bool>>>>,
}

impl QueueHandle {
    pub fn new() -> Self {
        Self {
            cancel_map: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn register(&self, id: &str, tx: watch::Sender<bool>) {
        let mut map = self.cancel_map.lock().await;
        map.insert(id.to_string(), tx);
    }

    pub async fn unregister(&self, id: &str) {
        let mut map = self.cancel_map.lock().await;
        map.remove(id);
    }

    pub async fn cancel(&self, id: &str) -> bool {
        let map = self.cancel_map.lock().await;
        if let Some(tx) = map.get(id) {
            let _ = tx.send(true);
            tracing::info!(item_id = %id, "queue item cancel signaled");
            true
        } else {
            false
        }
    }
}

/// Persist download progress updates to the queue item row.
pub fn spawn_progress_persister(
    db: Db,
    item_id: String,
    mut progress_rx: watch::Receiver<f64>,
) {
    tokio::spawn(async move {
        let mut last = -1.0f64;
        loop {
            if progress_rx.changed().await.is_err() {
                let pct = *progress_rx.borrow();
                if (pct - last).abs() > 0.001 {
                    let _ = db.with_conn(|c| {
                        db::update_queue_item(c, &item_id, None, Some(pct), None, None)?;
                        Ok(())
                    });
                }
                break;
            }
            let pct = *progress_rx.borrow_and_update();
            if (pct - last).abs() < 0.25 && pct < 99.0 {
                continue;
            }
            last = pct;
            let _ = db.with_conn(|c| {
                db::update_queue_item(c, &item_id, None, Some(pct), None, None)?;
                Ok(())
            });
        }
    });
}

pub fn start_queue_processor(db: Db, config: Config, handle: Arc<QueueHandle>) {
    tokio::spawn(async move {
        let _ = db.with_conn(|c| {
            let n = db::reset_stale_downloads(c)?;
            if n > 0 {
                tracing::info!("reset {n} stale downloads to pending");
            }
            Ok(())
        });

        loop {
            if let Err(e) = process_next(&db, &config, &handle).await {
                tracing::error!("queue error: {e:#}");
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    });
}

async fn process_next(db: &Db, config: &Config, handle: &QueueHandle) -> anyhow::Result<()> {
    let active = db.with_conn(|c| Ok(db::count_active_downloads(c)?))?;
    if active >= 1 {
        return Ok(());
    }
    let Some(item) = db.with_conn(|c| Ok(db::get_next_pending_item(c)?))? else {
        return Ok(());
    };

    let (cancel_tx, cancel_rx) = watch::channel(false);
    handle.register(&item.id, cancel_tx).await;

    tracing::info!(
        item_id = %item.id,
        url = %item.url,
        downloader = %item.downloader,
        "queue item started"
    );

    let (progress_tx, progress_rx) = watch::channel(0.0f64);
    spawn_progress_persister(db.clone(), item.id.clone(), progress_rx);

    let _ = db.with_conn(|c| {
        db::update_queue_item(c, &item.id, Some("downloading"), Some(0.0), None, None)?;
        Ok(())
    });

    let result = if item.downloader == "gallery-dl" {
        run_gallery(db, config, &item, progress_tx, cancel_rx).await
    } else {
        run_video(db, config, &item, progress_tx, cancel_rx).await
    };

    handle.unregister(&item.id).await;

    match result {
        Ok(()) => {
            let _ = db.with_conn(|c| {
                db::update_queue_item(
                    c,
                    &item.id,
                    Some("completed"),
                    Some(100.0),
                    Some(None),
                    Some(Some(&chrono::Utc::now().to_rfc3339())),
                )?;
                Ok(())
            });
            tracing::info!(
                item_id = %item.id,
                url = %item.url,
                downloader = %item.downloader,
                "queue item completed"
            );
        }
        Err(e) => {
            let msg = e.to_string();
            let cancelled = msg.contains("cancelled");
            let status = if cancelled { "cancelled" } else { "failed" };
            let _ = db.with_conn(|c| {
                db::update_queue_item(
                    c,
                    &item.id,
                    Some(status),
                    None,
                    Some(Some(if cancelled { "cancelled" } else { &msg })),
                    Some(Some(&chrono::Utc::now().to_rfc3339())),
                )?;
                Ok(())
            });
            if cancelled {
                tracing::warn!(
                    item_id = %item.id,
                    url = %item.url,
                    "queue item cancelled"
                );
            } else {
                tracing::error!(
                    item_id = %item.id,
                    url = %item.url,
                    downloader = %item.downloader,
                    error = %msg,
                    "queue item failed"
                );
            }
        }
    }

    Ok(())
}

async fn run_video(
    db: &Db,
    config: &Config,
    item: &db::QueueItem,
    progress_tx: watch::Sender<f64>,
    cancel_rx: watch::Receiver<bool>,
) -> anyhow::Result<()> {
    let result = ytdlp::run_ytdlp(
        db,
        config,
        &item.url,
        Some(progress_tx),
        cancel_rx,
        None,
    )
    .await?;

    let meta = &result.metadata;
    let title = meta.get("title").and_then(|v| v.as_str());
    let description = meta.get("description").and_then(|v| v.as_str());
    let uploader = meta
        .get("uploader")
        .or_else(|| meta.get("channel"))
        .and_then(|v| v.as_str());
    let duration = meta.get("duration").and_then(|v| v.as_f64());
    let width = meta.get("width").and_then(|v| v.as_i64());
    let height = meta.get("height").and_then(|v| v.as_i64());
    let format = result
        .file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_string());
    let file_size = std::fs::metadata(&result.file_path).ok().map(|m| m.len() as i64);
    let thumb = result
        .thumbnail_path
        .as_ref()
        .map(|p| p.to_string_lossy().to_string());
    let raw = serde_json::to_string(meta).ok();
    let file_path = result.file_path.to_string_lossy().to_string();

    let media = db.with_conn(|c| {
        Ok(db::insert_media_item(
            c,
            NewMedia {
                queue_item_id: Some(&item.id),
                url: &item.url,
                media_type: "video",
                title,
                description,
                uploader,
                duration,
                thumbnail_path: thumb.as_deref(),
                file_path: &file_path,
                file_size,
                format: format.as_deref(),
                width,
                height,
                raw_metadata: raw.as_deref(),
                album_id: None,
                include_in_random: 0,
            },
        )?)
    })?;

    autotag::auto_tag_media(
        db,
        &media.id,
        &media.url,
        &media.media_type,
        media.uploader.as_deref(),
        media.format.as_deref(),
        &media.created_at,
    );
    Ok(())
}

async fn run_gallery(
    db: &Db,
    config: &Config,
    item: &db::QueueItem,
    progress_tx: watch::Sender<f64>,
    cancel_rx: watch::Receiver<bool>,
) -> anyhow::Result<()> {
    let files = gallerydl::run_gallery_dl(
        db,
        config,
        &item.url,
        Some(progress_tx),
        cancel_rx,
        None,
    )
    .await?;

    if files.is_empty() {
        anyhow::bail!("gallery-dl produced no files");
    }

    let album_id = if files.len() > 1 {
        let title = files[0]
            .metadata
            .get("title")
            .or_else(|| files[0].metadata.get("manga"))
            .and_then(|v| v.as_str());
        let uploader = files[0]
            .metadata
            .get("uploader")
            .or_else(|| files[0].metadata.get("author"))
            .and_then(|v| v.as_str());
        let album = db.with_conn(|c| {
            Ok(db::insert_album(
                c,
                Some(&item.id),
                &item.url,
                title,
                uploader,
            )?)
        })?;
        Some(album.id)
    } else {
        None
    };

    for f in &files {
        let meta = &f.metadata;
        let title = meta.get("title").and_then(|v| v.as_str());
        let uploader = meta
            .get("uploader")
            .or_else(|| meta.get("author"))
            .and_then(|v| v.as_str());
        let format = f
            .file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_string());
        let file_size = std::fs::metadata(&f.file_path).ok().map(|m| m.len() as i64);
        let thumb = if f.media_type == "image" {
            Some(f.file_path.to_string_lossy().to_string())
        } else {
            None
        };
        let raw = serde_json::to_string(meta).ok();
        let file_path = f.file_path.to_string_lossy().to_string();
        let width = meta.get("width").and_then(|v| v.as_i64());
        let height = meta.get("height").and_then(|v| v.as_i64());

        let media = db.with_conn(|c| {
            Ok(db::insert_media_item(
                c,
                NewMedia {
                    queue_item_id: Some(&item.id),
                    url: &item.url,
                    media_type: &f.media_type,
                    title,
                    description: None,
                    uploader,
                    duration: None,
                    thumbnail_path: thumb.as_deref(),
                    file_path: &file_path,
                    file_size,
                    format: format.as_deref(),
                    width,
                    height,
                    raw_metadata: raw.as_deref(),
                    album_id: album_id.as_deref(),
                    include_in_random: 0,
                },
            )?)
        })?;

        autotag::auto_tag_media(
            db,
            &media.id,
            &media.url,
            &media.media_type,
            media.uploader.as_deref(),
            media.format.as_deref(),
            &media.created_at,
        );
    }

    Ok(())
}
