//! In-process download queue (2s poll, concurrency 1).

use crate::autotag;
use crate::config::Config;
use crate::db::{self, Db, NewMedia, QueueStatus};
use crate::ffprobe;
use crate::gallerydl;
use crate::process_tree::Cancelled;
use crate::ytdlp;
use std::collections::HashMap;
use std::path::PathBuf;
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

/// How a finished download ended, decided once for the queue row, the
/// worker's log and the bot replies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadOutcome {
    /// The download produced this many files (at least one).
    Completed(usize),
    /// The download succeeded but produced no files.
    Empty,
    /// The download was stopped by a cancel signal.
    Cancelled,
    /// The download failed with this error message.
    Failed(String),
}

impl DownloadOutcome {
    /// Classify a download's result: its file count, or the error it stopped with.
    pub fn from_result(result: Result<usize, &anyhow::Error>) -> Self {
        match result {
            Ok(0) => Self::Empty,
            Ok(file_count) => Self::Completed(file_count),
            Err(e) if e.chain().any(|cause| cause.is::<Cancelled>()) => Self::Cancelled,
            Err(e) => Self::Failed(e.to_string()),
        }
    }
}

/// Write the end of a download to its queue item row.
pub fn finish_queue_item(db: &Db, item_id: &str, outcome: &DownloadOutcome) {
    let (status, progress, error) = match outcome {
        DownloadOutcome::Completed(_) => (QueueStatus::Completed, Some(100.0), None),
        DownloadOutcome::Empty => (QueueStatus::Failed, None, Some("No files downloaded")),
        DownloadOutcome::Cancelled => (QueueStatus::Cancelled, None, Some("cancelled")),
        DownloadOutcome::Failed(message) => (QueueStatus::Failed, None, Some(message.as_str())),
    };
    let completed_at = chrono::Utc::now().to_rfc3339();
    let _ = db.with_conn(|c| {
        db::update_queue_item(
            c,
            item_id,
            Some(status),
            progress,
            Some(error),
            Some(Some(&completed_at)),
        )?;
        Ok(())
    });
}

/// Persist download progress updates to the queue item row.
pub fn spawn_progress_persister(db: Db, item_id: String, mut progress_rx: watch::Receiver<f64>) {
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
        db::update_queue_item(
            c,
            &item.id,
            Some(QueueStatus::Downloading),
            Some(0.0),
            None,
            None,
        )?;
        Ok(())
    });

    let result = if item.downloader == "gallery-dl" {
        run_gallery(db, config, &item, progress_tx, cancel_rx).await
    } else {
        run_video(db, config, &item, progress_tx, cancel_rx).await
    };

    handle.unregister(&item.id).await;

    let outcome = DownloadOutcome::from_result(result.as_ref().copied());
    finish_queue_item(db, &item.id, &outcome);

    match outcome {
        DownloadOutcome::Completed(file_count) => {
            tracing::info!(
                item_id = %item.id,
                url = %item.url,
                downloader = %item.downloader,
                file_count,
                "queue item completed"
            );
        }
        DownloadOutcome::Empty => {
            tracing::warn!(
                item_id = %item.id,
                url = %item.url,
                downloader = %item.downloader,
                "queue item produced no files"
            );
        }
        DownloadOutcome::Cancelled => {
            tracing::warn!(
                item_id = %item.id,
                url = %item.url,
                "queue item cancelled"
            );
        }
        DownloadOutcome::Failed(msg) => {
            tracing::error!(
                item_id = %item.id,
                url = %item.url,
                downloader = %item.downloader,
                error = %msg,
                "queue item failed"
            );
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
) -> anyhow::Result<usize> {
    let result =
        ytdlp::run_ytdlp(db, config, &item.url, Some(progress_tx), cancel_rx, None).await?;

    let meta = &result.metadata;
    let title = meta.get("title").and_then(|v| v.as_str());
    let description = meta.get("description").and_then(|v| v.as_str());
    let uploader = meta
        .get("uploader")
        .or_else(|| meta.get("channel"))
        .and_then(|v| v.as_str());
    let probe = ffprobe::probe_file(db, config, &result.file_path).await;
    let duration = meta
        .get("duration")
        .and_then(|v| v.as_f64())
        .or(probe.duration);
    let width = meta.get("width").and_then(|v| v.as_i64()).or(probe.width);
    let height = meta.get("height").and_then(|v| v.as_i64()).or(probe.height);
    let format = result
        .file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_string())
        .or_else(|| Some("mp4".into()));
    let file_size = std::fs::metadata(&result.file_path)
        .ok()
        .map(|m| m.len() as i64);
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
                include_in_random: item.include_in_random,
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
    // yt-dlp downloads exactly one file per job.
    Ok(1)
}

