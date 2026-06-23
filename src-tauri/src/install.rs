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
    /// Snapshot of the previous install (if any). Frontend persists this in
    /// state.installedBundles[id].previousInstall so the user can restore.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_install: Option<state::PreviousInstall>,
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

async fn current_settings() -> (String, state::InstallTargets) {
    state::read_state()
        .await
        .map(|s| (s.settings.folder_label, s.settings.install_targets))
        .unwrap_or_else(|_| ("MCM Vault".into(), state::InstallTargets::default()))
}

/// Per-file install routing. For most preset types this is a no-op (file
/// installs to `base_install_dir/<name>`). For `keyboard` bundles, files carry
/// a `win/` or `mac/` prefix in the manifest; the prefix is stripped and the
/// file is routed into the matching `Win/` or `Mac/` subfolder of the Premiere
/// profile. Files for the wrong platform return `None` and are skipped.
fn route_for_file(
    preset_type: &str,
    base_install_dir: &Path,
    file_name: &str,
) -> Option<(PathBuf, String)> {
    if preset_type == "keyboard" {
        let normalized = file_name.replace('\\', "/");
        if let Some(rest) = normalized.strip_prefix("win/") {
            if cfg!(target_os = "windows") {
                return Some((base_install_dir.join("Win"), rest.to_string()));
            }
            return None;
        }
        if let Some(rest) = normalized.strip_prefix("mac/") {
            if cfg!(target_os = "macos") {
                return Some((base_install_dir.join("Mac"), rest.to_string()));
            }
            return None;
        }
        // Keyboard bundle file without a platform prefix — skip rather than
        // dumping it into Profile-<user> root.
        return None;
    }
    Some((base_install_dir.to_path_buf(), file_name.to_string()))
}

async fn snapshot_previous(
    bundle_id: &str,
    prev_version: &str,
    prev_files: &[String],
) -> Result<Option<state::PreviousInstall>, InstallError> {
    let existing: Vec<&String> = prev_files
        .iter()
        .filter(|p| std::path::Path::new(p).exists())
        .collect();
    if existing.is_empty() {
        return Ok(None);
    }
    let snapshots = state::snapshots_dir().map_err(|e| InstallError::Path {
        message: e.to_string(),
    })?;
    let bundle_root = snapshots.join(bundle_id);

    // Only the most recent snapshot is reachable from state.installedBundles —
    // older ones are orphaned. Wipe them before writing the new one so the
    // snapshots directory doesn't grow unboundedly across many updates.
    if bundle_root.exists() {
        let _ = tokio::fs::remove_dir_all(&bundle_root).await;
    }

    let ts = chrono::Utc::now().timestamp_millis();
    let safe_version = prev_version.replace(['.', '/', '\\'], "_");
    let snap_dir = bundle_root.join(format!("{safe_version}_{ts}"));
    tokio::fs::create_dir_all(&snap_dir)
        .await
        .map_err(|e| InstallError::Io {
            message: e.to_string(),
        })?;

    let mut snapshot_paths = Vec::with_capacity(existing.len());
    let mut original_paths = Vec::with_capacity(existing.len());
    for (i, orig) in existing.iter().enumerate() {
        let p = PathBuf::from(orig);
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let snap_name = format!("{i:03}__{name}");
        let snap_path = snap_dir.join(&snap_name);
        tokio::fs::copy(&p, &snap_path)
            .await
            .map_err(|e| InstallError::Io {
                message: e.to_string(),
            })?;
        snapshot_paths.push(snap_path.to_string_lossy().to_string());
        original_paths.push(orig.to_string());
    }

    Ok(Some(state::PreviousInstall {
        version: prev_version.to_string(),
        original_paths,
        snapshot_paths,
        archived_at: chrono::Utc::now().to_rfc3339(),
    }))
}

