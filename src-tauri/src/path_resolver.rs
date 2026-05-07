use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PathError {
    #[serde(rename_all = "camelCase")]
    NoUserDirs { message: String },
    #[serde(rename_all = "camelCase")]
    NoVersion { app: String },
    #[serde(rename_all = "camelCase")]
    UnknownPresetType { preset_type: String },
    #[serde(rename_all = "camelCase")]
    Io { message: String },
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathError::NoUserDirs { message } => write!(f, "user dirs error: {message}"),
            PathError::NoVersion { app } => write!(f, "no installed {app} version found"),
            PathError::UnknownPresetType { preset_type } => {
                write!(f, "unknown preset type: {preset_type}")
            }
            PathError::Io { message } => write!(f, "io error: {message}"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectedVersion {
    pub label: String,
    pub root: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathReport {
    pub label: String,
    pub path: String,
    pub exists: bool,
    pub writable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppDetection {
    pub app: String,
    pub installed: bool,
    pub versions: Vec<DetectedVersion>,
    pub picked_version: Option<DetectedVersion>,
    pub paths: Vec<PathReport>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    pub os: String,
    pub user: String,
    pub premiere: AppDetection,
    pub audition: AppDetection,
    pub resolve: AppDetection,
}

fn current_user() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".into())
}

fn home_dir() -> Result<PathBuf, PathError> {
    dirs::home_dir().ok_or_else(|| PathError::NoUserDirs {
        message: "no home directory".into(),
    })
}

fn documents_dir() -> Result<PathBuf, PathError> {
    dirs::document_dir().ok_or_else(|| PathError::NoUserDirs {
        message: "no Documents directory".into(),
    })
}

fn appdata_roaming() -> Result<PathBuf, PathError> {
    if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| PathError::NoUserDirs {
                message: "APPDATA not set".into(),
            })
    } else {
        // macOS: ~/Library/Application Support
        Ok(home_dir()?.join("Library").join("Application Support"))
    }
}

fn programdata_dir() -> Result<PathBuf, PathError> {
    if cfg!(target_os = "windows") {
        std::env::var_os("PROGRAMDATA")
            .map(PathBuf::from)
            .ok_or_else(|| PathError::NoUserDirs {
                message: "PROGRAMDATA not set".into(),
            })
    } else {
        Ok(PathBuf::from("/Library/Application Support"))
    }
}

fn list_version_folders(parent: &Path) -> Vec<DetectedVersion> {
    let Ok(read) = std::fs::read_dir(parent) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in read.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.chars().any(|c| c.is_ascii_digit()) {
            out.push(DetectedVersion {
                label: name.to_string(),
                root: path.to_string_lossy().to_string(),
            });
        }
    }
    out.sort_by(|a, b| natural_compare(&b.label, &a.label));
    out
}

fn natural_compare(a: &str, b: &str) -> std::cmp::Ordering {
    let av: Vec<u32> = a
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|s| s.parse().ok())
        .collect();
    let bv: Vec<u32> = b
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|s| s.parse().ok())
        .collect();
    av.cmp(&bv)
}

fn check_path(label: &str, path: &Path) -> PathReport {
    let exists = path.exists();
    let writable = if exists {
        is_writable(path)
    } else {
        if let Some(parent) = path.parent() {
            parent.exists() && is_writable(parent)
        } else {
            false
        }
    };
    PathReport {
        label: label.to_string(),
        path: path.to_string_lossy().to_string(),
        exists,
        writable,
    }
}

