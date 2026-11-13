//! Auto-managed yt-dlp, gallery-dl, ffmpeg/ffprobe binaries.

use crate::config::Config;
use crate::db::{self, Db};
use serde::Serialize;
use std::path::Path;
use std::process::Stdio;

#[derive(Debug, Clone, Serialize)]
pub struct BinaryStatus {
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub version: Option<String>,
}

pub fn get_ytdlp_path(db: &Db, config: &Config) -> String {
    let override_path = db
        .with_conn(|c| Ok(db::get_setting(c, "ytdlp_bin")))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    override_path.unwrap_or_else(|| {
        config
            .bin_dir()
            .join(ytdlp_filename())
            .to_string_lossy()
            .into()
    })
}

pub fn get_gallerydl_path(db: &Db, config: &Config) -> String {
    let override_path = db
        .with_conn(|c| Ok(db::get_setting(c, "gallerydl_bin")))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    override_path.unwrap_or_else(|| match host_gallerydl_asset() {
        Some(asset) => config.bin_dir().join(asset).to_string_lossy().into(),
        // No upstream build for this host: use the user's own install.
        None => which::which("gallery-dl")
            .map(|p| p.to_string_lossy().into())
            .unwrap_or_else(|_| "gallery-dl".into()),
    })
}

pub fn get_ffmpeg_path(db: &Db, config: &Config) -> String {
    let override_path = db
        .with_conn(|c| Ok(db::get_setting(c, "ffmpeg_bin")))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    override_path.unwrap_or_else(|| {
        config
            .bin_dir()
            .join(ffmpeg_filename())
            .to_string_lossy()
            .into()
    })
}

pub fn get_ffprobe_path(db: &Db, config: &Config) -> String {
    let ffmpeg = get_ffmpeg_path(db, config);
    let p = Path::new(&ffmpeg);
    if let Some(parent) = p.parent() {
        let probe = parent.join(ffprobe_filename());
        if probe.exists() {
            return probe.to_string_lossy().into();
        }
    }
    // Same dir naming convention
    config
        .bin_dir()
        .join(ffprobe_filename())
        .to_string_lossy()
        .into()
}

fn ytdlp_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "yt-dlp.exe"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "yt-dlp_macos"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "yt-dlp_linux_aarch64"
    }
    // PyInstaller standalone (bundles Python). The plain `yt-dlp` asset is a
    // zipimport that needs system python3 — which the Docker image does not ship.
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "yt-dlp_linux"
    }
    #[cfg(all(
        not(target_os = "windows"),
        not(all(target_os = "linux", target_arch = "aarch64")),
        not(all(target_os = "linux", target_arch = "x86_64")),
        not(all(target_os = "macos", target_arch = "aarch64"))
    ))]
    {
        "yt-dlp"
    }
}

/// The upstream gallery-dl release asset for a target, if one exists.
/// Upstream only publishes standalone builds for Linux x86-64 and Windows;
/// everywhere else gallery-dl must come from the user's own install.
fn gallerydl_asset(os: &str, arch: &str) -> Option<&'static str> {
    match (os, arch) {
        ("linux", "x86_64") => Some("gallery-dl.bin"),
        ("windows", "x86") => Some("gallery-dl_x86.exe"),
        // x86-64 and arm64 (which runs x64 builds under emulation).
        ("windows", _) => Some("gallery-dl.exe"),
        _ => None,
    }
}

fn host_gallerydl_asset() -> Option<&'static str> {
    gallerydl_asset(std::env::consts::OS, std::env::consts::ARCH)
}

fn ffmpeg_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "ffmpeg.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "ffmpeg"
    }
}

fn ffprobe_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "ffprobe.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "ffprobe"
    }
}

