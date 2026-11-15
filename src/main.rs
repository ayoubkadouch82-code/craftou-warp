//! CRAFT WARP — server entry point.
//!
//! A single small binary that serves the whole editor (embedded static assets),
//! a tiny project store on disk, and the real-time collaboration WebSocket.

mod api;
mod assets;
mod collab;
mod state;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use state::AppState;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

const BANNER: &str = r#"
   ________  ____   _____ ______     __        __   ____  ____
  / ____/ _ \/ __ \/ ___//_  __/    / /       / /  / __ \/ __ \
 / /   / , _/ /_/ / /__   / /      / /___    / /__/ /_/ / /_/ /
/_/   /_/|_|\____/\___/  /_/      /_____/   /____/\____/ ____/
                              CRAFT WARP  —  v0.1.0
"#;

fn parse_addr() -> SocketAddr {
    let mut host = std::env::var("CW_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let mut port: u16 = std::env::var("CW_PORT")
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" | "-p" => {
                if let Some(v) = args.get(i + 1).and_then(|v| v.parse().ok()) {
                    port = v;
                }
                i += 1;
            }
            "--host" => {
                if let Some(v) = args.get(i + 1) {
                    host = v.clone();
                }
                i += 1;
            }
            "--help" | "-h" => {
                println!("CRAFT WARP\n\n  craftwarp [--port 8080] [--host 0.0.0.0]\n\nEnv: CW_PORT, CW_HOST, CW_DATA_DIR");
                std::process::exit(0);
            }
            _ => {}
        }
        i += 1;
    }

    format!("{host}:{port}").parse().unwrap_or_else(|_| {
        SocketAddr::new(std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED), port)
    })
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=warn".into()),
        )
        .with_target(false)
        .compact()
        .init();

    let data_dir = std::env::var("CW_DATA_DIR").unwrap_or_else(|_| "craftwarp-data".into());
    let state = AppState::new(data_dir.clone());

    let app = Router::new()
        .route("/api/health", get(api::health))
        .route("/api/config", get(api::config))
        .route("/api/rooms", post(api::create_room))
        .route("/api/rooms/:code", get(api::room_info))
        .route("/api/projects", get(api::list_projects).post(api::save_project))
        .route(
            "/api/projects/:id",
            get(api::load_project)
                .put(api::save_project_by_id)
                .delete(api::delete_project),
        )
        .route("/ws", get(collab::ws_handler))
        .fallback(assets::serve)
        .layer(DefaultBodyLimit::max(96 * 1024 * 1024))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = parse_addr();
    println!("{BANNER}");
    println!("  Editor      http://localhost:{}", addr.port());
    println!("  Projects    {}", data_dir);
    println!("  Stop        Ctrl+C\n");

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Could not bind {addr}: {e}");
            std::process::exit(1);
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("server error: {e}");
    }
}
