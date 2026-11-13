//! Auto-managed yt-dlp, gallery-dl, ffmpeg/ffprobe binaries.

use crate::config::Config;
use crate::db::{self, Db};
use crate::process_tree;
use serde::Serialize;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

/// A binary MemeVault manages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Binary {
    YtDlp,
    GalleryDl,
    Ffmpeg,
}

impl Binary {
    pub const ALL: [Binary; 3] = [Binary::YtDlp, Binary::GalleryDl, Binary::Ffmpeg];

    /// The name the API and the Binaries tab use for this binary.
    pub fn name(self) -> &'static str {
        match self {
            Binary::YtDlp => "ytdlp",
            Binary::GalleryDl => "gallery-dl",
            Binary::Ffmpeg => "ffmpeg",
        }
    }

    /// The setting that holds the user's path override.
    fn setting_key(self) -> &'static str {
        match self {
            Binary::YtDlp => "ytdlp_bin",
            Binary::GalleryDl => "gallerydl_bin",
            Binary::Ffmpeg => "ffmpeg_bin",
        }
    }

    /// The arguments that make the binary print its version.
    fn version_args(self) -> &'static [&'static str] {
        match self {
            Binary::YtDlp | Binary::GalleryDl => &["--version"],
            Binary::Ffmpeg => &["-version"],
        }
    }

    /// The user's path override, if one is set.
    fn override_path(self, db: &Db) -> Option<String> {
        db.with_conn(|c| Ok(db::get_setting(c, self.setting_key())))
            .ok()
            .flatten()
            .filter(|s| !s.is_empty())
    }

    /// Where the binary is when the user has not overridden its path.
    fn default_path(self, config: &Config) -> String {
        let file = match self {
            Binary::YtDlp => ytdlp_filename().to_string(),
            Binary::GalleryDl => match host_gallerydl_asset() {
                Some(asset) => asset.to_string(),
                // No upstream build for this host: use the user's own install.
                None => {
                    return which::which("gallery-dl")
                        .map(|p| p.to_string_lossy().into())
                        .unwrap_or_else(|_| "gallery-dl".into())
                }
            },
            Binary::Ffmpeg => ffmpeg_filename(),
        };
        config.bin_dir().join(file).to_string_lossy().into()
    }

    /// The path the binary is run from.
    pub fn path(self, db: &Db, config: &Config) -> String {
        self.override_path(db)
            .unwrap_or_else(|| self.default_path(config))
    }

    /// Why this binary cannot be auto-downloaded on this host, or `None` if it can.
    pub fn auto_download_unsupported(self) -> Option<String> {
        (self == Binary::GalleryDl && host_gallerydl_asset().is_none()).then(|| {
            format!(
                "gallery-dl publishes no build for {}/{}; install gallery-dl on PATH or set its path in Settings",
                std::env::consts::OS,
                std::env::consts::ARCH
            )
        })
    }
}

impl std::str::FromStr for Binary {
    type Err = UnknownBinary;

    fn from_str(name: &str) -> Result<Self, Self::Err> {
        Binary::ALL
            .into_iter()
            .find(|b| b.name() == name)
            .ok_or(UnknownBinary)
    }
}

/// A name that is not one of [`Binary::ALL`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UnknownBinary;

#[derive(Debug, Clone, Serialize)]
pub struct BinaryStatus {
    pub name: String,
    pub path: String,
    /// Whether the binary runs and reports a version, not merely whether the
    /// file is there: one that cannot run is shown as missing. The field keeps
    /// its name because the frontend reads it.
    pub exists: bool,
    pub version: Option<String>,
}

