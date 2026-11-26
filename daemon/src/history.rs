//! Saved boss fights, one JSON file per fight (A2Tools' `FightRecord`, so
//! nothing is lost), under $XDG_DATA_HOME/aion2-meter/fights.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

use a2tools::entity::fight_record::FightRecord;
use anyhow::Result;
use parking_lot::Mutex;
use serde::Serialize;

/// What the history widget lists for one fight.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FightSummary {
    pub id: String,
    pub boss_name: String,
    pub start_time_ms: i64,
    pub duration_ms: i64,
    pub total_damage: i64,
    pub killed: bool,
    pub players: Vec<FightPlayer>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FightPlayer {
    pub id: i32,
    pub name: String,
    pub job: String,
    pub job_key: String,
    pub damage: i64,
    pub dps: f64,
    /// Over non-DoT hits.
    pub crit_rate: f64,
    pub back_rate: f64,
    /// Share of the fight spent hitting: gaps of IDLE_GAP_MS or less between direct hits.
    pub active: f64,
    pub heal: i64,
    pub damage_taken: i64,
    pub deaths: i32,
    /// When each death happened, ms from the fight's first hit.
    pub death_ms: Vec<i64>,
    /// Damage dealt in each DAMAGE_BIN_MS of the fight, from its first hit.
    pub damage_bins: Vec<i64>,
    pub gear_score: i32,
    pub combat_power: i64,
}

pub struct History {
    dir: PathBuf,
    /// Each file's summary as of its modified time: reading every fight is seconds.
    cache: Mutex<HashMap<PathBuf, (SystemTime, Option<FightSummary>)>>,
}

impl History {
    pub fn new(dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&dir)?;
        Ok(Self { dir, cache: Mutex::default() })
    }

    fn path(&self, id: &str) -> Option<PathBuf> {
        // Ids come from the overlay too; keep them to a plain file name.
        let ok = !id.is_empty()
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        ok.then(|| self.dir.join(format!("{id}.json")))
    }

    /// Saves (or re-saves, when a fight went on) a fight.
    pub fn save(&self, record: &FightRecord) -> Result<()> {
        let Some(path) = self.path(&record.id) else {
            anyhow::bail!("unsafe fight id {:?}", record.id)
        };
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec(record)?)?;
        fs::rename(tmp, path)?;
        Ok(())
    }

    pub fn load(&self, id: &str) -> Option<FightRecord> {
        let text = fs::read(self.path(id)?).ok()?;
        serde_json::from_slice(&text).ok()
    }

    /// Newest first.
    pub fn list(&self, limit: usize) -> Vec<FightSummary> {
        let mut files: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(&self.dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
            .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
            .collect();
        files.sort_by_key(|f| std::cmp::Reverse(f.0));
        let mut out: Vec<FightSummary> = files
            .into_iter()
            .take(limit)
            .filter_map(|(modified, p)| {
                if let Some((t, s)) = self.cache.lock().get(&p) {
                    if *t == modified {
                        return s.clone();
                    }
                }
                // Parsed outside the lock; a file that won't parse is remembered as None.
                let s = fs::read(&p)
                    .ok()
                    .and_then(|b| serde_json::from_slice::<FightRecord>(&b).ok())
                    .map(|r| summarize(&r));
                self.cache.lock().insert(p, (modified, s.clone()));
                s
            })
            .collect();
        out.sort_by_key(|f| std::cmp::Reverse(f.start_time_ms));
        out
    }
}

const DAMAGE_BIN_MS: i64 = 30_000;
/// A longer pause between your hits counts as not attacking.
const IDLE_GAP_MS: i64 = 3_000;

fn active_ms(mut hits: Vec<i64>) -> i64 {
    hits.sort_unstable();
    hits.windows(2).map(|w| w[1] - w[0]).filter(|&g| g <= IDLE_GAP_MS).sum()
}

