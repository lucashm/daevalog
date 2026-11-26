//! PvP: the enemy players around you, for the overlay's PvP widget.
//!
//! Who's an enemy comes from the player spawn (`45 36`, or `44 36` before June
//! 2026), sent as a player comes into range, its own frame or inside a bigger
//! one. Its layout as far as we use it (found in our own capture, 2026-11-13:
//! the 9 players who fought us all read faction 1 and the server 1405/1406,
//! the other 62 of our side 2 and 2402; combat power checked against the game's
//! 197.7K for Frimbus, and against party rosters):
//!
//! ```text
//! 45 36  id varint, mask u32, mask2 u8 (bit 0: a name follows), name (len u8),
//!        class u32 (the roster's codes), faction u8 (1 Elyos, 2 Asmodian), ...,
//!        near the end: f4 cb 1f, u32, u32, combat power u64, 1-2 bytes
//! ```
//!
//! Who's fighting you comes from the hits: Aion has no friendly fire, so a
//! class skill from one player landing on another is PvP. A2Tools books those
//! as healing and drops them from the meter, so we read them off the `04 38`
//! frame ourselves (layout: `capture::stream_processor::parsing_damage`):
//!
//! ```text
//! 04 38  target varint, switch varint, flag varint, actor varint, skill u32, ...
//! ```
//!
//! A player leaves with `42 36  id varint, 0 varint, flag varint` (flag 7).

use std::collections::HashMap;
use std::sync::Mutex;

use a2tools::capture::stream_processor::read_varint;
use a2tools::combat::data_storage::{DataStorage, is_player_skill};
use a2tools::entity::job_class::JobClass;
use a2tools::entity::summon_resolver;
use serde::Serialize;

/// Someone you fought stays listed this long after the last hit either way.
const FOUGHT_MS: i64 = 60_000;
/// "Hitting you" while their last hit on you is this recent.
const HITTING_MS: i64 = 5_000;
/// Rows sent; fights first, so a crowd nearby can't push them out.
const MAX_ROWS: usize = 10;

#[derive(Debug, Clone, PartialEq)]
struct Spawn {
    name: String,
    class: Option<JobClass>,
    /// 1 Elyos, 2 Asmodian.
    faction: u8,
    /// 0 when it didn't read as one.
    combat_power: i64,
}

enum Event {
    Hit { actor: i32, target: i32, skill: i32 },
    Spawn(i32, Spawn),
    Gone(i32),
}

/// What the capture thread saw since the last `update`.
static EVENTS: Mutex<Vec<Event>> = Mutex::new(Vec::new());

/// One game frame.
pub fn frame(packet: &[u8]) {
    let mut found: Vec<Event> = spawns(packet)
        .into_iter()
        .map(|(id, s)| Event::Spawn(id, s))
        .collect();
    found.extend(hit(packet).or_else(|| gone(packet)));
    if !found.is_empty()
        && let Ok(mut events) = EVENTS.lock()
    {
        events.extend(found);
    }
}

/// The frame's opcode and where its body starts.
fn opcode(packet: &[u8]) -> Option<([u8; 2], usize)> {
    let at = read_varint(packet, 0).length;
    if at <= 0 {
        return None;
    }
    let at = at as usize;
    Some((packet.get(at..at + 2)?.try_into().ok()?, at + 2))
}

/// A class skill's hit, the first record of a `04 38` frame.
fn hit(packet: &[u8]) -> Option<Event> {
    let (op, mut at) = opcode(packet)?;
    if op != [0x04, 0x38] {
        return None;
    }
    let mut next = || {
        let v = read_varint(packet, at);
        (v.length > 0).then(|| {
            at += v.length as usize;
            v.value
        })
    };
    let target = next()?;
    let switch = next()? & 0x0F;
    next()?;
    let actor = next()?;
    if !(4..=7).contains(&switch)
        || !(100..=9_999_999).contains(&target)
        || !(100..=9_999_999).contains(&actor)
    {
        return None;
    }
    let skill = i32::from_le_bytes(packet.get(at..at + 4)?.try_into().ok()?);
    // Monsters' skills are 7 digits; a player's class band says who cast it.
    (is_player_skill(skill) && actor != target).then_some(Event::Hit {
        actor,
        target,
        skill,
    })
}

/// An entity leaving the world: `42 36` with flag 7.
fn gone(packet: &[u8]) -> Option<Event> {
    let (op, at) = opcode(packet)?;
    if op != [0x42, 0x36] {
        return None;
    }
    let id = read_varint(packet, at);
    let zero = read_varint(packet, at + id.length.max(0) as usize);
    let flag = read_varint(packet, at + (id.length + zero.length).max(0) as usize);
    (id.length > 0 && zero.length > 0 && flag.length > 0 && flag.value == 7)
        .then_some(Event::Gone(id.value))
}