pub fn get_ffprobe_path(db: &Db, config: &Config) -> String {
    let ffmpeg = Binary::Ffmpeg.path(db, config);
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

/// The upstream yt-dlp release asset for a target.
fn ytdlp_asset(os: &str, arch: &str) -> &'static str {
    match (os, arch) {
        ("windows", _) => "yt-dlp.exe",
        ("macos", "aarch64") => "yt-dlp_macos",
        ("linux", "aarch64") => "yt-dlp_linux_aarch64",
        // PyInstaller standalone (bundles Python). The plain `yt-dlp` asset is a
        // zipimport that needs system python3 — which the Docker image does not ship.
        ("linux", "x86_64") => "yt-dlp_linux",
        _ => "yt-dlp",
    }
}

fn ytdlp_filename() -> &'static str {
    ytdlp_asset(std::env::consts::OS, std::env::consts::ARCH)
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

fn ffmpeg_filename() -> String {
    format!("ffmpeg{}", std::env::consts::EXE_SUFFIX)
}

fn ffprobe_filename() -> String {
    format!("ffprobe{}", std::env::consts::EXE_SUFFIX)
}

/// How long a binary gets to print its version. PyInstaller onefile builds
/// (yt-dlp, gallery-dl) unpack themselves on first run, which takes seconds.
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);

/// Runs `path args…` and returns the first line it prints. `path` may be a
/// bare name, which is looked up on PATH. `None` if it cannot run or does not
/// finish within [`VERSION_TIMEOUT`].
async fn version_of(path: &str, args: &[&str]) -> Option<String> {
    version_of_within(path, args, VERSION_TIMEOUT).await
}

/// [`version_of`] with a caller-chosen timeout, so tests need not wait 10 s.
async fn version_of_within(path: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut cmd = tokio::process::Command::new(path);
    cmd.args(args)
        // A wrapper that reads stdin would otherwise wait for input forever.
        .stdin(Stdio::null());
    // A binary that hangs (cannot unpack, network-mounted path) has no
    // version, the same as one that exits non-zero. Anything it started
    // (PyInstaller's Python, a wrapper's grandchildren) is killed once it
    // exits, and on timeout the binary is killed with them.
    let out = process_tree::output_within(&mut cmd, timeout).await?;
    // A binary that cannot run (wrong architecture, missing interpreter)
    // prints its error to stderr and exits non-zero; that is not a version.
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let text2 = String::from_utf8_lossy(&out.stderr);
    let combined = if text.trim().is_empty() { text2 } else { text };
    combined.lines().next().map(|s| s.trim().to_string())
}

pub async fn check_binary(db: &Db, config: &Config, binary: Binary) -> BinaryStatus {
    let path = binary.path(db, config);
    let version = version_of(&path, binary.version_args()).await;
    // A binary that cannot run is as good as missing, so the Binaries tab
    // shows "missing" rather than "installed".
    let exists = version.is_some();
    BinaryStatus {
        name: binary.name().to_string(),
        path,
        exists,
        version,
    }
}

pub async fn download_binary(
    db: &Db,
    config: &Config,
    binary: Binary,
) -> anyhow::Result<BinaryStatus> {
    std::fs::create_dir_all(config.bin_dir())?;
    match binary {
        Binary::YtDlp => download_ytdlp(config).await?,
        Binary::GalleryDl => download_gallerydl(config).await?,
        Binary::Ffmpeg => download_ffmpeg(config).await?,
    }
    Ok(check_binary(db, config, binary).await)
}

async fn download_ytdlp(config: &Config) -> anyhow::Result<()> {
    let asset = ytdlp_filename();
    let url = format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{asset}");
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
        anyhow::anyhow!(Binary::GalleryDl
            .auto_download_unsupported()
            .unwrap_or_default())
    })?;
    // Codeberg/Forgejo has no GitHub-style /releases/latest/download/{asset}
    // shortcut — resolve the latest tag via the API, then download by tag.
    let release: serde_json::Value = http_client()?
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
    let archive = ffmpeg_archive(std::env::consts::OS, std::env::consts::ARCH);
    let url = archive.source.resolve().await?;
    let ext = archive.format.extension();
    let tmp = config.bin_dir().join(format!("ffmpeg-tmp.{ext}"));
    download_file(&url, &tmp).await?;
    archive.format.extract_ffmpeg(&tmp, &config.bin_dir())?;
    let _ = std::fs::remove_file(&tmp);
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArchiveFormat {
    TarXz,
    Zip,
}

