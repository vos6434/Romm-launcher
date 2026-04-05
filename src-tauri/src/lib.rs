use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    token_type: String,
    expires: i64,
    refresh_expires: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginOk {
    pub access_token: String,
    pub token_type: String,
    pub expires: i64,
    pub refresh_token: String,
    pub refresh_expires: i64,
    pub api_base: String,
}

fn normalize_base_url(host: &str) -> Result<String, String> {
    let mut s = host.trim().to_string();
    if s.is_empty() {
        return Err("RomM host is required.".to_string());
    }
    if !s.starts_with("http://") && !s.starts_with("https://") {
        s = format!("http://{s}");
    }
    Ok(s.trim_end_matches('/').to_string())
}

fn format_error_body(status: reqwest::StatusCode, body: &str) -> String {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(body) else {
        return format!(
            "Request failed ({}). {}",
            status,
            body.chars().take(200).collect::<String>()
        );
    };
    match v.get("detail") {
        Some(serde_json::Value::String(s)) => format!("{s} ({status})"),
        Some(serde_json::Value::Array(arr)) => {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(|item| {
                    item
                        .get("msg")
                        .and_then(|m| m.as_str())
                        .map(std::string::ToString::to_string)
                })
                .collect();
            if parts.is_empty() {
                format!("Request failed ({status})")
            } else {
                format!("{} ({status})", parts.join("; "))
            }
        }
        _ => format!("Request failed ({status})"),
    }
}

fn to_absolute_url(base: &str, candidate: &str) -> String {
    let trimmed = candidate.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    if trimmed.starts_with('/') {
        return format!("{base}{trimmed}");
    }
    format!("{base}/{}", trimmed.trim_start_matches('/'))
}

fn download_url_candidates(
    base: &str,
    rom_id: &str,
    file_name: Option<&str>,
    download_url: Option<&str>,
) -> Vec<String> {
    let mut candidates = Vec::<String>::new();

    if let Some(raw) = download_url {
        let t = raw.trim();
        if !t.is_empty() {
            candidates.push(to_absolute_url(base, t));
        }
    }

    let rid = rom_id.trim();
    if rid.is_empty() {
        return candidates;
    }

    let encoded_name = file_name
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(urlencoding::encode)
        .map(|v| v.to_string());

    candidates.push(format!("{base}/api/roms/{rid}/download"));
    candidates.push(format!("{base}/api/roms/{rid}/content"));
    if let Some(name) = encoded_name {
        candidates.push(format!("{base}/api/roms/{rid}/content/{name}"));
        candidates.push(format!("{base}/api/roms/{rid}/download/{name}"));
    }

    let mut seen = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|u| seen.insert(u.clone()))
        .collect()
}

/// OAuth2 password grant against RomM `/api/token`.
/// Scopes are a subset typical for browsing and downloading (viewer-capable).
#[tauri::command]
async fn romm_login(host: String, username: String, password: String) -> Result<LoginOk, String> {
    let base = normalize_base_url(&host)?;
    let url = format!("{base}/api/token");

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let scope = "roms.read collections.read platforms.read me.read";
    let form = [
        ("grant_type", "password"),
        ("username", username.as_str()),
        ("password", password.as_str()),
        ("scope", scope),
    ];

    let res = client
        .post(&url)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .form(&form)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed to connect. Check the host URL and your network. ({e})"
            )
        })?;

    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format_error_body(status, &body));
    }

    let token: TokenResponse =
        serde_json::from_str(&body).map_err(|e| format!("Unexpected response: {e}"))?;

    Ok(LoginOk {
        access_token: token.access_token,
        token_type: token.token_type,
        expires: token.expires,
        refresh_token: token.refresh_token,
        refresh_expires: token.refresh_expires,
        api_base: base,
    })
}

