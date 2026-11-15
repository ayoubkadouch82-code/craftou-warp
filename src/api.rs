//! HTTP API: health, runtime config, collaboration rooms, project store.

use crate::state::{room_code, AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

type ApiResult<T> = Result<T, (StatusCode, String)>;

fn bad(msg: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, msg.into())
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub async fn health(State(st): State<AppState>) -> Json<Value> {
    let rooms = st.rooms.lock().map(|r| r.len()).unwrap_or(0);
    Json(json!({
        "ok": true,
        "name": "CRAFT WARP",
        "version": env!("CARGO_PKG_VERSION"),
        "rooms": rooms,
        "runtime": "rust",
    }))
}

pub async fn config() -> Json<Value> {
    Json(json!({
        "name": "CRAFT WARP",
        "version": env!("CARGO_PKG_VERSION"),
        "runtime": "rust",
        "repository": "https://github.com/ayoubkadouch82-code/craftou-warp",
        "releaseUrl": "https://github.com/ayoubkadouch82-code/craftou-warp/releases/latest",
        "maxProjectBytes": 64 * 1024 * 1024,
        "collab": true,
    }))
}

pub async fn create_room(State(st): State<AppState>) -> Json<Value> {
    let mut rooms = st.rooms.lock().unwrap();
    let mut code = room_code();
    let mut guard = 0;
    while rooms.contains_key(&code) && guard < 32 {
        code = room_code();
        guard += 1;
    }
    rooms.insert(code.clone(), crate::state::Room::new());
    Json(json!({ "code": code }))
}

pub async fn room_info(
    State(st): State<AppState>,
    Path(code): Path<String>,
) -> Json<Value> {
    let code = code.to_uppercase();
    let rooms = st.rooms.lock().unwrap();
    match rooms.get(&code) {
        Some(room) => Json(json!({
            "exists": true,
            "code": code,
            "revision": room.revision,
            "hasSnapshot": room.snapshot.is_some(),
            "peers": room.peers.values().map(|p| json!({
                "id": p.id, "name": p.name, "color": p.color, "role": p.role
            })).collect::<Vec<_>>(),
        })),
        None => Json(json!({ "exists": false, "code": code, "peers": [] })),
    }
}

pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if c.is_alphanumeric() {
            // keep unicode letters (Arabic project names are common) 
            out.push(c);
        } else if (c == '-' || c == '_' || c == ' ') && !out.ends_with('-') {
            out.push('-');
        }
        if out.chars().count() >= 48 {
            break;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("project-{}", now_secs())
    } else {
        trimmed
    }
}

pub async fn list_projects(State(st): State<AppState>) -> Json<Value> {
    let dir = st.data_dir.join("projects");
    let mut items: Vec<Value> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Ok(raw) = std::fs::read_to_string(&path) else { continue };
            let Ok(doc) = serde_json::from_str::<Value>(&raw) else { continue };
            let updated = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            items.push(json!({
                "id": doc.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                "name": doc.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled"),
                "updated": updated,
                "sprites": doc.get("project").and_then(|p| p.get("targets"))
                    .and_then(|t| t.as_array()).map(|t| t.len().saturating_sub(1)).unwrap_or(0),
            }));
        }
    }
    items.sort_by(|a, b| {
        b["updated"].as_u64().unwrap_or(0).cmp(&a["updated"].as_u64().unwrap_or(0))
    });
    Json(json!({ "projects": items }))
}

#[derive(Deserialize)]
pub struct SaveBody {
    pub name: Option<String>,
    pub project: Option<Value>,
}

pub async fn save_project(
    State(st): State<AppState>,
    Json(body): Json<SaveBody>,
) -> ApiResult<Json<Value>> {
    let project = body.project.ok_or_else(|| bad("missing project"))?;
    let name = body
        .name
        .or_else(|| project.get("name").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_else(|| "Untitled".into());
    let id = slug(&name);
    write_doc(&st, &id, &name, project)?;
    Ok(Json(json!({ "ok": true, "id": id, "name": name })))
}

pub async fn save_project_by_id(
    State(st): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SaveBody>,
) -> ApiResult<Json<Value>> {
    let project = body.project.ok_or_else(|| bad("missing project"))?;
    let name = body
        .name
        .or_else(|| project.get("name").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_else(|| id.clone());
    write_doc(&st, &slug(&id), &name, project)?;
    Ok(Json(json!({ "ok": true, "id": slug(&id), "name": name })))
}

fn write_doc(st: &AppState, id: &str, name: &str, project: Value) -> ApiResult<()> {
    let dir = st.data_dir.join("projects");
    std::fs::create_dir_all(&dir).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let doc = json!({
        "id": id,
        "name": name,
        "updated": now_secs(),
        "project": project,
    });
    let tmp = dir.join(format!(".{id}.tmp"));
    let final_path = dir.join(format!("{id}.json"));
    let encoded = serde_json::to_vec(&doc)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    std::fs::write(&tmp, encoded)
        .and_then(|_| std::fs::rename(&tmp, &final_path))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(())
}

pub async fn load_project(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let path = st.data_dir.join("projects").join(format!("{}.json", slug(&id)));
    let raw = std::fs::read_to_string(&path)
        .map_err(|_| (StatusCode::NOT_FOUND, "project not found".to_string()))?;
    let doc = serde_json::from_str::<Value>(&raw)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(doc))
}

pub async fn delete_project(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let path = st.data_dir.join("projects").join(format!("{}.json", slug(&id)));
    std::fs::remove_file(&path)
        .map_err(|_| (StatusCode::NOT_FOUND, "project not found".to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_keeps_letters_and_dashes() {
        assert_eq!(slug("My Project!"), "my-project");
        assert_eq!(slug("space   out"), "space-out");
        assert_eq!(slug("--trim--"), "trim");
        assert_eq!(slug("مشروعي"), "مشروعي");
        assert!(!slug("!!!").is_empty());
    }

    #[test]
    fn slug_is_bounded() {
        let long = "a".repeat(200);
        assert!(slug(&long).chars().count() <= 48);
    }
}
