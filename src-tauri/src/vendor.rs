use serde::Serialize;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub static NODE_BIN: OnceLock<PathBuf> = OnceLock::new();

fn hidden_command(program: &PathBuf) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

pub fn node_binary() -> Result<PathBuf, String> {
    NODE_BIN.get().cloned().ok_or_else(|| "Node binary not resolved".to_string())
}

#[derive(Clone, Serialize)]
pub struct VendorDependency {
    name: String,
    id: String,
    status: String,
}

pub fn vendor_check() -> Result<Vec<VendorDependency>, String> {
    let node_ok = NODE_BIN.get().map(|p| p.exists()).unwrap_or(false);
    Ok(vec![
        VendorDependency {
            name: format!("Node.js {}", include_str!("../../.node-version").trim()),
            id: "node".to_string(),
            status: if node_ok { "installed" } else { "missing" }.to_string(),
        },
    ])
}

pub async fn vendor_version(tool: String) -> Result<Option<String>, String> {
    match tool.as_str() {
        "node" => {
            let bin = node_binary()?;
            let output = hidden_command(&bin)
                .args(["--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .map_err(|e| format!("Failed to run node --version: {e}"))?;
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let version = version.strip_prefix('v').unwrap_or(&version).to_string();
            if version.is_empty() {
                return Ok(None);
            }
            Ok(Some(version))
        }
        _ => Err(format!("Unknown tool: {tool}")),
    }
}
