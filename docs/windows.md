# Daevalog for Windows

Windows 10/11 **x64** uses a Tauri 2 / React companion window and a lightweight
Rust/egui overlay host. Both use the existing Rust capture and A2Tools engine.
The interface follows the selected design: Command's dark teal visuals with
Obsidian's Questlog-like sidebar and companion pages.

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
3. Start AION 2 and enter combat. Capture starts automatically unless you turn
   that preference off. For a VPN, choose and save the correct adapter in Settings,
   then start/restart capture.
4. In **Overlay studio**, turn on **Show overlays**, arrange the widgets and,
   once the shortcut registers, enable **Lock / click-through**.
   Use the game's borderless or windowed mode.

No Node.js, Rust, Quickshell or WSL installation is needed to run the package.
The unsigned executable can show a Windows publisher/SmartScreen prompt.
Npcap's administrator-only installation option may require an elevated meter.

The app embeds Noto Sans CJK for Korean, Chinese and Japanese player names;
no additional Windows language packs or font installation are needed. The
font's SIL Open Font License is included in `licenses/NotoSansCJK-OFL.txt`.

## Companion pages

- **Overview:** character and connection status, your DPS, party damage, actual
  collection progress, saved encounter count, current encounter and upcoming events.
- **Combat meter:** live ranked players with combat power and deaths, per-player
  skills, boss HP when supplied, ping, target filters and Save & reset. Click a
  player to focus their skills. Below it: kina per second while farming (from the
  first pick-up until 5 minutes after the last; spending doesn't lower it), kina
  an hour and the time to the 1M daily cap, and the enemies in range.
- **PvP:** the enemy players around you: your target, then whoever is hitting
  you, then those you traded hits with in the last minute, then the rest in range
  (dimmed), each with class, combat power and HP.
- **Pet collection:** the real per-server collection, name/monster search, genus
  and phase filters, souls remaining, estimated levels and locally saved pins.
  Log in or teleport at a Kibelisk if capture began after login. Unknown progress
  is shown as unknown rather than treated as a collected or missing pet.
  Counts saved by older versions are retained; log in or teleport once to
  confirm that collection before missing entries are treated as zero.
- **Overlay studio:** six detached native widgets (damage, boss HP, latency,
  event/cube reminders, PvP, Kina/s), visibility, saved primary-display anchors,
  opacity, scale and guarded click-through. Layouts saved before PvP and Kina/s
  existed gain them at their default spots.
- **Characters:** your characters by server, as the game last stated them: class,
  level, combat power and gear score (updated at character select), and Odyle
  energy with its 3-hour recharge (marked ~ while estimated) and when it's full.
- **Fight history:** your saved boss encounters with real player totals,
  per-player skill drill-down, party DPS over the fight and who died when.
- **Analytics:** every saved fight's players, grouped by player, class or boss, or
  one row per run, with a date range, shortest-run, kills-only and "me" filters,
  sortable columns (DPS, share, crit, back, active time, heal and damage taken
  per second, deaths, kill rate, trend) and, for the picked row, DPS over the
  fight, when deaths happen and the best runs. "Me" is your characters' names.
- **Event alerts:** hourly Shugo Festival and Dimensional Invasion timers, per-event
  switches, 1/3/5/10 minute lead time, test banner and optional system chime.
  These port the existing Linux community schedule, not an official server feed.
  Automatic reminders run while the game is open; tests work at any time.
- **Settings:** adapter discovery and selection, capture start/stop/restart,
  automatic start preference, replay, data location and Quit.

No fabricated combat data appears in the production app. Empty, waiting and
capture-error states are driven by the native session.

## Windows and shortcuts

Closing the companion **hides it to the system tray**. Capture and overlays
continue; choose **Quit Daevalog** from the tray or Settings to save and stop.
The tray can reopen the companion, toggle overlays and unlock input.

**While AION 2 is the window in front**, as on Linux: **Ctrl+`** shows the
widgets unlocked (drag them) and opens Overlay studio, and **Alt+`** hides or
shows them. ` is the key under Esc, whatever your layout prints on it. In any
other app these keys stay free. The tray has the same two actions.

**Ctrl+Alt+M** toggles overlay click-through. It starts unlocked every launch
and is refused until the global shortcut registers. When another application
owns the shortcut, the app reports the conflict and keeps the widgets interactive.
Locked widgets are topmost and nonactivating; their native windows pass mouse
input through to the game.

Drag native widget headers while unlocked for temporary placement. Use the
studio to save normalized anchors for the **primary display**. Arbitrary monitor
selection and persisted free-drag positions are not implemented yet; verify
mixed-DPI/multiple-monitor behavior on your setup. Exclusive fullscreen and
automatic game-focus visibility are not supported by this version.

`Ctrl+K` searches companion pages. Native titlebar controls minimize, maximize
or hide the window. The prior egui frontend remains available with `--legacy`
for troubleshooting; its existing settings ID remains unchanged.

## Replay and data

In Settings, enter a `.pcap` path and choose **Start replay**. Live capture stops
first. When replay finishes, the daemon remains available for history inspection;
Start capture returns to live traffic. Npcap is required for replay too.

Data stays in `%LOCALAPPDATA%\aion2-meter\`:

- `fights/`, `pets.json` and `cube-spots.json` retain the existing formats.
- `companion.json` stores companion preferences, pet pins and overlay anchors.
- `capture.log` is replaced each capture start; `startup-error.log` records a GUI
  startup failure. The WebView2 profile is maintained under the application's
  per-user WebView2 data directory.
- `capture.lock` prevents a second capture session for this user/data directory.

Remove the extracted package to uninstall. Keep the per-user data to retain
history and preferences. Npcap and WebView2 are shared prerequisites.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| App startup fails | Read `startup-error.log` and install the WebView2 Runtime. |
| Npcap / wpcap.dll error | Install Npcap x64 with WinPcap compatibility; restart capture. |
| Waiting for AION 2 | Start the actual `AION2.exe` client. |
| Finding game traffic | Enter combat and check the adapter, especially with a VPN. |
| Shortcut conflict | Close the conflicting hotkey app, then hide/show overlays to retry. |
| Widget takes game clicks | Lock the overlays; press Ctrl+Alt+M or use tray Unlock to edit again. |
| Missing skills/NPC names | Re-extract the whole ZIP including `data/`. |
| No saved fights after ordinary attacks | History records boss encounters; ordinary damage still appears live. |

Npcap remains separately installed because the existing engine consumes
libpcap payloads; Windows socket enumeration supplies ownership, not packet
data. Building uses a generated MSVC import library, not an Npcap SDK download.
See the [Npcap developer guide](https://npcap.com/guide/npcap-devguide.html) and
[redistribution terms](https://npcap.com/oem/redist).

## Build and validate

Install Rust stable/MSVC, Visual Studio Build Tools with Desktop development
with C++ and the Windows SDK, plus Node.js 24. Clone submodules recursively.

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

The full checks, as CI runs them:

~~~powershell
npm --prefix windows/ui ci
npm --prefix windows/ui run build
npm --prefix windows/ui test
./scripts/prepare-windows.ps1
cargo fmt --check -p aion2-meterd -p aion2-meter-windows
cargo clippy --locked --all-targets --all-features --no-deps -p aion2-meterd -p aion2-meter-windows -- -D warnings
cargo test --locked -p aion2-meterd -p aion2-meter-windows
cargo build --locked -p aion2-meterd -p aion2-meter-windows
python scripts/test-daemon.py --daemon target/debug/aion2-meterd.exe
./scripts/test-companion.ps1
./scripts/package-windows.ps1 -Version dev
~~~

The package script installs locked UI dependencies, builds the static frontend,
embeds it in the native executable and creates a ZIP plus SHA-256 checksum in
`dist/`. Close the Vite server before packaging on Windows so npm can replace
its native build plugin. The executables use static CRT linking.

`test-companion.ps1` builds an opt-in `ui-smoke` executable, runs a real pcap
through WebView2/Rust/daemon, checks four native widget HWNDs, click-through window styles,
unlock, history and persistence, then exits. It uses isolated storage and an
alternate Ctrl+Alt+Shift+M QA shortcut to avoid taking a running meter's hotkey.
The test report command and QA shortcut are excluded from normal packages.
The old renderer screenshot hook also requires `ui-smoke` and `--legacy`.
Add `-Release -MeasureIdle` to collect a short CPU/private-commit sample across
the app, native overlay host and WebView2 descendants before replay begins.
This does not measure game FPS or mouse delivery into a separate game process.
See the [recorded validation](windows-ui-validation.md) for results and limits.

For browser-only layout development, run `npm --prefix windows/ui run dev`.
It shows disconnected states and the reference catalog; capture, native
overlays and persistence operate in the Windows executable. Normal native
debug builds embed the UI from the preceding frontend build.

Linux retains its default workspace members, Unix socket, Quickshell frontend,
tray, services and installer. Windows dependencies remain target-specific.
The [technology note](windows-ui-stack.md) records the remaining performance
and real-game validation work; a native replay test does not establish FPS
impact, exclusive-fullscreen compatibility or mixed-DPI correctness.
