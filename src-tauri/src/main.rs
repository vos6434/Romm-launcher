// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn apply_linux_runtime_compat_defaults() {
    use std::os::unix::process::CommandExt;
    use std::path::Path;
    use std::process::Command;

    let disable_preload = std::env::var("ROMM_DISABLE_WAYLAND_PRELOAD")
        .ok()
        .map(|v| v == "1")
        .unwrap_or(false);

    // LD_PRELOAD only takes effect at exec time. Re-exec once so direct
    // AppImage launches get the same fast-path behavior as the wrapper script.
    if !disable_preload
        && std::env::var_os("LD_PRELOAD").is_none()
        && std::env::var_os("ROMM_PRELOAD_REEXEC").is_none()
        && Path::new("/usr/lib/libwayland-client.so").is_file()
    {
        let current_exe = match std::env::current_exe() {
            Ok(path) => path,
            Err(_) => {
                // Fall back to in-process env defaults if current exe resolution fails.
                std::env::set_var("LD_PRELOAD", "/usr/lib/libwayland-client.so");
                if std::env::var_os("GTK_MODULES").is_none() {
                    std::env::set_var("GTK_MODULES", "");
                }
                set_remaining_linux_compat_defaults();
                return;
            }
        };

        let mut cmd = Command::new(current_exe);
        cmd.args(std::env::args_os().skip(1))
            .env("LD_PRELOAD", "/usr/lib/libwayland-client.so")
            .env("ROMM_PRELOAD_REEXEC", "1");

        if std::env::var_os("GTK_MODULES").is_none() {
            cmd.env("GTK_MODULES", "");
        }

        let err = cmd.exec();
        eprintln!("romm-launcher: failed to re-exec with preload: {err}");
    }

    if std::env::var_os("GTK_MODULES").is_none() {
        std::env::set_var("GTK_MODULES", "");
    }

    set_remaining_linux_compat_defaults();
}

#[cfg(target_os = "linux")]
fn set_remaining_linux_compat_defaults() {

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
}

fn main() {
    #[cfg(target_os = "linux")]
    apply_linux_runtime_compat_defaults();

    tauri_app_lib::run()
}
