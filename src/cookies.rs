//! Netscape cookie file management for yt-dlp / gallery-dl.

use crate::config::Config;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CookieStatus {
    pub exists: bool,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
}

pub fn cookie_path(config: &Config, tool: &str) -> Option<PathBuf> {
    let name = match tool {
        "ytdlp" => "ytdlp_cookies.txt",
        "gallerydl" => "gallerydl_cookies.txt",
        _ => return None,
    };
    Some(config.cookies_dir().join(name))
}

pub fn cookie_status(config: &Config, tool: &str) -> Option<CookieStatus> {
    let path = cookie_path(config, tool)?;
    if !path.exists() {
        return Some(CookieStatus {
            exists: false,
            size: None,
            modified_at: None,
        });
    }
    let meta = std::fs::metadata(&path).ok()?;
    let modified_at = meta.modified().ok().map(|t| {
        let dt: chrono::DateTime<chrono::Utc> = t.into();
        dt.to_rfc3339()
    });
    Some(CookieStatus {
        exists: true,
        size: Some(meta.len()),
        modified_at,
    })
}

pub fn save_cookies(config: &Config, tool: &str, data: &[u8]) -> anyhow::Result<CookieStatus> {
    let path = cookie_path(config, tool).ok_or_else(|| anyhow::anyhow!("invalid tool"))?;
    std::fs::create_dir_all(config.cookies_dir())?;
    std::fs::write(&path, data)?;
    Ok(cookie_status(config, tool).unwrap())
}

pub fn delete_cookies(config: &Config, tool: &str) -> anyhow::Result<CookieStatus> {
    let path = cookie_path(config, tool).ok_or_else(|| anyhow::anyhow!("invalid tool"))?;
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(cookie_status(config, tool).unwrap())
}
