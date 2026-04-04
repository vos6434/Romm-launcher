use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};

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
    let key = api_key.trim();
    if key.is_empty() {
        return Ok(None);
    }
    let q = search_query.trim();
    if q.is_empty() {
        return Ok(None);
    }

    let client = reqwest::Client::builder()
        .https_only(true)
        .user_agent("RomM-Launcher/0.1")
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let Some(game_id) = sgdb_game_id_for_query(&client, key, q).await? else {
        return Ok(None);
    };

    let heroes_url = format!(
        "{SGDB_BASE}/heroes/game/{game_id}?types=static&nsfw=false&humor=false"
    );

    let res = client
        .get(&heroes_url)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", key),
        )
        .send()
        .await
        .map_err(|e| format!("SteamGridDB heroes failed: {e}"))?;

    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;

    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("SteamGridDB heroes ({}): {}", status, snippet));
    }

    let heroes_json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("SteamGridDB heroes JSON: {e}"))?;

    let urls = sgdb_all_image_urls(&heroes_json);
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
    let key = api_key.trim();
    if key.is_empty() {
        return Ok(None);
    }
    let q = search_query.trim();
    if q.is_empty() {
        return Ok(None);
    }

    let client = reqwest::Client::builder()
        .https_only(true)
        .user_agent("RomM-Launcher/0.1")
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let Some(game_id) = sgdb_game_id_for_query(&client, key, q).await? else {
        return Ok(None);
    };

    let grids_url = format!(
        "{SGDB_BASE}/grids/game/{game_id}?types=static&nsfw=false&humor=false"
    );

    let res = client
        .get(&grids_url)
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", key),
        )
        .send()
        .await
        .map_err(|e| format!("SteamGridDB grids failed: {e}"))?;

    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;

    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("SteamGridDB grids ({}): {}", status, snippet));
    }

    let grids_json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("SteamGridDB grids JSON: {e}"))?;

    let urls = sgdb_all_image_urls(&grids_json);
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
            steamgriddb_hero_url,
            steamgriddb_hero_url_at,
            steamgriddb_grid_url_at
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
