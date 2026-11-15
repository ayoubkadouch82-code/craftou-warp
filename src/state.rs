//! Shared application state: collaboration rooms + on-disk project store.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub color: String,
    pub role: String,
}

pub struct Room {
    pub tx: broadcast::Sender<String>,
    pub peers: HashMap<String, Peer>,
    /// Latest full project snapshot broadcast by the host, used to catch late joiners up.
    pub snapshot: Option<String>,
    pub revision: u64,
}

impl Default for Room {
    fn default() -> Self {
        Self::new()
    }
}

impl Room {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(512);
        Self {
            tx,
            peers: HashMap::new(),
            snapshot: None,
            revision: 0,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub rooms: Arc<Mutex<HashMap<String, Room>>>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        let dir = dir.into();
        let _ = std::fs::create_dir_all(dir.join("projects"));
        Self {
            rooms: Arc::new(Mutex::new(HashMap::new())),
            data_dir: dir,
        }
    }
}

/// Six character room code, unambiguous (no 0/O/1/I).
pub fn room_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut x = seed ^ (std::process::id() as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    let mut out = String::with_capacity(6);
    for _ in 0..6 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        out.push(ALPHABET[(x % ALPHABET.len() as u64) as usize] as char);
    }
    out
}

pub fn peer_color(index: usize) -> String {
    const COLORS: [&str; 10] = [
        "#ff661a", "#4c97ff", "#9966ff", "#cf63cf", "#40bf4a", "#0fbd8c", "#ffab19", "#ec5959",
        "#855cd6", "#29beb6",
    ];
    COLORS[index % COLORS.len()].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn room_codes_are_short_and_readable() {
        for _ in 0..50 {
            let code = room_code();
            assert_eq!(code.len(), 6);
            assert!(code.chars().all(|c| "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".contains(c)));
            assert!(!code.contains('0') && !code.contains('O') && !code.contains('1'));
        }
    }

    #[test]
    fn rooms_start_empty() {
        let room = Room::new();
        assert!(room.peers.is_empty());
        assert!(room.snapshot.is_none());
        assert_eq!(room.revision, 0);
    }
}
