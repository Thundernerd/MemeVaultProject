use crate::autotag;
use crate::db::{self, NewMedia};
use crate::error::{AppError, AppResult};
use crate::ffprobe;
use crate::state::AppState;
use axum::extract::{Multipart, State};
use axum::Json;
use serde_json::{json, Value};
use std::path::PathBuf;

fn is_allowed(mime: &str, filename: &str) -> Option<&'static str> {
    let video = [
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-matroska",
        "video/avi",
        "video/x-msvideo",
        "video/x-flv",
        "video/x-ms-wmv",
        "video/3gpp",
    ];
    let image = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/avif",
        "image/tiff",
        "image/bmp",
    ];
    if video.iter().any(|m| mime.starts_with(m)) {
        return Some("video");
    }
    if image.iter().any(|m| mime.starts_with(m)) {
        return Some("image");
    }
    // Fallback by extension
    let ext = PathBuf::from(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "mp4" | "webm" | "mov" | "mkv" | "avi" | "flv" | "wmv" | "3gp" => Some("video"),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "avif" | "tiff" | "bmp" => Some("image"),
        _ => None,
    }
}

pub async fn upload(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> AppResult<Json<Value>> {
    let download_path = state
        .db
        .with_conn(|c| Ok(db::get_setting(c, "download_path")))?
        .unwrap_or_else(|| {
            state
                .config
                .data_dir
                .join("media")
                .to_string_lossy()
                .into()
        });
    std::fs::create_dir_all(&download_path)
        .map_err(|e| AppError::internal(e.to_string()))?;

    let mut results = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::bad_request(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name != "files" && name != "files[]" {
            continue;
        }
        let filename = field
            .file_name()
            .unwrap_or("upload.bin")
            .to_string();
        let content_type = field
            .content_type()
            .map(|m| m.to_string())
            .unwrap_or_else(|| "application/octet-stream".into());

        let Some(media_type) = is_allowed(&content_type, &filename) else {
            results.push(json!({
                "success": false,
                "filename": filename,
                "error": "unsupported file type",
            }));
            continue;
        };

        let data = match field.bytes().await {
            Ok(b) => b,
            Err(e) => {
                results.push(json!({
                    "success": false,
                    "filename": filename,
                    "error": e.to_string(),
                }));
                continue;
            }
        };

        let ts = chrono::Utc::now().timestamp_millis();
        let rand: u32 = rand::random();
        let job_dir = PathBuf::from(&download_path).join(format!("upload_{ts}_{rand}"));
        if let Err(e) = std::fs::create_dir_all(&job_dir) {
            results.push(json!({
                "success": false,
                "filename": filename,
                "error": e.to_string(),
            }));
            continue;
        }

        let ext = {
            let p = PathBuf::from(&filename);
            p.extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    if media_type == "video" {
                        "mp4".into()
                    } else {
                        "jpg".into()
                    }
                })
        };
        let dest = job_dir.join(format!("media.{ext}"));
        if let Err(e) = tokio::fs::write(&dest, &data).await {
            results.push(json!({
                "success": false,
                "filename": filename,
                "error": e.to_string(),
            }));
            continue;
        }

        let probe = ffprobe::probe_file(&state.db, &state.config, &dest).await;
        let mut thumb_path: Option<String> = None;
        if media_type == "video" {
            let thumb = job_dir.join("thumbnail.jpg");
            if ffprobe::generate_video_thumbnail(&state.db, &state.config, &dest, &thumb).await {
                thumb_path = Some(thumb.to_string_lossy().into());
            }
        } else {
            thumb_path = Some(dest.to_string_lossy().into());
        }

        let url = format!("local://{filename}");
        let file_path = dest.to_string_lossy().to_string();
        let file_size = Some(data.len() as i64);
        let format = Some(ext.to_string());

        match state.db.with_conn(|c| {
            Ok(db::insert_media_item(
                c,
                NewMedia {
                    queue_item_id: None,
                    url: &url,
                    media_type,
                    title: Some(&filename),
                    description: None,
                    uploader: None,
                    duration: probe.duration,
                    thumbnail_path: thumb_path.as_deref(),
                    file_path: &file_path,
                    file_size,
                    format: format.as_deref(),
                    width: probe.width,
                    height: probe.height,
                    raw_metadata: None,
                    album_id: None,
                    include_in_random: 0,
                },
            )?)
        }) {
            Ok(media) => {
                autotag::auto_tag_media(
                    &state.db,
                    &media.id,
                    &media.url,
                    &media.media_type,
                    None,
                    media.format.as_deref(),
                    &media.created_at,
                );
                results.push(json!({
                    "success": true,
                    "filename": filename,
                    "media": media,
                }));
            }
            Err(e) => {
                results.push(json!({
                    "success": false,
                    "filename": filename,
                    "error": e.to_string(),
                }));
            }
        }
    }

    Ok(Json(json!({ "results": results })))
}
