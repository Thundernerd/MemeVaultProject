//! Auto-tag media on insert (mirrors V1 `lib/autotag.ts`).

use crate::db::{self, Db};

pub fn auto_tag_media(
    db: &Db,
    media_id: &str,
    url: &str,
    media_type: &str,
    uploader: Option<&str>,
    format: Option<&str>,
    created_at: &str,
) {
    let _ = db.with_conn(|conn| {
        let _ = apply(conn, media_id, url, media_type, uploader, format, created_at);
        Ok(())
    });
}

fn apply(
    conn: &rusqlite::Connection,
    media_id: &str,
    url: &str,
    media_type: &str,
    uploader: Option<&str>,
    format: Option<&str>,
    created_at: &str,
) -> rusqlite::Result<()> {
    add(conn, media_id, &format!("type:{media_type}"))?;

    let platform = platform_from_url(url);
    add(conn, media_id, &format!("platform:{platform}"))?;

    if let Some(u) = uploader.filter(|s| !s.is_empty()) {
        add(conn, media_id, &format!("uploader:{}", u.to_lowercase()))?;
    }

    if let Some(year) = created_at.get(0..4) {
        if year.chars().all(|c| c.is_ascii_digit()) {
            add(conn, media_id, &format!("date:{year}"))?;
        }
    }

    if let Some(fmt) = format.filter(|s| !s.is_empty()) {
        let ext = fmt.split('.').next_back().unwrap_or(fmt).to_lowercase();
        add(conn, media_id, &format!("format:{ext}"))?;
    }

    Ok(())
}

fn add(conn: &rusqlite::Connection, media_id: &str, name: &str) -> rusqlite::Result<()> {
    let tag = db::upsert_tag(conn, name)?;
    db::add_tag_to_media(conn, media_id, &tag.id)
}

fn platform_from_url(url: &str) -> String {
    if url.starts_with("local://") {
        return "upload".into();
    }
    let Ok(parsed) = url::Url::parse(url) else {
        return "unknown".into();
    };
    let host = parsed.host_str().unwrap_or("").to_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host);
    // Registrable-domain label (second-to-last), matching V1. Subdomains like
    // vm.tiktok.com / vt.tiktok.com must tag as tiktok, not vm/vt.
    let mut parts = host.rsplit('.');
    let _tld = parts.next();
    let label = parts.next().unwrap_or(host);
    match label {
        "twitter" | "t" => "x".into(),
        "youtu" => "youtube".into(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_from_url_uses_registrable_domain() {
        assert_eq!(
            platform_from_url("https://www.youtube.com/watch?v=abc"),
            "youtube"
        );
        assert_eq!(platform_from_url("https://youtu.be/abc123"), "youtube");
        assert_eq!(
            platform_from_url("https://twitter.com/user/status/123"),
            "x"
        );
        assert_eq!(platform_from_url("https://t.co/abc"), "x");
        assert_eq!(platform_from_url("https://www.reddit.com/r/test"), "reddit");
        assert_eq!(platform_from_url("https://vimeo.com/123456"), "vimeo");
        assert_eq!(platform_from_url("local://upload/file.mp4"), "upload");
        assert_eq!(platform_from_url("not-a-url"), "unknown");
    }

    #[test]
    fn tiktok_short_links_tag_as_tiktok() {
        assert_eq!(
            platform_from_url("https://vm.tiktok.com/ZGdxGkd5x/"),
            "tiktok"
        );
        assert_eq!(platform_from_url("https://vt.tiktok.com/abc"), "tiktok");
        assert_eq!(
            platform_from_url("https://www.tiktok.com/@user/video/123"),
            "tiktok"
        );
        assert_eq!(
            platform_from_url("https://m.tiktok.com/v/123"),
            "tiktok"
        );
    }
}
