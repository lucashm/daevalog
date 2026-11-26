//! The existing daemon wire format. Unknown fields/events remain compatible.
use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Capture {
    pub game_running: bool,
    pub locked: bool,
    pub error: Option<String>,
}

#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Player {
    pub id: i32,
    pub name: String,
    pub job: String,
    pub dps: f64,
    pub damage: f64,
    pub share: f64,
    pub crit_rate: f64,
    pub is_local: bool,
    /// From the party roster; 0 when the game hasn't said.
    pub combat_power: i64,
    pub deaths: i64,
}

/// An enemy player around you (daemon/src/pvp.rs).
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Enemy {
    pub id: i32,
    pub name: String,
    pub job: String,
    pub job_key: String,
    pub combat_power: i64,
    /// -1 when the game hasn't sent their HP.
    pub hp: i64,
    pub max_hp: i64,
    pub targeted: bool,
    pub hitting_you: bool,
    pub fought: bool,
}

/// Kina picked up while farming, as the Linux overlay counts it: only rises
/// count, so spending doesn't sink the rate, and a session ends 5 minutes
/// after its last gain. The daemon states only the balance.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Kina {
    pub balance: i64,
    /// Toward today's gain limit (1,000,000); -1 before the game states it.
    pub daily: i64,
    pub gained: i64,
    /// The gain that opened the session: it isn't timed.
    pub first: i64,
    pub start_ms: u64,
    pub last_ms: u64,
}

impl Default for Kina {
    fn default() -> Self {
        Self {
            balance: -1,
            daily: -1,
            gained: 0,
            first: 0,
            start_ms: 0,
            last_ms: 0,
        }
    }
}

pub const KINA_SESSION_MS: u64 = 5 * 60 * 1000;
pub const KINA_DAILY_CAP: i64 = 1_000_000;

impl Kina {
    pub fn update(&mut self, balance: i64, daily: i64, now: u64) {
        self.daily = daily;
        let delta = if self.balance < 0 {
            0
        } else {
            balance - self.balance
        };
        self.balance = balance;
        if delta <= 0 {
            return;
        }
        if self.last_ms == 0 || now.saturating_sub(self.last_ms) > KINA_SESSION_MS {
            self.gained = 0;
            self.first = delta;
            self.start_ms = now;
        }
        self.gained += delta;
        self.last_ms = now;
    }

    /// Shown while the last gain is under 5 minutes old.
    pub fn recent(&self, now: u64) -> bool {
        self.last_ms > 0 && now.saturating_sub(self.last_ms) < KINA_SESSION_MS
    }

    pub fn elapsed_ms(&self, now: u64) -> u64 {
        now.max(self.last_ms).saturating_sub(self.start_ms)
    }

    pub fn per_second(&self, now: u64) -> f64 {
        let ms = self.elapsed_ms(now);
        if ms == 0 {
            0.0
        } else {
            (self.gained - self.first) as f64 / (ms as f64 / 1000.0)
        }
    }
}

#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Skill {
    pub actor_id: i32,
    pub name: String,
    pub damage: f64,
    pub hits: i32,
    pub dps: f64,
    pub crit_rate: f64,
    pub back_rate: f64,
    pub is_dot: bool,
}

#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Target {
    pub name: String,
    pub max_hp: i64,
    pub current_hp: i64,
}

#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct State {
    pub capture: Capture,
    pub ping_ms: Option<i32>,
    pub battle_time_ms: i64,
    pub target_mode: String,
    pub target: Option<Target>,
    pub players: Vec<Player>,
    pub skills: Vec<Skill>,
}

#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Fight {
    pub id: String,
    pub boss_name: String,
    pub duration_ms: i64,
    pub killed: bool,
    pub players: Vec<Player>,
}

pub fn number(n: f64) -> String {
    if n.abs() >= 1_000_000.0 {
        format!("{:.2}m", n / 1_000_000.0)
    } else if n.abs() >= 1_000.0 {
        format!("{:.1}k", n / 1_000.0)
    } else {
        format!("{n:.0}")
    }
}

/// Partial pet updates cannot establish the rest of a player's collection.
pub fn read_pets(value: serde_json::Value) -> serde_json::Value {
    if value["ready"].as_bool() == Some(true) {
        value
    } else {
        serde_json::Value::Null
    }
}

