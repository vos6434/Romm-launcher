use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
#[cfg(feature = "steam-input")]
use std::ffi::CString;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(feature = "steam-input")]
use std::sync::{Mutex, OnceLock};
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputBackendCapabilities {
    steam_input_compiled: bool,
    steam_input_available: bool,
    steam_keyboard_supported: bool,
    action_mapping_stub_enabled: bool,
    active_backend: String,
    reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputActionMappingStatus {
    steam_input_compiled: bool,
    steam_runtime_detected: bool,
    action_mapping_stub_enabled: bool,
    active_backend: String,
    reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputActionSnapshot {
    backend: String,
    navigate_up: bool,
    navigate_down: bool,
    navigate_left: bool,
    navigate_right: bool,
    confirm: bool,
    back: bool,
    open_text_input: bool,
    toggle_settings: bool,
    toggle_item_settings: bool,
    refresh: bool,
}

#[cfg(feature = "steam-input")]
#[derive(Debug, Clone, Copy)]
struct SteamInputActionHandles {
    action_set: u64,
    navigate_axis: u64,
    navigate_up: u64,
    navigate_down: u64,
    navigate_left: u64,
    navigate_right: u64,
    confirm: u64,
    back: u64,
    open_text_input: u64,
    toggle_settings: u64,
    toggle_item_settings: u64,
    refresh: u64,
}

#[cfg(feature = "steam-input")]
const STEAM_ACTION_SET_NAME: &str = "menu";
#[cfg(feature = "steam-input")]
const STEAM_NAVIGATE_AXIS_ACTION_NAME: &str = "navigate";
#[cfg(feature = "steam-input")]
const STEAM_NAVIGATE_UP_ACTION_NAME: &str = "navigate_up";
#[cfg(feature = "steam-input")]
const STEAM_NAVIGATE_DOWN_ACTION_NAME: &str = "navigate_down";
#[cfg(feature = "steam-input")]
const STEAM_NAVIGATE_LEFT_ACTION_NAME: &str = "navigate_left";
#[cfg(feature = "steam-input")]
const STEAM_NAVIGATE_RIGHT_ACTION_NAME: &str = "navigate_right";
#[cfg(feature = "steam-input")]
const STEAM_CONFIRM_ACTION_NAME: &str = "confirm";
#[cfg(feature = "steam-input")]
const STEAM_BACK_ACTION_NAME: &str = "back";
#[cfg(feature = "steam-input")]
const STEAM_OPEN_TEXT_INPUT_ACTION_NAME: &str = "open_text_input";
#[cfg(feature = "steam-input")]
const STEAM_TOGGLE_SETTINGS_ACTION_NAME: &str = "toggle_settings";
#[cfg(feature = "steam-input")]
const STEAM_TOGGLE_ITEM_SETTINGS_ACTION_NAME: &str = "toggle_item_settings";
#[cfg(feature = "steam-input")]
const STEAM_REFRESH_ACTION_NAME: &str = "refresh";
#[cfg(feature = "steam-input")]
const STEAM_MANIFEST_RELATIVE_PATH: &str = "steam_input/romm_launcher_actions.vdf";

#[cfg(feature = "steam-input")]
const STEAM_EXPECTED_ACTION_MAP: &[&str] = &[
    "action_set: menu",
    "analog: navigate",
    "digital: navigate_up",
    "digital: navigate_down",
    "digital: navigate_left",
    "digital: navigate_right",
    "digital: confirm",
    "digital: back",
    "digital: open_text_input",
    "digital: toggle_settings",
    "digital: toggle_item_settings",
    "digital: refresh",
];

#[cfg(feature = "steam-input")]
fn expected_action_map_string() -> String {
    STEAM_EXPECTED_ACTION_MAP.join(", ")
}

#[cfg(feature = "steam-input")]
impl SteamInputActionHandles {
    fn resolve(input: &steamworks::Input<steamworks::ClientManager>) -> Self {
        Self {
            action_set: input.get_action_set_handle(STEAM_ACTION_SET_NAME),
            navigate_axis: input.get_analog_action_handle(STEAM_NAVIGATE_AXIS_ACTION_NAME),
            navigate_up: input.get_digital_action_handle(STEAM_NAVIGATE_UP_ACTION_NAME),
            navigate_down: input.get_digital_action_handle(STEAM_NAVIGATE_DOWN_ACTION_NAME),
            navigate_left: input.get_digital_action_handle(STEAM_NAVIGATE_LEFT_ACTION_NAME),
            navigate_right: input.get_digital_action_handle(STEAM_NAVIGATE_RIGHT_ACTION_NAME),
            confirm: input.get_digital_action_handle(STEAM_CONFIRM_ACTION_NAME),
            back: input.get_digital_action_handle(STEAM_BACK_ACTION_NAME),
            open_text_input: input.get_digital_action_handle(STEAM_OPEN_TEXT_INPUT_ACTION_NAME),
            toggle_settings: input.get_digital_action_handle(STEAM_TOGGLE_SETTINGS_ACTION_NAME),
            toggle_item_settings: input
                .get_digital_action_handle(STEAM_TOGGLE_ITEM_SETTINGS_ACTION_NAME),
            refresh: input.get_digital_action_handle(STEAM_REFRESH_ACTION_NAME),
        }
    }

    fn missing_required_actions(&self) -> Vec<&'static str> {
        let mut missing = Vec::new();
        if self.action_set == 0 {
            missing.push("action_set: menu");
        }
        let has_full_digital_navigation =
            self.navigate_up != 0
                && self.navigate_down != 0
                && self.navigate_left != 0
                && self.navigate_right != 0;
        if self.navigate_axis == 0 && !has_full_digital_navigation {
            missing.push("analog: navigate OR digital: navigate_up/down/left/right");
        }
        if self.confirm == 0 {
            missing.push("digital: confirm");
        }
        if self.back == 0 {
            missing.push("digital: back");
        }
        missing
    }
}

#[cfg(feature = "steam-input")]
#[derive(Default)]
struct SteamInputRuntime {
    attempted_init: bool,
    client: Option<steamworks::Client>,
    single: Option<steamworks::SingleClient>,
    handles: Option<SteamInputActionHandles>,
    manifest_path: Option<String>,
    manifest_warning: Option<String>,
    init_error: Option<String>,
}

#[cfg(feature = "steam-input")]
impl SteamInputRuntime {
    fn ensure_initialized(&mut self) {
        if self.client.is_some() || self.attempted_init {
            return;
        }
        self.attempted_init = true;

        match steamworks::Client::init() {
            Ok((client, single)) => {
                match configure_steam_input_action_manifest_path() {
                    Ok(path) => {
                        self.manifest_path = path;
                        self.manifest_warning = None;
                    }
                    Err(err) => {
                        self.manifest_path = None;
                        self.manifest_warning = Some(err);
                    }
                }

                let input = client.input();
                input.init(false);
                let handles = SteamInputActionHandles::resolve(&input);

                self.handles = Some(handles);
                self.single = Some(single);
                self.client = Some(client);
                self.init_error = None;
            }
            Err(err) => {
                self.init_error = Some(format!("Steam Input initialization failed: {err:?}"));
            }
        }
    }

    fn status(&mut self) -> (bool, Option<String>) {
        self.ensure_initialized();

        let Some(_) = self.client.as_ref() else {
            return (
                false,
                Some(
                    self.init_error
                        .clone()
                        .unwrap_or_else(|| "Steam Input client is unavailable.".to_string()),
                ),
            );
        };

        let handles = self.handles.get_or_insert_with(|| {
            let input = self
                .client
                .as_ref()
                .expect("steam client checked above")
                .input();
            SteamInputActionHandles::resolve(&input)
        });

        let missing = handles.missing_required_actions();
        if !missing.is_empty() {
            let manifest_hint = if let Some(path) = self.manifest_path.as_deref() {
                format!(" Manifest loaded from: {path}.")
            } else if let Some(warning) = self.manifest_warning.as_deref() {
                format!(" Manifest warning: {warning}")
            } else {
                " Manifest warning: No manifest file was auto-loaded; ensure Steam partner action manifest is configured or include a local manifest.".to_string()
            };

            return (
                false,
                Some(
                    format!(
                        "Steam Input is missing required actions: {}. Expected mapping: {}.{}",
                        missing.join(", "),
                        expected_action_map_string(),
                        manifest_hint
                    ),
                ),
            );
        }

        (true, None)
    }
}

#[cfg(feature = "steam-input")]
static STEAM_INPUT_RUNTIME: OnceLock<Mutex<SteamInputRuntime>> = OnceLock::new();

#[cfg(feature = "steam-input")]
fn with_steam_input_runtime<T>(
    f: impl FnOnce(&mut SteamInputRuntime) -> T,
) -> Result<T, String> {
    let runtime = STEAM_INPUT_RUNTIME.get_or_init(|| Mutex::new(SteamInputRuntime::default()));
    let mut guard = runtime
        .lock()
        .map_err(|_| "Steam Input runtime lock poisoned.".to_string())?;
    Ok(f(&mut guard))
}

#[cfg(feature = "steam-input")]
fn configure_steam_input_action_manifest_path() -> Result<Option<String>, String> {
    for candidate in steam_input_manifest_candidates() {
        if !candidate.is_file() {
            continue;
        }

        let full_path = candidate
            .canonicalize()
            .unwrap_or_else(|_| candidate.clone());
        let full_path_str = full_path.to_string_lossy().to_string();
        let c_path = CString::new(full_path_str.clone())
            .map_err(|_| "Steam Input manifest path contains interior null bytes.".to_string())?;

        let set_ok = unsafe {
            let input = steamworks::sys::SteamAPI_SteamInput_v006();
            if input.is_null() {
                false
            } else {
                steamworks::sys::SteamAPI_ISteamInput_SetInputActionManifestFilePath(
                    input,
                    c_path.as_ptr(),
                )
            }
        };

        if set_ok {
            return Ok(Some(full_path_str));
        }
    }

    Ok(None)
}

#[cfg(feature = "steam-input")]
fn steam_input_manifest_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(from_env) = std::env::var("ROMM_STEAM_INPUT_MANIFEST") {
        let trimmed = from_env.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join(STEAM_MANIFEST_RELATIVE_PATH));
            candidates.push(exe_dir.join("resources").join(STEAM_MANIFEST_RELATIVE_PATH));
            candidates.push(
                exe_dir
                    .join("..")
                    .join("resources")
                    .join(STEAM_MANIFEST_RELATIVE_PATH),
            );
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(STEAM_MANIFEST_RELATIVE_PATH));
        candidates.push(cwd.join("src-tauri").join(STEAM_MANIFEST_RELATIVE_PATH));
    }

    let mut unique = Vec::new();
    for path in candidates {
        if !unique.iter().any(|seen: &PathBuf| seen == &path) {
            unique.push(path);
        }
    }

    unique
}

