//! Your own combat power, which A2Tools only takes from the party roster: a
//! player with no party, or whose roster came before the meter started, had
//! none. Two frames state it for you alone (found in our own capture,
//! 2026-10-21, against the 106.8K the character window showed):
//!
//! ```text
//! 56 36  combat power changed: now u64 (buffs move it in a fight), a peak u64
//! 33 36  your self record (on zone loads): ..., combat power u64, peak u64, then 65 bytes
//! ```
//!
//! We take "now", which the HUD shows. The peak only climbs and isn't your CP:
//! it read 232.2K while the HUD showed 193.0K (2026-11-09). "Now" dips under a
//! boss debuff (123.5K read 110K mid-fight, 2026-10-24); that's true for the moment.

use std::sync::atomic::{AtomicI64, Ordering};

use a2tools::capture::stream_processor::read_varint;

static OWN_CP: AtomicI64 = AtomicI64::new(0);

/// Your last stated combat power; 0 before any.
pub fn get() -> i64 {
    OWN_CP.load(Ordering::Relaxed)
}

/// One game frame: `<length varint> <type, 2 bytes> <body>`.
pub fn frame(packet: &[u8]) {
    if let Some(cp) = read(packet) {
        OWN_CP.store(cp, Ordering::Relaxed);
    }
}

fn u64_at(packet: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_le_bytes(packet.get(at..at + 8)?.try_into().ok()?))
}

fn read(packet: &[u8]) -> Option<i64> {
    let at = read_varint(packet, 0).length;
    if at <= 0 {
        return None;
    }
    let at = at as usize;
    let cp = match packet.get(at..at + 2)? {
        [0x56, 0x36] => u64_at(packet, at + 2)?,
        // shortcut: only a main's record has the pair at this distance from its end (an alt's reads as nothing, 2026-11-02), so it can't be relied on; the 56 36 before it says the same.
        [0x33, 0x36] => {
            let peak = packet.len().checked_sub(65)?;
            let (now, peak) = (u64_at(packet, peak.checked_sub(8)?)?, u64_at(packet, peak)?);
            // The peak is never below "now"; if it is, these aren't the pair.
            if now == 0 || now > peak {
                return None;
            }
            now
        }
        _ => return None,
    };
    // The roster parser's bound: anything larger is not a combat power.
    (1..=100_000_000).contains(&cp).then_some(cp as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    /// A self record's head, then the last 80 bytes of a real one.
    fn record() -> Vec<u8> {
        let mut r = hex("ce123336");
        r.extend(vec![0u8; 100]);
        r.extend(hex(
            "0000000000000061a101000000000042a301000000000005019a010200000325000400000500000501120102000003250004000005000003010000001f00000002000000370000000400000001000000",
        ));
        r
    }

    #[test]
    fn reads_the_change_frame_and_the_self_record() {
        assert_eq!(read(&hex("16563661a101000000000042a3010000000000")), Some(106_849));
        // Mid-fight: now sunk to 110,596 under a debuff, peak 123,536; we show now.
        assert_eq!(read(&hex("16563604b001000000000090e2010000000000")), Some(110_596));
        assert_eq!(read(&record()), Some(106_849));
    }

    #[test]
    fn ignores_other_frames_and_nonsense() {
        assert_eq!(read(&hex("0e003624365e5ca1010000")), None);
        // A self record too short to hold the field.
        assert_eq!(read(&hex("0533360102")), None);
        // "Now" above the peak: not the pair.
        let mut r = record();
        let n = r.len();
        r[n - 72] = 0xff;
        assert_eq!(read(&r), None);
        // A value past the bound.
        assert_eq!(read(&hex("16563600000000000000014ca1010000000000")), None);
    }
}
