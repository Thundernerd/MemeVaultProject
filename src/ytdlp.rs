//! yt-dlp subprocess wrapper.

use crate::binaries;
use crate::config::Config;
use crate::cookies;
use crate::db::{self, Db};
use crate::ffprobe;
use regex::Regex;
use serde_json::Value;
use std::io::Read;
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
        // TikTok (and some others) write covers as `.image`; convert so the UI can serve them.
        args.push("--convert-thumbnails".into());
        args.push("jpg".into());
    }
    let cookies = if let Some(cookie) = cookies::cookie_path(config, "ytdlp") {
        if cookie.exists() {
            args.push("--cookies".into());
            args.push(cookie.to_string_lossy().into());
            true
        } else {
            false
        }
    } else {
        false
    };
    // TikTok's default "best" is often HEVC. Chrome/Firefox play the AAC track and skip the
    // video, which looks like an audio-only download. Prefer H.264 when the site offers it.
    if is_tiktok_url(url) {
        args.push("-S".into());
        args.push("vcodec:h264".into());
    }
    args.push("-o".into());
    args.push(job_dir.join("%(title)s.%(ext)s").to_string_lossy().into());
    for part in shell_split(&extra) {
        args.push(part);
    }
    args.push(url.to_string());

    let binary_name = Path::new(&ytdlp)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("yt-dlp");
    tracing::info!(
        url = %url,
        binary = %binary_name,
        cookies,
        "spawning yt-dlp"
    );

    let mut child = Command::new(&ytdlp)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
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

    // Drain stderr so ffmpeg thumbnail conversion cannot fill the pipe and deadlock.
    // Keep a short tail for failure diagnostics.
    let stderr_task = async {
        let mut reader = BufReader::new(stderr).lines();
        let mut tail: Vec<String> = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            if tail.len() >= 8 {
                tail.remove(0);
            }
            tail.push(line);
        }
        tail
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

    let (_, stderr_tail, status) = tokio::join!(read_task, stderr_task, wait_task);
    let status = status?;
    if !status.success() {
        let stderr_tail = truncate_stderr_tail(&stderr_tail);
        tracing::error!(
            url = %url,
            status = %status,
            stderr_tail = %stderr_tail,
            "yt-dlp exited with non-zero status"
        );
        anyhow::bail!("yt-dlp exited with {status}");
    }

    let mut result = finalize_job_dir(&job_dir)?;
    let file_name = result
        .file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("?");
    tracing::info!(
        url = %url,
        file = %file_name,
        "yt-dlp download finalized"
    );
    let thumb_missing = result
        .thumbnail_path
        .as_ref()
        .map(|p| !p.exists())
        .unwrap_or(true);
    if thumb_missing {
        let thumb = job_dir.join("thumbnail.jpg");
        if ffprobe::generate_video_thumbnail(db, config, &result.file_path, &thumb).await {
            result.thumbnail_path = Some(thumb);
        } else {
            result.thumbnail_path = None;
        }
    }
    Ok(result)
}

fn truncate_stderr_tail(lines: &[String]) -> String {
    let joined = lines.join(" | ");
    if joined.chars().count() <= 500 {
        joined
    } else {
        joined.chars().take(500).collect::<String>() + "…"
    }
}