pub fn summarize(r: &FightRecord) -> FightSummary {
    let bin_count = ((r.duration_ms.max(1) + DAMAGE_BIN_MS - 1) / DAMAGE_BIN_MS) as usize;
    let seconds = (r.duration_ms as f64 / 1000.0).max(1.0);
    let mut players: Vec<FightPlayer> = r
        .actors
        .iter()
        .map(|a| {
            let skills = || r.details.skills.iter().filter(|s| s.actor_id == a.actor_id);
            let death_ms = || -> Vec<i64> {
                let deaths = r.details.deaths.iter().flatten();
                deaths.filter(|d| d.actor_id == a.actor_id).map(|d| d.ts_ms).collect()
            };
            let damage: i64 = skills().map(|s| s.dmg as i64).sum();
            // shortcut: a skill's damage is spread evenly over its hits (only their times are kept).
            let mut bins = vec![0.0f64; bin_count];
            for s in skills().filter(|s| !s.hit_timestamps.is_empty()) {
                let per_hit = s.dmg as f64 / s.hit_timestamps.len() as f64;
                for &t in &s.hit_timestamps {
                    bins[((t.max(0) / DAMAGE_BIN_MS) as usize).min(bin_count - 1)] += per_hit;
                }
            }
            let (mut hits, mut crit, mut back) = (0i64, 0i64, 0i64);
            for s in skills().filter(|s| !s.is_dot) {
                hits += s.time as i64;
                crit += s.crit as i64;
                back += s.back as i64;
            }
            let rate = |n: i64| {
                if hits > 0 {
                    n as f64 / hits as f64
                } else {
                    0.0
                }
            };
            FightPlayer {
                id: a.actor_id,
                name: if a.nickname.is_empty() {
                    format!("#{}", a.actor_id)
                } else {
                    a.nickname.clone()
                },
                job: crate::meter::job_names(&a.job).1.to_string(),
                job_key: crate::meter::job_names(&a.job).0.to_string(),
                damage,
                dps: damage as f64 / seconds,
                crit_rate: rate(crit),
                back_rate: rate(back),
                active: (active_ms(skills().filter(|s| !s.is_dot).flat_map(|s| s.hit_timestamps.iter().copied()).collect())
                    as f64 / r.duration_ms.max(1) as f64).min(1.0),
                heal: r
                    .details
                    .heal_skills
                    .iter()
                    .filter(|s| s.actor_id == a.actor_id)
                    .map(|s| s.dmg as i64)
                    .sum(),
                damage_taken: a.damage_received,
                deaths: death_ms().len() as i32,
                death_ms: death_ms(),
                damage_bins: bins.iter().map(|d| d.round() as i64).collect(),
                gear_score: a.gear_score,
                combat_power: a.combat_power,
            }
        })
        .filter(|p| p.damage > 0)
        .collect();
    players.sort_by_key(|p| std::cmp::Reverse(p.damage));
    FightSummary {
        id: r.id.clone(),
        boss_name: r.boss_name.clone(),
        start_time_ms: r.start_time_ms,
        duration_ms: r.duration_ms,
        total_damage: r.total_damage as i64,
        killed: r.details.max_hp > 0 && r.total_damage as i64 >= r.details.max_hp as i64,
        players,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill(
        actor: i32,
        dmg: i32,
        hits: i32,
        crit: i32,
        back: i32,
        dot: bool,
    ) -> serde_json::Value {
        serde_json::json!({"actorId": actor, "code": 1, "name": "s", "time": hits, "dmg": dmg,
            "multiHitCount": 0, "multiHitDamage": 0, "crit": crit, "parry": 0, "back": back,
            "perfect": 0, "double": 0, "regen": 0, "isDot": dot})
    }

    #[test]
    fn active_time_skips_long_pauses() {
        // 0→2s and 2→5s count; the 10s pause doesn't; 15→16s counts. Order doesn't matter.
        assert_eq!(active_ms(vec![15_000, 0, 2_000, 5_000, 16_000]), 6_000);
        assert_eq!(active_ms(vec![]), 0);
    }

    #[test]
    fn damage_is_binned_by_hit_time() {
        let mut s = skill(7, 900, 3, 0, 0, false);
        s["hitTimestamps"] = serde_json::json!([1_000, 31_000, 65_000]);
        let record: FightRecord = serde_json::from_value(serde_json::json!({
            "id": "auto_1_2", "bossName": "Boss", "targetId": 1, "startTimeMs": 0,
            "durationMs": 61_000, "totalDamage": 900, "jobs": [],
            "details": {"targetId": 1, "maxHp": 0, "totalTargetDamage": 900, "battleTime": 61_000,
                "skills": [s], "healSkills": []},
            "actors": [{"actorId": 7, "nickname": "A"}]
        }))
        .unwrap();
        // The last hit, past the recorded length, lands in the last slice.
        assert_eq!(summarize(&record).players[0].damage_bins, vec![300, 300, 300]);
    }

    #[test]
    fn summary_has_each_players_rates_heals_and_deaths() {
        let record: FightRecord = serde_json::from_value(serde_json::json!({
            "id": "auto_1_2", "bossName": "Boss", "targetId": 1, "startTimeMs": 0,
            "durationMs": 10_000, "totalDamage": 1300, "jobs": [],
            "details": {"targetId": 1, "maxHp": 1000, "totalTargetDamage": 1300, "battleTime": 10_000,
                "skills": [skill(7, 1000, 10, 4, 2, false), skill(7, 200, 30, 30, 30, true), skill(8, 100, 5, 0, 5, false)],
                "healSkills": [skill(8, 300, 3, 0, 0, false), skill(8, 50, 1, 0, 0, true)],
                "deaths": [{"actorId": 7, "tsMs": 1000}, {"actorId": 7, "tsMs": 5000}]},
            "actors": [
                {"actorId": 7, "nickname": "A", "damageReceived": 900, "gearScore": 1700, "combatPower": 80000},
                {"actorId": 8, "nickname": "B"}
            ]
        }))
        .unwrap();
        let s = summarize(&record);
        assert!(s.killed);
        let a = &s.players[0];
        assert_eq!(
            (a.name.as_str(), a.damage, a.deaths, a.damage_taken, a.heal),
            ("A", 1200, 2, 900, 0)
        );
        assert_eq!(a.death_ms, vec![1000, 5000]);
        // The DoT's hits don't count toward the rates.
        assert_eq!((a.crit_rate, a.back_rate), (0.4, 0.2));
        assert_eq!((a.gear_score, a.combat_power), (1700, 80000));
        let b = &s.players[1];
        assert_eq!((b.heal, b.deaths, b.back_rate), (350, 0, 1.0));
    }
}
