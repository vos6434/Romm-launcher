// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn apply_linux_runtime_compat_defaults() {
    use std::path::Path;

    if std::env::var_os("__EGL_VENDOR_LIBRARY_FILENAMES").is_none() {
        std::env::set_var(
            "__EGL_VENDOR_LIBRARY_FILENAMES",
            "/usr/share/glvnd/egl_vendor.d/50_mesa.json",
        );
    }

    // Prefer GPU-friendly mode by default; launcher scripts can still override this.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "0");
    }

    let disable_preload = std::env::var("ROMM_DISABLE_WAYLAND_PRELOAD")
        .ok()
        .map(|v| v == "1")
        .unwrap_or(false);

    if !disable_preload
        && std::env::var_os("LD_PRELOAD").is_none()
        && Path::new("/usr/lib/libwayland-client.so").is_file()
    {
        std::env::set_var("LD_PRELOAD", "/usr/lib/libwayland-client.so");
    }

    if std::env::var_os("GTK_MODULES").is_none() {
        std::env::set_var("GTK_MODULES", "");
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    apply_linux_runtime_compat_defaults();

    tauri_app_lib::run()
}
