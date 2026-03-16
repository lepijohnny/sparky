mod api;
mod models;
mod sidecar;
mod vendor;

use std::path::PathBuf;
use tauri::image::Image;
use tauri::menu::{AboutMetadata, Menu, MenuBuilder, PredefinedMenuItem, Submenu};
use tauri::{Listener, Manager};



pub fn resolve_sidecar_script(_app: &tauri::AppHandle) -> PathBuf {
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let dev_path = project_root.join("server/index.ts");
    if dev_path.exists() {
        log::info!("Using dev sidecar script: {}", dev_path.display());
        return dev_path;
    }

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    log::info!("exe_dir: {}", exe_dir.display());

    let candidates = [
        "../Resources/_up_/server/dist/server.mjs",
        "_up_/server/dist/server.mjs",
        "server/dist/server.mjs",
    ];

    for candidate in &candidates {
        let path = exe_dir.join(candidate);
        log::info!("Checking sidecar path: {} (exists={})", path.display(), path.exists());
        if path.exists() {
            return path;
        }
    }

    let fallback = exe_dir.join("_up_/server/dist/server.mjs");
    log::warn!("No sidecar script found, using fallback: {}", fallback.display());
    fallback
}



/// Resolve a bundled binary by name (e.g. "node").
/// In production: Contents/Resources/binaries/{name}  (macOS)
///                {exe_dir}/binaries/{name}            (Windows/Linux)
/// In dev: src-tauri/binaries/{name}-{target_triple}
pub fn resolve_binary(_app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let target = env!("TARGET_TRIPLE");
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let with_triple = format!("{name}-{target}{ext}");
    let without_triple = format!("{name}{ext}");

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let plain_name = name.to_string();

    let node_triple = format!("node-{target}{ext}");

    let mut candidates = vec![
        // Production: Resources/binaries/sparky-sidecar (macOS .app bundle)
        exe_dir.join("../Resources/binaries").join(&plain_name),
        // Production: {exe_dir}/binaries/sparky-sidecar (Windows NSIS / Linux)
        exe_dir.join("binaries").join(&plain_name),
        // Dev: src-tauri/target/debug/sparky-sidecar (plain copy from build.rs)
        exe_dir.join(&plain_name),
        // Dev: src-tauri/binaries/sparky-sidecar-{triple}
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(&with_triple),
        // Dev fallback: src-tauri/binaries/node-{triple} (original node binary)
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(&node_triple),
    ];

    // Windows: also check with .exe extension
    if cfg!(windows) {
        candidates.push(exe_dir.join("binaries").join(&without_triple));
        candidates.push(exe_dir.join(&without_triple));
    }

    for path in &candidates {
        log::info!("Looking for {name} at: {} (exists={})", path.display(), path.exists());
        if path.exists() {
            return Ok(path.clone());
        }
    }

    Err(format!(
        "Bundled {name} not found at {:?}",
        candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>()
    ))
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let pkg = app.package_info();
    let icon = Image::from_bytes(include_bytes!("../icons/icon.png")).ok();

    let about_metadata = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        copyright: Some("Copyright © 2026 Nikola Radin.".to_string()),
        icon,
        ..Default::default()
    };

    #[cfg(target_os = "macos")]
    let app_submenu = Submenu::with_items(
        app,
        &pkg.name,
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let app_submenu = Submenu::with_items(
        app,
        &pkg.name,
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_submenu = Submenu::with_items(
        app,
        "File",
        true,
        &[&PredefinedMenuItem::close_window(app, None)?],
    )?;

    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_submenu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    MenuBuilder::new(app)
        .items(&[&app_submenu, &file_submenu, &edit_submenu, &window_submenu])
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            api::reveal_in_finder,
            api::open_log_file,
            api::write_file,
            api::start_sidecar,
            api::get_sidecar_info,
            api::quit_app,

            api::vendor_check,
            api::vendor_version,
            api::check_models,
            api::download_models,
            api::cancel_download,
        ])
        .setup(|app| {
            #[cfg(not(target_os = "windows"))]
            {
                let menu = build_menu(app.handle())?;
                app.set_menu(menu)?;
            }

            let log_dir = dirs::home_dir()
                .unwrap_or_default()
                .join(".sparky")
                .join("logs");
            std::fs::create_dir_all(&log_dir).ok();
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::Folder { path: log_dir, file_name: Some("sparky-tauri".into()) },
                    ))
                    .build(),
            )?;

            // Resolve bundled node binary (named sparky-sidecar for Task Manager visibility)
            let node = resolve_binary(app.handle(), "sparky-sidecar")
                .map_err(|e| {
                    log::error!("Node resolution failed: {e}");
                    Box::<dyn std::error::Error>::from(e)
                })?;
            log::info!("Resolved node at: {}", node.display());

            // Ensure node is executable (Tauri resources don't preserve permissions)
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = std::fs::metadata(&node) {
                    let mut perms = meta.permissions();
                    if perms.mode() & 0o111 == 0 {
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&node, perms);
                        log::info!("Set execute permission on node binary");
                    }
                }
            }

            let _ = vendor::NODE_BIN.set(node.clone());

            // Show window when frontend signals ready
            let window = app.handle().get_webview_window("main").unwrap();
            app.listen("show-window", move |_| {
                let _ = window.show();
            });

            // Start sidecar in background thread to avoid blocking the window
            let sidecar_script = resolve_sidecar_script(app.handle());
            std::thread::spawn(move || {
                match sidecar::spawn(&node, sidecar_script) {
                    Ok(info) => {
                        log::info!("Sidecar started on port {} with token {}", info.port, info.token);
                    }
                    Err(e) => {
                        log::error!("Sidecar failed: {e}");
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                sidecar::kill();
            }
        });
}
