//! Kina picked up while farming, counted as the Linux overlay's MeterClient
//! does: the daemon states only the balance.
use serde::{Deserialize, Serialize};

/// Only rises count, so spending doesn't sink the rate, and a session ends 5
/// minutes after its last gain.
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

    /// Ends the session: the next kina picked up starts a new one.
    pub fn reset(&mut self) {
        self.gained = 0;
        self.first = 0;
        self.start_ms = 0;
        self.last_ms = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kina_counts_rises_only_and_restarts_after_five_idle_minutes() {
        let mut k = Kina::default();
        // The first balance is a baseline, not a gain.
        k.update(10_000, 500, 1_000);
        assert_eq!((k.gained, k.last_ms), (0, 0));
        k.update(10_100, 600, 2_000);
        assert_eq!((k.gained, k.first, k.start_ms), (100, 100, 2_000));
        k.update(10_300, 800, 12_000);
        // Spending doesn't count.
        k.update(9_000, 800, 13_000);
        assert_eq!(k.gained, 300);
        // A gain after 5 idle minutes opens a new session.
        k.update(9_050, 850, 12_000 + KINA_SESSION_MS + 1);
        assert_eq!((k.gained, k.first), (50, 50));
        assert_eq!(k.daily, 850);
    }

    #[test]
    fn reset_keeps_the_balance_and_starts_over() {
        let mut k = Kina::default();
        k.update(100, 0, 1_000);
        k.update(200, 100, 2_000);
        k.reset();
        assert_eq!((k.gained, k.last_ms, k.balance), (0, 0, 200));
        k.update(260, 160, 3_000);
        assert_eq!((k.gained, k.first, k.start_ms), (60, 60, 3_000));
    }
}