fn finalize_job_dir(job_dir: &Path) -> anyhow::Result<YtdlpResult> {
    let mut video: Option<PathBuf> = None;
    let mut audio: Option<PathBuf> = None;
    let mut thumb: Option<PathBuf> = None;
    let mut info: Option<PathBuf> = None;

    for entry in std::fs::read_dir(job_dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.ends_with(".info.json") || name.ends_with(".part") {
            if name.ends_with(".info.json") {
                info = Some(path);
            }
            continue;
        }
        if is_image_ext(&path) {
            thumb = Some(path);
        } else if is_video_container(&path) {
            // Prefer a real video file over an earlier audio-only download.
            video = Some(path);
        } else if is_audio_container(&path) && audio.is_none() {
            audio = Some(path);
        }
    }

    let video = video
        .or(audio)
        .ok_or_else(|| anyhow::anyhow!("no media file found in job dir"))?;
    let ext = video
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    let final_video = job_dir.join(format!("video.{ext}"));
    if video != final_video {
        std::fs::rename(&video, &final_video)?;
    }

    let final_thumb = if let Some(t) = thumb {
        let mut ext = t
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg")
            .to_lowercase();
        if ext == "image" || ext == "jpeg" {
            ext = if ext == "image" {
                detect_image_ext(&t).to_string()
            } else {
                "jpg".into()
            };
        }
        let dest = job_dir.join(format!("thumbnail.{ext}"));
        if t != dest {
            std::fs::rename(&t, &dest)?;
        }
        if dest.exists() {
            Some(dest)
        } else {
            None
        }
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

fn ext_lower(p: &Path) -> String {
    p.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn is_video_container(p: &Path) -> bool {
    matches!(
        ext_lower(p).as_str(),
        "mp4" | "webm" | "mkv" | "avi" | "mov" | "flv" | "wmv" | "m4v" | "3gp" | "ts"
    )
}

fn is_audio_container(p: &Path) -> bool {
    matches!(
        ext_lower(p).as_str(),
        "m4a" | "mp3" | "opus" | "ogg" | "aac" | "wav" | "flac"
    )
}

fn is_image_ext(p: &Path) -> bool {
    matches!(
        ext_lower(p).as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "avif" | "image"
    )
}

fn detect_image_ext(path: &Path) -> &'static str {
    let mut buf = [0u8; 12];
    let Ok(mut f) = std::fs::File::open(path) else {
        return "jpg";
    };
    if f.read(&mut buf).unwrap_or(0) < 3 {
        return "jpg";
    }
    if buf[0] == 0xff && buf[1] == 0xd8 && buf[2] == 0xff {
        return "jpg";
    }
    if buf[0] == 0x89 && buf[1] == 0x50 && buf[2] == 0x4e && buf[3] == 0x47 {
        return "png";
    }
    if buf[0] == 0x52
        && buf[1] == 0x49
        && buf[2] == 0x46
        && buf[3] == 0x46
        && buf[8] == 0x57
        && buf[9] == 0x45
        && buf[10] == 0x42
        && buf[11] == 0x50
    {
        return "webp";
    }
    if buf[4] == b'f' && buf[5] == b't' && buf[6] == b'y' && buf[7] == b'p' {
        return "avif";
    }
    "jpg"
}

fn is_tiktok_url(url: &str) -> bool {
    let host = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()));
    match host {
        Some(h) => {
            h == "tiktok.com"
                || h.ends_with(".tiktok.com")
                || h == "tiktokv.com"
                || h.ends_with(".tiktokv.com")
        }
        None => {
            let lower = url.to_ascii_lowercase();
            lower.contains("tiktok.com") || lower.contains("tiktokv.com")
        }
    }
}

fn shell_split(s: &str) -> Vec<String> {
    s.split_whitespace().map(|p| p.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn jpeg_bytes() -> Vec<u8> {
        // Minimal JPEG SOI + extra bytes so detect_image_ext can read a header.
        let mut b = vec![0xff, 0xd8, 0xff, 0xe0];
        b.extend_from_slice(&[0u8; 16]);
        b
    }

    #[test]
    fn tiktok_hosts_are_detected() {
        assert!(is_tiktok_url("https://vm.tiktok.com/ZGdxGkd5x/"));
        assert!(is_tiktok_url("https://www.tiktok.com/@user/video/123"));
        assert!(is_tiktok_url("https://vt.tiktok.com/abc"));
        assert!(!is_tiktok_url("https://youtube.com/watch?v=abc"));
        assert!(!is_tiktok_url("https://example.com/tiktok.com/fake"));
    }

    #[test]
    fn finalize_renames_image_thumbnail_and_prefers_video() {
        let dir = tempfile::tempdir().unwrap();
        let job = dir.path();
        fs::write(job.join("clip.m4a"), b"audio").unwrap();
        fs::write(job.join("clip.mp4"), b"video").unwrap();
        fs::write(job.join("clip.image"), jpeg_bytes()).unwrap();
        fs::write(job.join("clip.info.json"), "{}").unwrap();

        let result = finalize_job_dir(job).unwrap();
        assert_eq!(result.file_path.file_name().unwrap(), "video.mp4");
        let thumb = result.thumbnail_path.expect("thumbnail");
        assert_eq!(thumb.file_name().unwrap(), "thumbnail.jpg");
        assert!(thumb.exists());
        assert!(job.join("data.json").exists());
        assert!(!job.join("clip.m4a").exists() || result.file_path.extension().unwrap() != "m4a");
    }

    #[test]
    fn finalize_falls_back_to_audio_if_no_video() {
        let dir = tempfile::tempdir().unwrap();
        let job = dir.path();
        fs::write(job.join("track.m4a"), b"audio").unwrap();
        let result = finalize_job_dir(job).unwrap();
        assert_eq!(result.file_path.file_name().unwrap(), "video.m4a");
        assert!(result.thumbnail_path.is_none());
    }
}
