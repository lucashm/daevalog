//! Your characters, with what the game last said about each (class, level,
//! combat power, Odyle energy), for the app's Characters page. Only what a game
//! record states; nothing estimated. Saved (characters.json) between sessions.
//!
//! Most comes from the character-select list, which has every character on the
//! server (found in our own capture, 2026-11-02, against the game's screen):
//!
//! ```text
//! 26 36  list: entries, each with hundreds of bytes of looks and gear between these fields
//!        id u32, name (len u8), class u32, skip 2, level u32, skip 4, gear score u32, skip 20,
//!        legion (len u8), last played ms u64, ..., combat power u64
//! ```
//!
//! Gear score checked against the party rosters saved with our fights, which
//! lead up to it (gran 2713 then 2722, haseri 1467 then 1513, vaeri 450 then 501).
//!
//! Each combat power is the last field of its entry, right before the next one's
//! id. This is the only place a CP comes with its owner's name: the 56 36 change
//! frame names nobody and at a login comes before the self record, so a live CP
//! can't be told apart from the next character's.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use a2tools::capture::stream_processor::read_varint;
use a2tools::combat::data_storage::DataStorage;
use a2tools::entity::job_class::JobClass;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Character {
    pub name: String,
    pub server_id: u16,
    pub server: String,
    pub job: String,
    pub job_key: String,
    pub level: Option<u32>,
    /// From the last character-select list; 0 before any.
    pub combat_power: i64,
    /// From the last character-select list; 0 before any.
    pub gear_score: u32,
    pub odyle: Option<Odyle>,
    /// When the meter last saw it playing (ms since the epoch): when its Odyle was read.
    pub last_seen: i64,
    /// When it was last played, meter or not, by the game's list; 0 before any.
    pub last_played: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Odyle {
    pub basic: u32,
    pub charged: u32,
}

#[derive(Serialize)]
pub struct Message<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    /// The character in game right now; None when the game is closed.
    playing: Option<&'a str>,
    list: &'a [Character],
}

/// One entry of the character-select list.
#[derive(Debug, Clone, PartialEq)]
struct Listed {
    name: String,
    class: JobClass,
    level: u32,
    /// 0 when it didn't read as one.
    combat_power: i64,
    /// 0 when it didn't read as one.
    gear_score: u32,
    last_played: i64,
}

/// The last list seen, from the capture thread until the next `update`.
static LISTED: Mutex<Option<Vec<Listed>>> = Mutex::new(None);

/// One game frame.
pub fn frame(packet: &[u8]) {
    if let Some(list) = read_list(packet)
        && let Ok(mut listed) = LISTED.lock()
    {
        *listed = Some(list);
    }
}

fn read_list(packet: &[u8]) -> Option<Vec<Listed>> {
    let at = read_varint(packet, 0).length;
    if at <= 0 {
        return None;
    }
    let at = at as usize;
    if packet.get(at..at + 2)? != [0x26, 0x36] {
        return None;
    }
    let u32_at = |i: usize| Some(u32::from_le_bytes(packet.get(i..i + 4)?.try_into().ok()?));
    let u64_at = |i: usize| Some(u64::from_le_bytes(packet.get(i..i + 8)?.try_into().ok()?));
    // An entry at `id`, if every field reads as what it should be: (entry, where the next search starts).
    let entry = |id: usize| -> Option<(Listed, usize)> {
        let len = *packet.get(id + 4)? as usize;
        if !(2..=24).contains(&len) {
            return None;
        }
        let name = std::str::from_utf8(packet.get(id + 5..id + 5 + len)?).ok()?;
        if !name.chars().all(char::is_alphanumeric) {
            return None;
        }
        let after = id + 5 + len;
        let class = JobClass::from_roster_class(u32_at(after)?)?;
        let level = u32_at(after + 6)?;
        let gear_score = u32_at(after + 14).filter(|g| (1..=99_999).contains(g)).unwrap_or(0);
        let legion = *packet.get(after + 38)? as usize;
        let time = after + 39 + legion;
        let last_played = u64_at(time)? as i64;
        // Between 2020 and 2050.
        if !(1..=99).contains(&level) || !(1_577_836_800_000..2_524_608_000_000).contains(&last_played) {
            return None;
        }
        let name = name.to_string();
        Some((Listed { name, class, level, combat_power: 0, gear_score, last_played }, time + 8))
    };
    let (mut list, mut ids) = (Vec::new(), Vec::new());
    let mut i = at + 2;
    while i < packet.len() {
        match entry(i) {
            Some((listed, next)) => {
                list.push(listed);
                ids.push(i);
                i = next;
            }
            None => i += 1,
        }
    }
    // Each CP ends right before the next entry's id; the last one a byte before the frame's end.
    let ends = ids.iter().skip(1).copied().chain(packet.len().checked_sub(1));
    for (listed, end) in list.iter_mut().zip(ends) {
        let cp = end.checked_sub(8).and_then(u64_at).unwrap_or(0);
        // The roster parser's bound: anything larger is not a combat power.
        listed.combat_power = if (1..=100_000_000).contains(&cp) { cp as i64 } else { 0 };
    }
    (!list.is_empty()).then_some(list)
}

