//! One Daevalog per user, as the Linux services are one per session: opening
//! it again brings up the running one's app window, and `--quit` asks the
//! running one to quit as from its tray (saving the fight and taking its tray
//! icon with it; a killed process leaves its icon behind until hovered).
use std::time::Duration;
use windows_sys::Win32::{
    Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError, HANDLE, WAIT_OBJECT_0},
    System::Threading::{
        CreateEventW, CreateMutexW, EVENT_MODIFY_STATE, OpenEventW, SetEvent,
        WaitForMultipleObjects,
    },
};

const MUTEX: &str = "Local\\Daevalog.Instance";
const SHOW: &str = "Local\\Daevalog.Show";
const QUIT: &str = "Local\\Daevalog.Quit";

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

/// This process holds the instance for its lifetime (the handle is never closed).
pub enum Instance {
    First,
    /// Another Daevalog runs: it was told what this one was asked.
    Running,
}

/// Becomes the running Daevalog, or hands the request to the one already running.
pub fn claim(quit: bool) -> Instance {
    // SAFETY: a named mutex owned for the process's lifetime; the error code is read right after.
    let first = unsafe {
        let mutex = CreateMutexW(std::ptr::null(), 0, wide(MUTEX).as_ptr());
        !mutex.is_null() && GetLastError() != ERROR_ALREADY_EXISTS
    };
    if first {
        return Instance::First;
    }
    signal(if quit { QUIT } else { SHOW });
    Instance::Running
}

/// Sets the running instance's event, if it's listening.
fn signal(name: &str) -> bool {
    // SAFETY: opened for signalling only, then closed.
    unsafe {
        let event = OpenEventW(EVENT_MODIFY_STATE, 0, wide(name).as_ptr());
        if event.is_null() {
            return false;
        }
        SetEvent(event);
        CloseHandle(event);
        true
    }
}

/// Waits for a later launch's requests: `on_show` for a plain launch, `on_quit` for `--quit`.
pub fn listen(on_show: impl Fn() + Send + 'static, on_quit: impl Fn() + Send + 'static) {
    // SAFETY: auto-reset events kept for the app's lifetime.
    let make = |name: &str| unsafe { CreateEventW(std::ptr::null(), 0, 0, wide(name).as_ptr()) };
    let (show, quit) = (make(SHOW) as isize, make(QUIT) as isize);
    std::thread::Builder::new()
        .name("instance".into())
        .spawn(move || {
            let handles = [show as HANDLE, quit as HANDLE];
            loop {
                // SAFETY: both handles stay open; the wait returns which was set.
                let which = unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, u32::MAX) };
                if which == WAIT_OBJECT_0 {
                    on_show();
                } else if which == WAIT_OBJECT_0 + 1 {
                    on_quit();
                } else {
                    std::thread::sleep(Duration::from_millis(500));
                }
            }
        })
        .expect("spawn the instance thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_reaches_only_a_listening_instance() {
        // Nobody listens under this name in the test runner.
        assert!(!signal("Local\\Daevalog.Test.Nobody"));
    }
}