/// Every player spawn in `data`, each a whole frame: `<length varint> 45 36 <body>`.
fn spawns(data: &[u8]) -> Vec<(i32, Spawn)> {
    let mut out = Vec::new();
    for op in 1..data.len().saturating_sub(1) {
        if data[op + 1] != 0x36 || !matches!(data[op], 0x44 | 0x45) {
            continue;
        }
        // A length varint ending right before the opcode, the longest that frames a
        // whole spawn; a frame counts its body plus 4 (see A2Tools' `capture::framing`).
        let found = (1..=3).rev().filter(|&w| w <= op).find_map(|w| {
            let v = read_varint(data, op - w);
            if v.length != w as i32 || v.value <= 6 {
                return None;
            }
            spawn(data.get(op + 2..op + 2 + v.value as usize - 6)?)
        });
        out.extend(found);
    }
    out
}

fn spawn(body: &[u8]) -> Option<(i32, Spawn)> {
    let id = read_varint(body, 0);
    if id.length <= 0 || !(100..=9_999_999).contains(&id.value) {
        return None;
    }
    let mask2 = id.length as usize + 4;
    if body.get(mask2)? & 0x01 == 0 {
        return None;
    }
    let len = *body.get(mask2 + 1)? as usize;
    let name = std::str::from_utf8(body.get(mask2 + 2..mask2 + 2 + len)?).ok()?;
    if !(1..=48).contains(&len) || name.chars().any(char::is_control) {
        return None;
    }
    let after = mask2 + 2 + len;
    let class = JobClass::from_roster_class(u32::from_le_bytes(
        body.get(after..after + 4)?.try_into().ok()?,
    ));
    let faction = *body.get(after + 4)?;
    if !matches!(faction, 1 | 2) {
        return None;
    }
    let s = Spawn {
        name: name.to_string(),
        class,
        faction,
        combat_power: combat_power(body).unwrap_or(0),
    };
    Some((id.value, s))
}

/// The u64 after `f4 cb 1f, u32, u32`. A byte sometimes sits before it (Frimbus:
/// `07 00 00 00 03 69 04 03 00..`) and a low character lacks the second u32,
/// so the first place that reads as a combat power wins.
fn combat_power(body: &[u8]) -> Option<i64> {
    let from = body.len().saturating_sub(48);
    let mark = from
        + body[from..]
            .windows(3)
            .rposition(|w| w == [0xf4, 0xcb, 0x1f])?
        + 3;
    // shortcut: under 65,536 a stray byte before it would read as the power; no player in PvP has so little.
    [8, 9, 4].iter().find_map(|d| {
        let v = u64::from_le_bytes(body.get(mark + d..mark + d + 8)?.try_into().ok()?);
        (1_000..16_777_216).contains(&v).then_some(v as i64)
    })
}

#[derive(Default)]
struct Fought {
    job: Option<JobClass>,
    hit_me: i64,
    hit_by_me: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Enemy {
    pub id: i32,
    pub name: String,
    pub job: String,
    pub job_key: String,
    /// 0 when the game hasn't said.
    pub combat_power: i64,
    /// -1 when the game hasn't sent their HP.
    pub hp: i64,
    /// The highest HP seen on them, so the bar can read low if they came in hurt.
    pub max_hp: i64,
    /// The one you hit last.
    pub targeted: bool,
    pub hitting_you: bool,
    /// Traded hits with you in the last minute; otherwise only in range.
    pub fought: bool,
}

#[derive(Default)]
pub struct Pvp {
    spawned: HashMap<i32, Spawn>,
    fought: HashMap<i32, Fought>,
    zone_reset: i64,
    last: Vec<Enemy>,
}

#[derive(Serialize)]
pub struct Message<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    enemies: &'a [Enemy],
}

