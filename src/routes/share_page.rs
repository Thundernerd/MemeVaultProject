use crate::db;
use crate::error::{AppError, AppResult};
use crate::files::mime_type;
use crate::state::AppState;
use askama::Template;
use axum::extract::{Path, State};
use axum::response::{Html, IntoResponse, Response};
use std::path::Path as FsPath;

#[derive(Template)]
#[template(path = "share.html")]
struct ShareTemplate {
    title: String,
    media_type: String,
    file_src: String,
    thumbnail_src: Option<String>,
    allow_download: bool,
    is_album: bool,
    album_items_json: String,
    og_meta: String,
}

pub async fn page(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Response> {
    // Album share?
    if let Some(album_link) = state
        .db
        .with_conn(|c| Ok(db::get_album_share_link(c, &token)?))?
    {
        if db::is_share_expired(&album_link.expires_at) {
            return Err(AppError::NotFound);
        }
        let album = state
            .db
            .with_conn(|c| Ok(db::get_album_with_media(c, &album_link.album_id)?))?
            .ok_or(AppError::NotFound)?;
        let title = album
            .album
            .title
            .clone()
            .unwrap_or_else(|| "Shared album".into());
        let base = state
            .db
            .with_conn(|c| Ok(db::get_setting(c, "share_base_url")))?
            .unwrap_or_default()
            .trim_end_matches('/')
            .to_string();
        let first = album.media.first();
        let mut og = String::new();
        if !base.is_empty() {
            if let Some(f) = first {
                let thumb = if f.media.thumbnail_path.is_some() {
                    format!("{base}/api/share/{token}/media/{}/thumbnail", f.media.id)
                } else {
                    format!("{base}/api/share/{token}/media/{}/file", f.media.id)
                };
                og.push_str(&format!(
                    r#"<meta property="og:type" content="website" />
<meta property="og:title" content="{}" />
<meta property="og:image" content="{thumb}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{}" />
<meta name="twitter:image" content="{thumb}" />"#,
                    html_escape(&title),
                    html_escape(&title),
                ));
            }
        }
        let items: Vec<_> = album
            .media
            .iter()
            .map(|m| {
                serde_json::json!({
                    "id": m.media.id,
                    "type": m.media.media_type,
                    "title": m.media.title,
                    "has_thumbnail": m.media.thumbnail_path.is_some(),
                })
            })
            .collect();
        let tmpl = ShareTemplate {
            title,
            media_type: "album".into(),
            file_src: String::new(),
            thumbnail_src: None,
            allow_download: album_link.allow_download == 1,
            is_album: true,
            album_items_json: serde_json::to_string(&items).unwrap_or_else(|_| "[]".into()),
            og_meta: og,
        };
        return Ok(Html(tmpl.render().map_err(|e| AppError::internal(e.to_string()))?).into_response());
    }

    let link = state
        .db
        .with_conn(|c| Ok(db::get_share_link(c, &token)?))?
        .ok_or(AppError::NotFound)?;
    if db::is_share_expired(&link.expires_at) {
        return Err(AppError::NotFound);
    }
    let media = state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &link.media_id)?))?
        .ok_or(AppError::NotFound)?;

    let title = media.title.clone().unwrap_or_else(|| "Shared media".into());
    let file_src = format!("/api/share/{token}/file");
    let thumbnail_src = media
        .thumbnail_path
        .as_ref()
        .map(|_| format!("/api/share/{token}/thumbnail"));
    let base = state
        .db
        .with_conn(|c| Ok(db::get_setting(c, "share_base_url")))?
        .unwrap_or_default()
        .trim_end_matches('/')
        .to_string();

    let mut og = String::new();
    if !base.is_empty() {
        let abs_file = format!("{base}{file_src}");
        let abs_thumb = thumbnail_src
            .as_ref()
            .map(|t| format!("{base}{t}"));
        let ext = FsPath::new(&media.file_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let mut video_mime = mime_type(ext).to_string();
        if video_mime == "application/octet-stream" {
            video_mime = "video/mp4".into();
        }
        if media.media_type == "video" {
            og.push_str(&format!(
                r#"<meta property="og:type" content="video.other" />
<meta property="og:title" content="{}" />
<meta property="og:video" content="{abs_file}" />
<meta property="og:video:type" content="{video_mime}" />
<meta name="twitter:card" content="player" />
<meta name="twitter:title" content="{}" />
<meta name="twitter:player" content="{base}/share/{token}" />
<meta name="twitter:player:stream" content="{abs_file}" />
<meta name="twitter:player:stream:content_type" content="{video_mime}" />"#,
                html_escape(&title),
                html_escape(&title),
            ));
            if let Some(t) = &abs_thumb {
                og.push_str(&format!(
                    r#"
<meta property="og:image" content="{t}" />
<meta name="twitter:image" content="{t}" />"#
                ));
            }
        } else {
            let img = abs_thumb.unwrap_or(abs_file);
            og.push_str(&format!(
                r#"<meta property="og:type" content="website" />
<meta property="og:title" content="{}" />
<meta property="og:image" content="{img}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{}" />
<meta name="twitter:image" content="{img}" />"#,
                html_escape(&title),
                html_escape(&title),
            ));
        }
    }

    let tmpl = ShareTemplate {
        title,
        media_type: media.media_type,
        file_src,
        thumbnail_src,
        allow_download: link.allow_download == 1,
        is_album: false,
        album_items_json: "[]".into(),
        og_meta: og,
    };
    Ok(Html(tmpl.render().map_err(|e| AppError::internal(e.to_string()))?).into_response())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