#[cfg(feature = "steam-input")]
fn read_digital_action(
    input: &steamworks::Input<steamworks::ClientManager>,
    controller: u64,
    handle: u64,
) -> bool {
    if handle == 0 {
        return false;
    }

    let state = input.get_digital_action_data(controller, handle);
    state.bActive && state.bState
}

#[cfg(feature = "steam-input")]
fn read_analog_axis(
    input: &steamworks::Input<steamworks::ClientManager>,
    controller: u64,
    handle: u64,
) -> Option<(f32, f32)> {
    if handle == 0 {
        return None;
    }

    let data = input.get_analog_action_data(controller, handle);
    let active = unsafe { std::ptr::addr_of!(data.bActive).read_unaligned() };
    if !active {
        return None;
    }

    let x = unsafe { std::ptr::addr_of!(data.x).read_unaligned() };
    let y = unsafe { std::ptr::addr_of!(data.y).read_unaligned() };
    Some((x, y))
}

fn empty_input_snapshot(backend: &str) -> InputActionSnapshot {
    InputActionSnapshot {
        backend: backend.to_string(),
        navigate_up: false,
        navigate_down: false,
        navigate_left: false,
        navigate_right: false,
        confirm: false,
        back: false,
        open_text_input: false,
        toggle_settings: false,
        toggle_item_settings: false,
        refresh: false,
    }
}

