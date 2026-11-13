//! Running a child process together with everything it starts.
//!
//! Killing a child kills only that process. A wrapper script's grandchildren,
//! or the Python a PyInstaller onefile bootloader runs, keep running.
//! [`ProcessTree`] starts the child in a group of its own (a process group
//! on Unix, a Job Object on Windows) so the whole tree can be killed at once.
//! [`output_within`] uses it for short checks; downloads and conversions use
//! it directly so cancelling them kills everything they started.
//! On Windows the child starts suspended and joins its job before it runs,
//! so nothing it starts, however early, escapes the job. If the job cannot
//! be set up, `taskkill /T` kills the tree instead, and once the child
//! exits normally its descendants are found and killed through their
//! parent pids.
//!
//! A descendant that leaves the group on purpose (`setsid` or `setpgid` on
//! Unix, breakaway on Windows) is out of reach.

#[cfg(windows)]
use std::os::windows::io::RawHandle;
use std::process::{ExitStatus, Output, Stdio};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::{Child, ChildStderr, ChildStdout, Command};
use tokio::sync::watch;

/// Runs `cmd` and collects its output, like [`Command::output`], but gives
/// up after `timeout`. Once the child exits, anything it started that is
/// still running is killed; on timeout, or when the returned future is
/// dropped, the child is killed too. `None` if `cmd` cannot be
/// spawned, its output cannot be read, or it does not finish in time.
///
/// On Windows this replaces any creation flags already set on `cmd`.
pub async fn output_within(cmd: &mut Command, timeout: Duration) -> Option<Output> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut tree = ProcessTree::spawn(cmd).ok()?;
    tokio::time::timeout(timeout, tree.output()).await.ok()?
}

/// A child and everything it starts. Dropping it kills whatever of them is
/// still running.
pub struct ProcessTree {
    child: Child,
    /// The child's process group, while it is safe to signal: `None` once
    /// the group has been killed, or once the child may have been reaped and
    /// the id may belong to an unrelated process.
    #[cfg(unix)]
    pgid: Option<libc::pid_t>,
    /// How to kill the child's tree: `None` once it has been killed.
    #[cfg(windows)]
    group: Option<Group>,
}

/// How a [`ProcessTree`] kills the child and everything it started.
#[cfg(windows)]
enum Group {
    /// Closing the job kills every process in it.
    Job(job::Job),
    /// The job could not be set up (a warning is logged at spawn).
    /// `taskkill /T` kills the child and its descendants, found through
    /// their parent pids, but only while the child is unreaped and so its
    /// pid still names it. A descendant whose parent has already exited
    /// is out of reach, and an unrelated orphan whose dead parent had the
    /// child's pid is killed too. Killing blocks the calling thread while
    /// taskkill runs. When the child exits by itself, [`ProcessTree::wait`]
    /// kills what it left running instead (see
    /// [`job::wait_then_kill_descendants`]), as taskkill cannot walk the
    /// tree of an exited process.
    Taskkill,
}

impl ProcessTree {
    /// Spawns `cmd` in a group of its own. Set up its pipes on `cmd` first.
    /// On Windows this replaces any creation flags already set on `cmd`.
    pub fn spawn(cmd: &mut Command) -> std::io::Result<ProcessTree> {
        // `ProcessTree` kills the group; this kills the child itself if the
        // group could not be set up.
        cmd.kill_on_drop(true);
        #[cfg(unix)]
        {
            // The child leads a new process group whose id is its pid, and
            // everything it starts joins that group.
            cmd.process_group(0);
            let child = cmd.spawn()?;
            let pgid = child.id().map(|pid| pid as libc::pid_t);
            Ok(ProcessTree { child, pgid })
        }
        #[cfg(windows)]
        {
            ProcessTree::spawn_in_job(cmd, job::Job::kill_on_close)
        }
    }

