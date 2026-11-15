//! Real-time collaboration.
//!
//! The server is a thin, extremely fast relay: rooms hold a roster, a broadcast
//! channel and the last full snapshot so that a friend joining mid-session is
//! instantly caught up. All document logic stays in the editor (op based), which
//! keeps the binary tiny and latency low.

use crate::state::{peer_color, AppState, Peer};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use serde::Deserialize;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;

#[derive(Deserialize)]
pub struct JoinQuery {
    pub room: Option<String>,
    pub role: Option<String>,
    pub name: Option<String>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(st): State<AppState>,
    Query(q): Query<JoinQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| client_loop(socket, st, q))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

async fn client_loop(mut socket: WebSocket, st: AppState, q: JoinQuery) {
    let room_key = q
        .room
        .unwrap_or_default()
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>();

    if room_key.len() < 4 {
        let _ = socket
            .send(Message::Text(
                json!({"t":"error","code":"bad-room","message":"Room code is invalid"}).to_string(),
            ))
            .await;
        let _ = socket.close().await;
        return;
    }

    let wanted_role = if q.role.as_deref() == Some("host") { "host" } else { "guest" };
    let name = q
        .name
        .unwrap_or_else(|| "Guest".into())
        .chars()
        .take(28)
        .collect::<String>();

    // ---- join ------------------------------------------------------------
    // Everything that touches the room map happens inside this block so that no
    // `MutexGuard` is alive across an `.await` (the handler future must be Send).
    enum Joined {
        Ok {
            id: String,
            color: String,
            role: String,
            peers: Vec<Value>,
            snapshot: Option<Value>,
            revision: u64,
            tx: broadcast::Sender<String>,
        },
        NotFound,
        HostTaken,
    }

    let outcome = {
        let mut rooms = st.rooms.lock().unwrap();
        match rooms.get_mut(&room_key) {
            None => Joined::NotFound,
            Some(room) => {
                let host_present = room.peers.values().any(|p| p.role == "host");
                if wanted_role == "host" && host_present {
                    Joined::HostTaken
                } else {
                    let id = format!("p{}_{}", now_ms() % 100_000, room.peers.len() + 1);
                    let color = peer_color(room.peers.len());
                    let mut peer = Peer {
                        id: id.clone(),
                        name: name.clone(),
                        color: color.clone(),
                        role: "guest".to_string(),
                    };
                    if wanted_role == "host" {
                        peer.role = "host".to_string();
                    }
                    let role = peer.role.clone();
                    room.peers.insert(id.clone(), peer);
                    let peers: Vec<Value> = room
                        .peers
                        .values()
                        .map(|p| json!({"id": p.id, "name": p.name, "color": p.color, "role": p.role}))
                        .collect();
                    let snapshot = room
                        .snapshot
                        .as_ref()
                        .and_then(|s| serde_json::from_str::<Value>(s).ok());
                    Joined::Ok {
                        id,
                        color,
                        role,
                        peers,
                        snapshot,
                        revision: room.revision,
                        tx: room.tx.clone(),
                    }
                }
            }
        }
    };

    let (id, color, role, peers, snapshot, revision, tx) = match outcome {
        Joined::NotFound => {
            let _ = socket
                .send(Message::Text(
                    json!({"t":"error","code":"room-not-found","message":"No live session with that code"})
                        .to_string(),
                ))
                .await;
            let _ = socket.close().await;
            return;
        }
        Joined::HostTaken => {
            let _ = socket
                .send(Message::Text(
                    json!({"t":"error","code":"host-taken","message":"This session already has a host"})
                        .to_string(),
                ))
                .await;
            let _ = socket.close().await;
            return;
        }
        Joined::Ok {
            id,
            color,
            role,
            peers,
            snapshot,
            revision,
            tx,
        } => (id, color, role, peers, snapshot, revision, tx),
    };

    let mut rx = tx.subscribe();

    let welcome = json!({
        "t": "welcome",
        "id": id,
        "name": name,
        "color": color,
        "role": role,
        "room": room_key,
        "revision": revision,
        "peers": peers,
        "snapshot": snapshot,
        "serverTime": now_ms(),
    });
    if socket.send(Message::Text(welcome.to_string())).await.is_err() {
        leave(&st, &room_key, &id);
        return;
    }

    let _ = tx.send(
        json!({"t":"join","id":id,"name":name,"color":color,"role":role})
            .to_string(),
    );

    // ---- relay loop ------------------------------------------------------
    // Split so the socket can be read and written from the two select branches
    // without fighting the borrow checker.
    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let text = text.to_string();
                        if text.len() > 64 * 1024 * 1024 {
                            continue;
                        }
                        let Ok(mut value) = serde_json::from_str::<Value>(&text) else { continue };
                        let kind = value.get("t").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if kind.is_empty() || kind == "welcome" || kind == "join" || kind == "leave" {
                            continue;
                        }
                        if let Some(obj) = value.as_object_mut() {
                            obj.insert("from".into(), json!(id));
                            obj.insert("name".into(), json!(name));
                            obj.insert("color".into(), json!(color));
                            obj.insert("role".into(), json!(role));
                            obj.insert("at".into(), json!(now_ms()));
                        }

                        if kind == "state" {
                            // Cache the canonical project snapshot for late joiners.
                            let mut rooms = st.rooms.lock().unwrap();
                            if let Some(room) = rooms.get_mut(&room_key) {
                                room.snapshot = Some(value.to_string());
                                room.revision += 1;
                                value["revision"] = json!(room.revision);
                            }
                        }
                        let _ = tx.send(value.to_string());
                    }
                    Some(Ok(Message::Binary(_)) | Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Ping(p))) => {
                        let _ = sender.send(Message::Pong(p)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                }
            }
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(text) => {
                        if sender.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    }

    drop(sender);
    drop(receiver);
    leave(&st, &room_key, &id);
}

fn leave(st: &AppState, room_key: &str, id: &str) {
    let mut rooms = st.rooms.lock().unwrap();
    let Some(room) = rooms.get_mut(room_key) else {
        return;
    };
    if let Some(peer) = room.peers.remove(id) {
        let _ = room.tx.send(
            json!({"t":"leave","id":peer.id,"name":peer.name,"role":peer.role}).to_string(),
        );
        if peer.role == "host" {
            let _ = room.tx.send(json!({"t":"host-left"}).to_string());
        }
    }
    if room.peers.is_empty() {
        rooms.remove(room_key);
    }
}