/// Authenticated GET under `/api/{path}` (path without leading slash), returns response body text.
/// Optional `query` is appended as `?...` (e.g. `type=all` for virtual collections).
#[tauri::command]
async fn romm_api_get(
    api_base: String,
    access_token: String,
    path: String,
    query: Option<String>,
) -> Result<String, String> {
    let base = normalize_base_url(&api_base)?;
    let p = path.trim_start_matches('/');
    let mut url = format!("{base}/api/{p}");
    if let Some(q) = query {
        let q = q.trim();
        if !q.is_empty() {
            let q = q.strip_prefix('?').unwrap_or(q);
            url.push('?');
            url.push_str(q);
        }
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let res = client
        .get(&url)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", access_token.trim()),
        )
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format_error_body(status, &body));
    }

    Ok(body)
}

#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    let picked = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|e| format!("Folder picker failed: {e}"))?;
    Ok(picked.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
async fn local_path_exists(path: String) -> Result<bool, String> {
    let path = path.trim();
    if path.is_empty() {
        return Ok(false);
    }
    Ok(Path::new(path).exists())
}

#[tauri::command]
async fn open_local_folder(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Folder path is required.".to_string());
    }

    let requested = PathBuf::from(trimmed);
    let resolved = if requested.is_absolute() {
        requested
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Failed to resolve current directory: {e}"))?
            .join(requested)
    };

    std::fs::create_dir_all(&resolved)
        .map_err(|e| format!("Failed to create folder: {e}"))?;

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("explorer");
        c.arg(&resolved);
        c
    };

    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(&resolved);
        c
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(&resolved);
        c
    };

    cmd.spawn()
        .map_err(|e| format!("Failed to open folder in file manager: {e}"))?;

    Ok(())
}

#[tauri::command]
async fn romm_download_rom(
    api_base: String,
    access_token: String,
    rom_id: String,
    file_name: Option<String>,
    download_url: Option<String>,
    destination_path: String,
) -> Result<(), String> {
    let base = normalize_base_url(&api_base)?;
    let destination = destination_path.trim();
    if destination.is_empty() {
        return Err("Destination path is required.".to_string());
    }

    let candidate_urls = download_url_candidates(
        &base,
        &rom_id,
        file_name.as_deref(),
        download_url.as_deref(),
    );
    if candidate_urls.is_empty() {
        return Err("No download URL candidates available for this ROM.".to_string());
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let mut last_err: Option<String> = None;
    for url in &candidate_urls {
        let res = match client
            .get(url)
            .header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", access_token.trim()),
            )
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = Some(format!("Download request failed for {url}: {e}"));
                continue;
            }
        };

        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            last_err = Some(format_error_body(status, &body));
            continue;
        }

        let bytes = res
            .bytes()
            .await
            .map_err(|e| format!("Failed to read download body: {e}"))?;
        if bytes.is_empty() {
            last_err = Some("Download returned an empty file.".to_string());
            continue;
        }

        let target = PathBuf::from(destination);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination folder: {e}"))?;
        }
        std::fs::write(&target, &bytes)
            .map_err(|e| format!("Failed to save ROM to disk: {e}"))?;
        return Ok(());
    }

    Err(last_err.unwrap_or_else(|| "ROM download failed.".to_string()))
}

const SGDB_BASE: &str = "https://www.steamgriddb.com/api/v2";

fn sgdb_extract_first_game_id(value: &serde_json::Value) -> Option<i64> {
    let data = value.get("data")?;
    let arr = data.as_array()?;
    for item in arr {
        if let Some(id) = item.get("id").and_then(|x| x.as_i64()) {
            return Some(id);
        }
        if let Some(id) = item.get("id").and_then(|x| x.as_u64()) {
            return Some(id as i64);
        }
        if let Some(inner) = item.get("data") {
            if let Some(id) = inner.get("id").and_then(|x| x.as_i64()) {
                return Some(id);
            }
            if let Some(id) = inner.get("id").and_then(|x| x.as_u64()) {
                return Some(id as i64);
            }
        }
    }
    None
}