    /// Spawns `cmd` suspended, puts it in the job `new_job` makes for its
    /// process handle, then resumes it. If there is no job, the tree is
    /// killed with `taskkill` instead (see [`Group::Taskkill`]).
    #[cfg(windows)]
    fn spawn_in_job(
        cmd: &mut Command,
        new_job: impl FnOnce(RawHandle) -> std::io::Result<job::Job>,
    ) -> std::io::Result<ProcessTree> {
        // The child starts suspended and is put in the job before any of
        // its code runs, so everything it starts joins the job too.
        cmd.creation_flags(job::CREATE_SUSPENDED);
        let mut child = cmd.spawn()?;
        let job = match child.raw_handle() {
            Some(handle) => new_job(handle),
            None => Err(std::io::Error::other("the child has no process handle")),
        };
        let group = match job {
            Ok(job) => Group::Job(job),
            Err(err) => {
                tracing::warn!(
                    program = ?cmd.as_std().get_program(),
                    "could not put the child in a job; its tree is killed with \
                     taskkill instead, which misses anything whose parent has \
                     already exited: {err}"
                );
                Group::Taskkill
            }
        };
        let resumed = child
            .id()
            .ok_or_else(|| std::io::Error::other("the child has no pid"))
            .and_then(job::resume_main_thread);
        if let Err(err) = resumed {
            tracing::warn!(
                program = ?cmd.as_std().get_program(),
                "could not resume the child; killing it: {err}"
            );
            // Left suspended, the child would never exit.
            let _ = child.start_kill();
            return Err(err);
        }
        Ok(ProcessTree {
            child,
            group: Some(group),
        })
    }

    /// Like [`ProcessTree::spawn`], but as if the job could not be set up.
    #[cfg(all(test, windows))]
    fn spawn_without_job(cmd: &mut Command) -> std::io::Result<ProcessTree> {
        ProcessTree::spawn_in_job(cmd, |_| {
            Err(std::io::Error::other("the test skipped the job"))
        })
    }

    /// The child's stdout, if it was piped and not taken yet.
    pub fn take_stdout(&mut self) -> Option<ChildStdout> {
        self.child.stdout.take()
    }

    /// The child's stderr, if it was piped and not taken yet.
    pub fn take_stderr(&mut self) -> Option<ChildStderr> {
        self.child.stderr.take()
    }

    /// Reads the child's stdout and stderr to the end while waiting for the
    /// child. Once the child exits, anything it left running is killed, so a
    /// descendant that still holds the pipes cannot keep them from reaching
    /// the end.
    async fn output(&mut self) -> Option<Output> {
        let mut stdout_pipe = self.take_stdout()?;
        let mut stderr_pipe = self.take_stderr()?;
        let (mut stdout, mut stderr) = (Vec::new(), Vec::new());
        let (stdout_read, stderr_read, status) = tokio::join!(
            stdout_pipe.read_to_end(&mut stdout),
            stderr_pipe.read_to_end(&mut stderr),
            self.wait()
        );
        stdout_read.ok()?;
        stderr_read.ok()?;
        let status = status.ok()?;
        Some(Output {
            status,
            stdout,
            stderr,
        })
    }

    /// Waits for the child to exit, then kills anything it left running, so
    /// nothing it started keeps the child's pipes open. Safe to cancel and
    /// call again, e.g. after [`ProcessTree::kill`].
    pub async fn wait(&mut self) -> std::io::Result<ExitStatus> {
        // Kill the group once the child has exited, but before it is reaped:
        // until then its pid, and so the group id, cannot be reused.
        #[cfg(unix)]
        if let Some(pid) = self.pgid {
            let exited = tokio::task::spawn_blocking(move || wait_unreaped(pid)).await;
            let exited = exited.unwrap_or_else(|e| Err(std::io::Error::other(e)));
            if let Err(e) = exited {
                // `waitid` fails (ECHILD) if something else has reaped the
                // child, and then the group id may already be reused: stop
                // `kill` and `Drop` from signalling it.
                self.pgid = None;
                return Err(e);
            }
            self.kill_remaining();
        }
        // Without a job, the child's descendants are found through their
        // parent pids, so they must be killed before the child is reaped and
        // its pid may be reused.
        #[cfg(windows)]
        if matches!(self.group, Some(Group::Taskkill)) {
            self.kill_descendants_once_exited().await;
        }
        let status = self.child.wait().await?;
        // A job is held by its handle, not an id, so it can be closed after
        // the child is reaped. Closing it earlier could kill a child that has
        // closed its pipes but not yet exited.
        #[cfg(windows)]
        self.kill_remaining();
        Ok(status)
    }

