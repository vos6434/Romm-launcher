use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

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

fn libretro_core_extension() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        ".dll"
    }
    #[cfg(target_os = "macos")]
    {
        ".dylib"
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        ".so"
    }
}

fn core_candidates_for_platform(platform: &str) -> &'static [&'static str] {
    match platform {
        "nes" | "famicom" => &[
            "nestopia_libretro",
            "fceumm_libretro",
            "mesen_libretro",
            "quicknes_libretro",
        ],
        "snes" | "super-nintendo" | "sfc" => &["snes9x_libretro", "bsnes_libretro"],
        "n64" | "nintendo-64" => &["mupen64plus_next_libretro", "parallel_n64_libretro"],
        "game-boy" | "gb" => &["gambatte_libretro", "gearboy_libretro"],
        "game-boy-color" | "gbc" => &["gambatte_libretro", "gearboy_libretro"],
        "game-boy-advance" | "gba" => &["mgba_libretro", "gpsp_libretro"],
        "genesis" | "megadrive" | "mega-drive" | "sega-genesis" | "sega-mega-drive" => {
            &["genesis_plus_gx_libretro", "picodrive_libretro"]
        }
        "psx" | "ps1" | "playstation" => {
            &["pcsx_rearmed_libretro", "beetle_psx_hw_libretro", "beetle_psx_libretro"]
        }
        _ => &[],
    }
}