#[tauri::command]
pub async fn install_bundle(
    window: Window,
    bundle: Bundle,
    path_override: Option<String>,
) -> Result<InstallResult, InstallError> {
    let (folder_label, install_targets) = current_settings().await;

    // Resolve all target install dirs. A user-supplied path_override bypasses
    // auto-detection entirely and installs to exactly that one directory.
    let targets = if let Some(ref custom) = path_override {
        vec![path_resolver::ResolvedTarget {
            path: custom.clone(),
            install_type: "auto".into(),
        }]
    } else {
        path_resolver::resolve_install_paths(
            &bundle.category,
            &bundle.preset_type,
            &folder_label,
            &install_targets,
        )?
    };

    // Snapshot the previous install (if any) before overwriting.
    let app_state = state::read_state().await.ok();
    let previous_install = if let Some(s) = &app_state {
        if let Some(prev) = s.installed_bundles.get(&bundle.id) {
            snapshot_previous(&bundle.id, &prev.version, &prev.files).await?
        } else {
            None
        }
    } else {
        None
    };

    state::log_event(
        "INFO",
        format!(
            "install_bundle id={} version={} files={} targets={}",
            bundle.id,
            bundle.version,
            bundle.files.len(),
            targets
                .iter()
                .map(|t| t.path.as_str())
                .collect::<Vec<_>>()
                .join(" | ")
        ),
    );

    // Download once into staging.
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
    let mut staged: Vec<(PathBuf, String)> = Vec::with_capacity(total);

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
        download_to(&client, &url, &staged_path).await.map_err(|e| {
            let _ = std::fs::remove_dir_all(&staging_root);
            e
        })?;
        staged.push((staged_path, file_name.clone()));
    }

    // Copy the staged files into every target dir.
    let mut installed_files = Vec::with_capacity(total * targets.len().max(1));
    for target in &targets {
        let install_dir = PathBuf::from(&target.path);
        for (src, name) in &staged {
            let Some((dst_dir, basename)) =
                route_for_file(&bundle.preset_type, &install_dir, name)
            else {
                continue;
            };
            tokio::fs::create_dir_all(&dst_dir)
                .await
                .map_err(|e| InstallError::Io {
                    message: e.to_string(),
                })?;
            let dst = dst_dir.join(&basename);
            if let Some(parent) = dst.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| InstallError::Io {
                        message: e.to_string(),
                    })?;
            }
            tokio::fs::copy(src, &dst)
                .await
                .map_err(|e| InstallError::Io {
                    message: e.to_string(),
                })?;
            installed_files.push(dst.to_string_lossy().to_string());
        }
    }

    let _ = tokio::fs::remove_dir_all(&staging_root).await;

    // Clean up stale tracked files: anything we wrote in the prior install that
    // isn't in this install. This catches renames so receivers don't end up
    // with both old + new copies of the same preset. We only ever delete files
    // we previously wrote (tracked in installed_bundles[id].files) — user-
    // created files in the same folder are not touched. The previous install
    // was already snapshotted above, so the Restore button brings these back
    // if a maintainer publishes a bundle by mistake.
    let mut removed_stale = 0usize;
    if let Some(prev) = app_state
        .as_ref()
        .and_then(|s| s.installed_bundles.get(&bundle.id))
    {
        let new_set: std::collections::HashSet<&String> = installed_files.iter().collect();
        for stale in prev.files.iter().filter(|p| !new_set.contains(*p)) {
            let p = std::path::Path::new(stale);
            if p.exists() {
                match tokio::fs::remove_file(p).await {
                    Ok(_) => removed_stale += 1,
                    Err(e) => state::log_event(
                        "WARN",
                        format!("cleanup stale file failed: {stale}: {e}"),
                    ),
                }
            }
        }
        if removed_stale > 0 {
            state::log_event(
                "INFO",
                format!(
                    "install_bundle id={} cleaned {removed_stale} stale file(s) from prior install",
                    bundle.id
                ),
            );
        }
    }

    let _ = window.emit(
        "install-progress",
        InstallProgress {
            bundle_id: bundle.id.clone(),
            current_file: String::new(),
            completed: total,
            total,
        },
    );

    let first_target = targets
        .first()
        .map(|t| t.path.clone())
        .unwrap_or_default();
    let install_type = targets
        .first()
        .map(|t| t.install_type.clone())
        .unwrap_or_else(|| "auto".into());

    Ok(InstallResult {
        bundle_id: bundle.id.clone(),
        install_type,
        installed_files,
        install_dir: first_target,
        previous_install,
    })
}

