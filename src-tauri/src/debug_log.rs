use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref LOG_FILE: Mutex<PathBuf> = {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home/deck"));
        let log_path = home.join("documents/romm-launcher-debug.log");
        
        // Ensure directory exists
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        
        Mutex::new(log_path)
    };
}

pub fn log_debug(message: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let formatted = format!("[{}] {}\n", timestamp, message);
    
    if let Ok(log_path) = LOG_FILE.lock() {
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path.as_path())
        {
            let _ = file.write_all(formatted.as_bytes());
        }
    }
    
    // Also print to stderr
    eprintln!("{}", formatted);
}

#[tauri::command]
pub fn log_frontend(message: String) {
    log_debug(&format!("[Frontend] {}", message));
}
