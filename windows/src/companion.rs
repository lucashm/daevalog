//! The Tauri app: the app window (as the Linux app window), the in-game
//! overlay (as the Linux widgets), the tray, and the session both read.
use crate::game_keys::{self, GameKey, Shortcuts};
use crate::overlay;
use crate::session::{Action, Session, Snapshot};
use crate::settings::{self, DEFAULT_EDIT_KEY, DEFAULT_HIDE_KEY};
use std::sync::{Arc, Mutex};
use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

/// Null while the webview already has `since`, the latest revision.
#[tauri::command]
fn snapshot(session: tauri::State<'_, Session>, since: Option<u64>) -> Option<Snapshot> {
    session.snapshot_since(since)
}

/// The saved fights; null while the webview already has `since`.
#[tauri::command]
fn history(session: tauri::State<'_, Session>, since: Option<u64>) -> Option<serde_json::Value> {
    session.history_since(since).map(|h| (*h).clone())
}

#[tauri::command]
async fn act(app: AppHandle, action: Action) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Session>().act(action))
        .await
        .map_err(|e| e.to_string())?
}

/// The overlay page's clickable regions and whether it draws anything.
#[tauri::command]
fn overlay_input(app: AppHandle, shared: tauri::State<'_, overlay::Shared>, input: overlay::Input) {
    overlay::set_input(&app, &shared, input);
}

/// The monitors' names, for Customize's monitor picker.
#[tauri::command]
fn monitors(app: AppHandle) -> Vec<String> {
    app.available_monitors()
        .map(|ms| ms.into_iter().filter_map(|m| m.name().cloned()).collect())
        .unwrap_or_default()
}

/// The app window, on a page or as it was.
fn open_app(app: &AppHandle, page: Option<&str>) {
    if let Some(page) = page {
        let _ = app
            .state::<Session>()
            .act(Action::Navigate { page: page.into() });
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn pinned_monitor(snapshot: &Snapshot) -> String {
    snapshot.settings["pinnedMonitor"]
        .as_str()
        .unwrap_or_default()
        .to_string()
}

pub fn run() -> tauri::Result<()> {
    let shortcuts: Shortcuts = Arc::new(Mutex::new([
        DEFAULT_EDIT_KEY.to_string(),
        DEFAULT_HIDE_KEY.to_string(),
    ]));
    let shared: overlay::Shared = Arc::default();
    let app = tauri::Builder::default()
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![
            snapshot,
            history,
            act,
            overlay_input,
            monitors
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            // Every new state: the shortcuts and the overlay follow the settings and Customize.
            // Before the windows, which poll it from their first frame.
            let session = {
                let (handle, shared, shortcuts) =
                    (handle.clone(), shared.clone(), shortcuts.clone());
                let last_pinned = Mutex::new(String::new());
                Session::new(move |s| {
                    *shortcuts.lock().unwrap_or_else(|e| e.into_inner()) = [
                        settings::shortcut(&s.settings, "shortcutEdit", DEFAULT_EDIT_KEY),
                        settings::shortcut(&s.settings, "shortcutHide", DEFAULT_HIDE_KEY),
                    ];
                    let pinned = pinned_monitor(s);
                    let mut last = last_pinned.lock().unwrap_or_else(|e| e.into_inner());
                    if *last != pinned {
                        overlay::place(&handle, &shared, &pinned);
                        *last = pinned;
                    }
                    overlay::follow_edit(&handle, &shared, s.edit_mode);
                })
            };
            app.manage(session);

            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| {
                    matches!(
                        (url.scheme(), url.host_str()),
                        ("tauri", Some("localhost")) | ("http" | "https", Some("tauri.localhost"))
                    ) || (cfg!(debug_assertions)
                        && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
                        && url.port() == Some(5173))
                })
                .build()?;
            overlay::create(&handle)?;
            let pinned = pinned_monitor(&app.state::<Session>().snapshot());
            overlay::place(&handle, &shared, &pinned);
            overlay::watch_pointer(handle.clone(), shared.clone());
            // Opened again: this one's app window. `--quit`: quit as from the tray.
            {
                let (show_app, quit_app) = (handle.clone(), handle.clone());
                crate::instance::listen(
                    move || open_app(&show_app, None),
                    move || quit_app.exit(0),
                );
            }

            {
                let (focus_app, key_app, shared) = (handle.clone(), handle.clone(), shared.clone());
                game_keys::spawn(
                    shortcuts.clone(),
                    move |in_front, window| {
                        let session = focus_app.state::<Session>();
                        session.set_game_focused(in_front);
                        let pinned = pinned_monitor(&session.snapshot());
                        overlay::game_focus(&focus_app, &shared, in_front, window, &pinned);
                    },
                    move |key| {
                        let session = key_app.state::<Session>();
                        let _ = session.act(match key {
                            GameKey::Customize => Action::Edit { on: None },
                            GameKey::ToggleWidgets => Action::ToggleHide {},
                        });
                    },
                );
            }

            // The Linux tray's menu.
            let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
            let menu = Menu::with_items(
                app,
                &[
                    &item("edit", "Customize")?,
                    &item("hide", "Hide / show widgets")?,
                    &item("history", "Fight history")?,
                    &PredefinedMenuItem::separator(app)?,
                    &item("app", "Open app")?,
                    &item("analytics", "Analytics")?,
                    &PredefinedMenuItem::separator(app)?,
                    &item("reset", "Reset meter")?,
                    &item("quit", "Quit Daevalog")?,
                ],
            )?;
            let icon = tauri::image::Image::from_bytes(include_bytes!(
                "../../desktop/aion2-meter-elyos.png"
            ))?;
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Daevalog")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    // Left click hides or shows the widgets, as on Linux.
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle().clone();
                        std::thread::spawn(move || {
                            let _ = app.state::<Session>().act(Action::ToggleHide {});
                        });
                    }
                })
                .on_menu_event(|app, event| {
                    let app = app.clone();
                    let id = event.id.as_ref().to_string();
                    // Off the event loop: session actions wait for the actor.
                    std::thread::spawn(move || {
                        let session = app.state::<Session>();
                        let _ = match id.as_str() {
                            "edit" => session.act(Action::Edit { on: None }),
                            "hide" => session.act(Action::ToggleHide {}),
                            "history" => session.act(Action::HistoryPanel {
                                open: None,
                                fight: None,
                            }),
                            "app" | "analytics" => {
                                open_app(&app, (id == "analytics").then_some("analytics"));
                                Ok(())
                            }
                            "reset" => session.act(Action::Reset {}),
                            "quit" => {
                                app.exit(0);
                                Ok(())
                            }
                            _ => Ok(()),
                        };
                    });
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the app window hides it: capture and the widgets go on.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && window.label() == "main"
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())?;
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<Session>().shutdown();
        }
    });
    Ok(())
}
