//! ffprobe metadata + ffmpeg thumbnail generation.

use crate::binaries;
use crate::config::Config;
use crate::db::Db;
use serde::Deserialize;
use std::path::Path;
use std::process::Stdio;

#[derive(Debug, Clone, Default)]
pub struct ProbeResult {
    pub duration: Option<f64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub format: Option<String>,
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
    width: Option<i64>,
    height: Option<i64>,
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
    let video = parsed
        .streams
        .unwrap_or_default()
        .into_iter()
        .find(|s| s.codec_type.as_deref() == Some("video"));
    ProbeResult {
        duration,
        width: video.as_ref().and_then(|v| v.width),
        height: video.as_ref().and_then(|v| v.height),
        format,
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
