use crate::{models, sidecar, vendor};

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_log_file(date: String) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::fs::File;

    let home = dirs::home_dir().ok_or("No home directory")?;
    let path = home.join(".sparky").join("logs").join(format!("sparky-{}.log", date));

    let file = File::open(&path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = BufReader::new(file)
        .lines()
        .filter_map(|l| l.ok())
        .collect();

    let total = lines.len();
    let tail = if total > 100 { &lines[total - 100..] } else { &lines[..] };
    let header = if total > 100 {
        format!("...last 100 of {} lines...\n\n", total)
    } else {
        String::new()
    };

    Ok(format!("{}{}", header, tail.join("\n")))
}

#[tauri::command]
pub fn write_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_sidecar(app: tauri::AppHandle) -> Result<sidecar::SidecarInfo, String> {
    let node = vendor::node_binary()?;
    let script = crate::resolve_sidecar_script(&app);
    sidecar::spawn(&node, script)
}

#[tauri::command]
pub async fn get_sidecar_info() -> Result<sidecar::SidecarInfo, String> {
    sidecar::get_sidecar_info().await
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    sidecar::quit_app(app);
}

#[tauri::command]
pub fn vendor_check() -> Result<Vec<vendor::VendorDependency>, String> {
    vendor::vendor_check()
}

#[tauri::command]
pub async fn vendor_version(tool: String) -> Result<Option<String>, String> {
    vendor::vendor_version(tool).await
}

#[tauri::command]
pub fn check_models() -> Result<Vec<models::ModelStatus>, String> {
    models::check_models()
}

#[tauri::command]
pub async fn download_models(app: tauri::AppHandle, filenames: Vec<String>) -> Result<(), String> {
    models::download_models(app, filenames).await
}

#[tauri::command]
pub fn cancel_download() -> Result<(), String> {
    models::cancel_download()
}
