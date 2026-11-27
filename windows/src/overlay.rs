//! The in-game widgets' window, as the Linux overlay's layer-shell surfaces:
//! one transparent, borderless, always-on-top window over the game's monitor
//! that never takes focus from the game. Clicks go through it except over
//! what the page says takes them (an open history, an alert's ✕), and in
//! Customize, where it covers the screen to drag widgets and takes the keys.
//!
//! Windows has no per-region input mask for a webview window, so a thread
//! watches the pointer and lets the window take it only while it is over
//! one of those regions.
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use windows_sys::Win32::{
    Foundation::{HWND, POINT, RECT},
    Graphics::Gdi::{
        GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY, MONITORINFO,
        MonitorFromPoint, MonitorFromWindow,
    },
    UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetCursorPos, GetWindowLongPtrW, IsWindow, SWP_FRAMECHANGED, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SetForegroundWindow, SetWindowLongPtrW, SetWindowPos,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    },
};

pub const LABEL: &str = "overlay";

/// What the page reports: where it takes clicks, in CSS pixels of the window.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Input {
    /// [x, y, width, height] each.
    pub rects: Vec<[f64; 4]>,
    /// The whole window takes the pointer (Customize).
    pub all: bool,
    /// Anything is drawn at all; without, the window is hidden.
    pub shown: bool,
}

#[derive(Default)]
pub struct Overlay {
    input: Mutex<Input>,
    /// The game's window, as last seen in front (an HWND as an integer, to cross threads).
    game: Mutex<isize>,
    /// Customize was on at the last snapshot.
    edit: Mutex<bool>,
}

pub type Shared = Arc<Overlay>;

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Daevalog overlay")
        // The same bundle as the app window, drawing the widgets instead.
        .initialization_script("window.__DAEVALOG_VIEW__ = 'overlay';")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .build()?;
    let _ = window.set_ignore_cursor_events(true);
    set_activatable(&window, false);
    Ok(window)
}

fn hwnd(window: &WebviewWindow) -> Option<HWND> {
    window.hwnd().ok().map(|h| h.0 as HWND)
}

/// Clicking a non-activatable window leaves the game focused; Customize needs the keys.
fn set_activatable(window: &WebviewWindow, on: bool) {
    let Some(hwnd) = hwnd(window) else { return };
    // SAFETY: our own window's extended style; the frame is refreshed after.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let next = if on {
            (style & !WS_EX_NOACTIVATE) | WS_EX_TOOLWINDOW
        } else {
            style | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW
        };
        if next != style {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next as isize);
            SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }
}

/// A monitor's whole area (physical pixels): the game's, or the primary one.
fn monitor_rect(game: HWND) -> RECT {
    // SAFETY: the monitor handle is always valid with these defaults; info has its size set.
    unsafe {
        let monitor = if !game.is_null() && IsWindow(game) != 0 {
            MonitorFromWindow(game, MONITOR_DEFAULTTONEAREST)
        } else {
            MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY)
        };
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        GetMonitorInfoW(monitor, &mut info);
        info.rcMonitor
    }
}

/// Covers a monitor: the one picked in Customize, else the game's.
pub fn place(app: &AppHandle, shared: &Overlay, pinned: &str) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let rect = app
        .available_monitors()
        .ok()
        .and_then(|ms| {
            ms.into_iter()
                .find(|m| !pinned.is_empty() && m.name().is_some_and(|n| n == pinned))
        })
        .map(|m| {
            let (p, s) = (m.position(), m.size());
            RECT {
                left: p.x,
                top: p.y,
                right: p.x + s.width as i32,
                bottom: p.y + s.height as i32,
            }
        })
        .unwrap_or_else(|| {
            monitor_rect(*shared.game.lock().unwrap_or_else(|e| e.into_inner()) as HWND)
        });
    let position = PhysicalPosition::new(rect.left, rect.top);
    let size = PhysicalSize::new(
        (rect.right - rect.left) as u32,
        (rect.bottom - rect.top) as u32,
    );
    if window.outer_position().ok() != Some(position) {
        let _ = window.set_position(position);
    }
    if window.outer_size().ok() != Some(size) {
        let _ = window.set_size(size);
    }
}