impl Pvp {
    /// Takes what the capture saw; true when the list changed.
    pub fn update(&mut self, storage: &DataStorage, home_server: u16, now: i64) -> bool {
        let events = std::mem::take(&mut *EVENTS.lock().unwrap_or_else(|e| e.into_inner()));
        // A new zone: everyone in range is sent again.
        if storage.last_zone_reset_ms() != self.zone_reset {
            self.zone_reset = storage.last_zone_reset_ms();
            self.spawned.clear();
        }
        let me = storage.local_player_id().map(|id| id as i32);
        let summons = storage.get_summon_data();
        let party = storage.get_party_members();
        let mine = match crate::meter::faction_of(home_server) {
            Some("elyos") => Some(1),
            Some(_) => Some(2),
            None => None,
        };
        for e in events {
            match e {
                Event::Spawn(id, s) => {
                    self.spawned.insert(id, s);
                }
                Event::Gone(id) => {
                    self.spawned.remove(&id);
                }
                Event::Hit {
                    actor,
                    target,
                    skill,
                } => {
                    let Some(me) = me else { continue };
                    // A player outside your party; never a monster, a spirit or you.
                    let foe = |id: i32| {
                        id != me
                            && !storage.is_mob(id)
                            && !storage.is_summon(id)
                            && storage
                                .get_nickname(id)
                                .is_none_or(|n| !party.contains_key(&n))
                    };
                    let actor = summon_resolver::resolve(actor, &summons);
                    if target == me && foe(actor) {
                        let f = self.fought.entry(actor).or_default();
                        f.hit_me = now;
                        f.job = f.job.or(JobClass::convert_from_skill(skill));
                    } else if actor == me && foe(target) && storage.is_known_player(target) {
                        self.fought.entry(target).or_default().hit_by_me = now;
                    }
                }
            }
        }
        self.fought
            .retain(|_, f| now - f.hit_me.max(f.hit_by_me) < FOUGHT_MS);

        let targeted = self
            .fought
            .iter()
            .filter(|(_, f)| f.hit_by_me > 0)
            .max_by_key(|(_, f)| f.hit_by_me)
            .map(|(&id, _)| id);
        // Those you fought, then the other side's players in range.
        let enemy_near = |s: &Spawn| mine.is_some_and(|m| s.faction != m);
        let ids = self.fought.keys().copied().chain(
            self.spawned
                .iter()
                .filter(|(_, s)| enemy_near(s))
                .map(|(&id, _)| id),
        );
        let mut list: Vec<(i64, Enemy)> = Vec::new();
        for id in ids {
            if list.iter().any(|(_, e)| e.id == id) {
                continue;
            }
            let (f, s) = (self.fought.get(&id), self.spawned.get(&id));
            let job = f.and_then(|f| f.job).or(s.and_then(|s| s.class));
            let job = job
                .map(|j| crate::meter::job_names(j.class_name()))
                .unwrap_or(("", ""));
            let enemy = Enemy {
                id,
                name: storage
                    .get_nickname(id)
                    .or(s.map(|s| s.name.clone()))
                    .unwrap_or_else(|| format!("#{id}")),
                job: job.1.to_string(),
                job_key: job.0.to_string(),
                combat_power: s.map_or(0, |s| s.combat_power),
                hp: storage.get_mob_current_hp(id).map_or(-1, i64::from),
                max_hp: storage.get_mob_hp(id).map_or(0, i64::from),
                targeted: Some(id) == targeted,
                hitting_you: f.is_some_and(|f| now - f.hit_me < HITTING_MS),
                fought: f.is_some(),
            };
            list.push((f.map_or(0, |f| f.hit_me.max(f.hit_by_me)), enemy));
        }
        // Your target, whoever is hitting you, the latest fought, then the strongest nearby.
        list.sort_by_key(|(at, e)| (!e.targeted, !e.hitting_you, -at, -e.combat_power, e.id));
        let list: Vec<Enemy> = list.into_iter().take(MAX_ROWS).map(|(_, e)| e).collect();
        let changed = list != self.last;
        self.last = list;
        changed
    }