fn sgdb_all_image_urls(value: &serde_json::Value) -> Vec<String> {
    let mut out = Vec::new();
    let Some(data) = value.get("data") else {
        return out;
    };
    let Some(arr) = data.as_array() else {
        return out;
    };
    for item in arr {
        if let Some(url) = item.get("url").and_then(|x| x.as_str()) {
            if !url.is_empty() {
                out.push(url.to_string());
            }
        }
    }
    out
}

async fn sgdb_game_id_for_query(
    client: &reqwest::Client,
    key: &str,
    q: &str,
) -> Result<Option<i64>, String> {
    let search_url = format!(
        "{SGDB_BASE}/search/autocomplete/{}",
        urlencoding::encode(q)
    );

    let res = client
        .get(&search_url)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", key),
        )
        .send()
        .await
        .map_err(|e| format!("SteamGridDB search failed: {e}"))?;

    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;

    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("SteamGridDB search ({}): {}", status, snippet));
    }

    let search_json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("SteamGridDB search JSON: {e}"))?;

    Ok(sgdb_extract_first_game_id(&search_json))
}

async fn sgdb_image_urls_for_game(
    api_key: String,
    search_query: String,
    image_kind: &str,
) -> Result<Vec<String>, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Ok(Vec::new());
    }
    let q = search_query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .https_only(true)
        .user_agent("RomM-Launcher/0.1")
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let Some(game_id) = sgdb_game_id_for_query(&client, key, q).await? else {
        return Ok(Vec::new());
    };

    let images_url = format!(
        "{SGDB_BASE}/{image_kind}/game/{game_id}?types=static&nsfw=false&humor=false"
    );

    let res = client
        .get(&images_url)
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", key))
        .send()
        .await
        .map_err(|e| format!("SteamGridDB {image_kind} failed: {e}"))?;

    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;

    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(Vec::new());
    }
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("SteamGridDB {image_kind} ({}): {}", status, snippet));
    }

    let images_json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("SteamGridDB {image_kind} JSON: {e}"))?;
    Ok(sgdb_all_image_urls(&images_json))
}

#[tauri::command]
async fn steamgriddb_hero_urls(
    api_key: String,
    search_query: String,
) -> Result<Vec<String>, String> {
    sgdb_image_urls_for_game(api_key, search_query, "heroes").await
}

#[tauri::command]
async fn steamgriddb_grid_urls(
    api_key: String,
    search_query: String,
) -> Result<Vec<String>, String> {
    sgdb_image_urls_for_game(api_key, search_query, "grids").await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SteamGridImage {
    source_index: u64,
    url: String,
    width: Option<u64>,
    height: Option<u64>,
    score: Option<i64>,
    author: Option<String>,
    mime: Option<String>,
    created_at: Option<String>,
}

fn sgdb_parse_images(value: &serde_json::Value) -> Vec<SteamGridImage> {
    let mut out = Vec::new();
    let Some(arr) = value.get("data").and_then(|v| v.as_array()) else {
        return out;
    };

    for (idx, item) in arr.iter().enumerate() {
        let Some(url) = item.get("url").and_then(|x| x.as_str()) else {
            continue;
        };
        if url.is_empty() {
            continue;
        }

        let score = item
            .get("score")
            .and_then(|x| x.as_i64())
            .or_else(|| item.get("upvotes").and_then(|x| x.as_i64()));

        let author = item
            .get("author")
            .and_then(|a| a.get("name"))
            .and_then(|x| x.as_str())
            .map(std::string::ToString::to_string)
            .or_else(|| {
                item.get("author_name")
                    .and_then(|x| x.as_str())
                    .map(std::string::ToString::to_string)
            });

        out.push(SteamGridImage {
            source_index: idx as u64,
            url: url.to_string(),
            width: item.get("width").and_then(|x| x.as_u64()),
            height: item.get("height").and_then(|x| x.as_u64()),
            score,
            author,
            mime: item
                .get("mime")
                .and_then(|x| x.as_str())
                .map(std::string::ToString::to_string),
            created_at: item
                .get("created_at")
                .and_then(|x| x.as_str())
                .map(std::string::ToString::to_string),
        });
    }

    out
}

async fn sgdb_images_for_game(
    api_key: String,
    search_query: String,
    image_kind: &str,
    static_only: bool,
    include_nsfw: bool,
    include_humor: bool,
) -> Result<Vec<SteamGridImage>, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Ok(Vec::new());
    }
    let q = search_query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .https_only(true)
        .user_agent("RomM-Launcher/0.1")
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let Some(game_id) = sgdb_game_id_for_query(&client, key, q).await? else {
        return Ok(Vec::new());
    };

    let mut params = Vec::new();
    if static_only {
        params.push("types=static".to_string());
    }
    params.push(format!("nsfw={}", if include_nsfw { "true" } else { "false" }));
    params.push(format!("humor={}", if include_humor { "true" } else { "false" }));
    let images_url = format!("{SGDB_BASE}/{image_kind}/game/{game_id}?{}", params.join("&"));

    let res = client
        .get(&images_url)
        .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", key))
        .send()
        .await
        .map_err(|e| format!("SteamGridDB {image_kind} failed: {e}"))?;

    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;

    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(Vec::new());
    }
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("SteamGridDB {image_kind} ({}): {}", status, snippet));
    }

    let images_json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("SteamGridDB {image_kind} JSON: {e}"))?;
    Ok(sgdb_parse_images(&images_json))
}

