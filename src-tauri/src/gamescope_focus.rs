use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;
use std::thread;
use std::time::Duration;

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt, Window};

const WINDOW_TITLE: &str = "RomM Launcher";
const POLL_INTERVAL_MS: u64 = 250;
const ATOM_NAME_HINTS: &[&str] = &[
    "FocusedWindow",
    "FOCUSED_WINDOW",
    "gamescopeFocusedWindow",
];

static START: Once = Once::new();
static LAUNCHER_FOCUSED: AtomicBool = AtomicBool::new(true);

fn atom_name_matches(name: &str) -> bool {
    let lowered = name.to_ascii_lowercase();
    ATOM_NAME_HINTS
        .iter()
        .any(|hint| lowered.contains(&hint.to_ascii_lowercase()))
}

fn get_window_title<C: Connection>(conn: &C, window: Window) -> Option<String> {
    let utf8_atom = conn
        .intern_atom(false, b"UTF8_STRING")
        .ok()?
        .reply()
        .ok()?
        .atom;

    for property in [AtomEnum::WM_NAME.into(), utf8_atom] {
        let reply = conn
            .get_property(false, window, property, AtomEnum::ANY, 0, u32::MAX)
            .ok()?
            .reply()
            .ok()?;

        if reply.value.is_empty() {
            continue;
        }

        if let Ok(text) = String::from_utf8(reply.value) {
            let trimmed = text.trim_matches(char::from(0)).trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }

    None
}

fn find_window_by_title<C: Connection>(conn: &C, root: Window) -> Option<Window> {
    let tree = conn.query_tree(root).ok()?.reply().ok()?;

    for child in tree.children {
        if let Some(title) = get_window_title(conn, child) {
            if title == WINDOW_TITLE || title.contains(WINDOW_TITLE) {
                return Some(child);
            }
        }

        if let Some(found) = find_window_by_title(conn, child) {
            return Some(found);
        }
    }

    None
}

fn find_gamescope_focused_window_atom<C: Connection>(conn: &C, root: Window) -> Option<u32> {
    let props = conn.list_properties(root).ok()?.reply().ok()?;
    for atom in props.atoms {
        let name = conn.get_atom_name(atom).ok()?.reply().ok()?;
        let name = String::from_utf8(name.name).ok()?;
        if atom_name_matches(&name) {
            return Some(atom);
        }
    }
    None
}

fn read_focused_window<C: Connection>(conn: &C, root: Window, atom: u32) -> Option<u32> {
    let reply = conn
        .get_property(false, root, atom, AtomEnum::CARDINAL, 0, 1)
        .ok()?
        .reply()
        .ok()?;

    if reply.value.len() < 4 {
        return None;
    }

    let mut value = [0u8; 4];
    value.copy_from_slice(&reply.value[..4]);
    Some(u32::from_ne_bytes(value))
}

fn monitor_focus_state() {
    let Ok((conn, screen_num)) = x11rb::connect(None) else {
        LAUNCHER_FOCUSED.store(true, Ordering::Relaxed);
        return;
    };

    let root = conn.setup().roots[screen_num].root;
    let mut focused_atom: Option<u32> = None;
    let mut launcher_window: Option<u32> = None;
    let mut last_state: Option<bool> = None;

    loop {
        if focused_atom.is_none() {
            focused_atom = find_gamescope_focused_window_atom(&conn, root);
        }
        if launcher_window.is_none() {
            launcher_window = find_window_by_title(&conn, root);
        }

        let focused_on_launcher = match (focused_atom, launcher_window) {
            (Some(atom), Some(launcher)) => read_focused_window(&conn, root, atom).is_some_and(|current| current == launcher),
            _ => true,
        };

        if last_state != Some(focused_on_launcher) {
            last_state = Some(focused_on_launcher);
            LAUNCHER_FOCUSED.store(focused_on_launcher, Ordering::Relaxed);
        }

        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }
}

pub fn start_monitor() {
    START.call_once(|| {
        let _ = thread::Builder::new()
            .name("gamescope-focus-monitor".to_string())
            .spawn(monitor_focus_state);
    });
}

pub fn is_launcher_focused() -> bool {
    LAUNCHER_FOCUSED.load(Ordering::Relaxed)
}