    pub fn message(&self) -> Message<'_> {
        Message {
            kind: "pvp",
            enemies: &self.last,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        let s: String = s.split_whitespace().collect();
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    /// A spawn frame for `name`, class 6, `faction`, ending in `tail`.
    fn spawn_frame(id: &str, name: &str, faction: u8, tail: &str) -> Vec<u8> {
        let mut body = hex(id);
        body.extend(hex("07070000 07"));
        body.push(name.len() as u8);
        body.extend(name.as_bytes());
        body.extend(hex("06000000"));
        body.push(faction);
        body.extend(vec![0u8; 60]);
        body.extend(hex(tail));
        let mut f = vec![(body.len() + 6) as u8, 0x45, 0x36];
        assert!(f[0] < 0x80);
        f.extend(body);
        f
    }

    // The tails of real records: Frimbus (a byte before the power), Tai (one after), a low alt (no second u32).
    const FRIMBUS: &str = "26 f4 cb 1f dd 04 00 00 07 00 00 00 03 69 04 03 00 00 00 00 00 00";
    const TAI: &str = "21 f4 cb 1f 52 04 00 00 13 00 00 00 39 8c 00 00 00 00 00 00 00 00";
    const ALT: &str = "21 f4 cb 1f 22 04 00 00 df 32 00 00 00 00 00 00 00";

    #[test]
    fn reads_a_spawn_with_its_faction_class_and_combat_power() {
        // Inside a bigger frame, after other bytes.
        let mut data = hex("0e 00 36 aa bb");
        data.extend(spawn_frame("ab1d", "Frimbus", 2, FRIMBUS));
        let got = spawns(&data);
        assert_eq!(got.len(), 1);
        let (id, s) = &got[0];
        assert_eq!(
            (*id, s.name.as_str(), s.class, s.faction, s.combat_power),
            (3755, "Frimbus", Some(JobClass::Gladiator), 2, 197_737)
        );
        assert_eq!(
            spawns(&spawn_frame("ab1d", "Tai", 1, TAI))[0]
                .1
                .combat_power,
            35_897
        );
        assert_eq!(
            spawns(&spawn_frame("ab1d", "Alt", 1, ALT))[0]
                .1
                .combat_power,
            13_023
        );
        // A frame cut short isn't read.
        let f = spawn_frame("ab1d", "Frimbus", 2, FRIMBUS);
        assert!(spawns(&f[..f.len() - 1]).is_empty());
    }

    #[test]
    fn reads_a_class_skills_hit_and_a_despawn() {
        // len, 04 38, target 2259 (d3 11), switch 05, flag 00, actor 2260 (d4 11), skill 11010000.
        assert!(matches!(
            hit(&hex("0f0438d3110500d411d0ffa700")),
            Some(Event::Hit {
                actor: 2260,
                target: 2259,
                skill: 11_010_000
            })
        ));
        // A monster's 7-digit skill.
        assert!(hit(&hex("0f0438d3110500d41140420f00")).is_none());
        assert!(matches!(
            gone(&hex("084236d3110007")),
            Some(Event::Gone(2259))
        ));
        // A combat death (flag 3) isn't leaving.
        assert!(gone(&hex("084236d3110003")).is_none());
    }

    #[test]
    fn lists_your_fights_then_the_other_side_in_range() {
        use a2tools::combat::data_storage::PartyMember;

        let storage = DataStorage::new();
        storage.set_local_player_id(Some(100));
        for (id, name) in [(200, "Foe"), (300, "Mate"), (400, "Prey")] {
            storage.append_nickname_authoritative(id, name);
        }
        storage.set_party_roster(vec![("Mate".into(), PartyMember::default())], true);
        let mut pvp = Pvp::default();
        let events = |e: Vec<Event>| EVENTS.lock().unwrap().extend(e);
        let s = |name: &str, faction, cp| Spawn {
            name: name.into(),
            class: Some(JobClass::Cleric),
            faction,
            combat_power: cp,
        };
        events(vec![
            Event::Hit {
                actor: 200,
                target: 100,
                skill: 11_010_000,
            },
            Event::Hit {
                actor: 300,
                target: 100,
                skill: 17_010_000,
            },
            // In range: two Elyos and one of ours.
            Event::Spawn(500, s("Lurker", 1, 150_000)),
            Event::Spawn(600, s("Big", 1, 250_000)),
            Event::Spawn(700, s("Friend", 2, 300_000)),
            Event::Spawn(200, s("Foe", 1, 180_000)),
        ]);
        assert!(pvp.update(&storage, 2402, 1_000));
        // Prey has used a class skill somewhere, so is a player.
        let mut h = a2tools::entity::damage_packet::ParsedDamagePacket::new();
        h.set_actor_id(400);
        h.set_target_id(50_000);
        h.set_skill_code(15_010_000);
        h.set_damage(1);
        storage.append_damage(h);
        events(vec![
            Event::Hit {
                actor: 100,
                target: 400,
                skill: 11_010_000,
            },
            Event::Gone(500),
        ]);
        pvp.update(&storage, 2402, 7_000);
        let got: Vec<_> = pvp
            .last
            .iter()
            .map(|e| {
                (
                    e.name.as_str(),
                    e.job_key.as_str(),
                    e.combat_power,
                    e.targeted,
                    e.fought,
                )
            })
            .collect();
        assert_eq!(
            got,
            vec![
                ("Prey", "", 0, true, true),
                ("Foe", "GLADIATOR", 180_000, false, true),
                ("Big", "CLERIC", 250_000, false, false)
            ]
        );
        // A minute after the last hit, Foe is only in range.
        pvp.update(&storage, 2402, 61_500);
        assert_eq!(
            pvp.last
                .iter()
                .map(|e| (e.id, e.fought))
                .collect::<Vec<_>>(),
            vec![(400, true), (600, false), (200, false)]
        );
    }
}
