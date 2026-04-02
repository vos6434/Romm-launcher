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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![romm_login])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
