//! The game's focus and its shortcuts, as the Linux overlay gets them from
//! Hyprland: whether AION 2 is the window in front (the widgets show only then),
//! and the Customize and hide shortcuts ("CTRL + grave", "ALT + grave" by default,
//! changed in Customize), held only while the game or Daevalog is in front so
//! the keys stay free in every other app. "grave" is the key under Esc, whatever
//! the keyboard layout prints on it.
use std::collections::HashSet;
use std::mem::{size_of, zeroed};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use windows_sys::Win32::{
    Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE},
    System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    },
    UI::{
        Input::KeyboardAndMouse::{
            HOT_KEY_MODIFIERS, MAPVK_VSC_TO_VK, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT,
            MOD_WIN, MapVirtualKeyW, RegisterHotKey, UnregisterHotKey, VK_F1, VK_OEM_3,
        },
        WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId, MSG, PM_REMOVE, PeekMessageW, WM_HOTKEY,
        },
    },
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GameKey {
    /// Customize: drag the widgets, settings.
    Customize,
    /// Hide or show the widgets.
    ToggleWidgets,
}

const CUSTOMIZE: i32 = 1;
const TOGGLE: i32 = 2;
/// The game's process name, as the daemon looks for it (daemon/src/windows/game.rs).
const GAME_EXE: &str = "AION2.exe";

/// The two combos, as overlay.json holds them; shared with the session's settings.
pub type Shortcuts = Arc<Mutex<[String; 2]>>;

/// What a WM_HOTKEY's id means.
fn key_for(id: usize) -> Option<GameKey> {
    match id as i32 {
        CUSTOMIZE => Some(GameKey::Customize),
        TOGGLE => Some(GameKey::ToggleWidgets),
        _ => None,
    }
}

/// The virtual key of the physical key under Esc (scan code 0x29) in the current layout.
fn console_key() -> u32 {
    // SAFETY: plain lookup in the thread's keyboard layout.
    let vk = unsafe { MapVirtualKeyW(0x29, MAPVK_VSC_TO_VK) };
    if vk == 0 { u32::from(VK_OEM_3) } else { vk }
}

/// A Linux-style combo ("CTRL + grave", "ALT + Z", "F9") as hotkey modifiers and a virtual key.
pub fn parse_combo(combo: &str) -> Option<(HOT_KEY_MODIFIERS, u32)> {
    let mut mods = MOD_NOREPEAT;
    let mut key = None;
    for part in combo.split('+').map(str::trim) {
        match part.to_ascii_uppercase().as_str() {
            "CTRL" => mods |= MOD_CONTROL,
            "ALT" => mods |= MOD_ALT,
            "SHIFT" => mods |= MOD_SHIFT,
            "SUPER" => mods |= MOD_WIN,
            "GRAVE" | "DEAD_GRAVE" => key = Some(console_key()),
            p if p.len() == 1 && p.as_bytes()[0].is_ascii_alphanumeric() => {
                key = Some(u32::from(p.as_bytes()[0]))
            }
            p if p.len() >= 2 && p.starts_with('F') => {
                let n: u32 = p[1..].parse().ok().filter(|n| (1..=24).contains(n))?;
                key = Some(u32::from(VK_F1) + n - 1);
            }
            _ => return None,
        }
    }
    key.map(|k| (mods, k))
}

fn pids_named(exe: &str) -> HashSet<u32> {
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
            if String::from_utf16_lossy(&entry.szExeFile[..end]).eq_ignore_ascii_case(exe) {
                pids.insert(entry.th32ProcessID);
            }
            more = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
    }
    pids
}

/// The window in front and the process that owns it.
fn foreground() -> (HWND, u32) {
    let mut pid = 0;
    // SAFETY: a null foreground window leaves pid at 0.
    unsafe {
        let window = GetForegroundWindow();
        if !window.is_null() {
            GetWindowThreadProcessId(window, &mut pid);
        }
        (window, pid)
    }
}

/// What the foreground means: the game in front, and whether the shortcuts are held.
fn judge(game: &HashSet<u32>, foreground: u32, own: u32) -> (bool, bool) {
    let game_in_front = foreground != 0 && game.contains(&foreground);
    (
        game_in_front,
        game_in_front || (foreground != 0 && foreground == own),
    )
}

