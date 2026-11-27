# Daevalog for Windows

Windows 10/11 **x64** gets the same Daevalog as Linux: the widgets drawn over the
game (meter, skills, boss HP, ping, history, pet souls, kina/s, PvP, hidden cube
alerts and event reminders), Customize to place them, and the app window (Characters,
Pets, Map, Analytics, Notifications). Same look, same settings, same capture and
parser (`aion2-meterd`); only how it's drawn differs (a Tauri webview instead of
Quickshell).

## Install

Each release has two Windows downloads: an installer
(`aion2-meter-…-x86_64-windows-setup.exe`) and a portable ZIP. Pick one.

1. Daevalog needs **Npcap x64** with **WinPcap API-compatible Mode** enabled.
   Npcap's license doesn't allow bundling it, so: the **installer** offers to
   download the official Npcap installer from npcap.com when it's missing (checked
   against a pinned SHA-256) and starts it; you go through Npcap's own setup,
   which asks for administrator permission. For the **portable ZIP**, install it
   yourself from [npcap.com](https://npcap.com/#download).
2. **Installer:** run the setup and follow it. It installs for your user only (no
   administrator prompt), adds Daevalog to the Start menu, installs Microsoft's
   WebView2 Runtime if it is missing, and has an uninstaller in Windows Settings →
   Apps. Your saved fights and settings in `%LOCALAPPDATA%\aion2-meter` stay when
   you uninstall or update.

   **Portable ZIP:** install Microsoft's [Evergreen WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
   if it's missing (it is normally present on Windows 11), extract the whole ZIP
   and open `aion2-meter-windows.exe`. Keep `aion2-meterd.exe` and `data/` beside it.
3. Start AION 2 in **borderless or windowed** mode (nothing can draw over exclusive
   fullscreen). The widgets appear while the game window is focused.

The unsigned executables can show a Windows SmartScreen prompt.

## Using it

As on Linux (see the [README](../README.md#using-it)):

- **Tray icon:** left click hides or shows the widgets. Right click has Customize,
  Fight history, Open app, Analytics, Reset meter and Quit.
- **Customize** (tray or **Ctrl+`**): drag widgets to move them. They snap to a grid,
  and pink guides show when a widget lines up with the screen centre or another
  widget; hold Shift to place freely. It also has the settings: which widgets show,
  three saved layouts, the monitor, keep visible when the game isn't focused, drag
  widgets in game, the meter's target and numbers, the shortcuts, size, opacity and
  the grid. Click a player in the meter for their skills. Esc or Done to finish.
- **Alt+`** hides or shows the widgets.
- **App** (tray → Open app): Characters, Pets, Map, Analytics and Notifications, as on
  Linux, and **Capture**, Windows' own page: the network adapter (pick the one
  carrying the game with a VPN), starting capture with the app, replaying a `.pcap`,
  and where your data is.

` is the key under Esc, whatever your keyboard layout prints on it. The shortcuts are
held only while AION 2 (or Daevalog) is the window in front, so other apps keep the
keys; change them in Customize → Shortcuts.

The widgets take no clicks: those go to the game, except over an open history, an
alert's ✕, and everything in Customize. With **Drag widgets in game** on, they take
clicks too, to be dragged while the game's cursor is free (Alt).

Closing the app window hides it; capture and the widgets go on. **Quit Daevalog** in
the tray saves the current fight and stops everything.

## Your data

Everything is in `%LOCALAPPDATA%\aion2-meter\`:

- `fights\`, `pets.json`, `characters.json` and `cube-spots.json`, in the Linux formats.
- `overlay.json`: the widget settings, the same file as Linux's
  `~/.config/aion2-meter/overlay.json` (positions, layouts, shortcuts, notifications).
- `companion.json`: the capture settings (adapter, start with the app).
- `capture.log` is replaced at each capture start; `startup-error.log` records a
  start-up failure.
- `capture.lock` keeps a second meter from capturing at the same time.

The pet map's tiles, spawns and portraits load from Arkive and are cached by the webview.

## Problems

| What you see | What to do |
| --- | --- |
| Daevalog doesn't start | Read `startup-error.log`; install the WebView2 Runtime. |
| Ping widget: "Npcap is missing" | Install Npcap x64 in WinPcap API-compatible Mode, then Capture → Start capture. |
| Stays on "game not running" | Start the actual `AION2.exe` client. |
| Stays on "finding game traffic" | Enter combat; with a VPN, pick its adapter on the Capture page and restart capture. |
| Widgets never show | They show while the game is focused: click the game. Check Customize → Show, and Alt+` (hidden). |
| Widgets not over the game | Use borderless or windowed mode; pick the monitor in Customize. |
| Ctrl+` does nothing | Another app holds the combo: pick another in Customize → Shortcuts (from the tray). |
| Skills and NPCs show as numbers | Reinstall, or re-extract the whole ZIP including `data\`. |

## Build and validate

Install Rust stable (MSVC), Visual Studio Build Tools with Desktop development
with C++, and Node.js 24. Clone with submodules.

Two shortcuts for working on it:

~~~powershell
./scripts/install-windows-local.ps1   # build this checkout (uncommitted edits too), install it, start it
./scripts/dev-windows.ps1             # run from source: UI hot reload, app rebuilds on edit
~~~

`install-windows-local.ps1` builds the installer as `local-<commit>` (`-dirty`
with uncommitted edits), closes a running Daevalog, installs over it for your
user and starts it; your fights and settings stay. `dev-windows.ps1` runs until
Ctrl+C: edits in `windows/ui` show at once, edits in `windows/src` rebuild and
restart the app, and edits in `daemon/src` need the script started again.

The checks, as CI runs them:

~~~powershell
npm --prefix windows/ui ci
npm --prefix windows/ui run build
npm --prefix windows/ui test
./scripts/prepare-windows.ps1
cargo fmt --check -p aion2-meterd -p aion2-meter-windows
cargo clippy --locked --all-targets --all-features --no-deps -p aion2-meterd -p aion2-meter-windows -- -D warnings
cargo test --locked -p aion2-meterd -p aion2-meter-windows
./scripts/package-windows.ps1 -Version dev
~~~

The package script builds the UI, the daemon and the app, and makes the portable
ZIP and the installer (Tauri's NSIS bundle, `windows/tauri.installer.conf.json`)
in `dist\`, each with a SHA-256 file.

How it's put together:

- `windows/src`: the Tauri app. `session.rs` runs `aion2-meterd --stdio` and keeps
  its messages as the Linux overlay's MeterClient does; `overlay.rs` is the
  full-screen transparent window over the game's monitor (clicks go through
  except over the regions the page reports); `game_keys.rs` follows the game's
  focus and holds the shortcuts.
- `windows/ui/src/overlay`: the widgets and Customize, ported from `overlay/*.qml`.
- `windows/ui/src/app`: the app window's pages, ported from the same.
- `windows/ui/src/linux-parity.test.ts` checks the ported logic against the QML's.
