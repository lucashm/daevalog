//! Your kina balance. The game states it as an item stack update (found in our
//! own capture, 2026-11-17, against 4,912,459 then 4,912,643 in the bag):
//!
//! ```text
//! A6 FF  kina toward today's gain limit: u64, then a timestamp u64 (ms); just before the 1B 56
//! A5 FF  the same, at login
//! 1B 56  item stack: ..., item type u32 at body 11 (kina: 3F 33 70 37), count u64 at body 15
//! 11 56  your bag, at login: <instance u64> <item u32> <count u64> ... (see cubes.rs)
//! ```
//!
//! Login values checked 2026-11-17 against 4,954,107 kina and 122,778 / 1,000,000 daily.

use std::sync::atomic::{AtomicI64, Ordering};

use a2tools::capture::stream_processor::read_varint;

const KINA: [u8; 4] = [0x3F, 0x33, 0x70, 0x37];

static BALANCE: AtomicI64 = AtomicI64::new(-1);
static DAILY: AtomicI64 = AtomicI64::new(-1);

/// Kina counted toward today's gain limit; -1 before any.
pub fn daily() -> i64 {
    DAILY.load(Ordering::Relaxed)
}

/// Your last stated kina; -1 before any.
pub fn get() -> i64 {
    BALANCE.load(Ordering::Relaxed)
}

/// One game frame: `<length varint> <type, 2 bytes> <body>`.
pub fn frame(packet: &[u8]) {
    match read(packet) {
        Some(Kina::Balance(k)) => BALANCE.store(k, Ordering::Relaxed),
        Some(Kina::Daily(k)) => DAILY.store(k, Ordering::Relaxed),
        None => {}
    }
}

#[derive(Debug, PartialEq)]
enum Kina {
    Balance(i64),
    Daily(i64),
}

fn u64_at(body: &[u8], at: usize) -> Option<i64> {
    i64::try_from(u64::from_le_bytes(body.get(at..at + 8)?.try_into().ok()?)).ok()
}

fn read(packet: &[u8]) -> Option<Kina> {
    let at = read_varint(packet, 0).length;
    if at <= 0 {
        return None;
    }
    let at = at as usize;
    let body = packet.get(at + 2..)?;
    match packet.get(at..at + 2)? {
        [0xA6 | 0xA5, 0xFF] if body.len() == 16 => Some(Kina::Daily(u64_at(body, 0)?)),
        [0x1B, 0x56] if body.get(11..15)? == KINA => Some(Kina::Balance(u64_at(body, 15)?)),
        // The bag: kina's item id, then its count; an id can turn up by chance, a real balance is below 100 billion.
        [0x11, 0x56] => body
            .windows(4)
            .enumerate()
            .filter(|(_, w)| *w == KINA)
            .find_map(|(i, _)| u64_at(body, i + 4).filter(|k| *k < 100_000_000_000))
            .map(Kina::Balance),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        s.split_whitespace().map(|b| u8::from_str_radix(b, 16).unwrap()).collect()
    }

    #[test]
    fn reads_kina_and_skips_other_stacks() {
        // The length varint is the parser's own; any one-byte value does here.
        let kina = hex("2B 1B 56 01 01 00 3E 35 08 00 00 6C 02 00 3F 33 70 37 4B F5 4A 00 00 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 0B 00 00");
        assert_eq!(read(&kina), Some(Kina::Balance(4_912_459)));
        assert_eq!(read(&hex("13 A6 FF A2 3D 01 00 00 00 00 00 4D 80 5F EB A1 01 00 00")), Some(Kina::Daily(81_314)));
        assert_eq!(read(&hex("13 A5 FF 9A DF 01 00 00 00 00 00 5F 2D 64 EB A1 01 00 00")), Some(Kina::Daily(122_778)));
        // Real bytes around kina in a login bag.
        let bag = hex("2B 11 56 00 00 00 00 33 D5 06 00 00 55 02 00 3F 33 70 37 FB 97 4B 00 00 00 00 00 01 00 00 00");
        assert_eq!(read(&bag), Some(Kina::Balance(4_954_107)));
        let other = hex("2B 1B 56 01 00 00 52 FF 0B 00 00 4F 00 00 5C 44 DE 1F 01 00 00 00 00 00 00 00 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 05 00 00");
        assert_eq!(read(&other), None);
        assert_eq!(read(&hex("2B 1B 56 01 01 00")), None);
    }
}