async fn run_gallery(
    db: &Db,
    config: &Config,
    item: &db::QueueItem,
    progress_tx: watch::Sender<f64>,
    cancel_rx: watch::Receiver<bool>,
) -> anyhow::Result<usize> {
    let cancel_for_convert = cancel_rx.clone();
    let files = gallerydl::run_gallery_dl(
        db,
        config,
        &item.url,
        Some(progress_tx.clone()),
        cancel_rx,
        None,
    )
    .await?;

    if files.is_empty() {
        return Ok(0);
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

    let video_count = files.iter().filter(|f| f.media_type == "video").count();
    let mut video_idx = 0usize;

    for f in &files {
        let meta = &f.metadata;
        let title = meta.get("title").and_then(|v| v.as_str());
        let uploader = meta
            .get("uploader")
            .or_else(|| meta.get("author"))
            .and_then(|v| v.as_str());
        let raw = serde_json::to_string(meta).ok();

        let (file_path, format, file_size, width, height, duration, thumb) =
            if f.media_type == "video" {
                video_idx += 1;
                let base = if video_count > 0 {
                    85.0 + (video_idx.saturating_sub(1) as f64) * (15.0 / video_count as f64)
                } else {
                    85.0
                };
                let _ = progress_tx.send(base);
                let normalized = ffprobe::ensure_h264_mp4(
                    db,
                    config,
                    &f.file_path,
                    Some(&progress_tx),
                    Some(cancel_for_convert.clone()),
                    base,
                )
                .await?;
                let probe = ffprobe::probe_file(db, config, &normalized).await;
                let thumb_path = {
                    let parent = normalized
                        .parent()
                        .map(PathBuf::from)
                        .unwrap_or_else(|| PathBuf::from("."));
                    let stem = normalized
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("video");
                    let thumb = parent.join(format!("{stem}_thumbnail.jpg"));
                    if ffprobe::generate_video_thumbnail(db, config, &normalized, &thumb).await {
                        Some(thumb.to_string_lossy().to_string())
                    } else {
                        None
                    }
                };
                let file_size = std::fs::metadata(&normalized).ok().map(|m| m.len() as i64);
                (
                    normalized.to_string_lossy().to_string(),
                    Some("mp4".to_string()),
                    file_size,
                    probe
                        .width
                        .or_else(|| meta.get("width").and_then(|v| v.as_i64())),
                    probe
                        .height
                        .or_else(|| meta.get("height").and_then(|v| v.as_i64())),
                    probe.duration,
                    thumb_path,
                )
            } else {
                let format = f
                    .file_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_string());
                let file_size = std::fs::metadata(&f.file_path).ok().map(|m| m.len() as i64);
                (
                    f.file_path.to_string_lossy().to_string(),
                    format,
                    file_size,
                    meta.get("width").and_then(|v| v.as_i64()),
                    meta.get("height").and_then(|v| v.as_i64()),
                    None,
                    Some(f.file_path.to_string_lossy().to_string()),
                )
            };

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
                    duration,
                    thumbnail_path: thumb.as_deref(),
                    file_path: &file_path,
                    file_size,
                    format: format.as_deref(),
                    width,
                    height,
                    raw_metadata: raw.as_deref(),
                    album_id: album_id.as_deref(),
                    include_in_random: item.include_in_random,
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

    let _ = progress_tx.send(100.0);
    Ok(files.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestVault;

    #[test]
    fn a_download_with_files_is_completed() {
        assert_eq!(
            DownloadOutcome::from_result(Ok(3)),
            DownloadOutcome::Completed(3)
        );
    }

    #[test]
    fn a_download_with_no_files_is_empty() {
        assert_eq!(DownloadOutcome::from_result(Ok(0)), DownloadOutcome::Empty);
    }

    #[test]
    fn a_download_stopped_by_the_cancel_signal_is_cancelled() {
        let error = anyhow::Error::from(Cancelled);
        assert_eq!(
            DownloadOutcome::from_result(Err(&error)),
            DownloadOutcome::Cancelled
        );
    }

    #[test]
    fn a_cancel_wrapped_in_context_is_still_cancelled() {
        let error = anyhow::Error::from(Cancelled).context("converting to mp4");
        assert_eq!(
            DownloadOutcome::from_result(Err(&error)),
            DownloadOutcome::Cancelled
        );
    }

    #[test]
    fn an_error_that_only_mentions_cancelled_is_a_failure() {
        let error = anyhow::anyhow!("upstream request cancelled by server");
        assert_eq!(
            DownloadOutcome::from_result(Err(&error)),
            DownloadOutcome::Failed("upstream request cancelled by server".to_string())
        );
    }

    #[test]
    fn any_other_error_is_a_failure_with_its_message() {
        let error = anyhow::anyhow!("yt-dlp exited with status 1");
        assert_eq!(
            DownloadOutcome::from_result(Err(&error)),
            DownloadOutcome::Failed("yt-dlp exited with status 1".to_string())
        );
    }

    /// A queue item mid-download, at 42 % progress.
    fn downloading_item(vault: &TestVault) -> String {
        vault
            .db
            .with_conn(|c| {
                let item = db::insert_queue_item(
                    c,
                    "https://example.com/v",
                    "yt-dlp",
                    db::QueueSource::Web,
                    None,
                    false,
                )?;
                db::update_queue_item(
                    c,
                    &item.id,
                    Some(QueueStatus::Downloading),
                    Some(42.0),
                    None,
                    None,
                )?;
                Ok(item.id)
            })
            .unwrap()
    }

    fn row(vault: &TestVault, id: &str) -> db::QueueItem {
        vault
            .db
            .with_conn(|c| Ok(db::get_queue_item(c, id)?))
            .unwrap()
            .unwrap()
    }

    #[test]
    fn a_download_with_files_completes_the_item() {
        let vault = TestVault::new();
        let id = downloading_item(&vault);

        finish_queue_item(&vault.db, &id, &DownloadOutcome::Completed(2));

        let item = row(&vault, &id);
        assert_eq!(item.status, QueueStatus::Completed);
        assert_eq!(item.progress, 100.0);
        assert_eq!(item.error, None);
        assert!(item.completed_at.is_some());
    }

    #[test]
    fn a_download_with_no_files_fails_the_item() {
        let vault = TestVault::new();
        let id = downloading_item(&vault);

        finish_queue_item(&vault.db, &id, &DownloadOutcome::Empty);

        let item = row(&vault, &id);
        assert_eq!(item.status, QueueStatus::Failed);
        assert_eq!(item.progress, 42.0);
        assert_eq!(item.error.as_deref(), Some("No files downloaded"));
        assert!(item.completed_at.is_some());
    }

    #[test]
    fn a_cancelled_download_cancels_the_item() {
        let vault = TestVault::new();
        let id = downloading_item(&vault);

        finish_queue_item(&vault.db, &id, &DownloadOutcome::Cancelled);

        let item = row(&vault, &id);
        assert_eq!(item.status, QueueStatus::Cancelled);
        assert_eq!(item.progress, 42.0);
        assert_eq!(item.error.as_deref(), Some("cancelled"));
        assert!(item.completed_at.is_some());
    }

    #[test]
    fn a_failed_download_fails_the_item_with_its_error() {
        let vault = TestVault::new();
        let id = downloading_item(&vault);

        finish_queue_item(
            &vault.db,
            &id,
            &DownloadOutcome::Failed("yt-dlp exited with status 1".to_string()),
        );

        let item = row(&vault, &id);
        assert_eq!(item.status, QueueStatus::Failed);
        assert_eq!(item.progress, 42.0);
        assert_eq!(item.error.as_deref(), Some("yt-dlp exited with status 1"));
        assert!(item.completed_at.is_some());
    }
}
