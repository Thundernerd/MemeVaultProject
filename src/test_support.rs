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
pub fn read_pid(pidfile: &Path) -> u32 {
    try_read_pid(pidfile).expect("the grandchild did not record its pid")
}

fn try_read_pid(pidfile: &Path) -> Option<u32> {
    std::fs::read_to_string(pidfile).ok()?.trim().parse().ok()
}

/// The pid a running test script writes to `pidfile`, once it has written it.
pub async fn wait_for_pid(pidfile: &Path, within: Duration) -> u32 {
    let deadline = std::time::Instant::now() + within;
    loop {
        if let Some(pid) = try_read_pid(pidfile) {
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
pub async fn gone_within(pid: u32, grace: Duration) -> bool {
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
pub fn cmd_script(dir: &Path, name: &str, body: &str) -> String {
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
pub fn start_grandchild(pidfile: &Path) -> String {
    let pid = pidfile.display();
    format!(
        "start /b powershell -NoProfile -NonInteractive -Command \
         \"Set-Content -Path '{pid}' -Value $PID; Start-Sleep 30\" >nul 2>&1\n\
         :wait\n\
         if not exist \"{pid}\" (ping -n 2 127.0.0.1 >nul & goto wait)"
    )
}

/// Whether process `pid` has exited, or is gone, within `grace`. Kills it
/// if it is still running, so a failing test leaves nothing behind.
#[cfg(windows)]
pub async fn gone_within(pid: u32, grace: Duration) -> bool {
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

    /// Runs `binary` as a fake that, like a PyInstaller onefile build, leaves
    /// the work to a child process that holds stdout. Returns the file the
    /// fake writes that child's pid to.
    #[cfg(unix)]
    pub fn use_fake_pyinstaller_binary(&self, binary: Binary) -> PathBuf {
        let pidfile = self.dir.path().join("grandchild.pid");
        let bin = script(
            self.dir.path(),
            binary.name(),
            &format!("sleep 30 &\necho $! > '{}'\nwait", pidfile.display()),
        );
        self.use_binary(binary, &bin);
        pidfile
    }
}