fn is_writable(path: &Path) -> bool {
    let probe = if path.is_dir() {
        path.join(".__mcmvault_write_probe")
    } else {
        return path
            .metadata()
            .map(|m| !m.permissions().readonly())
            .unwrap_or(false);
    };
    match std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&probe)
    {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn premiere_paths_for_version(version: &DetectedVersion, user: &str) -> Vec<PathReport> {
    let root = PathBuf::from(&version.root);
    let profile = format!("Profile-{user}");
    let docs_adobe_common = documents_dir()
        .ok()
        .map(|d| d.join("Adobe").join("Common"));

    let mut out = vec![
        check_path(
            "Effect presets (.prfpset)",
            &root.join(&profile).join("Effects Presets"),
        ),
        check_path(
            "Sequence presets (.sqpreset)",
            &root.join(&profile).join("Settings").join("Custom"),
        ),
    ];

    if let Ok(ame) = ame_presets_path() {
        out.push(check_path(
            "Export presets (.epr) — Adobe Media Encoder Presets",
            &ame,
        ));
    } else {
        out.push(PathReport {
            label: "Export presets (.epr) — Adobe Media Encoder not detected".into(),
            path: "(Adobe Media Encoder install required for export presets)".into(),
            exists: false,
            writable: false,
        });
    }

    if let Ok(creative) = adobe_common_lut_path("Creative") {
        out.push(check_path("Lumetri looks (.look)", &creative));
    }
    if let Ok(technical) = adobe_common_lut_path("Technical") {
        out.push(check_path("Technical LUTs (.cube, .3dl)", &technical));
    }

    if let Some(common) = docs_adobe_common {
        out.push(check_path(
            "MOGRTs (.mogrt)",
            &common.join("Motion Graphics Templates"),
        ));
    }

    out
}

fn detect_premiere() -> AppDetection {
    let Ok(docs) = documents_dir() else {
        return AppDetection {
            app: "Adobe Premiere Pro".into(),
            installed: false,
            versions: Vec::new(),
            picked_version: None,
            paths: Vec::new(),
        };
    };
    let parent = docs.join("Adobe").join("Premiere Pro");
    let versions = list_version_folders(&parent);
    let picked = versions.first().cloned();
    let paths = match &picked {
        Some(v) => premiere_paths_for_version(v, &current_user()),
        None => Vec::new(),
    };
    AppDetection {
        app: "Adobe Premiere Pro".into(),
        installed: !versions.is_empty(),
        versions,
        picked_version: picked,
        paths,
    }
}

fn detect_audition() -> AppDetection {
    let Ok(docs) = documents_dir() else {
        return AppDetection {
            app: "Adobe Audition".into(),
            installed: false,
            versions: Vec::new(),
            picked_version: None,
            paths: Vec::new(),
        };
    };
    let parent = docs.join("Adobe").join("Audition");
    let versions = list_version_folders(&parent);
    let picked = versions.first().cloned();
    let paths = match &picked {
        Some(v) => vec![check_path(
            "Audio effect presets (.aup)",
            &PathBuf::from(&v.root).join("Presets"),
        )],
        None => Vec::new(),
    };
    AppDetection {
        app: "Adobe Audition".into(),
        installed: !versions.is_empty(),
        versions,
        picked_version: picked,
        paths,
    }
}

fn detect_resolve(folder_label: &str) -> AppDetection {
    let mut paths = Vec::new();
    let mut installed_signal = false;

    if cfg!(target_os = "windows") {
        if let Ok(pd) = programdata_dir() {
            let lut_root = pd
                .join("Blackmagic Design")
                .join("DaVinci Resolve")
                .join("Support")
                .join("LUT");
            installed_signal |= lut_root.exists();
            paths.push(check_path(
                &format!("Resolve LUTs (.cube, .3dl) — {folder_label} folder"),
                &lut_root.join(folder_label),
            ));
        }
        if let Ok(ad) = appdata_roaming() {
            let support = ad
                .join("Blackmagic Design")
                .join("DaVinci Resolve")
                .join("Support");
            installed_signal |= support.exists();
            paths.push(check_path(
                "Fusion templates (.setting)",
                &support.join("Fusion").join("Templates"),
            ));
            paths.push(check_path(
                "Fairlight presets (.preset)",
                &support.join("Fairlight").join("Presets"),
            ));
        }
    } else {
        let ad = appdata_roaming().ok();
        if let Some(ad) = ad {
            let bmd = ad.join("Blackmagic Design").join("DaVinci Resolve");
            installed_signal |= bmd.exists();
            paths.push(check_path(
                &format!("Resolve LUTs (.cube, .3dl) — {folder_label} folder"),
                &PathBuf::from(format!(
                    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT/{folder_label}"
                )),
            ));
            paths.push(check_path(
                "Fusion templates (.setting)",
                &bmd.join("Fusion").join("Templates"),
            ));
            paths.push(check_path(
                "Fairlight presets (.preset)",
                &bmd.join("Fairlight").join("Presets"),
            ));
        }
    }

    let manual_root = documents_dir()
        .map(|d| d.join(format!("{folder_label} Presets")).join("Resolve"))
        .ok();
    if let Some(p) = manual_root {
        paths.push(check_path(
            "Manual import sync folder (PowerGrades, timelines, etc.)",
            &p,
        ));
    }

    AppDetection {
        app: "DaVinci Resolve".into(),
        installed: installed_signal,
        versions: Vec::new(),
        picked_version: None,
        paths,
    }
}

#[tauri::command]
pub fn scan_host_apps(folder_label: String) -> DiagnosticReport {
    DiagnosticReport {
        os: std::env::consts::OS.into(),
        user: current_user(),
        premiere: detect_premiere(),
        audition: detect_audition(),
        resolve: detect_resolve(&folder_label),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTarget {
    pub path: String,
    pub install_type: String,
}

pub fn resolve_install_path(
    category: &str,
    preset_type: &str,
    folder_label: &str,
) -> Result<ResolvedTarget, PathError> {
    let user = current_user();

    match (category, preset_type) {
        // Premiere 22+ uses Adobe Media Encoder for exports; AME stores .epr presets in
        // Documents\Adobe\Adobe Media Encoder\<version>\Presets\. The legacy
        // Premiere Pro\<version>\Profile-<user>\Settings\EPR folder isn't scanned anymore.
        ("premiere", "export") => Ok(auto(ame_presets_path()?.to_string_lossy().to_string())),
        ("premiere", "effect") => premiere_versioned_path(
            &user,
            &["Profile-", "/Effects Presets"],
            "Premiere Pro",
        )
        .map(auto),
        ("premiere", "sequence") => premiere_versioned_path(
            &user,
            &["Profile-", "/Settings/Custom"],
            "Premiere Pro",
        )
        .map(auto),
        ("premiere", "lumetri") => Ok(auto(
            adobe_common_lut_path("Creative")?.to_string_lossy().to_string(),
        )),
        ("premiere", "lut") => Ok(auto(
            adobe_common_lut_path("Technical")?.to_string_lossy().to_string(),
        )),
        ("premiere", "mogrt") => Ok(auto(
            documents_dir()?
                .join("Adobe")
                .join("Common")
                .join("Motion Graphics Templates")
                .to_string_lossy()
                .to_string(),
        )),
        ("premiere", "audio") => audition_versioned_path(&user).map(auto),
        ("resolve", "lut") => Ok(auto(
            resolve_lut_path(folder_label)?.to_string_lossy().to_string(),
        )),
        ("resolve", "fusion") => Ok(auto(
            resolve_support_dir()?
                .join("Fusion")
                .join("Templates")
                .to_string_lossy()
                .to_string(),
        )),
        ("resolve", "fairlight") => Ok(auto(
            resolve_support_dir()?
                .join("Fairlight")
                .join("Presets")
                .to_string_lossy()
                .to_string(),
        )),
        ("resolve", "powergrade") => Ok(manual(manual_resolve_dir(folder_label, "PowerGrades")?)),
        ("resolve", "timeline") => Ok(manual(manual_resolve_dir(folder_label, "Timelines")?)),
        ("resolve", "project") => Ok(manual(manual_resolve_dir(folder_label, "Projects")?)),
        ("resolve", "render") => Ok(manual(manual_resolve_dir(folder_label, "RenderPresets")?)),
        _ => Err(PathError::UnknownPresetType {
            preset_type: format!("{category}:{preset_type}"),
        }),
    }
}

fn auto(path: String) -> ResolvedTarget {
    ResolvedTarget {
        path,
        install_type: "auto".into(),
    }
}

fn manual(path: PathBuf) -> ResolvedTarget {
    ResolvedTarget {
        path: path.to_string_lossy().to_string(),
        install_type: "manual".into(),
    }
}

fn highest_version_for(app_subpath: &str) -> Result<DetectedVersion, PathError> {
    let parent = documents_dir()?.join("Adobe").join(app_subpath);
    list_version_folders(&parent)
        .into_iter()
        .next()
        .ok_or_else(|| PathError::NoVersion {
            app: format!("Adobe {app_subpath}"),
        })
}

fn premiere_versioned_path(
    user: &str,
    suffix_parts: &[&str],
    app_subpath: &str,
) -> Result<String, PathError> {
    let version = highest_version_for(app_subpath)?;
    let mut path = PathBuf::from(version.root);
    for part in suffix_parts {
        if let Some(stripped) = part.strip_prefix("Profile-") {
            path = path.join(format!("Profile-{user}{stripped}"));
        } else {
            for sub in part.split('/').filter(|s| !s.is_empty()) {
                path = path.join(sub);
            }
        }
    }
    Ok(path.to_string_lossy().to_string())
}

fn audition_versioned_path(_user: &str) -> Result<String, PathError> {
    let version = highest_version_for("Audition")?;
    Ok(PathBuf::from(version.root)
        .join("Presets")
        .to_string_lossy()
        .to_string())
}

fn highest_ame_version() -> Result<DetectedVersion, PathError> {
    let parent = documents_dir()?
        .join("Adobe")
        .join("Adobe Media Encoder");
    list_version_folders(&parent)
        .into_iter()
        .next()
        .ok_or_else(|| PathError::NoVersion {
            app: "Adobe Media Encoder".into(),
        })
}

fn ame_presets_path() -> Result<PathBuf, PathError> {
    Ok(PathBuf::from(highest_ame_version()?.root).join("Presets"))
}

fn adobe_common_lut_path(kind: &str) -> Result<PathBuf, PathError> {
    // Use the per-user Adobe Common folder so installs don't need admin rights.
    // Premiere scans this in addition to the system-wide Program Files path.
    if cfg!(target_os = "windows") {
        Ok(documents_dir()?
            .join("Adobe")
            .join("Common")
            .join("LUTs")
            .join(kind))
    } else {
        Ok(home_dir()?
            .join("Library")
            .join("Application Support")
            .join("Adobe")
            .join("Common")
            .join("LUTs")
            .join(kind))
    }
}

fn resolve_lut_path(folder_label: &str) -> Result<PathBuf, PathError> {
    if cfg!(target_os = "windows") {
        Ok(programdata_dir()?
            .join("Blackmagic Design")
            .join("DaVinci Resolve")
            .join("Support")
            .join("LUT")
            .join(folder_label))
    } else {
        Ok(PathBuf::from(format!(
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT/{folder_label}"
        )))
    }
}

fn resolve_support_dir() -> Result<PathBuf, PathError> {
    if cfg!(target_os = "windows") {
        Ok(appdata_roaming()?
            .join("Blackmagic Design")
            .join("DaVinci Resolve")
            .join("Support"))
    } else {
        Ok(appdata_roaming()?
            .join("Blackmagic Design")
            .join("DaVinci Resolve"))
    }
}

fn manual_resolve_dir(folder_label: &str, subtype: &str) -> Result<PathBuf, PathError> {
    Ok(documents_dir()?
        .join(format!("{folder_label} Presets"))
        .join("Resolve")
        .join(subtype))
}

#[tauri::command]
pub fn resolve_target(
    category: String,
    preset_type: String,
    folder_label: String,
) -> Result<ResolvedTarget, PathError> {
    resolve_install_path(&category, &preset_type, &folder_label)
}
