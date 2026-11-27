#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod backend;
#[cfg(windows)]
mod companion;
#[cfg(windows)]
mod game_keys;
#[cfg(windows)]
mod instance;
#[cfg(windows)]
mod model;
#[cfg(windows)]
mod overlay;
#[cfg(windows)]
mod preferences;
#[cfg(windows)]
mod session;
#[cfg(windows)]
mod settings;

#[cfg(windows)]
fn main() {
    // `--quit` closes the running Daevalog; a plain launch while one runs opens its app window.
    let quit = std::env::args().any(|a| a == "--quit");
    if quit || matches!(instance::claim(false), instance::Instance::Running) {
        if quit {
            instance::claim(true);
        }
        return;
    }
    if let Err(error) = companion::run().map_err(|e| e.to_string()) {
        // A GUI executable has no console; keep startup failures reviewable.
        let _ = std::fs::create_dir_all(backend::data_dir());
        let _ = std::fs::write(backend::data_dir().join("startup-error.log"), &error);
        let message: Vec<u16> = format!("Daevalog could not start.\n\n{error}\n\nInstall Microsoft Edge WebView2 Runtime if it is missing.").encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "Daevalog".encode_utf16().chain(Some(0)).collect();
        // SAFETY: valid NUL-terminated UTF-16 strings; no parent window.
        unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
                std::ptr::null_mut(),
                message.as_ptr(),
                title.as_ptr(),
                0x10,
            );
        }
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("This frontend is for Windows. On Linux use scripts/install.sh.");
}
