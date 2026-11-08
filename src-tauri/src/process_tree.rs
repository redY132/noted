//! Run only in the dedicated client-host process, never the GUI or an MCP server.
//! The host enters the job before creating children, so cancellation cannot race
//! their assignment. Its noninheritable job handle belongs only to this host.
use std::{
    convert::Infallible,
    io, mem,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    ptr,
};
use windows_sys::Win32::System::{
    JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    },
    Threading::GetCurrentProcess,
};

pub(crate) fn run(operation: impl FnOnce() -> i32) -> io::Result<Infallible> {
    // SAFETY: no custom security attributes or name; the returned handle is
    // checked and uniquely owned. This handle is not inherited by children.
    let raw = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
    if raw.is_null() {
        return Err(io::Error::last_os_error());
    }
    let job = unsafe { OwnedHandle::from_raw_handle(raw) };
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { mem::zeroed() };
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    // SAFETY: the structure is initialized POD and its size matches this class.
    if unsafe {
        SetInformationJobObject(
            job.as_raw_handle(),
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            mem::size_of_val(&limits) as u32,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    // Only this dedicated host joins the new job. Normal CreateProcess children
    // inherit membership; no breakaway flags are enabled. No PID tree is scanned.
    if unsafe { AssignProcessToJobObject(job.as_raw_handle(), GetCurrentProcess()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let code = operation();
    // Deliberately exit without Rust unwinding: dropping the job while its host
    // is still running would terminate the host before preserving `code`.
    // Windows closes the handle during process teardown and stops remaining
    // members. Terminating this host externally closes the same handle.
    std::process::exit(code)
}