#[cfg(feature = "steam-input")]
fn steam_input_status() -> (bool, Option<String>) {
    match with_steam_input_runtime(|runtime| runtime.status()) {
        Ok(status) => status,
        Err(err) => (false, Some(err)),
    }
}

#[cfg(not(feature = "steam-input"))]
fn steam_input_status() -> (bool, Option<String>) {
    (false, Some("Steam input feature is not compiled in this build.".to_string()))
}

#[cfg(feature = "steam-input")]
fn poll_steam_input_actions_snapshot() -> Result<InputActionSnapshot, String> {
    let snapshot = with_steam_input_runtime(|runtime| {
        let (ready, reason) = runtime.status();
        if !ready {
            return Err(reason.unwrap_or_else(|| "Steam Input is not ready.".to_string()));
        }

        let client = runtime
            .client
            .as_ref()
            .ok_or_else(|| "Steam Input client missing after initialization.".to_string())?;
        let single = runtime
            .single
            .as_ref()
            .ok_or_else(|| "Steam Input callback dispatcher missing.".to_string())?;

        single.run_callbacks();

        let input = client.input();
        input.run_frame();

        let handles = runtime
            .handles
            .as_ref()
            .ok_or_else(|| "Steam Input handles were not resolved.".to_string())?;

        let controllers = input.get_connected_controllers();
        if controllers.is_empty() {
            return Ok(empty_input_snapshot("steam"));
        }

        const ANALOG_DEADZONE: f32 = 0.45;

        let mut snapshot = empty_input_snapshot("steam");
        for controller in controllers {
            if handles.action_set != 0 {
                input.activate_action_set_handle(controller, handles.action_set);
            }

            snapshot.navigate_up |= read_digital_action(&input, controller, handles.navigate_up);
            snapshot.navigate_down |=
                read_digital_action(&input, controller, handles.navigate_down);
            snapshot.navigate_left |=
                read_digital_action(&input, controller, handles.navigate_left);
            snapshot.navigate_right |=
                read_digital_action(&input, controller, handles.navigate_right);
            snapshot.confirm |= read_digital_action(&input, controller, handles.confirm);
            snapshot.back |= read_digital_action(&input, controller, handles.back);
            snapshot.open_text_input |=
                read_digital_action(&input, controller, handles.open_text_input);
            snapshot.toggle_settings |=
                read_digital_action(&input, controller, handles.toggle_settings);
            snapshot.toggle_item_settings |=
                read_digital_action(&input, controller, handles.toggle_item_settings);
            snapshot.refresh |= read_digital_action(&input, controller, handles.refresh);

            if let Some((x, y)) = read_analog_axis(&input, controller, handles.navigate_axis) {
                snapshot.navigate_up |= y <= -ANALOG_DEADZONE;
                snapshot.navigate_down |= y >= ANALOG_DEADZONE;
                snapshot.navigate_left |= x <= -ANALOG_DEADZONE;
                snapshot.navigate_right |= x >= ANALOG_DEADZONE;
            }
        }

        Ok(snapshot)
    })?;

    snapshot
}