    /// Without a job: blocks until the child has exited, leaving it
    /// unreaped, then kills its descendants (see
    /// [`job::wait_then_kill_descendants`]). Logs a warning if it cannot.
    #[cfg(windows)]
    async fn kill_descendants_once_exited(&mut self) {
        use std::os::windows::io::BorrowedHandle;
        // Both are `None` once the child has been reaped.
        let (Some(handle), Some(pid)) = (self.child.raw_handle(), self.child.id()) else {
            return;
        };
        // SAFETY: the child is unreaped, so its handle is open, and it stays
        // open while it is borrowed here. The blocking task gets a handle of
        // its own, which stays valid even if this future is dropped and the
        // child with it.
        let process = unsafe { BorrowedHandle::borrow_raw(handle) }.try_clone_to_owned();
        let killed = match process {
            Ok(process) => {
                tokio::task::spawn_blocking(move || job::wait_then_kill_descendants(process, pid))
                    .await
                    .unwrap_or_else(|e| Err(std::io::Error::other(e)))
            }
            Err(err) => Err(err),
        };
        match killed {
            // Nothing is left for `kill` or `Drop` to kill.
            Ok(()) => self.group = None,
            Err(err) => tracing::warn!(pid, "could not kill what the child left running: {err}"),
        }
    }

    /// Kills the child and everything it started. [`ProcessTree::wait`]
    /// then reaps the child.
    pub fn kill(&mut self) {
        self.kill_remaining();
        // Reaches the child even if its group could not be set up.
        let _ = self.child.start_kill();
    }

    /// Like [`ProcessTree::wait`], but if `cancel` turns `true` first, kills
    /// the tree and then waits for it. A `None` or closed `cancel` never
    /// cancels.
    pub async fn wait_or_cancel(
        &mut self,
        cancel: Option<watch::Receiver<bool>>,
    ) -> std::io::Result<ExitStatus> {
        let cancelled = async {
            match cancel {
                // `map(drop)` releases the borrow `wait_for` returns, which
                // must not be held across an await.
                Some(mut cancel) => cancel.wait_for(|cancelled| *cancelled).await.map(drop),
                None => std::future::pending().await,
            }
        };
        tokio::select! {
            status = self.wait() => status,
            Ok(()) = cancelled => {
                self.kill();
                self.wait().await
            }
        }
    }

    /// Kills everything left in the group. Only the first call does anything.
    fn kill_remaining(&mut self) {
        #[cfg(unix)]
        if let Some(pgid) = self.pgid.take() {
            // SAFETY: no memory is involved. The leader has not been waited
            // on, so `pgid` still names this child's group and no other.
            unsafe { libc::killpg(pgid, libc::SIGKILL) };
        }
        #[cfg(windows)]
        match self.group.take() {
            Some(Group::Job(job)) => drop(job),
            // `id` is `None` once the child has been reaped, when its pid
            // may name an unrelated process.
            Some(Group::Taskkill) => {
                if let Some(pid) = self.child.id() {
                    taskkill_tree(pid);
                }
            }
            None => {}
        }
    }
}

/// Kills process `pid` and its descendants with `taskkill /T /F`, blocking
/// until taskkill exits. Does nothing if `pid` has already exited. Only the
/// fallback for a missing job runs this, so the block is accepted: running
/// taskkill in the background could let the pid be reused before it acts.
#[cfg(windows)]
fn taskkill_tree(pid: u32) {
    // taskkill's exit code when there is no process `pid`.
    const NOT_FOUND: i32 = 128;
    use std::os::windows::process::CommandExt;
    // From System32, so nothing on PATH can stand in for it.
    let taskkill = std::env::var_os("SystemRoot")
        .map(|root| std::path::Path::new(&root).join(r"System32\taskkill.exe"))
        .unwrap_or_else(|| "taskkill.exe".into());
    let killed = std::process::Command::new(taskkill)
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(job::CREATE_NO_WINDOW)
        .status();
    match killed {
        // Not found: the child exited before it could be killed.
        Ok(status) if status.success() || status.code() == Some(NOT_FOUND) => {}
        Ok(status) => tracing::warn!(pid, "taskkill could not kill the child's tree: {status}"),
        Err(err) => tracing::warn!(pid, "could not run taskkill: {err}"),
    }
}