#[tauri::command]
pub async fn restore_previous_install(
    previous: state::PreviousInstall,
) -> Result<usize, InstallError> {
    let mut restored = 0usize;
    for (snap, orig) in previous
        .snapshot_paths
        .iter()
        .zip(previous.original_paths.iter())
    {
        let snap_path = PathBuf::from(snap);
        if !snap_path.exists() {
            continue;
        }
        let orig_path = PathBuf::from(orig);
        if let Some(parent) = orig_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| InstallError::Io {
                    message: e.to_string(),
                })?;
        }
        tokio::fs::copy(&snap_path, &orig_path)
            .await
            .map_err(|e| InstallError::Io {
                message: e.to_string(),
            })?;
        restored += 1;
    }

    // Snapshots are no longer referenced by state once the frontend clears
    // previousInstall. Best-effort wipe of the parent dir so they don't leak.
    if let Some(first) = previous.snapshot_paths.first() {
        if let Some(snap_dir) = std::path::Path::new(first).parent() {
            let _ = tokio::fs::remove_dir_all(snap_dir).await;
            // Also remove the bundle_id parent dir if it's now empty.
            if let Some(bundle_root) = snap_dir.parent() {
                let _ = tokio::fs::remove_dir(bundle_root).await;
            }
        }
    }

    state::log_event(
        "INFO",
        format!("restore_previous_install version={} restored={restored}", previous.version),
    );
    Ok(restored)
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

/// Remove every file MCM Vault installed on this machine (all tracked bundle
/// files across all install targets) and wipe the app's data directory
/// (state.json, logs, snapshots, staging, the publisher's repo clone). For a
/// roaming freelancer leaving a borrowed/client machine — one action, no
/// trace left behind. Returns the number of installed files deleted. Does NOT
/// touch files the user created themselves (only tracked installs).
#[tauri::command]
pub async fn wipe_this_machine() -> Result<usize, InstallError> {
    let mut removed = 0usize;
    if let Ok(s) = state::read_state().await {
        for bundle in s.installed_bundles.values() {
            for f in &bundle.files {
                let p = PathBuf::from(f);
                if p.exists() && tokio::fs::remove_file(&p).await.is_ok() {
                    removed += 1;
                }
            }
        }
    }
    state::log_event(
        "INFO",
        format!("wipe_this_machine removed {removed} installed file(s) + app data"),
    );
    // Remove the entire app data dir last (this also deletes the log we just
    // wrote, plus snapshots, staging, and any publisher repo clone).
    if let Ok(dir) = state::app_data_dir() {
        let _ = tokio::fs::remove_dir_all(&dir).await;
    }
    Ok(removed)
}

#[tauri::command]
pub async fn reveal_path(path: String) -> Result<(), InstallError> {
    let target = PathBuf::from(&path);
    // If the path points at a file that exists, open its parent folder.
    // If the path is a dir that exists, open it.
    // If the path doesn't exist (file was renamed/deleted since we tracked it),
    // walk up the ancestry until we find a folder that does — never error out
    // and never trigger Windows' "cannot find file" dialog.
    let to_open: Option<PathBuf> = if target.is_file() {
        target.parent().map(PathBuf::from)
    } else if target.is_dir() {
        Some(target.clone())
    } else {
        target.ancestors().find(|p| p.exists()).map(PathBuf::from)
    };
    if let Some(p) = to_open {
        let _ = open::that(p);
    }
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
