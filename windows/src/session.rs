//! One actor owns capture and the shared state both webviews (the app window
//! and the in-game overlay) read. Webviews poll its coalesced snapshot.
use crate::backend::{self, Backend};
use crate::model::Kina;
use crate::preferences::Preferences;
use crate::settings;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The daemon's messages, as the Linux overlay's MeterClient keeps them.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub running: bool,
    pub replay: bool,
    pub replay_complete: bool,
    /// The live meter (daemon/src/meter.rs, OverlayState); null without capture.
    pub state: Value,
    /// Pet levels, souls and what's being farmed (daemon/src/pets.rs), as sent.
    pub pets: Value,
    /// Your characters (daemon/src/characters.rs): `{ playing, list }`.
    pub characters: Value,
    /// The enemy players around you (daemon/src/pvp.rs).
    pub pvp: Value,
    pub kina: Kina,
    /// Saved fights' summaries, newest first. Every fight for Analytics: too big
    /// to copy with each meter update, so it's fetched apart (`history`) when
    /// `history_revision` changes.
    #[serde(skip)]
    pub history: Arc<Value>,
    pub history_revision: u64,
    /// One saved fight in full, as last asked for.
    pub fight: Value,
    /// Hidden cube spots seen, by map id.
    pub cube_spots: Value,
    /// The latest cube messages, each with a rising `seq`: the overlay takes the new ones.
    pub cube_events: Vec<Value>,
    pub adapters: Vec<backend::Adapter>,
    pub preferences: Preferences,
    /// overlay.json, as on Linux.
    pub settings: Value,
    /// Customize: the widgets are dragged over the game.
    pub edit_mode: bool,
    /// The fight history over the game, and the fight it was asked to open (`{ id, seq }`).
    pub history_open: bool,
    pub history_request: Value,
    /// AION 2 is the window in front.
    pub game_focused: bool,
    /// The app page it was last told to show (`{ page, seq }`).
    pub nav: Value,
    /// A sample alert from the Notifications page (`{ event, seq }`): a cube event or `{ reminder }`.
    pub test_notification: Value,
    pub error: Option<String>,
    pub data_dir: String,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self {
            revision: 0,
            running: false,
            replay: false,
            replay_complete: false,
            state: Value::Null,
            pets: Value::Null,
            characters: Value::Null,
            pvp: json!([]),
            kina: Kina::default(),
            history: Arc::new(json!([])),
            history_revision: 0,
            fight: Value::Null,
            cube_spots: json!({}),
            cube_events: Vec::new(),
            adapters: Vec::new(),
            preferences: Preferences::default(),
            settings: json!({}),
            edit_mode: false,
            history_open: false,
            history_request: Value::Null,
            game_focused: false,
            nav: Value::Null,
            test_notification: Value::Null,
            error: None,
            data_dir: backend::data_dir().display().to_string(),
        }
    }
}

impl Snapshot {
    /// What only a running capture can say: the meter and who's around.
    fn clear_live_state(&mut self) {
        self.running = false;
        self.state = Value::Null;
        self.pvp = json!([]);
    }
}

/// Analytics compares every saved fight, as the Linux app does.
const HISTORY_LIMIT: usize = 100_000;
/// Cube messages kept for a webview that polls late.
const CUBE_EVENTS: usize = 32;
/// The app window's pages (windows/ui/src/app/App.tsx).
pub const PAGES: [&str; 6] = [
    "pets",
    "map",
    "analytics",
    "characters",
    "notifications",
    "capture",
];
/// The meter's target modes (A2Tools' selection modes, as the Linux Customize panel offers them).
const TARGET_MODES: [&str; 6] = [
    "bossTargets",
    "lastHitByMe",
    "mostDamage",
    "mostRecent",
    "allTargets",
    "trainTargets",
];

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// What a webview may ask; anything else is refused.
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum Action {
    Start {
        replay: Option<String>,
    },
    Stop {},
    Reset {},
    Target {
        mode: String,
    },
    Focus {
        id: Option<i32>,
    },
    History {},
    Fight {
        id: String,
    },
    Preferences {
        preferences: Preferences,
    },
    RefreshAdapters {},
    Settings {
        settings: Value,
    },
    /// Customize on, off, or toggled.
    Edit {
        on: Option<bool>,
    },
    /// Hide or show the widgets (`hideWidgets`), toggled.
    ToggleHide {},
    /// The history over the game: open, closed or toggled, optionally on a fight.
    HistoryPanel {
        open: Option<bool>,
        fight: Option<String>,
    },
    Navigate {
        page: String,
    },
    /// A sample alert for the overlay to show.
    TestNotification {
        event: Value,
    },
    /// The alert chime (overlay/sounds/cube.wav).
    Chime {},
}