#[cfg(not(feature = "steam-input"))]
fn poll_steam_input_actions_snapshot() -> Result<InputActionSnapshot, String> {
    Err("Steam input feature is not compiled in this build.".to_string())
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

    let ra_path = retro_arch_path
        .map(str::trim)
        .filter(|v| !v.is_empty())?;
    let ra = Path::new(ra_path);
    let base_dir = if ra.is_file() {
        ra.parent()
    } else if ra.is_dir() {
        Some(ra)
    } else {
        ra.parent()
    }?;

    let cores_dir = base_dir.join("cores");
    if !cores_dir.is_dir() {
        return None;
    }

    let ext = libretro_core_extension();
    for base_name in candidates {
        let candidate = cores_dir.join(format!("{base_name}{ext}"));
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
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

fn steam_runtime_detected() -> bool {
    std::env::var_os("SteamGameId").is_some()
        || std::env::var_os("STEAM_GAME_ID").is_some()
        || std::env::var_os("SteamAppId").is_some()
        || std::env::var_os("STEAM_COMPAT_DATA_PATH").is_some()
}

fn action_mapping_stub_enabled() -> bool {
    cfg!(feature = "steam-input") && steam_runtime_detected()
}

fn action_mapping_backend() -> String {
    if !cfg!(feature = "steam-input") || !steam_runtime_detected() {
        return "native".to_string();
    }

    let (ready, _) = steam_input_status();
    if ready {
        "steam".to_string()
    } else {
        "native".to_string()
    }
}

fn steam_keyboard_support() -> (bool, Option<String>) {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if steam_runtime_detected() {
            (true, None)
        } else {
            (
                false,
                Some("Steam runtime not detected in environment.".to_string()),
            )
        }
    }

    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        (
            false,
            Some("Steam keyboard URL trigger is only supported on Linux builds.".to_string()),
        )
    }
}