/// Calls `on_focus(game in front, its window)` when that changes, and
/// `on_key` for each shortcut press. Runs for the app's lifetime.
pub fn spawn(
    shortcuts: Shortcuts,
    on_focus: impl Fn(bool, HWND) + Send + 'static,
    on_key: impl Fn(GameKey) + Send + 'static,
) {
    std::thread::Builder::new()
        .name("game-keys".into())
        .spawn(move || {
            let own = std::process::id();
            let mut game = HashSet::new();
            let mut scanned: Option<Instant> = None;
            let mut focused: Option<bool> = None;
            // The combos currently registered, and whether they are.
            let mut bound: Option<[String; 2]> = None;
            loop {
                // The game's processes change rarely; the foreground often.
                if scanned.is_none_or(|t| t.elapsed() >= Duration::from_secs(2)) {
                    game = pids_named(GAME_EXE);
                    scanned = Some(Instant::now());
                }
                let (window, pid) = foreground();
                let (in_front, hold) = judge(&game, pid, own);
                if focused != Some(in_front) {
                    focused = Some(in_front);
                    on_focus(in_front, window);
                }
                let wanted =
                    hold.then(|| shortcuts.lock().unwrap_or_else(|e| e.into_inner()).clone());
                if wanted != bound {
                    // SAFETY: thread-owned hotkeys with no HWND; WM_HOTKEY arrives in this thread's queue.
                    unsafe {
                        UnregisterHotKey(std::ptr::null_mut(), CUSTOMIZE);
                        UnregisterHotKey(std::ptr::null_mut(), TOGGLE);
                        if let Some(combos) = &wanted {
                            for (id, combo) in [(CUSTOMIZE, &combos[0]), (TOGGLE, &combos[1])] {
                                // A combo another app holds just stays unbound.
                                if let Some((mods, vk)) = parse_combo(combo) {
                                    RegisterHotKey(std::ptr::null_mut(), id, mods, vk);
                                }
                            }
                        }
                    }
                    bound = wanted;
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
    fn the_game_in_front_shows_widgets_and_daevalog_in_front_keeps_the_keys() {
        let game: HashSet<u32> = [4321].into();
        assert_eq!(judge(&game, 4321, 7), (true, true));
        assert_eq!(judge(&game, 7, 7), (false, true), "Daevalog in front");
        assert_eq!(judge(&game, 99, 7), (false, false), "another app in front");
        assert_eq!(judge(&HashSet::new(), 0, 7), (false, false), "no window");
    }

    #[test]
    fn linux_style_combos_become_hotkeys() {
        let grave = console_key();
        assert_eq!(
            parse_combo("CTRL + grave"),
            Some((MOD_NOREPEAT | MOD_CONTROL, grave))
        );
        assert_eq!(
            parse_combo("ALT + dead_grave"),
            Some((MOD_NOREPEAT | MOD_ALT, grave))
        );
        assert_eq!(
            parse_combo("CTRL + SHIFT + Z"),
            Some((MOD_NOREPEAT | MOD_CONTROL | MOD_SHIFT, u32::from(b'Z')))
        );
        assert_eq!(
            parse_combo("SUPER + 5"),
            Some((MOD_NOREPEAT | MOD_WIN, u32::from(b'5')))
        );
        assert_eq!(
            parse_combo("F9"),
            Some((MOD_NOREPEAT, u32::from(VK_F1) + 8))
        );
        assert_eq!(parse_combo(""), None);
        assert_eq!(parse_combo("CTRL"), None);
        assert_eq!(parse_combo("CTRL + F99"), None);
        assert_eq!(parse_combo("CTRL + Tab"), None);
    }

    #[test]
    fn hotkey_ids_map_to_actions() {
        assert_eq!(key_for(1), Some(GameKey::Customize));
        assert_eq!(key_for(2), Some(GameKey::ToggleWidgets));
        assert_eq!(key_for(3), None);
    }

    #[test]
    fn finds_no_game_in_the_test_runner() {
        assert!(!pids_named(GAME_EXE).contains(&std::process::id()));
    }
}