pub struct Characters {
    path: PathBuf,
    list: Vec<Character>,
    servers: HashMap<u16, String>,
    playing: Option<String>,
    unsaved: bool,
    pub changed: bool,
}

impl Characters {
    /// `servers_json`: A2Tools' servers.json, for server names.
    pub fn load(path: PathBuf, servers_json: Option<&str>) -> Self {
        let mut list: Vec<Character> = fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        let servers = servers_json.map(server_names).unwrap_or_default();
        for c in &mut list {
            if let Some(s) = servers.get(&c.server_id) {
                c.server = s.clone();
            }
        }
        Self {
            path,
            list,
            servers,
            playing: None,
            unsaved: false,
            changed: true,
        }
    }

    /// Takes what the game has said about you since the last call.
    pub fn update(&mut self, storage: &DataStorage, game_running: bool, now: i64) {
        // Only a name the game gave as yours (not a guess from loot records).
        let profile = storage.local_profile();
        let me = profile.name.filter(|_| game_running && storage.local_identity_from_self_record());
        let me = me.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        if me != self.playing {
            self.playing = me.clone();
            self.changed = true;
        }
        if let Some(name) = &me {
            let server_id = storage.home_server_id();
            let server = self.servers.get(&server_id).cloned().unwrap_or_default();
            let (job_key, job) = profile.class.map_or(("", ""), |c| crate::meter::job_names(c.class_name()));
            let c = self.entry(name, server_id);
            let mut next = c.clone();
            if server_id != 0 {
                next.server_id = server_id;
                next.server = server;
            }
            if !job_key.is_empty() {
                (next.job_key, next.job) = (job_key.into(), job.into());
            }
            next.level = profile.level.or(next.level);
            next.last_seen = now;
            let moved = *c != Character { last_seen: c.last_seen, ..next.clone() };
            *c = next;
            self.changed |= moved;
            self.unsaved = true;
        }
        // shortcut: the list is filed under the server last played, as where it says its own isn't known; a list from another server can file its characters under the last one until each is played.
        let server_id = self.list_server(storage.home_server_id());
        let listed = if server_id == 0 { None } else { LISTED.lock().ok().and_then(|mut l| l.take()) };
        for l in listed.into_iter().flatten() {
            let server = self.servers.get(&server_id).cloned().unwrap_or_default();
            let (job_key, job) = crate::meter::job_names(l.class.class_name());
            let c = self.entry(&l.name, server_id);
            let before = c.clone();
            c.server_id = server_id;
            c.server = server;
            (c.job_key, c.job) = (job_key.into(), job.into());
            c.level = Some(l.level);
            if l.combat_power > 0 {
                c.combat_power = l.combat_power;
            }
            if l.gear_score > 0 {
                c.gear_score = l.gear_score;
            }
            c.last_played = c.last_played.max(l.last_played);
            if *c != before {
                self.changed = true;
                self.unsaved = true;
            }
        }
        // Odyle energy, to the character A2Tools says it belongs to.
        if let (Some((basic, charged)), Some(owner)) = (storage.odyle_energy(), storage.odyle_owner())
            && let Some(c) = self.list.iter_mut().find(|c| c.name == owner.trim())
            && c.odyle != Some(Odyle { basic, charged })
        {
            c.odyle = Some(Odyle { basic, charged });
            self.changed = true;
            self.unsaved = true;
        }
    }

    /// The server to file a list under: the game's, or at character select, before
    /// it has said, the one you last played on.
    pub fn list_server(&self, current: u16) -> u16 {
        if current != 0 {
            return current;
        }
        self.list.iter().filter(|c| c.server_id != 0).max_by_key(|c| c.last_seen).map_or(0, |c| c.server_id)
    }

    fn entry(&mut self, name: &str, server_id: u16) -> &mut Character {
        // A character first seen before its server was known is the same one.
        let at = self.list.iter().position(|c| {
            c.name == name && (c.server_id == server_id || c.server_id == 0 || server_id == 0)
        });
        let at = at.unwrap_or_else(|| {
            self.list.push(Character { name: name.into(), ..Default::default() });
            self.list.len() - 1
        });
        &mut self.list[at]
    }

    pub fn message(&self) -> Message<'_> {
        Message { kind: "characters", playing: self.playing.as_deref(), list: &self.list }
    }

    pub fn save(&mut self) {
        if !self.unsaved {
            return;
        }
        self.unsaved = false;
        let write = || -> anyhow::Result<()> {
            if let Some(dir) = self.path.parent() {
                fs::create_dir_all(dir)?;
            }
            let tmp = self.path.with_extension("json.tmp");
            fs::write(&tmp, serde_json::to_vec(&self.list)?)?;
            fs::rename(&tmp, &self.path)?;
            Ok(())
        };
        if let Err(e) = write() {
            tracing::warn!("Saving characters to {}: {e:#}", self.path.display());
        }
    }
}

