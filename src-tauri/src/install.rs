use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};

use crate::branding;
use crate::manifest::Bundle;
use crate::path_resolver::{self, PathError};
use crate::state;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum InstallError {
    #[serde(rename_all = "camelCase")]
    Path { message: String },
    #[serde(rename_all = "camelCase")]
    Network { message: String },
    #[serde(rename_all = "camelCase")]
    Status { code: u16, file: String },
    #[serde(rename_all = "camelCase")]
    Io { message: String },
}

impl From<PathError> for InstallError {
    fn from(e: PathError) -> Self {
        InstallError::Path {
            message: e.to_string(),
        }
    }
}

impl std::fmt::Display for InstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InstallError::Path { message } => write!(f, "path error: {message}"),
            InstallError::Network { message } => write!(f, "network error: {message}"),
            InstallError::Status { code, file } => write!(f, "HTTP {code} downloading {file}"),
            InstallError::Io { message } => write!(f, "io error: {message}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub bundle_id: String,
    pub current_file: String,
    pub completed: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub bundle_id: String,
    pub install_type: String,
    pub installed_files: Vec<String>,
    pub install_dir: String,
}

fn http_client() -> Result<reqwest::Client, InstallError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent(format!("{}/0.1", branding::APP_NAME))
        .build()
        .map_err(|e| InstallError::Network {
            message: e.to_string(),
        })
}

async fn download_to(client: &reqwest::Client, url: &str, dest: &Path) -> Result<(), InstallError> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| InstallError::Network {
            message: e.to_string(),
        })?;
    let status = resp.status();
    if !status.is_success() {
        return Err(InstallError::Status {
            code: status.as_u16(),
            file: url.to_string(),
        });
    }
    let bytes = resp.bytes().await.map_err(|e| InstallError::Network {
        message: e.to_string(),
    })?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| InstallError::Io {
                message: e.to_string(),
            })?;
    }
    tokio::fs::write(dest, &bytes)
        .await
        .map_err(|e| InstallError::Io {
            message: e.to_string(),
        })?;
    Ok(())
}

async fn current_folder_label() -> String {
    state::read_state()
        .await
        .map(|s| s.settings.folder_label)
        .unwrap_or_else(|_| "MCM Vault".into())
}

#[tauri::command]
pub async fn install_bundle(
    window: Window,
    bundle: Bundle,
) -> Result<InstallResult, InstallError> {
    let folder_label = current_folder_label().await;
    let target =
        path_resolver::resolve_install_path(&bundle.category, &bundle.preset_type, &folder_label)?;
    let install_dir = PathBuf::from(&target.path);
    state::log_event(
        "INFO",
        format!(
            "install_bundle id={} version={} files={} target={}",
            bundle.id,
            bundle.version,
            bundle.files.len(),
            install_dir.display()
        ),
    );

    let staging_root = state::app_data_dir()
        .map_err(|e| InstallError::Path {
            message: e.to_string(),
        })?
        .join("staging")
        .join(&bundle.id);
    tokio::fs::create_dir_all(&staging_root)
        .await
        .map_err(|e| InstallError::Io {
            message: e.to_string(),
        })?;

    let client = http_client()?;
    let total = bundle.files.len();
    let mut staged: Vec<(PathBuf, PathBuf)> = Vec::with_capacity(total);

    for (idx, file_name) in bundle.files.iter().enumerate() {
        let _ = window.emit(
            "install-progress",
            InstallProgress {
                bundle_id: bundle.id.clone(),
                current_file: file_name.clone(),
                completed: idx,
                total,
            },
        );
        let url = branding::bundle_file_url(&bundle.path, file_name);
        let staged_path = staging_root.join(file_name);
        let final_path = install_dir.join(file_name);
        download_to(&client, &url, &staged_path).await.map_err(|e| {
            let _ = std::fs::remove_dir_all(&staging_root);
            e
        })?;
        staged.push((staged_path, final_path));
    }

    tokio::fs::create_dir_all(&install_dir)
        .await
        .map_err(|e| InstallError::Io {
            message: e.to_string(),
        })?;

    let mut installed_files = Vec::with_capacity(total);
    for (src, dst) in &staged {
        if let Some(parent) = dst.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| InstallError::Io {
                    message: e.to_string(),
                })?;
        }
        tokio::fs::copy(src, dst).await.map_err(|e| InstallError::Io {
            message: e.to_string(),
        })?;
        installed_files.push(dst.to_string_lossy().to_string());
    }

    let _ = tokio::fs::remove_dir_all(&staging_root).await;

    let _ = window.emit(
        "install-progress",
        InstallProgress {
            bundle_id: bundle.id.clone(),
            current_file: String::new(),
            completed: total,
            total,
        },
    );

    Ok(InstallResult {
        bundle_id: bundle.id.clone(),
        install_type: target.install_type,
        installed_files,
        install_dir: install_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn uninstall_bundle(files: Vec<String>) -> Result<usize, InstallError> {
    let mut removed = 0usize;
    for path in &files {
        let p = PathBuf::from(path);
        if p.exists() {
            tokio::fs::remove_file(&p)
                .await
                .map_err(|e| InstallError::Io {
                    message: e.to_string(),
                })?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub async fn reveal_path(path: String) -> Result<(), InstallError> {
    let target = PathBuf::from(&path);
    let to_open = if target.is_file() {
        target
            .parent()
            .map(PathBuf::from)
            .unwrap_or(target)
    } else {
        target
    };
    let _ = open::that(to_open);
    Ok(())
}

#[tauri::command]
pub async fn open_vault_folder() -> Result<String, InstallError> {
    let docs = dirs::document_dir().ok_or_else(|| InstallError::Path {
        message: "no Documents directory".into(),
    })?;
    let folder = docs.join("MCM Vault Presets");
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|e| InstallError::Io {
            message: e.to_string(),
        })?;
    let _ = open::that(&folder);
    Ok(folder.to_string_lossy().to_string())
}

/// Resolve the canonical install folder for a (category, preset_type), create
/// it if missing, and open it in the OS file manager. Used by Reveal buttons
/// in the bundle detail view and manual-import modal so they work even when
/// no files have been installed yet.
#[tauri::command]
pub async fn reveal_bundle_folder(
    category: String,
    preset_type: String,
    folder_label: String,
) -> Result<String, InstallError> {
    let target = path_resolver::resolve_install_path(&category, &preset_type, &folder_label)?;
    let path = PathBuf::from(&target.path);
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| InstallError::Io {
            message: e.to_string(),
        })?;
    let _ = open::that(&path);
    Ok(target.path)
}
