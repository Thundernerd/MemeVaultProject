//! ffprobe metadata + ffmpeg thumbnail generation + H.264 normalization.

use crate::binaries;
use crate::config::Config;
use crate::db::Db;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::watch;

#[derive(Debug, Clone, Default)]
pub struct ProbeResult {
    pub duration: Option<f64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub format: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub pix_fmt: Option<String>,
}

#[derive(Deserialize)]
struct FfprobeJson {
    format: Option<FfprobeFormat>,
    streams: Option<Vec<FfprobeStream>>,
}

#[derive(Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
    format_name: Option<String>,
}

#[derive(Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<i64>,
    height: Option<i64>,
    pix_fmt: Option<String>,
}

pub async fn probe_file(db: &Db, config: &Config, path: &Path) -> ProbeResult {
    let ffprobe = binaries::get_ffprobe_path(db, config);
    if !Path::new(&ffprobe).exists() {
        return ProbeResult::default();
    }
    let out = tokio::process::Command::new(&ffprobe)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &path.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await;
    let Ok(out) = out else {
        return ProbeResult::default();
    };
    let parsed: FfprobeJson = match serde_json::from_slice(&out.stdout) {
        Ok(p) => p,
        Err(_) => return ProbeResult::default(),
    };
    let duration = parsed
        .format
        .as_ref()
        .and_then(|f| f.duration.as_ref())
        .and_then(|d| d.parse().ok());
    let format = parsed
        .format
        .as_ref()
        .and_then(|f| f.format_name.clone())
        .map(|s| {
            s.split(',')
                .next()
                .unwrap_or(&s)
                .to_string()
        });
    let streams = parsed.streams.unwrap_or_default();
    let video = streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("video"));
    let audio = streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("audio"));
    ProbeResult {
        duration,
        width: video.and_then(|v| v.width),
        height: video.and_then(|v| v.height),
        format,
        video_codec: video.and_then(|v| v.codec_name.clone()),
        audio_codec: audio.and_then(|a| a.codec_name.clone()),
        pix_fmt: video.and_then(|v| v.pix_fmt.clone()),
    }
}

