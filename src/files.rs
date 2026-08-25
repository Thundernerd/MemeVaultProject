//! MIME helpers and HTTP range file serving.

use axum::body::Body;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncSeekExt;
use tokio_util::io::ReaderStream;

pub fn mime_type(ext: &str) -> &'static str {
    match ext.trim_start_matches('.').to_lowercase().as_str() {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "flv" => "video/x-flv",
        "wmv" => "video/x-ms-wmv",
        "3gp" => "video/3gpp",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "tiff" | "tif" => "image/tiff",
        "bmp" => "image/bmp",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
}

pub fn mime_for_path(path: &Path) -> &'static str {
    path.extension()
        .and_then(|e| e.to_str())
        .map(mime_type)
        .unwrap_or("application/octet-stream")
}

/// Serve a file with optional Range support (200 / 206 / 416).
pub async fn serve_file_with_range(
    path: &Path,
    headers: &HeaderMap,
    as_attachment: bool,
) -> Result<Response, StatusCode> {
    let meta = tokio::fs::metadata(path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if !meta.is_file() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let file_size = meta.len();
    let content_type = mime_for_path(path);
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");

    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type),
    );
    response_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if as_attachment {
        let cd = format!("attachment; filename=\"{filename}\"");
        if let Ok(v) = HeaderValue::from_str(&cd) {
            response_headers.insert(header::CONTENT_DISPOSITION, v);
        }
    }

    if let Some(range_hdr) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some((start, end)) = parse_bytes_range(range_hdr, file_size) {
            let len = end - start + 1;
            let mut file = File::open(path)
                .await
                .map_err(|_| StatusCode::NOT_FOUND)?;
            file.seek(std::io::SeekFrom::Start(start))
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let stream = ReaderStream::new(file.take(len));
            response_headers.insert(
                header::CONTENT_LENGTH,
                HeaderValue::from_str(&len.to_string()).unwrap(),
            );
            response_headers.insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes {start}-{end}/{file_size}")).unwrap(),
            );
            let body = Body::from_stream(stream);
            return Ok((StatusCode::PARTIAL_CONTENT, response_headers, body).into_response());
        } else {
            response_headers.insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes */{file_size}")).unwrap(),
            );
            return Ok((StatusCode::RANGE_NOT_SATISFIABLE, response_headers).into_response());
        }
    }

    response_headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&file_size.to_string()).unwrap(),
    );
    let file = File::open(path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let body = Body::from_stream(ReaderStream::new(file));
    Ok((StatusCode::OK, response_headers, body).into_response())
}

trait AsyncTakeExt: tokio::io::AsyncRead + Sized {
    fn take(self, limit: u64) -> tokio::io::Take<Self> {
        tokio::io::AsyncReadExt::take(self, limit)
    }
}
impl<T: tokio::io::AsyncRead> AsyncTakeExt for T {}

fn parse_bytes_range(header: &str, file_size: u64) -> Option<(u64, u64)> {
    let header = header.strip_prefix("bytes=")?;
    // Support single range only: start-end or start-
    let mut parts = header.splitn(2, '-');
    let start_s = parts.next()?;
    let end_s = parts.next().unwrap_or("");
    if start_s.is_empty() {
        // suffix: -N
        let n: u64 = end_s.parse().ok()?;
        if n == 0 || file_size == 0 {
            return None;
        }
        let start = file_size.saturating_sub(n);
        return Some((start, file_size - 1));
    }
    let start: u64 = start_s.parse().ok()?;
    if start >= file_size {
        return None;
    }
    let end = if end_s.is_empty() {
        file_size - 1
    } else {
        end_s.parse::<u64>().ok()?.min(file_size - 1)
    };
    if end < start {
        return None;
    }
    Some((start, end))
}

/// Delete the parent job directory of a media file (V1 behavior).
pub fn delete_job_dir(file_path: &str) {
    let path = Path::new(file_path);
    if let Some(parent) = path.parent() {
        if parent.exists() {
            let _ = std::fs::remove_dir_all(parent);
        }
    }
}