async fn version_of(path: &str, args: &[&str]) -> Option<String> {
    if !Path::new(path).exists() {
        return None;
    }
    let out = tokio::process::Command::new(path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .ok()?;
    // A binary that cannot run (wrong architecture, missing interpreter)
    // prints its error to stderr and exits non-zero; that is not a version.
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let text2 = String::from_utf8_lossy(&out.stderr);
    let combined = if text.trim().is_empty() {
        text2
    } else {
        text
    };
    combined.lines().next().map(|s| s.trim().to_string())
}

fn binary_path(db: &Db, config: &Config, name: &str) -> String {
    match name {
        "ytdlp" => get_ytdlp_path(db, config),
        "gallery-dl" => get_gallerydl_path(db, config),
        "ffmpeg" => get_ffmpeg_path(db, config),
        _ => String::new(),
    }
}

pub async fn check_binary(db: &Db, config: &Config, name: &str) -> BinaryStatus {
    let path = binary_path(db, config, name);
    let version = if Path::new(&path).exists() {
        match name {
            "ytdlp" => version_of(&path, &["--version"]).await,
            "gallery-dl" => version_of(&path, &["--version"]).await,
            "ffmpeg" => version_of(&path, &["-version"]).await,
            _ => None,
        }
    } else {
        None
    };
    // A file that cannot run is as good as missing: the Binaries tab then
    // shows "missing", and startup re-downloads it where a build exists.
    let exists = version.is_some();
    BinaryStatus {
        name: name.to_string(),
        path,
        exists,
        version,
    }
}

pub async fn download_binary(
    db: &Db,
    config: &Config,
    name: &str,
) -> anyhow::Result<BinaryStatus> {
    std::fs::create_dir_all(config.bin_dir())?;
    match name {
        "ytdlp" => download_ytdlp(config).await?,
        "gallery-dl" => download_gallerydl(config).await?,
        "ffmpeg" => download_ffmpeg(config).await?,
        _ => anyhow::bail!("unknown binary: {name}"),
    }
    Ok(check_binary(db, config, name).await)
}

async fn download_ytdlp(config: &Config) -> anyhow::Result<()> {
    let asset = ytdlp_filename();
    let url = format!(
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/{asset}"
    );
    let dest = config.bin_dir().join(asset);
    download_file(&url, &dest).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))?;
    }
    Ok(())
}

async fn download_gallerydl(config: &Config) -> anyhow::Result<()> {
    let asset = host_gallerydl_asset().ok_or_else(|| {
        anyhow::anyhow!(
            "gallery-dl publishes no build for {}/{}; install gallery-dl on PATH or set its path in Settings",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;
    // Codeberg/Forgejo has no GitHub-style /releases/latest/download/{asset}
    // shortcut — resolve the latest tag via the API, then download by tag.
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;
    let release: serde_json::Value = client
        .get("https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases/latest")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let tag = release["tag_name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("gallery-dl release missing tag_name"))?;

    let url = format!("https://codeberg.org/mikf/gallery-dl/releases/download/{tag}/{asset}");
    let dest = config.bin_dir().join(asset);
    download_file(&url, &dest).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))?;
    }
    Ok(())
}

async fn download_ffmpeg(config: &Config) -> anyhow::Result<()> {
    let (url, is_xz) = ffmpeg_archive();
    let ext = if is_xz { "tar.xz" } else { "zip" };
    let tmp = config.bin_dir().join(format!("ffmpeg-tmp.{ext}"));
    download_file(url, &tmp).await?;
    if is_xz {
        extract_ffmpeg_xz(&tmp, &config.bin_dir())?;
    } else {
        extract_ffmpeg_zip(&tmp, &config.bin_dir())?;
    }
    let _ = std::fs::remove_file(&tmp);
    Ok(())
}

fn ffmpeg_archive() -> (&'static str, bool) {
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        (
            "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
            true,
        )
    }
    #[cfg(all(target_os = "linux", not(target_arch = "aarch64")))]
    {
        (
            "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz",
            true,
        )
    }
    #[cfg(target_os = "macos")]
    {
        ("https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip", false)
    }
    #[cfg(target_os = "windows")]
    {
        (
            "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip",
            false,
        )
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        (
            "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz",
            true,
        )
    }
}

fn extract_ffmpeg_xz(archive: &Path, bin_dir: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::open(archive)?;
    let dec = xz2::read::XzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);
    let tmp_dir = bin_dir.join("_ffmpeg_extract");
    let _ = std::fs::remove_dir_all(&tmp_dir);
    std::fs::create_dir_all(&tmp_dir)?;
    archive.unpack(&tmp_dir)?;
    copy_ffmpeg_bins(&tmp_dir, bin_dir)?;
    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(())
}