#[tauri::command]
async fn steamgriddb_hero_images(
    api_key: String,
    search_query: String,
    static_only: bool,
    include_nsfw: bool,
    include_humor: bool,
) -> Result<Vec<SteamGridImage>, String> {
    sgdb_images_for_game(
        api_key,
        search_query,
        "heroes",
        static_only,
        include_nsfw,
        include_humor,
    )
    .await
}

#[tauri::command]
async fn steamgriddb_grid_images(
    api_key: String,
    search_query: String,
    static_only: bool,
    include_nsfw: bool,
    include_humor: bool,
) -> Result<Vec<SteamGridImage>, String> {
    sgdb_images_for_game(
        api_key,
        search_query,
        "grids",
        static_only,
        include_nsfw,
        include_humor,
    )
    .await
}

/// SteamGridDB hero image for fullscreen backgrounds ([API v2](https://www.steamgriddb.com/api)).
/// Searches by collection name, then loads static heroes for the first matching game.
#[tauri::command]
async fn steamgriddb_hero_url(api_key: String, search_query: String) -> Result<Option<String>, String> {
    steamgriddb_hero_url_at(api_key, search_query, 0).await
}

/// Same as [`steamgriddb_hero_url`], but picks `index` modulo the number of static heroes (for cycling).
#[tauri::command]
async fn steamgriddb_hero_url_at(
    api_key: String,
    search_query: String,
    index: u64,
) -> Result<Option<String>, String> {
    let urls = steamgriddb_hero_urls(api_key, search_query).await?;
    let i = index as usize;
    if i >= urls.len() {
        return Ok(None);
    }
    Ok(Some(urls[i].clone()))
}

/// SteamGridDB box-style grid art for a game; `index` selects modulo returned static grids.
#[tauri::command]
async fn steamgriddb_grid_url_at(
    api_key: String,
    search_query: String,
    index: u64,
) -> Result<Option<String>, String> {
    let urls = steamgriddb_grid_urls(api_key, search_query).await?;
    let i = index as usize;
    if i >= urls.len() {
        return Ok(None);
    }
    Ok(Some(urls[i].clone()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            romm_login,
            romm_api_get,
            pick_folder,
            local_path_exists,
            open_local_folder,
            romm_download_rom,
            steamgriddb_hero_url,
            steamgriddb_hero_urls,
            steamgriddb_hero_images,
            steamgriddb_hero_url_at,
            steamgriddb_grid_urls,
            steamgriddb_grid_images,
            steamgriddb_grid_url_at
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
