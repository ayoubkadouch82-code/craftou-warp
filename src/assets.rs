//! Embedded editor assets — the released .exe is a single file, no install step.

use axum::body::Body;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use include_dir::{include_dir, Dir};

pub static FILES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/static");

fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "txt" | "md" => "text/plain; charset=utf-8",
        "webmanifest" => "application/manifest+json",
        _ => "application/octet-stream",
    }
}

pub async fn serve(uri: Uri) -> Response {
    let raw = uri.path().trim_start_matches('/');
    let path = if raw.is_empty() { "index.html" } else { raw };

    let file = FILES
        .get_file(path)
        .or_else(|| FILES.get_file(format!("{path}/index.html")))
        .or_else(|| FILES.get_file("index.html"));

    match file {
        Some(file) => {
            let name = file.path().to_string_lossy().to_string();
            let cache = if name.ends_with("index.html") {
                "no-store"
            } else {
                "public, max-age=3600"
            };
            (
                [
                    (header::CONTENT_TYPE, mime_for(&name)),
                    (header::CACHE_CONTROL, cache),
                    (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
                ],
                Body::from(file.contents().to_vec()),
            )
                .into_response()
        }
        None => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}
