//! Helpers shared by tests that run fake binaries.

use crate::binaries::Binary;
use crate::config::Config;
use crate::db::{self, Db};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Writes an executable `sh` script called `name` into `dir` and returns
/// its path.
#[cfg(unix)]
pub fn script(dir: &Path, name: &str, body: &str) -> String {
    use std::os::unix::fs::PermissionsExt;
    let path = dir.join(name);
    std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path.to_string_lossy().into()
}

/// The pid a test script wrote to `pidfile`.
#[cfg(unix)]
pub fn read_pid(pidfile: &Path) -> libc::pid_t {
    std::fs::read_to_string(pidfile)
        .unwrap()
        .trim()
        .parse()
        .unwrap()
}

/// The pid a running test script writes to `pidfile`, once it has written it.
#[cfg(unix)]
pub async fn wait_for_pid(pidfile: &Path, within: Duration) -> libc::pid_t {
    let deadline = std::time::Instant::now() + within;
    loop {
        if let Some(pid) = std::fs::read_to_string(pidfile)
            .ok()
            .and_then(|s| s.trim().parse().ok())
        {
            return pid;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "no pid in {} after {within:?}",
            pidfile.display()
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

/// Whether `pid` stops existing within `grace`. An orphan is reaped by
/// init, which may take a moment. Kills `pid` if it is still running, so
/// a failing test leaves nothing behind.
#[cfg(unix)]
pub async fn gone_within(pid: libc::pid_t, grace: Duration) -> bool {
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

/// A throwaway data directory with its config and database.
pub struct TestVault {
    pub dir: tempfile::TempDir,
    pub config: Config,
    pub db: Db,
}

impl TestVault {
    pub fn new() -> TestVault {
        let dir = tempfile::tempdir().unwrap();
        let config = Config {
            data_dir: dir.path().join("data"),
            bind: "127.0.0.1:0".into(),
            log_level: "error".into(),
            static_dir: PathBuf::from("frontend/dist"),
            oidc_issuer: None,
            oidc_client_id: None,
            oidc_client_secret: None,
            auth_secret: None,
            auth_url: None,
            legacy_api_key: None,
        };
        let db = Db::open(&config).unwrap();
        TestVault { dir, config, db }
    }

    /// Runs `binary` from `path` instead of its default location.
    pub fn use_binary(&self, binary: Binary, path: &str) {
        self.db
            .with_conn(|c| Ok(db::set_setting(c, binary.setting_key(), path)?))
            .unwrap();
    }
}
