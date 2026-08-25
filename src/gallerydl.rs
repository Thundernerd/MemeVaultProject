//! gallery-dl subprocess wrapper.

use crate::binaries;
use crate::config::Config;
use crate::cookies;
use crate::db::{self, Db};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::watch;

#[derive(Debug, Clone)]
pub struct GalleryDlFile {
    pub file_path: PathBuf,
    pub metadata: Value,
    pub media_type: String, // video | image
}

pub async fn run_gallery_dl(
    db: &Db,
    config: &Config,
    url: &str,
    progress_tx: Option<watch::Sender<f64>>,
    cancel: tokio::sync::watch::Receiver<bool>,
    output_dir: Option<PathBuf>,
) -> anyhow::Result<Vec<GalleryDlFile>> {
    let download_path = db
        .with_conn(|c| Ok(db::get_setting(c, "download_path")))?
        .unwrap_or_else(|| config.data_dir.join("media").to_string_lossy().into());
    std::fs::create_dir_all(&download_path)?;

    let job_dir = output_dir.unwrap_or_else(|| {
        let ts = chrono::Utc::now().timestamp_millis();
        PathBuf::from(&download_path).join(format!("gallerydl_{ts}"))
    });
    std::fs::create_dir_all(&job_dir)?;

    let bin = binaries::get_gallerydl_path(db, config);
    let extra = db
        .with_conn(|c| Ok(db::get_setting(c, "gallerydl_extra_args")))?
        .unwrap_or_default();

    let mut args: Vec<String> = vec![
        "--write-metadata".into(),
        "--directory".into(),
        job_dir.to_string_lossy().into(),
    ];
    if let Some(cookie) = cookies::cookie_path(config, "gallerydl") {
        if cookie.exists() {
            args.push("--cookies".into());
            args.push(cookie.to_string_lossy().into());
        }
    }
    for part in extra.split_whitespace() {
        args.push(part.to_string());
    }
    args.push(url.to_string());

    let mut child = Command::new(&bin)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout).lines();
    let progress_tx = progress_tx.map(Arc::new);
    let mut files_seen = 0u32;

    let read_task = async {
        while let Ok(Some(line)) = reader.next_line().await {
            let trimmed = line.trim();
            if trimmed.starts_with('/') && Path::new(trimmed).exists() {
                let p = Path::new(trimmed);
                if p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e != "json" && e != "part")
                    .unwrap_or(false)
                {
                    files_seen += 1;
                    if let Some(ref tx) = progress_tx {
                        let pct = (files_seen as f64 * 5.0).min(95.0);
                        let _ = tx.send(pct);
                    }
                }
            }
        }
        files_seen
    };

    let wait_task = async {
        loop {
            tokio::select! {
                status = child.wait() => break status,
                _ = async {
                    let mut c = cancel.clone();
                    let _ = c.changed().await;
                } => {
                    if *cancel.borrow() {
                        let _ = child.start_kill();
                        break child.wait().await;
                    }
                }
            }
        }
    };

    let (count, status) = tokio::join!(read_task, wait_task);
    let status = status?;
    if !status.success() {
        if *cancel.borrow() {
            anyhow::bail!("cancelled");
        }
        anyhow::bail!("gallery-dl exited with {status}");
    }
    let _ = count;

    let files = collect_files(&job_dir)?;
    if let Some(tx) = progress_tx {
        let _ = tx.send(100.0);
    }
    Ok(files)
}

fn collect_files(job_dir: &Path) -> anyhow::Result<Vec<GalleryDlFile>> {
    let mut media_paths: Vec<PathBuf> = Vec::new();
    for entry in walkdir::WalkDir::new(job_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.ends_with(".json") || name.ends_with(".part") {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if matches!(
            ext.as_str(),
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "avif" | "bmp" | "tiff"
                | "mp4" | "webm" | "mkv" | "mov"
        ) {
            media_paths.push(path.to_path_buf());
        }
    }
    media_paths.sort();

    let mut results = Vec::new();
    for (i, src) in media_paths.into_iter().enumerate() {
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        let dest = job_dir.join(format!("image_{:03}.{ext}", i + 1));
        if src != dest {
            std::fs::rename(&src, &dest)?;
        }
        let meta_src = PathBuf::from(format!("{}.json", src.display()));
        // after rename, metadata may still use old name — also try dest.json
        let meta = read_sidecar_meta(&meta_src)
            .or_else(|| read_sidecar_meta(&PathBuf::from(format!("{}.json", dest.display()))))
            .unwrap_or(Value::Object(Default::default()));
        if meta_src.exists() {
            let _ = std::fs::rename(&meta_src, format!("{}.json", dest.display()));
        }
        let media_type = if matches!(ext, "mp4" | "webm" | "mkv" | "mov") {
            "video"
        } else {
            "image"
        };
        results.push(GalleryDlFile {
            file_path: dest,
            metadata: meta,
            media_type: media_type.into(),
        });
    }
    Ok(results)
}

fn read_sidecar_meta(path: &Path) -> Option<Value> {
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}
