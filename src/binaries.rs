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
    override_path.unwrap_or_else(|| {
        config
            .bin_dir()
            .join(gallerydl_filename())
            .to_string_lossy()
            .into()
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
    #[cfg(all(not(target_os = "windows"), not(all(target_os = "linux", target_arch = "aarch64")), not(all(target_os = "macos", target_arch = "aarch64"))))]
    {
        "yt-dlp"
    }
}

fn gallerydl_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "gallery-dl.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "gallery-dl.bin"
    }
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
    let text = String::from_utf8_lossy(&out.stdout);
    let text2 = String::from_utf8_lossy(&out.stderr);
    let combined = if text.trim().is_empty() {
        text2
    } else {
        text
    };
    combined.lines().next().map(|s| s.trim().to_string())
}

pub async fn check_binary(db: &Db, config: &Config, name: &str) -> BinaryStatus {
    let path = match name {
        "ytdlp" => get_ytdlp_path(db, config),
        "gallery-dl" => get_gallerydl_path(db, config),
        "ffmpeg" => get_ffmpeg_path(db, config),
        _ => String::new(),
    };
    let exists = Path::new(&path).exists();
    let version = if exists {
        match name {
            "ytdlp" => version_of(&path, &["--version"]).await,
            "gallery-dl" => version_of(&path, &["--version"]).await,
            "ffmpeg" => version_of(&path, &["-version"]).await,
            _ => None,
        }
    } else {
        None
    };
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

    let asset = gallerydl_filename();
    let urls = [
        format!("https://codeberg.org/mikf/gallery-dl/releases/download/{tag}/{asset}"),
        format!("https://codeberg.org/mikf/gallery-dl/releases/download/{tag}/gallery-dl.bin"),
        format!("https://codeberg.org/mikf/gallery-dl/releases/download/{tag}/gallery-dl"),
    ];
    let dest = config.bin_dir().join(asset);
    let mut last_err = None;
    for url in &urls {
        match download_file(url, &dest).await {
            Ok(()) => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))?;
                }
                return Ok(());
            }
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("gallery-dl download failed")))
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
        let status = check_binary(db, config, name).await;
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
        if !status.exists && !has_override {
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
