//! A child process together with everything it starts.
//!
//! Killing a child kills only that process. A wrapper script's grandchildren,
//! or the Python a PyInstaller onefile bootloader runs, keep running.
//! [`ProcessTree`] starts the child in a group of its own (a process group on
//! Unix, a Job Object on Windows) so the whole tree can be killed at once.

use tokio::process::{Child, Command};

/// Everything a spawned child started. Dropping it kills the whole tree,
/// unless [`ProcessTree::finished`] was called first.
pub struct ProcessTree {
    #[cfg(unix)]
    pgid: Option<libc::pid_t>,
    #[cfg(windows)]
    job: Option<windows::Job>,
}

impl ProcessTree {
    /// Spawns `cmd` in a group of its own.
    pub fn spawn(cmd: &mut Command) -> std::io::Result<(Child, ProcessTree)> {
        #[cfg(unix)]
        {
            // The child leads a new process group whose id is its pid, and
            // everything it starts joins that group.
            cmd.process_group(0);
            let child = cmd.spawn()?;
            let pgid = child.id().map(|pid| pid as libc::pid_t);
            Ok((child, ProcessTree { pgid }))
        }
        #[cfg(windows)]
        {
            let child = cmd.spawn()?;
            // Anything the child starts after this joins the job. If the job
            // cannot be set up, only the child itself can be killed.
            let job = child.raw_handle().and_then(windows::Job::kill_on_close);
            Ok((child, ProcessTree { job }))
        }
        #[cfg(not(any(unix, windows)))]
        {
            Ok((cmd.spawn()?, ProcessTree {}))
        }
    }

    /// The child has exited and been waited on. Leaves anything it left
    /// behind running: on Unix its process group id may already belong to
    /// another process.
    pub fn finished(mut self) {
        #[cfg(unix)]
        {
            self.pgid = None;
        }
        #[cfg(windows)]
        if let Some(job) = self.job.take() {
            job.release();
        }
    }
}

impl Drop for ProcessTree {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(pgid) = self.pgid.take() {
            // SAFETY: plain syscall. The group leader has not been waited on
            // yet, so the group id cannot have been reused.
            unsafe { libc::killpg(pgid, libc::SIGKILL) };
        }
        #[cfg(windows)]
        {
            // Closing the job kills every process in it.
            self.job.take();
        }
    }
}

#[cfg(windows)]
mod windows {
    use std::os::windows::io::RawHandle;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// A Job Object that kills its processes when it is closed.
    pub struct Job(HANDLE);

    // SAFETY: a job handle may be used and closed from any thread.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

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

        /// Closes the job without killing what is left in it.
        pub fn release(self) {
            self.set_limit_flags(0);
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