/// Blocks until the child `pid` has exited, leaving it unreaped (a zombie) so
/// its pid and process group id stay reserved.
#[cfg(unix)]
fn wait_unreaped(pid: libc::pid_t) -> std::io::Result<()> {
    loop {
        // SAFETY: an all-zero siginfo_t is valid.
        let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
        // SAFETY: `info` is a valid siginfo_t that outlives the call. WNOWAIT
        // leaves the child waitable, so `Child::wait` still reaps it.
        let ret = unsafe {
            libc::waitid(
                libc::P_PID,
                pid as libc::id_t,
                &mut info,
                libc::WEXITED | libc::WNOWAIT,
            )
        };
        if ret == 0 {
            return Ok(());
        }
        let err = std::io::Error::last_os_error();
        if err.kind() != std::io::ErrorKind::Interrupted {
            return Err(err);
        }
    }
}

impl Drop for ProcessTree {
    // Runs before `child` is dropped, so the group dies while its leader is
    // still unreaped.
    fn drop(&mut self) {
        self.kill_remaining();
    }
}

#[cfg(windows)]
mod job {
    use std::io;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle};
    use windows_sys::Win32::Foundation::{
        CloseHandle, FILETIME, HANDLE, INVALID_HANDLE_VALUE, WAIT_OBJECT_0,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, Thread32First, Thread32Next,
        PROCESSENTRY32W, TH32CS_SNAPPROCESS, TH32CS_SNAPTHREAD, THREADENTRY32,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::SystemInformation::GetSystemTimePreciseAsFileTime;
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, OpenThread, ResumeThread, TerminateProcess,
        WaitForSingleObject, INFINITE, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
        THREAD_SUSPEND_RESUME,
    };

    pub use windows_sys::Win32::System::Threading::{CREATE_NO_WINDOW, CREATE_SUSPENDED};

    /// Resumes the only thread of process `pid`, started with
    /// [`CREATE_SUSPENDED`]. std and tokio keep the thread's handle to
    /// themselves, so it is found by walking a snapshot of all threads.
    pub fn resume_main_thread(pid: u32) -> io::Result<()> {
        // SAFETY: no pointers are passed; the result is checked below.
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: `snapshot` is a valid handle that nothing else owns.
        let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot as RawHandle) };
        // SAFETY: an all-zero THREADENTRY32 is valid; dwSize is set below.
        let mut entry: THREADENTRY32 = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
        let snapshot = snapshot.as_raw_handle() as HANDLE;
        // SAFETY: `entry` is a THREADENTRY32 with its size set, outliving the call.
        if unsafe { Thread32First(snapshot, &mut entry) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut more = true;
        while more {
            if entry.th32OwnerProcessID == pid {
                return resume_thread(entry.th32ThreadID);
            }
            // SAFETY: as for Thread32First.
            more = unsafe { Thread32Next(snapshot, &mut entry) } != 0;
        }
        Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("process {pid} has no thread to resume"),
        ))
    }

    fn resume_thread(tid: u32) -> io::Result<()> {
        // SAFETY: no pointers are passed; the result is checked below.
        let thread = unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, tid) };
        if thread.is_null() {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: `thread` is a valid handle that nothing else owns.
        let thread = unsafe { OwnedHandle::from_raw_handle(thread as RawHandle) };
        // SAFETY: `thread` is open with THREAD_SUSPEND_RESUME.
        if unsafe { ResumeThread(thread.as_raw_handle() as HANDLE) } == u32::MAX {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    /// Blocks until `process`, the child with pid `pid`, has exited, then
    /// kills its descendants. Holding `process` keeps `pid` from being
    /// reused, so it names the child and no other process throughout.
    ///
    /// A descendant is found through its parent pid, which is reused once
    /// that parent is gone. So each one must have been created no earlier
    /// than its parent, or it is an older, unrelated process whose own
    /// parent happened to have the same pid; nothing created before the
    /// child is ever killed. A descendant whose parent exited before the
    /// child did is out of reach: nothing links it to the child any more.
    pub fn wait_then_kill_descendants(process: OwnedHandle, pid: u32) -> io::Result<()> {
        let handle = process.as_raw_handle() as HANDLE;
        // SAFETY: `handle` is open until `process` is dropped at the end.
        if unsafe { WaitForSingleObject(handle, INFINITE) } != WAIT_OBJECT_0 {
            return Err(io::Error::last_os_error());
        }
        let created = creation_time(handle)?;
        let processes = process_snapshot()?;
        // Anything created after this did not exist when the snapshot was
        // taken: an entry's pid that now names it has been reused.
        let taken = now();
        let mut parents = vec![(pid, created)];
        let mut killed = vec![pid];
        while let Some((parent, parent_created)) = parents.pop() {
            for &(child, _) in processes.iter().filter(|&&(c, p)| p == parent && c != p) {
                if killed.contains(&child) {
                    continue;
                }
                // Without access to it, it cannot be checked or killed.
                let Some(child_process) = open_process(child) else {
                    continue;
                };
                let child_handle = child_process.as_raw_handle() as HANDLE;
                let Ok(child_created) = creation_time(child_handle) else {
                    continue;
                };
                if child_created < parent_created || child_created > taken {
                    continue;
                }
                // SAFETY: `child_handle` is open with PROCESS_TERMINATE.
                // Failure means it has already exited.
                unsafe { TerminateProcess(child_handle, 1) };
                killed.push(child);
                parents.push((child, child_created));
            }
        }
        drop(process);
        Ok(())
    }

    /// The pid and parent pid of every process.
    fn process_snapshot() -> io::Result<Vec<(u32, u32)>> {
        // SAFETY: no pointers are passed; the result is checked below.
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: `snapshot` is a valid handle that nothing else owns.
        let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot as RawHandle) };
        let snapshot = snapshot.as_raw_handle() as HANDLE;
        // SAFETY: an all-zero PROCESSENTRY32W is valid; dwSize is set below.
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut processes = Vec::new();
        // SAFETY: `entry` is a PROCESSENTRY32W with its size set, outliving the call.
        let mut more = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
        if !more {
            return Err(io::Error::last_os_error());
        }
        while more {
            processes.push((entry.th32ProcessID, entry.th32ParentProcessID));
            // SAFETY: as for Process32FirstW.
            more = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
        }
        Ok(processes)
    }

    /// Opens process `pid` to check its creation time and kill it.
    fn open_process(pid: u32) -> Option<OwnedHandle> {
        // SAFETY: no pointers are passed; the result is checked below.
        let handle = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
                0,
                pid,
            )
        };
        // SAFETY: a non-null result is a valid handle that nothing else owns.
        (!handle.is_null()).then(|| unsafe { OwnedHandle::from_raw_handle(handle as RawHandle) })
    }

    /// When `process` was created, in 100 ns intervals since 1601.
    fn creation_time(process: HANDLE) -> io::Result<u64> {
        let mut times = [FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        }; 4];
        let [created, exited, kernel, user] = &mut times;
        // SAFETY: `process` is open with at least
        // PROCESS_QUERY_LIMITED_INFORMATION, and each FILETIME outlives the call.
        if unsafe { GetProcessTimes(process, created, exited, kernel, user) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(filetime(times[0]))
    }

    /// The current time, as [`creation_time`] counts it.
    fn now() -> u64 {
        let mut time = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        // SAFETY: `time` is a FILETIME that outlives the call.
        unsafe { GetSystemTimePreciseAsFileTime(&mut time) };
        filetime(time)
    }

    fn filetime(time: FILETIME) -> u64 {
        (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime)
    }

    /// A Job Object that kills its processes when it is closed.
    pub struct Job(HANDLE);

    // SAFETY: a job handle is a kernel handle, usable and closable from any thread.
    unsafe impl Send for Job {}

    impl Job {
        /// Puts `process` in a new job that kills it, and everything it
        /// starts, when the job is closed.
        pub fn kill_on_close(process: RawHandle) -> io::Result<Job> {
            // SAFETY: CreateJobObjectW accepts null attributes and name.
            let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if handle.is_null() {
                return Err(io::Error::last_os_error());
            }
            // The handle is owned by `Job` and closed exactly once in `drop`.
            let job = Job(handle);
            if !job.set_limit_flags(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
                // SAFETY: `process` is the live child's handle, borrowed only for this call.
                || unsafe { AssignProcessToJobObject(job.0, process as HANDLE) } == 0
            {
                return Err(io::Error::last_os_error());
            }
            Ok(job)
        }

        fn set_limit_flags(&self, flags: u32) -> bool {
            // SAFETY: an all-zero JOBOBJECT_EXTENDED_LIMIT_INFORMATION is valid.
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            info.BasicLimitInformation.LimitFlags = flags;
            // SAFETY: `info` is the struct JobObjectExtendedLimitInformation expects, with its size.
            unsafe {
                SetInformationJobObject(
                    self.0,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                ) != 0
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: the handle is valid and closed only here.
            unsafe { CloseHandle(self.0) };
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::ProcessTree;
    use crate::test_support::{cmd_script, gone_within, wait_for_pid};
    use std::path::{Path, PathBuf};
    use std::process::Stdio;
    use std::time::Duration;
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    /// Spawns, with no job, a script that starts a PowerShell grandchild
    /// holding the script's stdout for 30 s, like the Python a PyInstaller
    /// onefile bootloader runs. Returns the tree and the file the grandchild
    /// writes its pid to. Unlike `test_support::start_grandchild`, the
    /// grandchild keeps stdout, so the tree is gone only once it reaches EOF.
    fn spawn_tree_without_job(dir: &Path) -> (ProcessTree, PathBuf) {
        let pidfile = dir.join("grandchild.pid");
        let bin = cmd_script(
            dir,
            "wrapper",
            &format!(
                "start /b powershell -NoProfile -NonInteractive -Command \
                 \"Set-Content -Path '{}' -Value $PID; Start-Sleep 30\"\n\
                 ping -n 30 127.0.0.1 >nul",
                pidfile.display()
            ),
        );
        let mut cmd = Command::new(bin);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        (ProcessTree::spawn_without_job(&mut cmd).unwrap(), pidfile)
    }

    #[tokio::test]
    async fn kill_without_a_job_kills_the_whole_tree() {
        let dir = tempfile::tempdir().unwrap();
        let (mut tree, pidfile) = spawn_tree_without_job(dir.path());
        let mut stdout = tree.take_stdout().unwrap();
        // Long enough for PowerShell to start on a cold CI runner.
        let pid = wait_for_pid(&pidfile, Duration::from_secs(15)).await;

        tree.kill();

        tokio::time::timeout(Duration::from_secs(5), tree.wait())
            .await
            .expect("wait still running 5 s after kill")
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), stdout.read_to_end(&mut Vec::new()))
            .await
            .expect("stdout still open 5 s after kill")
            .unwrap();
        assert!(
            gone_within(pid, Duration::from_secs(2)).await,
            "grandchild {pid} is still running after kill"
        );
    }

    #[tokio::test]
    async fn wait_without_a_job_kills_what_the_child_left_running() {
        let dir = tempfile::tempdir().unwrap();
        let pidfile = dir.path().join("grandchild.pid");
        // Starts a grandchild that holds stdout for 30 s, waits until it has
        // recorded its pid, then exits and leaves it running.
        let bin = cmd_script(
            dir.path(),
            "wrapper",
            &format!(
                "start /b powershell -NoProfile -NonInteractive -Command \
                 \"Set-Content -Path '{pid}' -Value $PID; Start-Sleep 30\"\n\
                 :wait\n\
                 if not exist \"{pid}\" (ping -n 2 127.0.0.1 >nul & goto wait)",
                pid = pidfile.display()
            ),
        );
        let mut cmd = Command::new(bin);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut tree = ProcessTree::spawn_without_job(&mut cmd).unwrap();
        let mut stdout = tree.take_stdout().unwrap();

        // Long enough for PowerShell to start on a cold CI runner.
        tokio::time::timeout(Duration::from_secs(20), tree.wait())
            .await
            .expect("the wrapper did not exit")
            .unwrap();
        let pid = wait_for_pid(&pidfile, Duration::from_secs(1)).await;

        tokio::time::timeout(Duration::from_secs(5), stdout.read_to_end(&mut Vec::new()))
            .await
            .expect("stdout still open 5 s after the wrapper exited")
            .unwrap();
        assert!(
            gone_within(pid, Duration::from_secs(2)).await,
            "grandchild {pid} is still running after wait"
        );
    }

    #[tokio::test]
    async fn dropping_without_a_job_kills_the_whole_tree() {
        let dir = tempfile::tempdir().unwrap();
        let (tree, pidfile) = spawn_tree_without_job(dir.path());
        let pid = wait_for_pid(&pidfile, Duration::from_secs(15)).await;

        drop(tree);

        assert!(
            gone_within(pid, Duration::from_secs(2)).await,
            "grandchild {pid} is still running after the tree was dropped"
        );
    }
}