impl ArchiveFormat {
    fn extension(self) -> &'static str {
        match self {
            ArchiveFormat::TarXz => "tar.xz",
            ArchiveFormat::Zip => "zip",
        }
    }

    /// Unpacks ffmpeg and ffprobe from `archive` into `bin_dir`.
    fn extract_ffmpeg(self, archive: &Path, bin_dir: &Path) -> anyhow::Result<()> {
        match self {
            ArchiveFormat::TarXz => extract_ffmpeg_xz(archive, bin_dir),
            ArchiveFormat::Zip => extract_ffmpeg_zip(archive, bin_dir),
        }
    }
}

/// Where the ffmpeg + ffprobe build for a target is downloaded from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FfmpegArchive {
    source: FfmpegSource,
    format: ArchiveFormat,
}

/// How the archive's download URL is found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FfmpegSource {
    /// A stable URL that always serves the latest archive.
    Direct(&'static str),
    /// evermeet.cx's info JSON, whose `download.zip.url` names the
    /// versioned zip of the latest release.
    EvermeetInfo(&'static str),
}

impl FfmpegSource {
    async fn resolve(self) -> anyhow::Result<String> {
        match self {
            FfmpegSource::Direct(url) => Ok(url.to_string()),
            FfmpegSource::EvermeetInfo(info_url) => {
                let info = fetch_text(info_url).await.map_err(|e| {
                    anyhow::anyhow!("fetching evermeet.cx ffmpeg info failed: {e:#}")
                })?;
                evermeet_zip_url(&info)
            }
        }
    }
}

/// The ffmpeg archive for a target. Targets with no build of their own get
/// the Linux x86-64 one.
fn ffmpeg_archive(os: &str, arch: &str) -> FfmpegArchive {
    let (source, format) = match (os, arch) {
        ("linux", "aarch64") => (
            FfmpegSource::Direct("https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linuxarm64-gpl.tar.xz"),
            ArchiveFormat::TarXz,
        ),
        ("macos", _) => (
            FfmpegSource::EvermeetInfo("https://evermeet.cx/ffmpeg/info/ffmpeg/release"),
            ArchiveFormat::Zip,
        ),
        ("windows", _) => (
            FfmpegSource::Direct("https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"),
            ArchiveFormat::Zip,
        ),
        _ => (
            FfmpegSource::Direct("https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz"),
            ArchiveFormat::TarXz,
        ),
    };
    FfmpegArchive { source, format }
}

/// The versioned zip URL from evermeet.cx's ffmpeg info JSON
/// (`https://evermeet.cx/ffmpeg/info/ffmpeg/release`), read from
/// `download.zip.url`.
fn evermeet_zip_url(info: &str) -> anyhow::Result<String> {
    let info: serde_json::Value = serde_json::from_str(info)
        .map_err(|e| anyhow::anyhow!("evermeet.cx ffmpeg info is not valid JSON: {e}"))?;
    let url = info["download"]["zip"]["url"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("evermeet.cx ffmpeg info is missing download.zip.url"))?;
    if !url.starts_with("https://") {
        anyhow::bail!("evermeet.cx ffmpeg info gave a download.zip.url that is not https: {url}");
    }
    Ok(url.to_string())
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
        if name == "ffmpeg" || name == "ffprobe" || name == "ffmpeg.exe" || name == "ffprobe.exe" {
            let dest = bin_dir.join(name.as_ref());
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

async fn fetch_text(url: &str) -> anyhow::Result<String> {
    Ok(http_client()?
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?)
}

/// The HTTP client used for every binary download: follows up to 10
/// redirects, as GitHub release and evermeet download links redirect.
fn http_client() -> anyhow::Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?)
}

async fn download_file(url: &str, dest: &Path) -> anyhow::Result<()> {
    let resp = http_client()?.get(url).send().await?.error_for_status()?;
    let bytes = resp.bytes().await?;
    let partial = dest.with_extension("partial");
    tokio::fs::write(&partial, &bytes).await?;
    tokio::fs::rename(&partial, dest).await?;
    Ok(())
}

pub async fn ensure_binaries(db: &Db, config: &Config) {
    std::fs::create_dir_all(config.bin_dir()).ok();
    for binary in Binary::ALL {
        let name = binary.name();
        // Decide on the file, not on whether it runs: a binary that exists but
        // fails `--version` is reported as missing, but re-fetching it on every
        // boot would not make it run.
        let path = binary.path(db, config);
        let file_present = Path::new(&path).exists();
        let has_override = binary.override_path(db).is_some();
        if let Some(why) = binary.auto_download_unsupported() {
            if !file_present && !has_override {
                tracing::info!("{why}");
            }
            continue;
        }
        if !file_present && !has_override {
            tracing::info!("downloading missing binary: {name}");
            match download_binary(db, config, binary).await {
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

    #[cfg(unix)]
    #[tokio::test]
    async fn version_of_is_none_when_binary_never_exits() {
        let dir = tempfile::tempdir().unwrap();
        let bin = script(dir.path(), "hangs", "sleep 30\necho 1.2.3");
        let started = std::time::Instant::now();
        assert_eq!(
            version_of_within(&bin, &["--version"], Duration::from_millis(200)).await,
            None
        );
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn version_of_kills_the_whole_process_tree_when_it_times_out() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("grandchild.pid");
        let bin = script(
            dir.path(),
            "wrapper",
            &format!("sleep 30 &\necho $! > '{}'\nwait", pidfile.display()),
        );
        assert_eq!(
            version_of_within(&bin, &["--version"], Duration::from_millis(500)).await,
            None
        );
        let pid = read_pid(&pidfile);
        assert!(
            gone_within(pid, Duration::from_secs(2)).await,
            "grandchild {pid} is still running after the timeout"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn version_of_leaves_nothing_running_after_it_succeeds() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("grandchild.pid");
        let bin = script(
            dir.path(),
            "detaches",
            &format!(
                "sleep 30 >/dev/null 2>&1 &\necho $! > '{}'\necho 1.2.3",
                pidfile.display()
            ),
        );
        assert_eq!(
            version_of_within(&bin, &["--version"], Duration::from_secs(5)).await,
            Some("1.2.3".to_string())
        );
        let pid = read_pid(&pidfile);
        assert!(
            gone_within(pid, Duration::from_secs(2)).await,
            "grandchild {pid} is still running after a successful check"
        );
    }

    /// The pid a test script wrote to `pidfile`.
    fn read_pid(pidfile: &Path) -> u32 {
        std::fs::read_to_string(pidfile)
            .expect("the grandchild did not record its pid")
            .trim()
            .parse()
            .unwrap()
    }

    /// Whether `pid` stops existing within `grace`. An orphan is reaped by
    /// init, which may take a moment. Kills `pid` if it is still running, so
    /// a failing test leaves nothing behind.
    #[cfg(unix)]
    async fn gone_within(pid: u32, grace: Duration) -> bool {
        let pid = pid as libc::pid_t;
        let deadline = std::time::Instant::now() + grace;
        loop {
            // SAFETY: signal 0 only checks whether the process exists.
            let alive = unsafe { libc::kill(pid, 0) } == 0;
            if !alive {
                return std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH);
            }
            if std::time::Instant::now() > deadline {
                // SAFETY: signal-only syscall on the pid the script recorded.
                unsafe { libc::kill(pid, libc::SIGKILL) };
                return false;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    /// Writes a `.cmd` script that runs `body`, and returns its path.
    #[cfg(windows)]
    fn cmd_script(dir: &Path, name: &str, body: &str) -> String {
        let path = dir.join(format!("{name}.cmd"));
        std::fs::write(
            &path,
            format!("@echo off\r\n{}\r\n", body.replace('\n', "\r\n")),
        )
        .unwrap();
        path.to_string_lossy().into()
    }

    /// Script lines that start a PowerShell grandchild running for 30 s, with
    /// its output discarded, and wait until it has written its pid to
    /// `pidfile`. `start /b` gives the script no way to learn the pid itself.
    #[cfg(windows)]
    fn start_grandchild(pidfile: &Path) -> String {
        let pid = pidfile.display();
        format!(
            "start /b powershell -NoProfile -NonInteractive -Command \
             \"Set-Content -Path '{pid}' -Value $PID; Start-Sleep 30\" >nul 2>&1\n\
             :wait\n\
             if not exist \"{pid}\" (ping -n 2 127.0.0.1 >nul & goto wait)"
        )
    }

    // The window #115 closes, between spawning the child and putting it in
    // its job, ends before cmd.exe gets as far as starting a grandchild, so
    // this test fails only if the tree is not killed at all.
    #[cfg(windows)]
    #[tokio::test]
    async fn version_of_kills_the_whole_process_tree_when_it_times_out() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("grandchild.pid");
        let bin = cmd_script(
            dir.path(),
            "wrapper",
            &format!("{}\nping -n 30 127.0.0.1 >nul", start_grandchild(&pidfile)),
        );
        // Long enough for PowerShell to start on a cold CI runner.
        assert_eq!(
            version_of_within(&bin, &["--version"], Duration::from_secs(15)).await,
            None
        );
        let pid = read_pid(&pidfile);
        assert!(
            gone_within(pid, Duration::from_secs(2)).await,
            "grandchild {pid} is still running after the timeout"
        );
    }

    /// Whether process `pid` has exited, or is gone, within `grace`. Kills it
    /// if it is still running, so a failing test leaves nothing behind.
    #[cfg(windows)]
    async fn gone_within(pid: u32, grace: Duration) -> bool {
        tokio::task::spawn_blocking(move || {
            use windows_sys::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
            use windows_sys::Win32::System::Threading::{
                OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE,
                PROCESS_TERMINATE,
            };
            // SAFETY: OpenProcess takes no pointers; a null result means the
            // process is gone (or its pid was reused by one we may not open).
            let process = unsafe { OpenProcess(PROCESS_SYNCHRONIZE | PROCESS_TERMINATE, 0, pid) };
            if process.is_null() {
                return true;
            }
            let ms = grace.as_millis() as u32;
            // SAFETY: `process` is a handle this closure owns and closes below.
            let exited = unsafe { WaitForSingleObject(process, ms) } == WAIT_OBJECT_0;
            if !exited {
                // SAFETY: as above.
                unsafe { TerminateProcess(process, 1) };
            }
            // SAFETY: as above; closed exactly once.
            unsafe { CloseHandle(process) };
            exited
        })
        .await
        .unwrap()
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn version_of_resolves_a_bare_name_on_path() {
        assert_eq!(
            version_of("sh", &["-c", "echo 1.2.3"]).await,
            Some("1.2.3".to_string())
        );
    }

    #[test]
    fn gallerydl_is_downloaded_only_where_upstream_publishes_a_build() {
        assert_eq!(gallerydl_asset("linux", "x86_64"), Some("gallery-dl.bin"));
        assert_eq!(gallerydl_asset("windows", "x86_64"), Some("gallery-dl.exe"));
        assert_eq!(
            gallerydl_asset("windows", "x86"),
            Some("gallery-dl_x86.exe")
        );
        // x64 build runs under emulation on Windows on Arm.
        assert_eq!(
            gallerydl_asset("windows", "aarch64"),
            Some("gallery-dl.exe")
        );
        assert_eq!(gallerydl_asset("macos", "aarch64"), None);
        assert_eq!(gallerydl_asset("macos", "x86_64"), None);
        assert_eq!(gallerydl_asset("linux", "aarch64"), None);
        assert_eq!(gallerydl_asset("freebsd", "x86_64"), None);
    }

    #[test]
    fn ytdlp_uses_the_standalone_build_for_each_target() {
        assert_eq!(ytdlp_asset("windows", "x86_64"), "yt-dlp.exe");
        assert_eq!(ytdlp_asset("windows", "aarch64"), "yt-dlp.exe");
        assert_eq!(ytdlp_asset("macos", "aarch64"), "yt-dlp_macos");
        assert_eq!(ytdlp_asset("linux", "aarch64"), "yt-dlp_linux_aarch64");
        assert_eq!(ytdlp_asset("linux", "x86_64"), "yt-dlp_linux");
        // Everywhere else: the zipimport build, which needs python3.
        assert_eq!(ytdlp_asset("macos", "x86_64"), "yt-dlp");
        assert_eq!(ytdlp_asset("freebsd", "x86_64"), "yt-dlp");
    }

    #[test]
    fn evermeet_zip_url_reads_download_zip_url_from_the_info_json() {
        let info = r#"{"name":"ffmpeg","type":"release","version":"9.0.2",
            "download":{"7z":{"url":"https://evermeet.cx/ffmpeg/ffmpeg-9.0.2.7z"},
            "zip":{"url":"https://evermeet.cx/ffmpeg/ffmpeg-9.0.2.zip","size":26198325}}}"#;
        assert_eq!(
            evermeet_zip_url(info).unwrap(),
            "https://evermeet.cx/ffmpeg/ffmpeg-9.0.2.zip"
        );
    }

    #[test]
    fn evermeet_zip_url_names_the_missing_field() {
        let info = r#"{"name":"ffmpeg","download":{"7z":{"url":"https://evermeet.cx/ffmpeg/ffmpeg-9.0.2.7z"}}}"#;
        let err = evermeet_zip_url(info).unwrap_err().to_string();
        assert!(err.contains("download.zip.url"), "{err}");
    }

    #[test]
    fn evermeet_zip_url_rejects_a_url_that_is_not_https() {
        let info = r#"{"download":{"zip":{"url":"http://evermeet.cx/ffmpeg/ffmpeg-9.0.2.zip"}}}"#;
        let err = evermeet_zip_url(info).unwrap_err().to_string();
        assert!(
            err.contains("http://evermeet.cx/ffmpeg/ffmpeg-9.0.2.zip"),
            "{err}"
        );
    }

    #[test]
    fn ffmpeg_archive_matches_each_target() {
        let linux64 = FfmpegArchive {
            source: FfmpegSource::Direct("https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz"),
            format: ArchiveFormat::TarXz,
        };
        assert_eq!(ffmpeg_archive("linux", "x86_64"), linux64);
        assert_eq!(ffmpeg_archive("linux", "x86"), linux64);
        assert_eq!(
            ffmpeg_archive("linux", "aarch64"),
            FfmpegArchive {
                source: FfmpegSource::Direct("https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linuxarm64-gpl.tar.xz"),
                format: ArchiveFormat::TarXz,
            }
        );
        // evermeet.cx retired its "latest zip" redirect (410 Gone); the
        // versioned zip URL is read from its info JSON instead.
        let evermeet = FfmpegArchive {
            source: FfmpegSource::EvermeetInfo("https://evermeet.cx/ffmpeg/info/ffmpeg/release"),
            format: ArchiveFormat::Zip,
        };
        assert_eq!(ffmpeg_archive("macos", "aarch64"), evermeet);
        assert_eq!(ffmpeg_archive("macos", "x86_64"), evermeet);
        assert_eq!(
            ffmpeg_archive("windows", "x86_64"),
            FfmpegArchive {
                source: FfmpegSource::Direct("https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"),
                format: ArchiveFormat::Zip,
            }
        );
        // Unknown targets fall back to the Linux x86-64 build.
        assert_eq!(ffmpeg_archive("freebsd", "x86_64"), linux64);
    }
}
