//! Ctrl+` (customize) and Alt+` (hide or show the widgets), as the Linux overlay
//! binds them on Hyprland: only while AION 2 is the window in front, so the keys
//! stay free in every other app. ` is the key under Esc, whatever the keyboard
//! layout prints on it (the key games use for a console).
use std::collections::HashSet;
use std::mem::{size_of, zeroed};
use std::time::{Duration, Instant};

use windows_sys::Win32::{
    Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
    System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    },
    UI::{
        Input::KeyboardAndMouse::{
            MAPVK_VSC_TO_VK, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MapVirtualKeyW, RegisterHotKey,
            UnregisterHotKey, VK_OEM_3,
        },
        WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId, MSG, PM_REMOVE, PeekMessageW, WM_HOTKEY,
        },
    },
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GameKey {
    /// Ctrl+`: unlock the widgets and open Overlay studio.
    Customize,
    /// Alt+`: hide or show the widgets.
    ToggleOverlays,
}

const CUSTOMIZE: i32 = 1;
const TOGGLE: i32 = 2;
/// The game's process name, as the daemon looks for it (daemon/src/windows/game.rs).
const GAME_EXE: &str = "AION2.exe";

/// What a WM_HOTKEY's id means.
fn key_for(id: usize) -> Option<GameKey> {
    match id as i32 {
        CUSTOMIZE => Some(GameKey::Customize),
        TOGGLE => Some(GameKey::ToggleOverlays),
        _ => None,
    }
}

/// The keys are held only while a game process owns the foreground window.
fn game_in_front(game: &HashSet<u32>, foreground: u32) -> bool {
    foreground != 0 && game.contains(&foreground)
}

/// The virtual key of the physical key under Esc (scan code 0x29) in the current layout.
fn console_key() -> u32 {
    // SAFETY: plain lookup in the thread's keyboard layout.
    let vk = unsafe { MapVirtualKeyW(0x29, MAPVK_VSC_TO_VK) };
    if vk == 0 { u32::from(VK_OEM_3) } else { vk }
}

fn game_pids() -> HashSet<u32> {
    let mut pids = HashSet::new();
    // SAFETY: the snapshot handle is checked and closed; the entry has its required size.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return pids;
        }
        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snapshot, &mut entry);
        while more != 0 {
            let end = entry
                .szExeFile
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExeFile.len());
            if String::from_utf16_lossy(&entry.szExeFile[..end]).eq_ignore_ascii_case(GAME_EXE) {
                pids.insert(entry.th32ProcessID);
            }
            more = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
    }
    pids
}

fn foreground_pid() -> u32 {
    let mut pid = 0;
    // SAFETY: a null foreground window leaves pid at 0.
    unsafe {
        let window = GetForegroundWindow();
        if !window.is_null() {
            GetWindowThreadProcessId(window, &mut pid);
        }
    }
    pid
}

/// Watches the foreground window and calls `on_key` for each press while the game is in front.
pub fn spawn(on_key: impl Fn(GameKey) + Send + 'static) {
    std::thread::Builder::new()
        .name("game-keys".into())
        .spawn(move || {
            let mut game = HashSet::new();
            let mut scanned: Option<Instant> = None;
            let mut armed = false;
            loop {
                // The game's processes change rarely; the foreground often.
                if scanned.is_none_or(|t| t.elapsed() >= Duration::from_secs(2)) {
                    game = game_pids();
                    scanned = Some(Instant::now());
                }
                let want = game_in_front(&game, foreground_pid());
                if want != armed {
                    armed = want;
                    // SAFETY: thread-owned hotkeys with no HWND; WM_HOTKEY arrives in this thread's queue.
                    unsafe {
                        if armed {
                            let key = console_key();
                            // A key another app holds just stays unbound; the other still works.
                            RegisterHotKey(
                                std::ptr::null_mut(),
                                CUSTOMIZE,
                                MOD_CONTROL | MOD_NOREPEAT,
                                key,
                            );
                            RegisterHotKey(
                                std::ptr::null_mut(),
                                TOGGLE,
                                MOD_ALT | MOD_NOREPEAT,
                                key,
                            );
                        } else {
                            UnregisterHotKey(std::ptr::null_mut(), CUSTOMIZE);
                            UnregisterHotKey(std::ptr::null_mut(), TOGGLE);
                        }
                    }
                }
                // SAFETY: drains this thread's own message queue.
                unsafe {
                    let mut msg: MSG = zeroed();
                    while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                        if msg.message == WM_HOTKEY
                            && let Some(key) = key_for(msg.wParam)
                        {
                            on_key(key);
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        })
        .expect("spawn the game-keys thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_held_only_while_the_game_is_in_front() {
        let game: HashSet<u32> = [4321].into();
        assert!(game_in_front(&game, 4321));
        assert!(!game_in_front(&game, 99), "another app in front");
        assert!(!game_in_front(&HashSet::new(), 0), "no game, no window");
        assert!(!game_in_front(&[0].into(), 0), "no foreground window");
    }

    #[test]
    fn hotkey_ids_map_to_actions() {
        assert_eq!(key_for(1), Some(GameKey::Customize));
        assert_eq!(key_for(2), Some(GameKey::ToggleOverlays));
        assert_eq!(key_for(3), None);
    }

    #[test]
    fn the_console_key_resolves_in_any_layout() {
        assert_ne!(console_key(), 0);
    }

    #[test]
    fn finds_no_game_in_the_test_runner() {
        assert!(!game_pids().contains(&std::process::id()));
    }
}