fn auto_core_path_from_platform(
    retro_arch_path: Option<&str>,
    platform_slug: Option<&str>,
) -> Option<String> {
    let platform = platform_slug
        .map(str::trim)
        .filter(|v| !v.is_empty())?
        .to_lowercase();
    let candidates = core_candidates_for_platform(&platform);
    if candidates.is_empty() {
        return None;
    }

    let mut candidate_dirs: Vec<PathBuf> = Vec::new();

    if let Some(ra_path) = retro_arch_path
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let ra = Path::new(ra_path);
        let base_dir = if ra.is_file() {
            ra.parent()
        } else if ra.is_dir() {
            Some(ra)
        } else {
            ra.parent()
        };

        if let Some(base) = base_dir {
            candidate_dirs.push(base.join("cores"));
        }

        // AppImage portable mode stores user config at <AppImage>.home.
        if ra_path.to_ascii_lowercase().ends_with(".appimage") {
            let portable_home = PathBuf::from(format!("{ra_path}.home"));
            candidate_dirs.push(portable_home.join(".config/retroarch/cores"));
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let home_dir = PathBuf::from(home);
        candidate_dirs.push(home_dir.join(".config/retroarch/cores"));
        candidate_dirs.push(home_dir.join(".var/app/org.libretro.RetroArch/config/retroarch/cores"));
    }

    let mut unique_dirs: Vec<PathBuf> = Vec::new();
    for dir in candidate_dirs {
        if !dir.is_dir() {
            continue;
        }
        if unique_dirs.iter().any(|seen| seen == &dir) {
            continue;
        }
        unique_dirs.push(dir);
    }

    if unique_dirs.is_empty() {
        return None;
    }

    let ext = libretro_core_extension();
    for cores_dir in &unique_dirs {
        for base_name in candidates {
            let candidate = cores_dir.join(format!("{base_name}{ext}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }

    None
}

#[cfg(all(unix, not(target_os = "macos")))]
fn detect_local_retroarch_executable() -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let home_dir = PathBuf::from(home);
    let mut search_roots = vec![home_dir.join("Downloads"), home_dir.clone()];

    // Toolbox/Bazzite can expose either /home/<user> or /var/home/<user>.
    if let Some(stripped) = home_dir.to_string_lossy().strip_prefix("/home/") {
        search_roots.push(PathBuf::from(format!("/var/home/{stripped}")).join("Downloads"));
    }
    if let Some(stripped) = home_dir.to_string_lossy().strip_prefix("/var/home/") {
        search_roots.push(PathBuf::from(format!("/home/{stripped}")).join("Downloads"));
    }

    let mut queue: Vec<(PathBuf, usize)> = Vec::new();
    for root in search_roots {
        queue.push((root, 0));
    }

    while let Some((dir, depth)) = queue.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if depth < 4 {
                    queue.push((path, depth + 1));
                }
                continue;
            }
            if !path.is_file() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            let lower = name.to_ascii_lowercase();
            if lower.contains("retroarch") && lower.ends_with(".appimage") {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn focus_and_maximize_window_for_pid(pid: u32) {
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, GW_OWNER, GetWindow, GetWindowThreadProcessId,
        IsWindowVisible, SW_MAXIMIZE, SetForegroundWindow, ShowWindow,
    };

    #[repr(C)]
    struct FindWindowCtx {
        target_pid: u32,
        hwnd: HWND,
    }

    unsafe extern "system" fn enum_windows_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = unsafe { &mut *(lparam as *mut FindWindowCtx) };
        let mut window_pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut window_pid);
        }

        if window_pid != ctx.target_pid {
            return 1;
        }
        if unsafe { IsWindowVisible(hwnd) } == 0 {
            return 1;
        }
        if unsafe { GetWindow(hwnd, GW_OWNER) } != std::ptr::null_mut() {
            return 1;
        }

        ctx.hwnd = hwnd;
        0
    }

    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        let mut ctx = FindWindowCtx {
            target_pid: pid,
            hwnd: std::ptr::null_mut(),
        };
        unsafe {
            EnumWindows(
                Some(enum_windows_cb),
                (&mut ctx as *mut FindWindowCtx) as LPARAM,
            );
        }

        if ctx.hwnd != std::ptr::null_mut() {
            unsafe {
                ShowWindow(ctx.hwnd, SW_MAXIMIZE);
                BringWindowToTop(ctx.hwnd);
                SetForegroundWindow(ctx.hwnd);
            }
            return;
        }

        std::thread::sleep(Duration::from_millis(120));
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn focus_and_maximize_window_for_pid(pid: u32) {
    use std::time::{Duration, Instant};

    // Best effort on X11/Wayland compositors that expose wmctrl.
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        let output = match Command::new("wmctrl").arg("-lp").output() {
            Ok(v) => v,
            Err(_) => return,
        };
        if !output.status.success() {
            return;
        }

        let list = String::from_utf8_lossy(&output.stdout);
        let mut window_id: Option<String> = None;
        for line in list.lines() {
            let mut parts = line.split_whitespace();
            let Some(id) = parts.next() else {
                continue;
            };
            let _desktop = parts.next();
            let Some(pid_col) = parts.next() else {
                continue;
            };
            if pid_col.parse::<u32>().ok() == Some(pid) {
                window_id = Some(id.to_string());
                break;
            }
        }

        if let Some(id) = window_id {
            let _ = Command::new("wmctrl")
                .args([
                    "-ir",
                    id.as_str(),
                    "-b",
                    "add,maximized_vert,maximized_horz",
                ])
                .spawn();
            let _ = Command::new("wmctrl").args(["-ia", id.as_str()]).spawn();
            return;
        }

        std::thread::sleep(Duration::from_millis(120));
    }
}

