use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn make_git_command(args: &[&str], cwd: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(cwd).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

use crate::branding;
use crate::manifest::{self, Bundle};
use crate::state;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PublisherError {
    #[serde(rename_all = "camelCase")]
    Io { message: String },
    #[serde(rename_all = "camelCase")]
    Git { message: String },
    #[serde(rename_all = "camelCase")]
    Manifest { message: String },
    #[serde(rename_all = "camelCase")]
    State { message: String },
    #[serde(rename_all = "camelCase")]
    Path { message: String },
}

impl std::fmt::Display for PublisherError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PublisherError::Io { message } => write!(f, "io error: {message}"),
            PublisherError::Git { message } => write!(f, "git error: {message}"),
            PublisherError::Manifest { message } => write!(f, "manifest error: {message}"),
            PublisherError::State { message } => write!(f, "state error: {message}"),
            PublisherError::Path { message } => write!(f, "path error: {message}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    pub name: String,
    pub size: u64,
    pub mtime_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleDiff {
    pub bundle_id: String,
    pub source_path: String,
    pub source_exists: bool,
    pub current_files: Vec<ScannedFile>,
    pub added: Vec<String>,
    pub modified: Vec<String>,
    pub removed: Vec<String>,
}

impl BundleDiff {
    pub fn has_changes(&self) -> bool {
        !self.added.is_empty() || !self.modified.is_empty() || !self.removed.is_empty()
    }
}

fn mtime_ms(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn scan_folder(path: &Path) -> Vec<ScannedFile> {
    let mut out = Vec::new();
    scan_recursive(path, path, &mut out);
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn scan_recursive(base: &Path, current: &Path, out: &mut Vec<ScannedFile>) {
    let Ok(read) = std::fs::read_dir(current) else { return };
    for entry in read.flatten() {
        let p = entry.path();
        let Some(file_name) = p.file_name().and_then(|n| n.to_str()) else { continue };
        if file_name.starts_with('.') || file_name.eq_ignore_ascii_case("_PLACEHOLDER.md") {
            continue;
        }
        if p.is_dir() {
            scan_recursive(base, &p, out);
        } else if p.is_file() {
            let rel = p.strip_prefix(base).unwrap_or(&p);
            let name = rel.to_string_lossy().replace('\\', "/");
            let Ok(meta) = entry.metadata() else { continue };
            out.push(ScannedFile {
                name,
                size: meta.len(),
                mtime_ms: mtime_ms(&meta),
            });
        }
    }
}

fn diff_for_bundle(
    bundle_id: &str,
    source_path: &str,
    baseline: &BTreeMap<String, state::PublisherFile>,
) -> BundleDiff {
    let path = PathBuf::from(source_path);
    let source_exists = path.is_dir();
    let current = if source_exists {
        scan_folder(&path)
    } else {
        Vec::new()
    };
    let current_map: BTreeMap<&String, &ScannedFile> =
        current.iter().map(|f| (&f.name, f)).collect();

    let mut added = Vec::new();
    let mut modified = Vec::new();
    for f in &current {
        match baseline.get(&f.name) {
            None => added.push(f.name.clone()),
            Some(prev) => {
                if prev.size != f.size {
                    modified.push(f.name.clone());
                }
            }
        }
    }
    let mut removed = Vec::new();
    for name in baseline.keys() {
        if !current_map.contains_key(name) {
            removed.push(name.clone());
        }
    }

    BundleDiff {
        bundle_id: bundle_id.to_string(),
        source_path: source_path.to_string(),
        source_exists,
        current_files: current,
        added,
        modified,
        removed,
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanInput {
    pub bundle_id: String,
    pub source_path: String,
    #[serde(default)]
    pub baseline: BTreeMap<String, state::PublisherFile>,
}

#[tauri::command]
pub fn scan_publish_diffs(inputs: Vec<ScanInput>) -> Vec<BundleDiff> {
    inputs
        .into_iter()
        .map(|i| diff_for_bundle(&i.bundle_id, &i.source_path, &i.baseline))
        .collect()
}

fn publisher_repo_dir() -> Result<PathBuf, PublisherError> {
    let base = state::app_data_dir().map_err(|e| PublisherError::State {
        message: e.to_string(),
    })?;
    Ok(base.join("publish").join(branding::REPO_NAME))
}

async fn ensure_repo_cloned() -> Result<PathBuf, PublisherError> {
    let dir = publisher_repo_dir()?;
    if dir.join(".git").exists() {
        // Pull latest before mutating
        run_git(&dir, &["fetch", "origin", branding::REPO_BRANCH]).await?;
        run_git(&dir, &["reset", "--hard", &format!("origin/{}", branding::REPO_BRANCH)]).await?;
        return Ok(dir);
    }
    if let Some(parent) = dir.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| PublisherError::Io {
                message: e.to_string(),
            })?;
    }
    let url = format!(
        "https://github.com/{}/{}.git",
        branding::REPO_OWNER,
        branding::REPO_NAME
    );
    // Clone from parent directory into the named subfolder
    let parent = dir.parent().ok_or_else(|| PublisherError::Path {
        message: "publish dir has no parent".into(),
    })?;
    run_git(parent, &["clone", &url, branding::REPO_NAME]).await?;
    Ok(dir)
}

async fn run_git(cwd: &Path, args: &[&str]) -> Result<String, PublisherError> {
    let output = make_git_command(args, cwd)
        .output()
        .await
        .map_err(|e| PublisherError::Git {
            message: format!("spawn git failed: {e}"),
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(PublisherError::Git {
            message: format!(
                "git {} failed: {}",
                args.join(" "),
                stderr.lines().next_back().unwrap_or(&stderr)
            ),
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn bump_patch(version: &str) -> String {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() == 2 {
        if let (Ok(major), Ok(minor)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
            return format!("{}.{}", major, minor + 1);
        }
    }
    if parts.len() == 3 {
        if let (Ok(a), Ok(b), Ok(c)) = (
            parts[0].parse::<u32>(),
            parts[1].parse::<u32>(),
            parts[2].parse::<u32>(),
        ) {
            return format!("{}.{}.{}", a, b, c + 1);
        }
    }
    // Non-semver: append .1
    format!("{}.1", version)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishPlan {
    pub bundle_id: String,
    pub source_path: String,
    /// File names the user has checked on this machine. Must all exist in source_path.
    /// Files in the existing manifest's bundle.files that are NOT locally present are
    /// preserved (they're owned by another machine).
    pub included_file_names: Vec<String>,
    /// Bundle's preset_type — used to apply per-type repo-layout transforms
    /// (e.g. `keyboard` files get a `win/` or `mac/` prefix based on current OS
    /// when written into the repo + manifest).
    #[serde(default)]
    pub preset_type: String,
    /// Repo-space file names the user has explicitly marked to remove from the manifest.
    #[serde(default)]
    pub explicitly_excluded: Vec<String>,
    /// Local file names this machine published last time (keys from lastPublishedFiles).
    /// Used to auto-clean renamed/deleted files from the manifest.
    #[serde(default)]
    pub prior_local_names: Vec<String>,
}

/// Translate a flat local file name into the path/key the manifest + repo use.
/// For most preset types this is identity. For `keyboard`, prefixes the file
/// with the current OS's subfolder name (`win/` or `mac/`) so the same bundle
/// can carry separate Windows and macOS `.kys` files without collision.
fn repo_name_for(preset_type: &str, local_name: &str) -> String {
    if preset_type == "keyboard" {
        let prefix = if cfg!(target_os = "macos") { "mac/" } else { "win/" };
        format!("{prefix}{local_name}")
    } else {
        local_name.to_string()
    }
}

/// True if `repo_name` is a file the current platform's publisher is
/// responsible for (i.e. could have produced it from a local scan). Used to
/// decide whether the repo-cleanup step is allowed to delete it; files owned
/// by the other-platform maintainer must be left alone.
fn is_local_platform_file(preset_type: &str, repo_name: &str) -> bool {
    if preset_type != "keyboard" {
        return true;
    }
    let normalized = repo_name.replace('\\', "/");
    let my_prefix = if cfg!(target_os = "macos") { "mac/" } else { "win/" };
    normalized.starts_with(my_prefix)
}

fn walk_repo_files(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    walk_repo_files_inner(root, root, &mut out);
    out
}

fn walk_repo_files_inner(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let p = entry.path();
        if p.is_dir() {
            walk_repo_files_inner(root, &p, out);
        } else if p.is_file() {
            if let Ok(rel) = p.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishProgressEvent {
    pub bundle_id: Option<String>,
    pub phase: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub published: Vec<PublishedBundle>,
    pub commit_sha: Option<String>,
    pub manifest_url: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PublishedBundle {
    pub bundle_id: String,
    pub new_version: String,
    pub file_signatures: BTreeMap<String, state::PublisherFile>,
    pub published_at: String,
}

#[tauri::command]
pub async fn publish_bundles(app_handle: AppHandle, plans: Vec<PublishPlan>) -> Result<PublishResult, PublisherError> {
    if plans.is_empty() {
        return Err(PublisherError::Manifest {
            message: "nothing to publish".into(),
        });
    }
    state::log_event(
        "INFO",
        format!(
            "publish_bundles start ({} bundle{})",
            plans.len(),
            if plans.len() == 1 { "" } else { "s" }
        ),
    );
    let repo = ensure_repo_cloned().await?;

    let manifest_path = repo.join("manifest.json");
    let manifest_bytes = tokio::fs::read(&manifest_path)
        .await
        .map_err(|e| PublisherError::Io {
            message: format!("read manifest: {e}"),
        })?;
    let mut manifest_value: serde_json::Value =
        serde_json::from_slice(&manifest_bytes).map_err(|e| PublisherError::Manifest {
            message: e.to_string(),
        })?;

    let bundles_array = manifest_value
        .get_mut("bundles")
        .and_then(|v| v.as_array_mut())
        .ok_or_else(|| PublisherError::Manifest {
            message: "manifest.json has no bundles array".into(),
        })?;

    let mut published = Vec::new();

    for plan in &plans {
        let _ = app_handle.emit("publish-progress", PublishProgressEvent {
            bundle_id: Some(plan.bundle_id.clone()),
            phase: "copying".into(),
        });
        let bundle_index = bundles_array
            .iter()
            .position(|b| b.get("id").and_then(|i| i.as_str()) == Some(plan.bundle_id.as_str()))
            .ok_or_else(|| PublisherError::Manifest {
                message: format!("bundle '{}' not found in manifest", plan.bundle_id),
            })?;

        let bundle_value = &mut bundles_array[bundle_index];
        let current_version = bundle_value
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("1.0")
            .to_string();
        let new_version = bump_patch(&current_version);
        let bundle_path = bundle_value
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| PublisherError::Manifest {
                message: format!("bundle '{}' missing path field", plan.bundle_id),
            })?
            .to_string();

        let current_manifest_files: std::collections::HashSet<String> = bundle_value
            .get("files")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let preset_type = plan.preset_type.as_str();

        // Scan local source folder so we know which files this machine has.
        let local_scan = scan_folder(&PathBuf::from(&plan.source_path));
        let local_names: std::collections::HashSet<String> =
            local_scan.iter().map(|f| f.name.clone()).collect();
        // Same names projected into repo-space (with `win/`/`mac/` prefix for
        // keyboard bundles) so cross-machine comparison vs current_manifest_files
        // works regardless of the layout transform.
        let local_repo_names: std::collections::HashSet<String> = local_scan
            .iter()
            .map(|f| repo_name_for(preset_type, &f.name))
            .collect();

        // Validate: every name the user wants to publish must actually exist locally.
        for name in &plan.included_file_names {
            if !local_names.contains(name) {
                return Err(PublisherError::Io {
                    message: format!(
                        "file '{}' not found in source folder '{}'",
                        name, plan.source_path
                    ),
                });
            }
        }

        let included_set: std::collections::HashSet<String> =
            plan.included_file_names.iter().cloned().collect();

        // Cross-machine semantics:
        //   preserved = manifest files NOT locally present (other machines own them)
        //   new files = preserved + included (in repo-space)

        // Repo-space names this machine previously published (for auto-cleanup of renames/deletes)
        let prior_repo_names: std::collections::HashSet<String> = plan.prior_local_names
            .iter()
            .map(|n| repo_name_for(preset_type, n))
            .collect();

        // Preserve manifest files that:
        //   - don't exist locally (another machine owns them)
        //   - aren't explicitly excluded by the user
        //   - weren't previously published by THIS machine (auto-clean renames/deletes)
        let mut new_bundle_files: Vec<String> = current_manifest_files
            .iter()
            .filter(|name| {
                !local_repo_names.contains(*name)
                    && !plan.explicitly_excluded.contains(*name)
                    && !prior_repo_names.contains(*name)
            })
            .cloned()
            .collect();
        for name in &plan.included_file_names {
            let repo_rel = repo_name_for(preset_type, name);
            if !new_bundle_files.contains(&repo_rel) {
                new_bundle_files.push(repo_rel);
            }
        }
        new_bundle_files.sort();

        let target_dir = repo.join(&bundle_path);
        tokio::fs::create_dir_all(&target_dir)
            .await
            .map_err(|e| PublisherError::Io {
                message: e.to_string(),
            })?;

        let want_in_repo: Vec<String> = new_bundle_files.clone();

        // Sync repo's bundle folder against new_bundle_files. Walk recursively
        // so subdirs (e.g. keyboard's `win/`/`mac/`) are covered. Only delete
        // files this machine "owns" — i.e. the ones the local platform could
        // have produced — so a Windows publisher doesn't wipe Mac files and
        // vice versa. Use case-insensitive comparison so macOS case folding
        // doesn't cause files to be incorrectly deleted before re-copy.
        for rel in walk_repo_files(&target_dir) {
            if rel.eq_ignore_ascii_case("_PLACEHOLDER.md") {
                continue;
            }
            if want_in_repo.iter().any(|w| w.eq_ignore_ascii_case(&rel)) {
                continue;
            }
            if !is_local_platform_file(preset_type, &rel) {
                continue;
            }
            let _ = tokio::fs::remove_file(target_dir.join(&rel)).await;
        }

        // Copy this machine's checked files into the repo (overwrite). Stored
        // signatures use FLAT local names (matches what `scan_folder` returns
        // on the next launch) so the diff comparison stays consistent with
        // what the user sees in the publisher UI.
        let mut signatures: BTreeMap<String, state::PublisherFile> = BTreeMap::new();
        for f in &local_scan {
            if !included_set.contains(&f.name) {
                continue;
            }
            let repo_rel = repo_name_for(preset_type, &f.name);
            let src = PathBuf::from(&plan.source_path).join(&f.name);
            let dst = target_dir.join(&repo_rel);
            if let Some(parent) = dst.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| PublisherError::Io {
                        message: e.to_string(),
                    })?;
            }
            tokio::fs::copy(&src, &dst)
                .await
                .map_err(|e| PublisherError::Io {
                    message: format!("copy {}: {e}", f.name),
                })?;
            signatures.insert(
                f.name.clone(),
                state::PublisherFile {
                    size: f.size,
                    mtime_ms: f.mtime_ms,
                },
            );
        }

        // Remap new_bundle_files to the actual on-disk casing after all copies.
        // On case-insensitive filesystems (macOS, Windows), create_dir_all may
        // reuse a differently-cased existing directory. The manifest must reflect
        // what git actually tracks, not what we intended, so raw content URLs match.
        let actual_paths = walk_repo_files(&target_dir);
        let actual_path_map: std::collections::HashMap<String, String> = actual_paths
            .iter()
            .filter(|p| !p.eq_ignore_ascii_case("_PLACEHOLDER.md"))
            .map(|p| (p.to_lowercase(), p.clone()))
            .collect();
        new_bundle_files = new_bundle_files
            .into_iter()
            .map(|name| {
                actual_path_map
                    .get(&name.to_lowercase())
                    .cloned()
                    .unwrap_or(name)
            })
            .collect();
        new_bundle_files.sort();

        // Update manifest entry: version, files.
        let bundle_obj = bundle_value
            .as_object_mut()
            .ok_or_else(|| PublisherError::Manifest {
                message: "bundle entry not an object".into(),
            })?;
        bundle_obj.insert("version".into(), serde_json::Value::String(new_version.clone()));
        bundle_obj.insert(
            "files".into(),
            serde_json::Value::Array(
                new_bundle_files
                    .iter()
                    .map(|name| serde_json::Value::String(name.clone()))
                    .collect(),
            ),
        );

        let _ = app_handle.emit("publish-progress", PublishProgressEvent {
            bundle_id: Some(plan.bundle_id.clone()),
            phase: "done".into(),
        });
        published.push(PublishedBundle {
            bundle_id: plan.bundle_id.clone(),
            new_version,
            file_signatures: signatures,
            published_at: chrono::Utc::now().to_rfc3339(),
        });
    }

    // Update top-level updatedAt
    if let Some(obj) = manifest_value.as_object_mut() {
        obj.insert(
            "updatedAt".into(),
            serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
        );
    }

    // Validate the result still parses as our Manifest type
    let _: manifest::Manifest =
        serde_json::from_value(manifest_value.clone()).map_err(|e| PublisherError::Manifest {
            message: format!("manifest validation failed: {e}"),
        })?;

    let bytes =
        serde_json::to_vec_pretty(&manifest_value).map_err(|e| PublisherError::Manifest {
            message: e.to_string(),
        })?;
    tokio::fs::write(&manifest_path, bytes)
        .await
        .map_err(|e| PublisherError::Io {
            message: format!("write manifest: {e}"),
        })?;

    // git add + commit + push
    let _ = app_handle.emit("publish-progress", PublishProgressEvent {
        bundle_id: None,
        phase: "committing".into(),
    });
    run_git(&repo, &["add", "-A"]).await?;
    let summary = published
        .iter()
        .map(|p| format!("{} -> {}", p.bundle_id, p.new_version))
        .collect::<Vec<_>>()
        .join(", ");
    let commit_msg = format!("Publish from MCM Vault: {summary}");
    let commit_out = make_git_command(&["commit", "-m", &commit_msg], &repo)
        .output()
        .await
        .map_err(|e| PublisherError::Git {
            message: e.to_string(),
        })?;
    if !commit_out.status.success() {
        let stderr = String::from_utf8_lossy(&commit_out.stderr).to_string();
        // "nothing to commit" means files matched repo state; treat as benign
        if !stderr.contains("nothing to commit") {
            return Err(PublisherError::Git {
                message: format!("git commit failed: {stderr}"),
            });
        }
    }
    run_git(&repo, &["push", "origin", branding::REPO_BRANCH]).await?;
    let _ = app_handle.emit("publish-progress", PublishProgressEvent {
        bundle_id: None,
        phase: "complete".into(),
    });
    let sha = run_git(&repo, &["rev-parse", "HEAD"]).await.ok().map(|s| s.trim().to_string());

    Ok(PublishResult {
        published,
        commit_sha: sha,
        manifest_url: branding::manifest_url(),
    })
}

/// Undo the most recent publish by reverting that specific commit and pushing
/// the revert. We revert the exact SHA (not just HEAD) so it still works if a
/// teammate pushed after us — `git revert` creates a NEW commit that undoes the
/// named one, restoring the prior manifest + bundle files without rewriting
/// history. On conflict (the same files changed since) we abort cleanly and ask
/// the maintainer to resolve manually rather than leave the repo half-reverted.
#[tauri::command]
pub async fn revert_last_publish(sha: String) -> Result<String, PublisherError> {
    let trimmed = sha.trim();
    if trimmed.is_empty() {
        return Err(PublisherError::Git {
            message: "no publish to revert".into(),
        });
    }
    state::log_event("INFO", format!("revert_last_publish sha={trimmed}"));
    let repo = ensure_repo_cloned().await?;

    let revert_out = make_git_command(&["revert", "--no-edit", trimmed], &repo)
        .output()
        .await
        .map_err(|e| PublisherError::Git {
            message: format!("spawn git revert failed: {e}"),
        })?;
    if !revert_out.status.success() {
        let stderr = String::from_utf8_lossy(&revert_out.stderr).to_string();
        // Leave the working tree clean so the next publish/revert isn't blocked.
        let _ = make_git_command(&["revert", "--abort"], &repo)
            .output()
            .await;
        return Err(PublisherError::Git {
            message: format!(
                "couldn't auto-revert (the files likely changed since): {}",
                stderr.lines().next_back().unwrap_or(&stderr)
            ),
        });
    }

    run_git(&repo, &["push", "origin", branding::REPO_BRANCH]).await?;
    let new_sha = run_git(&repo, &["rev-parse", "HEAD"])
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    state::log_event(
        "INFO",
        format!("revert_last_publish OK reverted={trimmed} new={new_sha}"),
    );
    Ok(new_sha)
}

#[tauri::command]
pub fn publisher_default_source(
    bundle: Bundle,
    folder_label: String,
) -> Result<String, PublisherError> {
    use crate::path_resolver;
    let resolved = path_resolver::resolve_install_path(
        &bundle.category,
        &bundle.preset_type,
        &folder_label,
    )
    .map_err(|e| PublisherError::Path {
        message: e.to_string(),
    })?;
    Ok(resolved.path)
}
