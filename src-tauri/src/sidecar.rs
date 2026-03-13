use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Clone, Serialize)]
pub struct SidecarInfo {
    pub port: u16,
    pub token: String,
}

static SIDECAR: OnceLock<SidecarInfo> = OnceLock::new();
static SIDECAR_CHILD: Mutex<Option<Child>> = Mutex::new(None);

#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn spawn(node: &PathBuf, sidecar_script: PathBuf) -> Result<SidecarInfo, String> {
    log::info!("Using node at: {}", node.display());
    log::info!("Sidecar script: {}", sidecar_script.display());

    let is_bundled = sidecar_script.extension().is_some_and(|e| e == "mjs");

    let mut cmd = Command::new(node);
    if !is_bundled {
        let server_dir = sidecar_script.parent().unwrap_or(Path::new("."));
        let tsx_path = server_dir.join("node_modules").join("tsx").join("dist").join("loader.mjs");
        let import_arg = if tsx_path.exists() {
            format!("--import={}", path_to_file_url(&tsx_path))
        } else {
            "--import=tsx".to_string()
        };
        cmd.arg(&import_arg);
    }
    cmd.arg(&sidecar_script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());

    // On Windows, inherit() with no parent console can flash a terminal window.
    // Use null() instead — sidecar logs to ~/.sparky/logs/, not stderr.
    #[cfg(windows)]
    cmd.stderr(Stdio::null());
    #[cfg(not(windows))]
    cmd.stderr(Stdio::inherit());

    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar (node={}): {e}", node.display()))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|e| format!("Failed to read sidecar output: {e}"))?;

    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err("Sidecar produced no output. Check logs at ~/.sparky/logs/".to_string());
    }

    let parsed: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("Invalid JSON from sidecar: {e} (got: {trimmed})"))?;

    let port = parsed["port"].as_u64().ok_or("Missing port")? as u16;
    let token = parsed["token"].as_str().ok_or("Missing token")?.to_string();

    if let Ok(mut guard) = SIDECAR_CHILD.lock() {
        *guard = Some(child);
    }

    let info = SidecarInfo { port, token };
    let _ = SIDECAR.set(info.clone());
    Ok(info)
}

pub fn kill() {
    if let Ok(mut guard) = SIDECAR_CHILD.lock() {
        if let Some(ref mut child) = *guard {
            let pid = child.id();

            #[cfg(unix)]
            {
                log::info!("Sending SIGTERM to process group (pgid {})", pid);
                unsafe { libc::killpg(pid as i32, libc::SIGTERM); }
            }

            #[cfg(windows)]
            {
                log::info!("Terminating process tree (pid {})", pid);
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .creation_flags(CREATE_NO_WINDOW)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }

            for _ in 0..20 {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        log::info!("Sidecar exited: {}", status);
                        *guard = None;
                        return;
                    }
                    _ => std::thread::sleep(std::time::Duration::from_millis(100)),
                }
            }

            #[cfg(unix)]
            {
                log::warn!("Process group did not exit after SIGTERM, sending SIGKILL");
                unsafe { libc::killpg(pid as i32, libc::SIGKILL); }
            }

            let _ = child.wait();
        }
        *guard = None;
    }
}

pub async fn get_sidecar_info() -> Result<SidecarInfo, String> {
    for _ in 0..60 {
        if let Some(info) = SIDECAR.get() {
            return Ok(info.clone());
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err("Sidecar failed to start within 30s".into())
}

pub fn quit_app(app: tauri::AppHandle) {
    kill();
    app.exit(0);
}

fn path_to_file_url(path: &Path) -> String {
    let absolute = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let slash_path = absolute.to_string_lossy().replace('\\', "/");
    let trimmed = slash_path.strip_prefix("//?/").unwrap_or(&slash_path);
    if trimmed.starts_with('/') {
        format!("file://{trimmed}")
    } else {
        format!("file:///{trimmed}")
    }
}
