use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(serde::Deserialize)]
struct TargetDef {
    url: String,
    extract: String,
    binary: String,
}

#[derive(serde::Deserialize)]
struct BinaryDef {
    version: String,
    targets: HashMap<String, TargetDef>,
}

fn load_binaries(manifest_dir: &Path) -> HashMap<String, BinaryDef> {
    let path = manifest_dir.join("binaries.json");
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {e}", path.display()));
    serde_json::from_str(&content)
        .unwrap_or_else(|e| panic!("Failed to parse {}: {e}", path.display()))
}

fn download_and_extract(name: &str, version: &str, target_def: &TargetDef, target: &str, out_path: &Path) {
    if out_path.exists() {
        println!(
            "cargo:warning={name} binary already exists at {}, skipping download",
            out_path.display()
        );
        return;
    }

    let url = target_def.url.replace("{version}", version);

    let tmp_dir = env::temp_dir().join(format!("{name}-download-{target}"));
    let archive_ext = match target_def.extract.as_str() {
        "tar.gz" => "tar.gz",
        "zip" => "zip",
        other => panic!("Unsupported extract format: {other}"),
    };
    let archive_path = tmp_dir.join(format!("{name}.{archive_ext}"));

    fs::create_dir_all(&tmp_dir).expect("Failed to create temp dir");

    println!("cargo:warning=Downloading {name} v{version} for {target} from {url}");
    let status = Command::new("curl")
        .args(["-L", "-f", "-o"])
        .arg(&archive_path)
        .arg(&url)
        .status()
        .expect("Failed to run curl");
    assert!(status.success(), "Failed to download {name} from {url}");

    let extract_dir = tmp_dir.join("extracted");
    let _ = fs::remove_dir_all(&extract_dir);
    fs::create_dir_all(&extract_dir).expect("Failed to create extract dir");

    match target_def.extract.as_str() {
        "zip" => {
            let status = Command::new("unzip")
                .args(["-o", "-q"])
                .arg(&archive_path)
                .arg("-d")
                .arg(&extract_dir)
                .status()
                .expect("Failed to run unzip");
            assert!(status.success(), "Failed to unzip {name}");
        }
        "tar.gz" => {
            let status = Command::new("tar")
                .args(["-xzf"])
                .arg(&archive_path)
                .arg("-C")
                .arg(&extract_dir)
                .status()
                .expect("Failed to run tar");
            assert!(status.success(), "Failed to extract {name}");
        }
        _ => {}
    }

    let bin_rel = target_def.binary.replace("{version}", version);
    let bin_path = extract_dir.join(&bin_rel);
    assert!(
        bin_path.exists(),
        "{name} binary not found at {} (expected from archive)",
        bin_path.display()
    );

    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).expect("Failed to create binaries dir");
    }
    fs::copy(&bin_path, out_path).expect(&format!("Failed to copy {name} binary"));

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(out_path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(out_path, perms).unwrap();
    }

    let _ = fs::remove_dir_all(&tmp_dir);

    println!(
        "cargo:warning={name} v{version} downloaded for {target} → {}",
        out_path.display()
    );
}

fn main() {
    let target = env::var("TARGET").expect("TARGET env not set");
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let binaries_dir = manifest_dir.join("binaries");

    println!("cargo:rerun-if-changed=binaries.json");

    let defs = load_binaries(&manifest_dir);

    for (name, def) in &defs {
        let target_def = match def.targets.get(target.as_str()) {
            Some(t) => t,
            None => {
                println!("cargo:warning=Skipping {name}: no target mapping for {target}");
                continue;
            }
        };

        let ext = if target.contains("windows") { ".exe" } else { "" };
        let bin_name = format!("{name}-{target}{ext}");
        let bin_path = binaries_dir.join(&bin_name);

        download_and_extract(name, &def.version, target_def, &target, &bin_path);

        // Create a plain-name copy for Tauri resources (no target triple, no extension).
        // Named "sparky-sidecar" so it shows up clearly in Task Manager / Activity Monitor.
        let plain_path = binaries_dir.join("sparky-sidecar");
        if bin_path.exists() && (!plain_path.exists() || fs::metadata(&plain_path).map(|m| m.len()).unwrap_or(0) != fs::metadata(&bin_path).map(|m| m.len()).unwrap_or(1)) {
            fs::copy(&bin_path, &plain_path).expect("Failed to create plain-name binary copy");
        }

        println!("cargo:rerun-if-changed={}", bin_path.display());
    }

    println!("cargo:rustc-env=TARGET_TRIPLE={target}");

    tauri_build::build()
}