/// English server names by id, from servers.json's `servers`.
fn server_names(text: &str) -> HashMap<u16, String> {
    #[derive(Deserialize)]
    struct File {
        servers: HashMap<String, HashMap<String, String>>,
    }
    let Ok(file) = serde_json::from_str::<File>(text) else { return HashMap::new() };
    file.servers
        .into_iter()
        .filter_map(|(id, names)| Some((id.parse().ok()?, names.get("en")?.clone())))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An entry as the game lays it out, with the looks and gear that sit between its fields.
    fn listed(name: &str, class: u32, level: u32, gear: u32, legion: &str, played: u64, cp: u64) -> Vec<u8> {
        let mut e = 2000u32.to_le_bytes().to_vec();
        e.push(name.len() as u8);
        e.extend(name.as_bytes());
        e.extend(class.to_le_bytes());
        e.extend([2, 2]);
        e.extend(level.to_le_bytes());
        e.extend([0; 4]);
        e.extend(gear.to_le_bytes());
        e.extend([0; 20]);
        e.push(legion.len() as u8);
        e.extend(legion.as_bytes());
        e.extend(played.to_le_bytes());
        e.extend([0x5a; 300]);
        e.extend(cp.to_le_bytes());
        e
    }

    #[test]
    fn reads_the_select_list() {
        // The three entries as read from the list of 2026-11-02.
        let mut f = vec![0xe4, 0x43, 0x26, 0x36, 0, 0, 4, 1, 2, 3];
        f.extend(listed("gran", 12, 45, 2722, "DarknessFllz", 1_793_583_216_547, 163_352));
        f.extend(listed("haseri", 36, 45, 1513, "", 1_793_637_927_533, 79_975));
        f.extend(listed("vaeri", 16, 33, 501, "", 1_793_637_876_933, 35_109));
        f.push(0);
        let list = read_list(&f).unwrap();
        let got: Vec<_> = list.iter().map(|l| (l.name.as_str(), l.class, l.level, l.gear_score, l.combat_power, l.last_played)).collect();
        assert_eq!(got, [
            ("gran", JobClass::Templar, 45, 2722, 163_352, 1_793_583_216_547),
            ("haseri", JobClass::Chanter, 45, 1513, 79_975, 1_793_637_927_533),
            ("vaeri", JobClass::Ranger, 33, 501, 35_109, 1_793_637_876_933),
        ]);
    }

    #[test]
    fn the_select_list_ignores_other_frames_and_what_does_not_read_as_an_entry() {
        assert_eq!(read_list(&[0x05, 0x56, 0x36, 1, 2]), None);
        assert_eq!(read_list(&[0x05, 0x26, 0x36, 1, 2]), None);
        // A name followed by a class but no plausible level or time.
        let mut f = vec![0xe4, 0x43, 0x26, 0x36];
        f.extend(listed("gran", 12, 0, 2722, "", 1_793_583_216_547, 163_352));
        assert_eq!(read_list(&f), None);
        let mut f = vec![0xe4, 0x43, 0x26, 0x36];
        f.extend(listed("gran", 12, 45, 2722, "", 12345, 163_352));
        assert_eq!(read_list(&f), None);
    }

    #[test]
    fn a_list_goes_under_the_game_server_else_the_one_last_played() {
        let mut c = Characters::load(PathBuf::from("/nonexistent/characters.json"), None);
        assert_eq!(c.list_server(0), 0, "nothing known: the list waits");
        c.entry("Old", 1001).server_id = 1001;
        c.entry("Old", 1001).last_seen = 5;
        c.entry("New", 2402).server_id = 2402;
        c.entry("New", 2402).last_seen = 9;
        assert_eq!(c.list_server(0), 2402);
        assert_eq!(c.list_server(1001), 1001);
    }

    #[test]
    fn reads_server_names() {
        let names = server_names(r#"{"regions":{},"servers":{"1001":{"en":"Siel","ko":"시엘"},"x":{"en":"bad"}}}"#);
        assert_eq!(names.get(&1001).map(String::as_str), Some("Siel"));
        assert_eq!(names.len(), 1);
    }

    #[test]
    fn a_character_first_seen_without_a_server_is_kept_once() {
        let mut c = Characters::load(PathBuf::from("/nonexistent/characters.json"), None);
        c.entry("Trimbus", 0).level = Some(21);
        c.entry("Trimbus", 2014).server_id = 2014;
        assert_eq!(c.list.len(), 1);
        assert_eq!(c.list[0].level, Some(21));
        c.entry("Trimbus", 1001);
        assert_eq!(c.list.len(), 2, "same name on another server is another character");
    }
}