fn extract_ffmpeg_zip(archive: &Path, bin_dir: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let tmp_dir = bin_dir.join("_ffmpeg_extract");
    let _ = std::fs::remove_dir_all(&tmp_dir);
    std::fs::create_dir_all(&tmp_dir)?;
    zip.extract(&tmp_dir)?;
    copy_ffmpeg_bins(&tmp_dir, bin_dir)?;
    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(())
}

fn copy_ffmpeg_bins(tmp_dir: &Path, bin_dir: &Path) -> anyhow::Result<()> {
    for entry in walkdir::WalkDir::new(tmp_dir) {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy();
        if name == "ffmpeg"
            || name == "ffprobe"
            || name == "ffmpeg.exe"
            || name == "ffprobe.exe"
        {
            let dest_name = if name.ends_with(".exe") {
                name.to_string()
            } else {
                name.to_string()
            };
            let dest = bin_dir.join(&dest_name);
            std::fs::copy(entry.path(), &dest)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))?;
            }
        }
    }
    Ok(())
}

async fn download_file(url: &str, dest: &Path) -> anyhow::Result<()> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;
    let resp = client.get(url).send().await?.error_for_status()?;
    let bytes = resp.bytes().await?;
    let partial = dest.with_extension("partial");
    tokio::fs::write(&partial, &bytes).await?;
    tokio::fs::rename(&partial, dest).await?;
    Ok(())
}

pub async fn ensure_binaries(db: &Db, config: &Config) {
    std::fs::create_dir_all(config.bin_dir()).ok();
    for name in ["ytdlp", "gallery-dl", "ffmpeg"] {
        // Decide on the file, not on whether it runs: a binary that exists but
        // fails `--version` is reported as missing, but re-fetching it on every
        // boot would not make it run.
        let path = binary_path(db, config, name);
        let file_present = Path::new(&path).exists();
        let has_override = match name {
            "ytdlp" => db
                .with_conn(|c| Ok(db::get_setting(c, "ytdlp_bin")))
                .ok()
                .flatten()
                .filter(|s| !s.is_empty())
                .is_some(),
            "gallery-dl" => db
                .with_conn(|c| Ok(db::get_setting(c, "gallerydl_bin")))
                .ok()
                .flatten()
                .filter(|s| !s.is_empty())
                .is_some(),
            "ffmpeg" => db
                .with_conn(|c| Ok(db::get_setting(c, "ffmpeg_bin")))
                .ok()
                .flatten()
                .filter(|s| !s.is_empty())
                .is_some(),
            _ => false,
        };
        if name == "gallery-dl" && host_gallerydl_asset().is_none() {
            if !file_present && !has_override {
                tracing::info!(
                    "gallery-dl has no upstream build for this platform; install it on PATH or set its path in Settings"
                );
            }
            continue;
        }
        if !file_present && !has_override {
            tracing::info!("downloading missing binary: {name}");
            match download_binary(db, config, name).await {
                Ok(_) => {
                    tracing::info!("downloaded binary: {name}");
                }
                Err(e) => {
                    tracing::warn!("failed to download {name}: {e:#}");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn script(dir: &Path, name: &str, body: &str) -> String {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path.to_string_lossy().into()
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn version_of_is_none_when_binary_exits_non_zero() {
        let dir = tempfile::tempdir().unwrap();
        let bin = script(
            dir.path(),
            "broken",
            "echo 'broken: cannot execute binary file' >&2\nexit 126",
        );
        assert_eq!(version_of(&bin, &["--version"]).await, None);
    }

    #[test]
    fn gallerydl_is_downloaded_only_where_upstream_publishes_a_build() {
        assert_eq!(gallerydl_asset("linux", "x86_64"), Some("gallery-dl.bin"));
        assert_eq!(gallerydl_asset("windows", "x86_64"), Some("gallery-dl.exe"));
        assert_eq!(gallerydl_asset("windows", "x86"), Some("gallery-dl_x86.exe"));
        // x64 build runs under emulation on Windows on Arm.
        assert_eq!(gallerydl_asset("windows", "aarch64"), Some("gallery-dl.exe"));
        assert_eq!(gallerydl_asset("macos", "aarch64"), None);
        assert_eq!(gallerydl_asset("macos", "x86_64"), None);
        assert_eq!(gallerydl_asset("linux", "aarch64"), None);
        assert_eq!(gallerydl_asset("freebsd", "x86_64"), None);
    }
}