#[cfg(target_os = "macos")]
fn focus_and_maximize_window_for_pid(_pid: u32) {
    // no-op for now
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
async fn pick_retroarch_path() -> Result<Option<String>, String> {
    let picked = tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "windows")]
        {
            return rfd::FileDialog::new()
                .add_filter("Executable", &["exe"])
                .pick_file();
        }

        #[cfg(not(target_os = "windows"))]
        {
            rfd::FileDialog::new().pick_file()
        }
    })
    .await
    .map_err(|e| format!("RetroArch picker failed: {e}"))?;
    Ok(picked.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
async fn retroarch_flatpak_exists() -> Result<bool, String> {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let app_id = "org.libretro.RetroArch";
        let attempts: [(&str, &[&str]); 3] = [
            ("flatpak", &["info", app_id]),
            ("/usr/bin/flatpak", &["info", app_id]),
            ("host-spawn", &["flatpak", "info", app_id]),
        ];

        for (program, args) in attempts {
            match Command::new(program).args(args).status() {
                Ok(status) if status.success() => return Ok(true),
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
                Err(_) => continue,
            }
        }

        Ok(false)
    }

    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        Ok(false)
    }
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
async fn move_local_file(from_path: String, to_path: String) -> Result<bool, String> {
    let from_trimmed = from_path.trim();
    let to_trimmed = to_path.trim();
    if from_trimmed.is_empty() || to_trimmed.is_empty() {
        return Err("Source and destination paths are required.".to_string());
    }

    let from = PathBuf::from(from_trimmed);
    let to = PathBuf::from(to_trimmed);

    if !from.exists() {
        return Ok(false);
    }
    if from == to || to.exists() {
        return Ok(true);
    }

    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create destination folder: {e}"))?;
    }

    if let Err(rename_err) = std::fs::rename(&from, &to) {
        if from.is_file() {
            std::fs::copy(&from, &to)
                .map_err(|e| format!("Failed to copy file to destination: {e}"))?;
            std::fs::remove_file(&from)
                .map_err(|e| format!("Failed to remove legacy source file: {e}"))?;
        } else {
            return Err(format!("Failed to move file: {rename_err}"));
        }
    }

    Ok(true)
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
async fn launch_retroarch(
    window: tauri::Window,
    rom_path: String,
    core_path: Option<String>,
    retro_arch_path: Option<String>,
    platform_slug: Option<String>,
    minimize_launcher: Option<bool>,
) -> Result<(), String> {
    let rom = rom_path.trim();
    if rom.is_empty() {
        return Err("ROM path is required.".to_string());
    }

    let rom_path = PathBuf::from(rom);
    if !rom_path.exists() {
        return Err("ROM file does not exist.".to_string());
    }

    let configured_retroarch = retro_arch_path
        .as_deref()
        .map(str::trim)
        .map(|v| v.trim_matches('"').trim_matches('\''))
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .map(|p| {
            if Path::new(&p).exists() {
                return p;
            }

            if let Some(stripped) = p.strip_prefix("/home/") {
                let alt = format!("/var/home/{stripped}");
                if Path::new(&alt).exists() {
                    return alt;
                }
            }

            if let Some(stripped) = p.strip_prefix("/var/home/") {
                let alt = format!("/home/{stripped}");
                if Path::new(&alt).exists() {
                    return alt;
                }
            }

            p
        });

    if let Some(executable) = configured_retroarch.as_deref() {
        let looks_like_path = executable.contains(['\\', '/', ':']);
        if looks_like_path && !Path::new(executable).exists() {
            return Err(format!(
                "Configured RetroArch path does not exist: {executable}"
            ));
        }
    }

    let explicit_core_path = core_path
        .as_deref()
        .map(str::trim)
        .map(|v| v.trim_matches('"').trim_matches('\''))
        .filter(|v| !v.is_empty())
        .map(str::to_string);

    if let Some(core) = explicit_core_path.as_deref() {
        let looks_like_path = core.contains(['\\', '/', ':']);
        if looks_like_path && !Path::new(core).exists() {
            return Err(format!("Configured RetroArch core path does not exist: {core}"));
        }
    }

    let resolved_core_path = explicit_core_path.or_else(|| {
        auto_core_path_from_platform(
            configured_retroarch.as_deref(),
            platform_slug.as_deref(),
        )
    });

    let mut launch_args = Vec::<String>::new();
    if let Some(core) = resolved_core_path {
        launch_args.push("-L".to_string());
        launch_args.push(core);
    }
    launch_args.push(rom_path.to_string_lossy().to_string());

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let executable = configured_retroarch.as_deref().unwrap_or("retroarch.exe");
        let c = Command::new(executable);
        c
    };

    #[cfg(target_os = "macos")]
    let mut cmd = {
        let executable = configured_retroarch.as_deref().unwrap_or("retroarch");
        let c = Command::new(executable);
        c
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut child = {
        let mut launch_attempts: Vec<(String, Command, bool)> = Vec::new();

        if let Some(executable) = configured_retroarch.as_deref() {
            let is_appimage = executable.to_ascii_lowercase().ends_with(".appimage");
            launch_attempts.push((executable.to_string(), Command::new(executable), is_appimage));
        }

        let mut c1 = Command::new("flatpak");
        c1.arg("run").arg("org.libretro.RetroArch");
        launch_attempts.push(("flatpak run org.libretro.RetroArch".to_string(), c1, false));

        let mut c2 = Command::new("/usr/bin/flatpak");
        c2.arg("run").arg("org.libretro.RetroArch");
        launch_attempts.push(("/usr/bin/flatpak run org.libretro.RetroArch".to_string(), c2, false));

        let mut c3 = Command::new("host-spawn");
        c3.arg("flatpak").arg("run").arg("org.libretro.RetroArch");
        launch_attempts.push(("host-spawn flatpak run org.libretro.RetroArch".to_string(), c3, false));

        if let Some(auto_executable) = detect_local_retroarch_executable() {
            let already_added = launch_attempts
                .iter()
                .any(|(label, _, _)| label == &auto_executable);
            if !already_added {
                launch_attempts.push((
                    auto_executable.clone(),
                    Command::new(auto_executable),
                    true,
                ));
            }
        }

        launch_attempts.push(("retroarch".to_string(), Command::new("retroarch"), false));

        let mut failures = Vec::<String>::new();
        let mut spawned: Option<std::process::Child> = None;

        for (label, mut candidate_cmd, candidate_is_appimage) in launch_attempts {
            if candidate_is_appimage {
                // AppImage can fail on some systems/containers without FUSE. This fallback
                // tells AppImage to extract and run directly from a temp location.
                candidate_cmd.env("APPIMAGE_EXTRACT_AND_RUN", "1");
            }
            candidate_cmd.stderr(Stdio::piped());
            candidate_cmd.args(&launch_args);

            match candidate_cmd.spawn() {
                Ok(child) => {
                    spawned = Some(child);
                    break;
                }
                Err(e) => failures.push(format!("{label}: {e}")),
            }
        }

        if let Some(child) = spawned {
            child
        } else if configured_retroarch.is_none() {
            return Err(format!(
                "Failed to launch RetroArch. Attempted: {}. Install Flatpak RetroArch (org.libretro.RetroArch) on the host or set a custom RetroArch command/path in Emulator Settings.",
                failures.join(" | ")
            ));
        } else {
            return Err(format!("Failed to launch RetroArch: {}", failures.join(" | ")));
        }
    };

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        cmd.stderr(Stdio::piped());
        cmd.args(&launch_args);
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    let mut child = cmd.spawn().map_err(|e| {
        #[cfg(target_os = "windows")]
        {
            if configured_retroarch.is_none() {
                return format!(
                    "Failed to launch RetroArch: {e}. Set RetroArch executable path in Emulator Settings or add retroarch.exe to PATH."
                );
            }
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            if configured_retroarch.is_none() {
                return format!(
                    "Failed to launch RetroArch: {e}. Install Flatpak RetroArch (org.libretro.RetroArch) or set a custom RetroArch command/path in Emulator Settings."
                );
            }
        }

        format!("Failed to launch RetroArch: {e}")
    })?;

    focus_and_maximize_window_for_pid(child.id());

    if minimize_launcher.unwrap_or(true) {
        let _ = window.minimize();
    }

    std::thread::sleep(Duration::from_millis(350));
    if let Ok(Some(status)) = child.try_wait() {
        let stderr_hint = child
            .wait_with_output()
            .ok()
            .and_then(|output| {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if stderr.is_empty() {
                    None
                } else {
                    Some(stderr)
                }
            })
            .map(|stderr| {
                format!(
                    "\nRetroArch stderr:\n{}",
                    stderr.lines().take(8).collect::<Vec<_>>().join("\n")
                )
            })
            .unwrap_or_default();

        return Err(format!(
            "RetroArch exited immediately (status: {status}).{}\nVerify RetroArch path, optional core path, and ROM compatibility.",
            stderr_hint
        ));
    }

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
            pick_retroarch_path,
            retroarch_flatpak_exists,
            local_path_exists,
            move_local_file,
            open_local_folder,
            launch_retroarch,
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
