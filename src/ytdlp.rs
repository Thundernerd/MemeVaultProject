//! yt-dlp subprocess wrapper.

use crate::binaries;
use crate::config::Config;
use crate::cookies;
use crate::db::{self, Db};
use regex::Regex;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::watch;

#[derive(Debug, Clone)]
pub struct YtdlpResult {
    pub file_path: PathBuf,
    pub thumbnail_path: Option<PathBuf>,
    pub metadata: Value,
}

pub async fn run_ytdlp(
    db: &Db,
    config: &Config,
    url: &str,
    progress_tx: Option<watch::Sender<f64>>,
    cancel: tokio::sync::watch::Receiver<bool>,
    output_dir: Option<PathBuf>,
) -> anyhow::Result<YtdlpResult> {
    let download_path = db
        .with_conn(|c| Ok(db::get_setting(c, "download_path")))?
        .unwrap_or_else(|| config.data_dir.join("media").to_string_lossy().into());
    std::fs::create_dir_all(&download_path)?;

    let job_dir = output_dir.unwrap_or_else(|| {
        let ts = chrono::Utc::now().timestamp_millis();
        PathBuf::from(&download_path).join(format!("ytdlp_{ts}"))
    });
    std::fs::create_dir_all(&job_dir)?;

    let ytdlp = binaries::get_ytdlp_path(db, config);
    let ffmpeg = binaries::get_ffmpeg_path(db, config);
    let extra = db
        .with_conn(|c| Ok(db::get_setting(c, "ytdlp_extra_args")))?
        .unwrap_or_default();

    let mut args: Vec<String> = vec![
        "--write-thumbnail".into(),
        "--write-info-json".into(),
        "--newline".into(),
    ];
    if Path::new(&ffmpeg).exists() {
        args.push("--ffmpeg-location".into());
        args.push(
            Path::new(&ffmpeg)
                .parent()
                .unwrap_or(Path::new("."))
                .to_string_lossy()
                .into(),
        );
    }
    if let Some(cookie) = cookies::cookie_path(config, "ytdlp") {
        if cookie.exists() {
            args.push("--cookies".into());
            args.push(cookie.to_string_lossy().into());
        }
    }
    args.push("-o".into());
    args.push(job_dir.join("%(title)s.%(ext)s").to_string_lossy().into());
    for part in shell_split(&extra) {
        args.push(part);
    }
    args.push(url.to_string());

    let mut child = Command::new(&ytdlp)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let stdout = child.stdout.take().unwrap();
    let progress_re = Regex::new(r"\[download\]\s+([\d.]+)%").unwrap();
    let mut reader = BufReader::new(stdout).lines();
    let progress_tx = progress_tx.map(Arc::new);

    let read_task = async {
        while let Ok(Some(line)) = reader.next_line().await {
            if let Some(caps) = progress_re.captures(&line) {
                if let Ok(pct) = caps[1].parse::<f64>() {
                    if let Some(ref tx) = progress_tx {
                        let _ = tx.send(pct);
                    }
                }
            }
        }
    };

    let wait_task = async {
        let mut cancel = cancel;
        loop {
            tokio::select! {
                status = child.wait() => break status,
                _ = cancel.changed() => {
                    if *cancel.borrow() {
                        let _ = child.start_kill();
                        break child.wait().await;
                    }
                }
            }
        }
    };

    let (_, status) = tokio::join!(read_task, wait_task);
    let status = status?;
    if !status.success() {
        // cancel was moved; check via channel clone before move — use status only
        anyhow::bail!("yt-dlp exited with {status}");
    }

    finalize_job_dir(&job_dir)
}

fn finalize_job_dir(job_dir: &Path) -> anyhow::Result<YtdlpResult> {
    let mut video: Option<PathBuf> = None;
    let mut thumb: Option<PathBuf> = None;
    let mut info: Option<PathBuf> = None;

    for entry in std::fs::read_dir(job_dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.ends_with(".info.json") {
            info = Some(path);
        } else if is_image_ext(&path) && (name.contains("thumbnail") || is_thumb_name(name)) {
            thumb = Some(path);
        } else if is_video_ext(&path) || (is_media_ext(&path) && !name.ends_with(".json")) {
            if video.is_none() && !name.ends_with(".json") && !is_image_ext(&path) {
                video = Some(path);
            } else if video.is_none() && is_video_ext(&path) {
                video = Some(path);
            }
        }
    }

    // Prefer video file; fall back to any non-json media
    if video.is_none() {
        for entry in std::fs::read_dir(job_dir)? {
            let path = entry?.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.ends_with(".json") || name.ends_with(".part") {
                continue;
            }
            if is_media_ext(&path) {
                video = Some(path);
                break;
            }
        }
    }

    // Thumbnail: yt-dlp writes .webp/.jpg alongside
    if thumb.is_none() {
        for entry in std::fs::read_dir(job_dir)? {
            let path = entry?.path();
            if is_image_ext(&path) {
                thumb = Some(path);
                break;
            }
        }
    }

    let video = video.ok_or_else(|| anyhow::anyhow!("no media file found in job dir"))?;
    let ext = video
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let final_video = job_dir.join(format!("video.{ext}"));
    if video != final_video {
        std::fs::rename(&video, &final_video)?;
    }

    let final_thumb = if let Some(t) = thumb {
        let text = t.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
        let dest = job_dir.join(format!("thumbnail.{text}"));
        if t != dest {
            let _ = std::fs::rename(&t, &dest);
        }
        Some(dest)
    } else {
        None
    };

    let metadata = if let Some(info_path) = info {
        let data = std::fs::read_to_string(&info_path).unwrap_or_else(|_| "{}".into());
        let dest = job_dir.join("data.json");
        let _ = std::fs::rename(&info_path, &dest);
        serde_json::from_str(&data).unwrap_or(Value::Object(Default::default()))
    } else {
        Value::Object(Default::default())
    };

    Ok(YtdlpResult {
        file_path: final_video,
        thumbnail_path: final_thumb,
        metadata,
    })
}

fn is_video_ext(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str(),
        "mp4" | "webm" | "mkv" | "avi" | "mov" | "flv" | "wmv" | "m4a" | "mp3" | "opus"
    )
}

fn is_image_ext(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "gif"
    )
}

fn is_media_ext(p: &Path) -> bool {
    is_video_ext(p) || is_image_ext(p)
}

fn is_thumb_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains(".jpg") || lower.contains(".webp") || lower.contains(".png")
}

fn shell_split(s: &str) -> Vec<String> {
    s.split_whitespace().map(|p| p.to_string()).collect()
}