fn request_steam_keyboard_url() -> Result<(), String> {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg("steam://open/keyboard")
            .spawn()
            .map_err(|e| format!("Failed to request Steam keyboard: {e}"))?;
        Ok(())
    }

    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        Err("Steam keyboard URL trigger is only supported on Linux builds.".to_string())
    }
}

#[tauri::command]
async fn get_input_backend_capabilities() -> InputBackendCapabilities {
    let steam_input_compiled = cfg!(feature = "steam-input");
    let steam_runtime = steam_runtime_detected();
    let (steam_input_ready, steam_input_reason) = steam_input_status();
    let (steam_keyboard_supported, reason) = steam_keyboard_support();
    let action_mapping_stub_enabled = action_mapping_stub_enabled();
    let steam_input_available = steam_input_compiled && steam_runtime && steam_input_ready;
    let active_backend = if steam_input_available || steam_keyboard_supported {
        "steam".to_string()
    } else {
        "native".to_string()
    };

    InputBackendCapabilities {
        steam_input_compiled,
        steam_input_available,
        steam_keyboard_supported,
        action_mapping_stub_enabled,
        active_backend,
        reason: reason.or(steam_input_reason),
    }
}

#[tauri::command]
async fn get_input_action_mapping_status() -> InputActionMappingStatus {
    let steam_input_compiled = cfg!(feature = "steam-input");
    let steam_runtime = steam_runtime_detected();
    let action_mapping_stub_enabled = action_mapping_stub_enabled();
    let (steam_input_ready, steam_input_reason) = steam_input_status();
    let active_backend = action_mapping_backend();
    let reason = if steam_input_compiled && steam_runtime && steam_input_ready {
        None
    } else if !steam_input_compiled {
        Some("Steam input feature is not compiled; using native backend.".to_string())
    } else if !steam_runtime {
        Some("Steam runtime was not detected; using native backend.".to_string())
    } else {
        steam_input_reason
    };

    InputActionMappingStatus {
        steam_input_compiled,
        steam_runtime_detected: steam_runtime,
        action_mapping_stub_enabled,
        active_backend,
        reason,
    }
}

#[tauri::command]
async fn poll_input_actions() -> InputActionSnapshot {
    if action_mapping_backend() == "steam" {
        if let Ok(snapshot) = poll_steam_input_actions_snapshot() {
            return snapshot;
        }
    }

    empty_input_snapshot("native")
}

#[tauri::command]
async fn open_text_input() -> Result<bool, String> {
    let capabilities = get_input_backend_capabilities().await;
    if !capabilities.steam_keyboard_supported {
        return Ok(false);
    }

    request_steam_keyboard_url()?;
    Ok(true)
}

#[tauri::command]
async fn show_steam_keyboard() -> Result<(), String> {
    #[cfg(all(unix, not(target_os = "macos")))]
    request_steam_keyboard_url()?;
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
        .map(str::to_string);

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

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let c = if let Some(executable) = configured_retroarch.as_deref() {
            Command::new(executable)
        } else {
            let mut fallback = Command::new("flatpak");
            fallback.arg("run").arg("org.libretro.RetroArch");
            fallback
        };
        c
    };

    #[cfg(target_os = "macos")]
    let mut cmd = {
        let executable = configured_retroarch.as_deref().unwrap_or("retroarch");
        let c = Command::new(executable);
        c
    };

    cmd.args(&launch_args);

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
        return Err(format!(
            "RetroArch exited immediately (status: {status}). Verify RetroArch path, optional core path, and ROM compatibility."
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
            local_path_exists,
            open_local_folder,
            get_input_backend_capabilities,
            get_input_action_mapping_status,
            open_text_input,
            poll_input_actions,
            show_steam_keyboard,
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