enum Request {
    Action(Action, mpsc::Sender<Result<(), String>>),
    GameFocus(bool),
    Quit,
}

type OnPublish = Box<dyn Fn(&Snapshot) + Send>;

pub struct Session {
    tx: mpsc::SyncSender<Request>,
    cache: Arc<Mutex<Snapshot>>,
    thread: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Session {
    /// `on_publish` sees every new snapshot, on the actor's thread (windows follow edit mode with it).
    pub fn new(on_publish: impl Fn(&Snapshot) + Send + 'static) -> Self {
        let cache = Arc::new(Mutex::new(Snapshot::default()));
        let (tx, rx) = mpsc::sync_channel(64);
        let shared = cache.clone();
        let on_publish: OnPublish = Box::new(on_publish);
        let thread = std::thread::spawn(move || Actor::new(shared, on_publish).run(rx));
        Self {
            tx,
            cache,
            thread: Mutex::new(Some(thread)),
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        self.cache.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
    /// The snapshot only when it changed since `revision`: the webviews poll
    /// often, and a long fight history is too big to copy on every poll.
    pub fn snapshot_since(&self, revision: Option<u64>) -> Option<Snapshot> {
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        (Some(cache.revision) != revision).then(|| cache.clone())
    }
    /// The saved fights, only when they changed since `revision`.
    pub fn history_since(&self, revision: Option<u64>) -> Option<Arc<Value>> {
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        (Some(cache.history_revision) != revision).then(|| cache.history.clone())
    }
    pub fn act(&self, action: Action) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .try_send(Request::Action(action, tx))
            .map_err(|_| "Daevalog is busy or shutting down".to_string())?;
        rx.recv_timeout(Duration::from_secs(10))
            .map_err(|_| "Daevalog command timed out".to_string())?
    }
    pub fn set_game_focused(&self, focused: bool) {
        let _ = self.tx.try_send(Request::GameFocus(focused));
    }
    pub fn shutdown(&self) {
        let mut thread = self.thread.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(handle) = thread.take() {
            let _ = self.tx.send(Request::Quit);
            let _ = handle.join();
        }
    }
}

struct Actor {
    cache: Arc<Mutex<Snapshot>>,
    snapshot: Snapshot,
    backend: Option<Backend>,
    on_publish: OnPublish,
    cube_seq: u64,
}

impl Actor {
    fn new(cache: Arc<Mutex<Snapshot>>, on_publish: OnPublish) -> Self {
        let mut snapshot = Snapshot::default();
        let _ = std::fs::create_dir_all(backend::data_dir());
        match Preferences::load(&backend::data_dir().join("companion.json")) {
            Ok(prefs) => snapshot.preferences = prefs,
            Err(e) => snapshot.error = Some(e),
        }
        snapshot.settings = settings::load(&backend::data_dir().join("overlay.json"));
        Self {
            cache,
            snapshot,
            backend: None,
            on_publish,
            cube_seq: 0,
        }
    }
    fn publish(&mut self) {
        self.snapshot.revision += 1;
        *self.cache.lock().unwrap_or_else(|e| e.into_inner()) = self.snapshot.clone();
        (self.on_publish)(&self.snapshot);
    }
    fn start(&mut self, replay: Option<String>) -> Result<(), String> {
        self.backend.take();
        self.snapshot.clear_live_state();
        self.snapshot.fight = Value::Null;
        self.snapshot.pets = Value::Null;
        self.snapshot.characters = Value::Null;
        self.snapshot.kina = Kina::default();
        self.snapshot.replay = replay.as_ref().is_some_and(|p| !p.is_empty());
        self.snapshot.replay_complete = false;
        let mut backend = Backend::start(
            &self.snapshot.preferences.iface,
            replay.as_deref().unwrap_or(""),
            true,
            || {},
        )?;
        backend.send(json!({"cmd":"history","limit":HISTORY_LIMIT}));
        self.backend = Some(backend);
        self.snapshot.running = true;
        self.snapshot.error = None;
        Ok(())
    }
    fn send(&mut self, value: Value) -> Result<(), String> {
        let backend = self
            .backend
            .as_mut()
            .ok_or("Start capture to use this command")?;
        backend.send(value);
        Ok(())
    }
    fn save_settings(&mut self, value: Value) -> Result<(), String> {
        settings::save(&backend::data_dir().join("overlay.json"), &value)?;
        self.snapshot.settings = value;
        Ok(())
    }
    fn action(&mut self, action: Action) -> Result<(), String> {
        match action {
            Action::Start { replay } => self.start(replay)?,
            Action::Stop {} => {
                self.backend.take();
                self.snapshot.clear_live_state();
            }
            Action::Reset {} => {
                self.send(json!({"cmd":"reset"}))?;
                // Kina/s starts over with the next kina, as on Linux.
                self.snapshot.kina.reset();
            }
            Action::Target { mode } => {
                if !TARGET_MODES.contains(&mode.as_str()) {
                    return Err("Invalid target mode".into());
                }
                self.send(json!({"cmd":"targetMode","mode":mode}))?;
            }
            Action::Focus { id } => self.send(json!({"cmd":"focus","id":id}))?,
            Action::History {} => self.send(json!({"cmd":"history","limit":HISTORY_LIMIT}))?,
            Action::Fight { id } => {
                check_fight_id(&id)?;
                self.snapshot.fight = Value::Null;
                self.send(json!({"cmd":"fight","id":id}))?;
            }
            Action::RefreshAdapters {} => self.snapshot.adapters = backend::adapters()?,
            Action::Preferences { preferences } => {
                preferences.save(&backend::data_dir().join("companion.json"))?;
                self.snapshot.preferences = preferences;
            }
            Action::Settings { settings } => self.save_settings(settings)?,
            Action::Edit { on } => self.snapshot.edit_mode = on.unwrap_or(!self.snapshot.edit_mode),
            Action::ToggleHide {} => {
                let mut value = self.snapshot.settings.clone();
                let hidden = settings::hide_widgets(&value);
                settings::set_hide_widgets(&mut value, !hidden);
                self.save_settings(value)?;
            }
            Action::HistoryPanel { open, fight } => {
                let open = open.unwrap_or(!self.snapshot.history_open) || fight.is_some();
                self.snapshot.history_open = open;
                if let Some(id) = fight {
                    check_fight_id(&id)?;
                    let seq = self.snapshot.history_request["seq"].as_u64().unwrap_or(0) + 1;
                    self.snapshot.history_request = json!({"id":id,"seq":seq});
                    self.snapshot.fight = Value::Null;
                    let _ = self.send(json!({"cmd":"fight","id":id}));
                } else if open {
                    let _ = self.send(json!({"cmd":"history","limit":HISTORY_LIMIT}));
                }
            }
            Action::Navigate { page } => {
                if !PAGES.contains(&page.as_str()) {
                    return Err("Unknown page".into());
                }
                // A new seq each time, so asking for the same page again still counts.
                let seq = self.snapshot.nav["seq"].as_u64().unwrap_or(0) + 1;
                self.snapshot.nav = json!({"page":page,"seq":seq});
            }
            Action::TestNotification { event } => {
                if !event.is_object() || event.to_string().len() > 4096 {
                    return Err("Invalid test notification".into());
                }
                let seq = self.snapshot.test_notification["seq"].as_u64().unwrap_or(0) + 1;
                self.snapshot.test_notification = json!({"event":event,"seq":seq});
            }
            Action::Chime {} => chime(),
        }
        Ok(())
    }
    fn message(&mut self, value: Value) {
        match value["type"].as_str() {
            Some("state") => self.snapshot.state = value,
            Some("replayFinished") => self.snapshot.replay_complete = true,
            Some("pets") => self.snapshot.pets = value,
            Some("characters") => self.snapshot.characters = value,
            Some("pvp") => self.snapshot.pvp = value["enemies"].clone(),
            Some("kina") => self.snapshot.kina.update(
                value["balance"].as_i64().unwrap_or(-1),
                value["daily"].as_i64().unwrap_or(-1),
                now_ms(),
            ),
            Some("history") => {
                self.snapshot.history = Arc::new(value["fights"].clone());
                self.snapshot.history_revision += 1;
            }
            Some("fight") => self.snapshot.fight = value,
            Some("fightSaved") => {
                let _ = self.send(json!({"cmd":"history","limit":HISTORY_LIMIT}));
            }
            Some("cubeSpots") => self.snapshot.cube_spots = value["spots"].clone(),
            Some("cube") => {
                self.cube_seq += 1;
                let mut event = value;
                event["seq"] = json!(self.cube_seq);
                event["at"] = json!(now_ms());
                self.snapshot.cube_events.push(event);
                let extra = self.snapshot.cube_events.len().saturating_sub(CUBE_EVENTS);
                self.snapshot.cube_events.drain(..extra);
            }
            _ => {}
        }
    }
    fn run(mut self, rx: mpsc::Receiver<Request>) {
        match backend::adapters() {
            Ok(adapters) => self.snapshot.adapters = adapters,
            Err(e) => self.snapshot.error = Some(e),
        }
        if self.snapshot.preferences.auto_start
            && let Err(e) = self.start(None)
        {
            self.snapshot.error = Some(e);
        }
        self.publish();
        loop {
            let mut changed = false;
            match rx.recv_timeout(Duration::from_millis(25)) {
                Ok(Request::Quit) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Ok(Request::Action(action, reply)) => {
                    let result = self.action(action);
                    self.snapshot.error = result.as_ref().err().cloned();
                    self.publish();
                    let _ = reply.send(result);
                }
                Ok(Request::GameFocus(focused)) => {
                    changed = self.snapshot.game_focused != focused;
                    self.snapshot.game_focused = focused;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            for _ in 0..256 {
                let message = self.backend.as_mut().and_then(Backend::next_message);
                let Some(message) = message else { break };
                self.message(message);
                changed = true;
            }
            if let Some(result) = self.backend.as_mut().and_then(Backend::exited) {
                self.backend.take();
                // A dead capture process cannot provide live combat, HP or latency.
                self.snapshot.clear_live_state();
                if let Err(e) = result {
                    self.snapshot.error = Some(e);
                }
                changed = true;
            }
            if changed {
                self.publish();
            }
        }
        self.backend.take();
    }
}

fn check_fight_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 160
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err("Invalid fight ID".into())
    }
}

/// The Linux overlay's chime (overlay/sounds/cube.wav), without waiting for it.
fn chime() {
    use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};
    static WAV: &[u8] = include_bytes!("../../overlay/sounds/cube.wav");
    // SAFETY: SND_MEMORY reads the static WAV; it outlives the asynchronous play.
    unsafe {
        PlaySoundW(
            WAV.as_ptr().cast(),
            std::ptr::null_mut(),
            SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn actor() -> Actor {
        Actor {
            cache: Arc::new(Mutex::new(Snapshot::default())),
            snapshot: Snapshot::default(),
            backend: None,
            on_publish: Box::new(|_| {}),
            cube_seq: 0,
        }
    }

    #[test]
    fn capture_exit_invalidates_live_widgets_but_retains_saved_data() {
        let mut snapshot = Snapshot {
            running: true,
            state: json!({"capture":{"locked":true},"players":[{"damage":1000}]}),
            pvp: json!([{"id":5}]),
            history: Arc::new(json!([{"id":"saved"}])),
            pets: json!({"levels":{"1002":1}}),
            ..Snapshot::default()
        };
        snapshot.clear_live_state();
        assert!(!snapshot.running);
        assert!(snapshot.state.is_null());
        assert_eq!(snapshot.pvp, json!([]));
        assert_eq!(snapshot.history[0]["id"], "saved");
        assert_eq!(snapshot.pets["levels"]["1002"], 1);
    }

    #[test]
    fn daemon_messages_land_where_the_linux_client_keeps_them() {
        let mut a = actor();
        a.message(json!({"type":"characters","playing":"Naicha","list":[{"name":"Naicha"}]}));
        a.message(json!({"type":"pvp","enemies":[{"id":5,"name":"Foe"}]}));
        a.message(json!({"type":"kina","balance":1000,"daily":20}));
        a.message(json!({"type":"kina","balance":1500,"daily":520}));
        a.message(json!({"type":"pets","ready":false,"farming":[{"pet":1002}]}));
        a.message(json!({"type":"cubeSpots","spots":{"110":[[1,2,3]]}}));
        assert_eq!(a.snapshot.characters["playing"], "Naicha");
        assert_eq!(a.snapshot.pvp[0]["name"], "Foe");
        assert_eq!((a.snapshot.kina.gained, a.snapshot.kina.daily), (500, 520));
        // Kept as sent, ready or not: the souls widget reads what's being farmed.
        assert_eq!(a.snapshot.pets["farming"][0]["pet"], 1002);
        assert_eq!(a.snapshot.cube_spots["110"][0][2], 3);
    }

    #[test]
    fn cube_messages_queue_with_a_rising_seq_and_old_ones_drop() {
        let mut a = actor();
        for id in 0..40 {
            a.message(json!({"type":"cube","event":"near","id":id}));
        }
        assert_eq!(a.snapshot.cube_events.len(), CUBE_EVENTS);
        assert_eq!(a.snapshot.cube_events[0]["seq"], 9);
        assert_eq!(a.snapshot.cube_events.last().unwrap()["seq"], 40);
    }

    #[test]
    fn hide_toggles_the_overlay_setting() {
        let mut a = actor();
        // Without saving to the real data folder: only the in-memory flip.
        let mut v = a.snapshot.settings.clone();
        let hidden = settings::hide_widgets(&v);
        settings::set_hide_widgets(&mut v, !hidden);
        a.snapshot.settings = v;
        assert!(settings::hide_widgets(&a.snapshot.settings));
    }

    #[test]
    fn edit_mode_toggles_or_is_set() {
        let mut a = actor();
        a.action(Action::Edit { on: None }).unwrap();
        assert!(a.snapshot.edit_mode);
        a.action(Action::Edit { on: Some(true) }).unwrap();
        assert!(a.snapshot.edit_mode);
        a.action(Action::Edit { on: None }).unwrap();
        assert!(!a.snapshot.edit_mode);
    }

    #[test]
    fn history_panel_opens_on_a_fight_with_a_fresh_request() {
        let mut a = actor();
        let open = |fight: Option<&str>| Action::HistoryPanel {
            open: None,
            fight: fight.map(str::to_string),
        };
        a.action(open(None)).unwrap();
        assert!(a.snapshot.history_open);
        a.action(open(None)).unwrap();
        assert!(!a.snapshot.history_open);
        a.action(open(Some("auto_1_2"))).unwrap();
        assert!(a.snapshot.history_open);
        assert_eq!(a.snapshot.history_request, json!({"id":"auto_1_2","seq":1}));
        assert!(a.action(open(Some("../x"))).is_err());
    }

    #[test]
    fn navigate_names_a_known_page_with_a_fresh_seq() {
        let mut a = actor();
        let go = |page: &str| Action::Navigate { page: page.into() };
        a.action(go("analytics")).unwrap();
        a.action(go("analytics")).unwrap();
        assert_eq!(a.snapshot.nav, json!({"page":"analytics","seq":2}));
        assert!(a.action(go("../etc")).is_err());
    }

    #[test]
    fn webview_commands_are_typed_and_reject_unexpected_input() {
        assert!(
            serde_json::from_value::<Action>(json!({"action":"shell","command":"anything"}))
                .is_err()
        );
        assert!(serde_json::from_value::<Action>(json!({"action":"reset","extra":true})).is_err());
        assert!(serde_json::from_value::<Action>(json!({"action":"target","mode":"x"})).is_ok());
    }

    #[test]
    fn an_unchanged_snapshot_is_not_copied_again() {
        let session = Session {
            tx: mpsc::sync_channel(1).0,
            cache: Arc::new(Mutex::new(Snapshot {
                revision: 4,
                ..Snapshot::default()
            })),
            thread: Mutex::new(None),
        };
        assert!(session.snapshot_since(Some(4)).is_none());
        assert_eq!(session.snapshot_since(Some(3)).unwrap().revision, 4);
        assert!(session.snapshot_since(None).is_some());
    }
}
