//! Running a child process together with everything it starts.
//!
//! Killing a child kills only that process. A wrapper script's grandchildren,
//! or the Python a PyInstaller onefile bootloader runs, keep running.
//! [`output_within`] starts the child in a group of its own (a process group
//! on Unix, a Job Object on Windows) so the whole tree can be killed at once.
//!
//! A descendant that leaves the group on purpose (`setsid` or `setpgid` on
//! Unix, breakaway on Windows) is out of reach.

use std::process::{Output, Stdio};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};

/// Runs `cmd` and collects its output, like [`Command::output`], but gives
/// up after `timeout`. Once the child exits, anything it started that is
/// still running is killed; on timeout, or when the returned future is
/// dropped, the child is killed too. `None` if `cmd` cannot be
/// spawned, its output cannot be read, or it does not finish in time.
pub async fn output_within(cmd: &mut Command, timeout: Duration) -> Option<Output> {
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // `ProcessTree` kills the group; this kills the child itself if the
        // group could not be set up.
        .kill_on_drop(true);
    let mut tree = ProcessTree::spawn(cmd).ok()?;
    tokio::time::timeout(timeout, tree.output()).await.ok()?
}

/// A child and everything it starts. Dropping it kills whatever of them is
/// still running.
struct ProcessTree {
    child: Child,
    /// The child's process group, until the group has been killed. The
    /// child is reaped only after that: once it is, the id may belong to an
    /// unrelated process.
    #[cfg(unix)]
    pgid: Option<libc::pid_t>,
    /// `None` if the job could not be set up; then only the child is killed.
    #[cfg(windows)]
    job: Option<job::Job>,
}

impl ProcessTree {
    fn spawn(cmd: &mut Command) -> std::io::Result<ProcessTree> {
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
            let child = cmd.spawn()?;
            // Anything the child starts after this joins the job.
            let job = child.raw_handle().and_then(job::Job::kill_on_close);
            Ok(ProcessTree { child, job })
        }
    }

    /// Reads the child's stdout and stderr to the end, waits for the child,
    /// then kills anything it left running.
    async fn output(&mut self) -> Option<Output> {
        let mut stdout_pipe = self.child.stdout.take()?;
        let mut stderr_pipe = self.child.stderr.take()?;
        let (mut stdout, mut stderr) = (Vec::new(), Vec::new());
        let (stdout_read, stderr_read) = tokio::join!(
            stdout_pipe.read_to_end(&mut stdout),
            stderr_pipe.read_to_end(&mut stderr)
        );
        stdout_read.ok()?;
        stderr_read.ok()?;
        // Kill the group once the child has exited, but before it is reaped:
        // until then its pid, and so the group id, cannot be reused.
        #[cfg(unix)]
        {
            if let Some(pid) = self.pgid {
                tokio::task::spawn_blocking(move || wait_unreaped(pid))
                    .await
                    .ok()?
                    .ok()?;
            }
            self.kill();
        }
        let status = self.child.wait().await.ok()?;
        // A job is held by its handle, not an id, so it can be closed after
        // the child is reaped. Closing it earlier could kill a child that has
        // closed its pipes but not yet exited.
        #[cfg(windows)]
        self.kill();
        Some(Output {
            status,
            stdout,
            stderr,
        })
    }

    /// Kills everything left in the group. Only the first call does anything.
    fn kill(&mut self) {
        #[cfg(unix)]
        if let Some(pgid) = self.pgid.take() {
            // SAFETY: no memory is involved. The leader has not been waited
            // on, so `pgid` still names this child's group and no other.
            unsafe { libc::killpg(pgid, libc::SIGKILL) };
        }
        #[cfg(windows)]
        {
            // Closing the job kills every process in it.
            self.job.take();
        }
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
        self.kill();
    }
}

#[cfg(windows)]
mod job {
    use std::os::windows::io::RawHandle;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// A Job Object that kills its processes when it is closed.
    pub struct Job(HANDLE);

    // SAFETY: a job handle is a kernel handle, usable and closable from any thread.
    unsafe impl Send for Job {}

    impl Job {
        /// Puts `process` in a new job that kills it, and everything it
        /// starts, when the job is closed.
        pub fn kill_on_close(process: RawHandle) -> Option<Job> {
            // SAFETY: CreateJobObjectW accepts null attributes and name; the
            // handle is owned by `Job` and closed exactly once in `drop`.
            let job = Job(unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) });
            if job.0.is_null() {
                return None;
            }
            (job.set_limit_flags(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
                // SAFETY: `process` is the live child's handle, borrowed only for this call.
                && unsafe { AssignProcessToJobObject(job.0, process as HANDLE) } != 0)
                .then_some(job)
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