/// Saved fights carry hit counts; live skills carry precomputed rates.
pub fn read_fight(value: &serde_json::Value) -> Option<(Fight, Vec<Skill>)> {
    let mut fight: Fight = serde_json::from_value(value["summary"].clone()).ok()?;
    let seconds = (fight.duration_ms as f64 / 1000.0).max(1.0);
    let total: f64 = fight.players.iter().map(|p| p.damage).sum();
    for player in &mut fight.players {
        player.share = if total > 0.0 {
            player.damage / total * 100.0
        } else {
            0.0
        };
    }
    let skills = value["skills"]
        .as_array()?
        .iter()
        .filter_map(|value| {
            let mut skill: Skill = serde_json::from_value(value.clone()).ok()?;
            skill.dps = skill.damage / seconds;
            if !skill.is_dot && skill.hits > 0 {
                skill.crit_rate = value["crit"].as_f64().unwrap_or(0.0) / f64::from(skill.hits);
                skill.back_rate = value["back"].as_f64().unwrap_or(0.0) / f64::from(skill.hits);
            } else {
                skill.crit_rate = 0.0;
                skill.back_rate = 0.0;
            }
            Some(skill)
        })
        .collect();
    Some((fight, skills))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unknown_pet_data_stays_unknown_even_with_a_server_or_partial_counts() {
        for value in [
            serde_json::json!({"server":0,"ready":false,"levels":{},"points":{}}),
            serde_json::json!({"server":1001,"ready":false,"levels":{},"points":{}}),
            serde_json::json!({"server":1001,"ready":false,"levels":{"1002":1},"points":{"1002":2}}),
        ] {
            assert!(read_pets(value).is_null());
        }
    }

    #[test]
    fn observed_empty_pet_collection_is_known() {
        let collection = serde_json::json!({"server":1001,"ready":true,"levels":{},"points":{}});
        assert_eq!(read_pets(collection.clone()), collection);
    }

    #[test]
    fn reads_existing_camel_case_state_and_extra_fields() {
        let state: State = serde_json::from_value(serde_json::json!({
            "type":"state", "capture":{"gameRunning":true,"locked":true,"error":null},
            "battleTimeMs":1500,"pingMs":48,"targetMode":"boss",
            "players":[{"id":7,"name":"Test","damage":9876,"dps":6584,"isLocal":true,"jobKey":"CLERIC"}],
            "skills":[{"name":"Hit","damage":9876,"critRate":0.5}], "faction":"elyos"
        })).unwrap();
        assert!(state.capture.game_running && state.capture.locked);
        assert_eq!(state.battle_time_ms, 1500);
        assert_eq!(state.players[0].id, 7);
        assert!(state.players[0].is_local);
        assert_eq!(state.skills[0].crit_rate, 0.5);
    }

    #[test]
    fn saved_fight_uses_duration_and_hit_counts_for_rates() {
        let (fight, skills) = read_fight(&serde_json::json!({
            "summary":{"id":"test", "durationMs":2000,"players":[{"id":1,"damage":750},{"id":2,"damage":250}]},
            "skills":[{"actorId":1,"name":"Hit","damage":750,"hits":4,"crit":2,"back":1}]
        })).unwrap();
        assert_eq!(fight.players[0].share, 75.0);
        assert_eq!(skills[0].dps, 375.0);
        assert_eq!(skills[0].crit_rate, 0.5);
        assert_eq!(skills[0].back_rate, 0.25);
    }

    #[test]
    fn kina_counts_rises_only_and_restarts_after_five_idle_minutes() {
        let mut k = Kina::default();
        // The first balance is a baseline, not a gain.
        k.update(10_000, 500, 1_000);
        assert_eq!((k.gained, k.last_ms), (0, 0));
        assert!(!k.recent(1_000));
        k.update(10_100, 600, 2_000);
        assert_eq!((k.gained, k.first, k.start_ms), (100, 100, 2_000));
        k.update(10_300, 800, 12_000);
        // The opening gain isn't timed: 200 over 10 s.
        assert_eq!(k.per_second(12_000), 20.0);
        // Spending doesn't count.
        k.update(9_000, 800, 13_000);
        assert_eq!(k.gained, 300);
        assert!(k.recent(12_000 + KINA_SESSION_MS - 1));
        // A gain after 5 idle minutes opens a new session.
        k.update(9_050, 850, 12_000 + KINA_SESSION_MS + 1);
        assert_eq!((k.gained, k.first), (50, 50));
        assert_eq!(k.daily, 850);
    }

    #[test]
    fn reads_live_combat_power_deaths_and_enemies() {
        let state: State = serde_json::from_value(serde_json::json!({
            "players":[{"id":7,"name":"Test","combatPower":193000,"deaths":2}]
        }))
        .unwrap();
        assert_eq!(
            (state.players[0].combat_power, state.players[0].deaths),
            (193000, 2)
        );
        let enemy: Enemy = serde_json::from_value(serde_json::json!({
            "id":9,"name":"Foe","job":"Gladiator","jobKey":"GLADIATOR","combatPower":197700,
            "hp":-1,"maxHp":0,"targeted":true,"hittingYou":false,"fought":true
        }))
        .unwrap();
        assert!(enemy.targeted && enemy.fought && !enemy.hitting_you);
        assert_eq!(enemy.hp, -1);
    }

    #[test]
    fn saved_dot_rates_match_the_live_meter() {
        let (_, skills) = read_fight(&serde_json::json!({
            "summary":{"id":"dot", "durationMs":2000, "players":[]},
            "skills":[{"actorId":1,"name":"DoT","damage":100,"hits":4,"crit":4,"back":2,"isDot":true}]
        })).unwrap();
        assert!(skills[0].is_dot);
        assert_eq!(skills[0].dps, 50.0);
        assert_eq!(skills[0].crit_rate, 0.0);
        assert_eq!(skills[0].back_rate, 0.0);
    }
}
