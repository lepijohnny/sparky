use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

const MODELS_DIR: &str = ".sparky/models";

static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

struct ModelSpec {
    name: &'static str,
    filename: &'static str,
    url: &'static str,
    size_bytes: u64,
}

const MODELS: &[ModelSpec] = &[
    ModelSpec {
        name: "embed",
        filename: "nomic-embed-text-v1.5.Q4_0.gguf",
        url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_0.gguf",
        size_bytes: 77_900_000,
    },
    ModelSpec {
        name: "generate",
        filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
        size_bytes: 1_049_000_000,
    },
    ModelSpec {
        name: "rerank",
        filename: "bge-reranker-v2-m3-Q4_K_M.gguf",
        url: "https://huggingface.co/gpustack/bge-reranker-v2-m3-GGUF/resolve/main/bge-reranker-v2-m3-Q4_K_M.gguf",
        size_bytes: 438_000_000,
    },
];

fn models_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot resolve home directory")?;
    let dir = home.join(MODELS_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create models dir: {e}"))?;
    Ok(dir)
}

#[derive(serde::Serialize, Clone)]
pub struct ModelStatus {
    pub name: String,
    pub filename: String,
    pub present: bool,
    pub size_bytes: u64,
}

pub fn check_models() -> Result<Vec<ModelStatus>, String> {
    let dir = models_dir()?;
    let statuses: Vec<ModelStatus> = MODELS
        .iter()
        .map(|m| {
            let path = dir.join(m.filename);
            ModelStatus {
                name: m.name.to_string(),
                filename: m.filename.to_string(),
                present: path.exists(),
                size_bytes: m.size_bytes,
            }
        })
        .collect();
    Ok(statuses)
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    pub filename: String,
    pub downloaded: u64,
    pub total: u64,
}

pub async fn download_models(app: tauri::AppHandle, filenames: Vec<String>) -> Result<(), String> {
    CANCEL_FLAG.store(false, Ordering::SeqCst);

    let dir = models_dir()?;
    let specs: Vec<(String, String, u64)> = MODELS
        .iter()
        .filter(|m| filenames.contains(&m.filename.to_string()))
        .filter(|m| !dir.join(m.filename).exists())
        .map(|m| (m.filename.to_string(), m.url.to_string(), m.size_bytes))
        .collect();

    let dir_clone = dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        for (filename, url, est_size) in &specs {
            if CANCEL_FLAG.load(Ordering::SeqCst) {
                return Err("Download cancelled".to_string());
            }

            let final_path = dir_clone.join(filename);
            let part_path = dir_clone.join(format!("{filename}.part"));

            let response = ureq::get(url)
                .call()
                .map_err(|e| format!("Download failed for {filename}: {e}"))?;

            let total = response
                .headers()
                .get("content-length")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(*est_size);

            let mut reader = response.into_body().into_reader();
            let mut file = fs::File::create(&part_path)
                .map_err(|e| format!("Failed to create {}: {e}", part_path.display()))?;

            let mut downloaded: u64 = 0;
            let mut buf = [0u8; 65536];
            let mut last_emit: u64 = 0;

            loop {
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    drop(file);
                    let _ = fs::remove_file(&part_path);
                    return Err("Download cancelled".to_string());
                }

                let n = reader.read(&mut buf).map_err(|e| {
                    let _ = fs::remove_file(&part_path);
                    format!("Read error for {filename}: {e}")
                })?;
                if n == 0 {
                    break;
                }
                std::io::Write::write_all(&mut file, &buf[..n]).map_err(|e| {
                    let _ = fs::remove_file(&part_path);
                    format!("Write error for {filename}: {e}")
                })?;
                downloaded += n as u64;

                if downloaded - last_emit > 500_000 || downloaded >= total {
                    let _ = app.emit("models:progress", DownloadProgress {
                        filename: filename.to_string(),
                        downloaded,
                        total,
                    });
                    last_emit = downloaded;
                }
            }

            fs::rename(&part_path, &final_path).map_err(|e| {
                let _ = fs::remove_file(&part_path);
                format!("Failed to rename {filename}: {e}")
            })?;
        }

        let _ = app.emit("models:complete", ());
        Ok(())
    })
    .await
    .map_err(|e| format!("Download task failed: {e}"))?
}

pub fn cancel_download() -> Result<(), String> {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    let dir = models_dir()?;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("part") {
                let _ = fs::remove_file(&path);
            }
        }
    }
    Ok(())
}