/// The game came to the front (or left it): the overlay follows it to its monitor.
pub fn game_focus(app: &AppHandle, shared: &Overlay, in_front: bool, window: HWND, pinned: &str) {
    if in_front {
        *shared.game.lock().unwrap_or_else(|e| e.into_inner()) = window as isize;
        place(app, shared, pinned);
    }
}

/// Customize on: the window takes focus and keys; off: back to the game.
pub fn follow_edit(app: &AppHandle, shared: &Overlay, edit: bool) {
    let mut was = shared.edit.lock().unwrap_or_else(|e| e.into_inner());
    if *was == edit {
        return;
    }
    *was = edit;
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    set_activatable(&window, edit);
    if edit {
        let _ = window.show();
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.set_focus();
    } else {
        let _ = window.set_ignore_cursor_events(true);
        let game = *shared.game.lock().unwrap_or_else(|e| e.into_inner()) as HWND;
        // SAFETY: a window handle we saw in front; IsWindow checks it still exists.
        unsafe {
            if !game.is_null() && IsWindow(game) != 0 {
                SetForegroundWindow(game);
            }
        }
    }
}

/// From the page: where it takes clicks, and whether there's anything to show.
pub fn set_input(app: &AppHandle, shared: &Overlay, input: Input) {
    let shown = input.shown;
    *shared.input.lock().unwrap_or_else(|e| e.into_inner()) = input;
    if let Some(window) = app.get_webview_window(LABEL)
        && window.is_visible().ok() != Some(shown)
    {
        let _ = if shown { window.show() } else { window.hide() };
    }
}

fn inside(input: &Input, x: f64, y: f64) -> bool {
    input.all
        || input
            .rects
            .iter()
            .any(|r| x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3])
}

/// Lets the window take the pointer only over the page's regions.
pub fn watch_pointer(app: AppHandle, shared: Shared) {
    std::thread::Builder::new()
        .name("overlay-input".into())
        .spawn(move || {
            let mut taking: Option<bool> = None;
            loop {
                std::thread::sleep(Duration::from_millis(30));
                let Some(window) = app.get_webview_window(LABEL) else {
                    continue;
                };
                let input = shared
                    .input
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone();
                if !input.shown {
                    taking = None;
                    continue;
                }
                let mut cursor = POINT { x: 0, y: 0 };
                // SAFETY: writes the pointer's screen position into a local.
                if unsafe { GetCursorPos(&mut cursor) } == 0 {
                    continue;
                }
                let (Ok(origin), Ok(scale)) = (window.outer_position(), window.scale_factor())
                else {
                    continue;
                };
                let x = f64::from(cursor.x - origin.x) / scale;
                let y = f64::from(cursor.y - origin.y) / scale;
                let take = inside(&input, x, y);
                if taking != Some(take) {
                    taking = Some(take);
                    let _ = window.set_ignore_cursor_events(!take);
                }
            }
        })
        .expect("spawn the overlay-input thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pointer_is_taken_only_over_a_region_or_in_customize() {
        let mut input = Input {
            rects: vec![[10.0, 20.0, 100.0, 50.0]],
            all: false,
            shown: true,
        };
        assert!(inside(&input, 10.0, 20.0));
        assert!(inside(&input, 109.9, 69.9));
        assert!(!inside(&input, 110.0, 30.0));
        assert!(!inside(&input, 5.0, 30.0));
        input.all = true;
        assert!(inside(&input, 5000.0, 5000.0));
    }

    #[test]
    fn the_primary_monitor_stands_in_without_a_game() {
        let r = monitor_rect(std::ptr::null_mut());
        assert!(r.right > r.left && r.bottom > r.top);
    }
}