pub async fn generate_video_thumbnail(
    db: &Db,
    config: &Config,
    video_path: &Path,
    output_path: &Path,
) -> bool {
    let ffmpeg = binaries::get_ffmpeg_path(db, config);
    if !Path::new(&ffmpeg).exists() {
        return false;
    }
    let status = tokio::process::Command::new(&ffmpeg)
        .args([
            "-y",
            "-i",
            &video_path.to_string_lossy(),
            "-vf",
            "thumbnail,scale=720:-1",
            "-frames:v",
            "1",
            &output_path.to_string_lossy(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;
    matches!(status, Ok(s) if s.success()) && output_path.exists()
}

fn is_h264(codec: &str) -> bool {
    matches!(codec.to_ascii_lowercase().as_str(), "h264" | "avc1")
}

fn is_aac(codec: &str) -> bool {
    matches!(codec.to_ascii_lowercase().as_str(), "aac")
}

fn is_mp4_container(format: &str, path: &Path) -> bool {
    let fmt = format.to_ascii_lowercase();
    if fmt.split(',').any(|p| matches!(p.trim(), "mp4" | "mov" | "m4a" | "3gp" | "3g2" | "mj2")) {
        // Prefer extension when format_name is the broad ISO BMFF list
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        return matches!(ext.as_str(), "mp4" | "m4v" | "");
    }
    false
}

fn mp4_output_path(input: &Path) -> PathBuf {
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    input
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(format!("{stem}.mp4"))
}

/// Ensure the file is H.264 + AAC (when audio present) in an MP4 container.
/// Audio-only files (no video stream) are left unchanged.
///
/// Progress (when `progress_tx` is set) is mapped into `[progress_base, 100]`.
pub async fn ensure_h264_mp4(
    db: &Db,
    config: &Config,
    path: &Path,
    progress_tx: Option<&watch::Sender<f64>>,
    mut cancel: Option<watch::Receiver<bool>>,
    progress_base: f64,
) -> anyhow::Result<PathBuf> {
    let probe = probe_file(db, config, path).await;
    let Some(video_codec) = probe.video_codec.as_deref() else {
        // Audio-only or unreadable — leave as-is.
        if let Some(tx) = progress_tx {
            let _ = tx.send(100.0);
        }
        return Ok(path.to_path_buf());
    };

    let audio_ok = match probe.audio_codec.as_deref() {
        None => true,
        Some(c) => is_aac(c),
    };
    let pix_ok = probe
        .pix_fmt
        .as_deref()
        .map(|p| p.eq_ignore_ascii_case("yuv420p"))
        .unwrap_or(false);
    let container_ok = probe
        .format
        .as_deref()
        .map(|f| is_mp4_container(f, path))
        .unwrap_or_else(|| {
            path.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("mp4"))
                .unwrap_or(false)
        });

    if is_h264(video_codec) && audio_ok && pix_ok && container_ok {
        if let Some(tx) = progress_tx {
            let _ = tx.send(100.0);
        }
        tracing::debug!(path = %path.display(), "video already H.264-compatible");
        return Ok(path.to_path_buf());
    }

    let ffmpeg = binaries::get_ffmpeg_path(db, config);
    if !Path::new(&ffmpeg).exists() {
        anyhow::bail!("ffmpeg not found; cannot normalize video to H.264");
    }

    let final_path = mp4_output_path(path);
    let tmp_path = {
        let stem = final_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("video");
        final_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(format!("{stem}.partial.mp4"))
    };
    let _ = std::fs::remove_file(&tmp_path);

    let has_audio = probe.audio_codec.is_some();
    let remux = is_h264(video_codec) && pix_ok;

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        path.to_string_lossy().into(),
    ];
    if remux {
        tracing::info!(
            path = %path.display(),
            out = %final_path.display(),
            "remuxing to H.264 MP4"
        );
        args.push("-c:v".into());
        args.push("copy".into());
        if has_audio {
            args.push("-c:a".into());
            args.push("aac".into());
            args.push("-b:a".into());
            args.push("192k".into());
        } else {
            args.push("-an".into());
        }
    } else {
        tracing::info!(
            path = %path.display(),
            out = %final_path.display(),
            codec = %video_codec,
            "transcoding to H.264 MP4"
        );
        args.extend([
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "fast".into(),
            "-crf".into(),
            "23".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ]);
        if has_audio {
            args.extend([
                "-c:a".into(),
                "aac".into(),
                "-b:a".into(),
                "192k".into(),
            ]);
        } else {
            args.push("-an".into());
        }
    }
    args.push("-movflags".into());
    args.push("+faststart".into());
    args.push("-progress".into());
    args.push("pipe:1".into());
    args.push("-nostats".into());
    args.push(tmp_path.to_string_lossy().into());

    if let Some(tx) = progress_tx {
        let _ = tx.send(progress_base);
    }

    let mut child = tokio::process::Command::new(&ffmpeg)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let duration = probe.duration.unwrap_or(0.0);
    let progress_span = (100.0 - progress_base).max(0.0);

    let progress_task = {
        let progress_tx = progress_tx.cloned();
        async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(tx) = &progress_tx {
                    if let Some(pct) = parse_ffmpeg_progress(&line, duration, progress_base, progress_span)
                    {
                        let _ = tx.send(pct);
                    }
                }
            }
        }
    };

    let stderr_task = async move {
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
        if let Some(ref mut cancel) = cancel {
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
        } else {
            child.wait().await
        }
    };

    let (_, stderr_tail, status) = tokio::join!(progress_task, stderr_task, wait_task);
    let status = status?;

    if cancel
        .as_ref()
        .map(|c| *c.borrow())
        .unwrap_or(false)
    {
        let _ = std::fs::remove_file(&tmp_path);
        anyhow::bail!("cancelled");
    }

    if !status.success() {
        let _ = std::fs::remove_file(&tmp_path);
        let tail = if stderr_tail.len() <= 4 {
            stderr_tail.join("\n")
        } else {
            stderr_tail[stderr_tail.len() - 4..].join("\n")
        };
        anyhow::bail!("ffmpeg H.264 normalize failed ({status}): {tail}");
    }

    if !tmp_path.exists() {
        anyhow::bail!("ffmpeg did not produce output file");
    }

    if path != final_path && path.exists() {
        let _ = std::fs::remove_file(path);
    }
    if tmp_path != final_path {
        if final_path.exists() && final_path != path {
            let _ = std::fs::remove_file(&final_path);
        }
        std::fs::rename(&tmp_path, &final_path)?;
    }

    if let Some(tx) = progress_tx {
        let _ = tx.send(100.0);
    }

    Ok(final_path)
}

fn parse_ffmpeg_progress(
    line: &str,
    duration_secs: f64,
    progress_base: f64,
    progress_span: f64,
) -> Option<f64> {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("out_time_us=") {
        let us: f64 = rest.parse().ok()?;
        if duration_secs <= 0.0 {
            return Some(progress_base);
        }
        let ratio = (us / 1_000_000.0 / duration_secs).clamp(0.0, 1.0);
        return Some(progress_base + ratio * progress_span);
    }
    if line == "progress=end" {
        return Some(progress_base + progress_span);
    }
    None
}
