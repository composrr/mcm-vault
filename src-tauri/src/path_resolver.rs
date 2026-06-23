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

    if let Ok(text_styles) = adobe_common_text_styles_path() {
        out.push(check_path(
            "Caption / text styles (.prtextstyle)",
            &text_styles,
        ));
    }

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

    if let Ok(appdata) = appdata_roaming() {
        out.push(check_path(
            "MOGRTs (.mogrt)",
            &appdata.join("Adobe").join("Common").join("Motion Graphics Templates"),
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
                "Resolve LUTs (.cube, .3dl) — root LUT folder",
                &lut_root,
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
            if let Ok(fp) = resolve_fairlight_presets_path() {
                paths.push(check_path("Fairlight presets (.preset)", &fp));
            }
        }
    } else {
        let ad = appdata_roaming().ok();
        if let Some(ad) = ad {
            let bmd = ad.join("Blackmagic Design").join("DaVinci Resolve");
            installed_signal |= bmd.exists();
            // LUTs live in system /Library, not ~/Library, on macOS.
            if let Ok(pd) = programdata_dir() {
                paths.push(check_path(
                    "Resolve LUTs (.cube, .3dl) — root LUT folder",
                    &pd.join("Blackmagic Design")
                        .join("DaVinci Resolve")
                        .join("LUT"),
                ));
            }
            paths.push(check_path(
                "Fusion templates (.setting)",
                &bmd.join("Fusion").join("Templates"),
            ));
            if let Ok(fp) = resolve_fairlight_presets_path() {
                paths.push(check_path("Fairlight presets (.preset)", &fp));
            }
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
pub struct InstallTargetVersions {
    pub premiere_pro: Vec<DetectedVersion>,
    pub adobe_media_encoder: Vec<DetectedVersion>,
    pub audition: Vec<DetectedVersion>,
}

/// Lists installed version folders for each host app the user can target. Used
/// by the Install Targets settings UI so the user can pick which versions
/// receive new files.
#[tauri::command]
pub fn list_install_target_versions() -> InstallTargetVersions {
    InstallTargetVersions {
        premiere_pro: list_versions_for("Premiere Pro").unwrap_or_default(),
        adobe_media_encoder: list_versions_for("Adobe Media Encoder").unwrap_or_default(),
        audition: list_versions_for("Audition").unwrap_or_default(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTarget {
    pub path: String,
    pub install_type: String,
}

/// Multi-target resolver. Returns one ResolvedTarget per host-app version that
/// should receive this preset type. For version-agnostic preset types
/// (LUTs, MOGRTs, Resolve LUTs/Fairlight), always returns exactly one target.
/// For version-specific preset types (Premiere export → AME, sequence →
/// Premiere Pro, audio → Audition), returns one per enabled version per
/// `install_targets` setting; defaults to highest version when the setting is
/// empty.
pub fn resolve_install_paths(
    category: &str,
    preset_type: &str,
    folder_label: &str,
    install_targets: &crate::state::InstallTargets,
) -> Result<Vec<ResolvedTarget>, PathError> {
    let user = current_user();
    match (category, preset_type) {
        ("premiere", "export") => {
            let versions = pick_versions(
                list_versions_for("Adobe Media Encoder").unwrap_or_default(),
                &install_targets.adobe_media_encoder,
            );
            if versions.is_empty() {
                return Err(PathError::NoVersion {
                    app: "Adobe Media Encoder".into(),
                });
            }
            Ok(versions
                .into_iter()
                .map(|v| auto(PathBuf::from(v.root).join("Presets").to_string_lossy().to_string()))
                .collect())
        }
        ("premiere", "sequence") => {
            let versions = pick_versions(
                list_versions_for("Premiere Pro").unwrap_or_default(),
                &install_targets.premiere_pro,
            );
            if versions.is_empty() {
                return Err(PathError::NoVersion {
                    app: "Adobe Premiere Pro".into(),
                });
            }
            Ok(versions
                .into_iter()
                .map(|v| {
                    auto(
                        PathBuf::from(v.root)
                            .join(format!("Profile-{user}"))
                            .join("Settings")
                            .join("Custom")
                            .to_string_lossy()
                            .to_string(),
                    )
                })
                .collect())
        }
        // ("premiere", "caption") is version-agnostic: lives under Adobe Common,
        // not per-version Profile-<user>. Falls through to the `_` arm.
        ("premiere", "audio") => {
            let versions = pick_versions(
                list_versions_for("Audition").unwrap_or_default(),
                &install_targets.audition,
            );
            if versions.is_empty() {
                return Err(PathError::NoVersion {
                    app: "Adobe Audition".into(),
                });
            }
            Ok(versions
                .into_iter()
                .map(|v| auto(PathBuf::from(v.root).join("Presets").to_string_lossy().to_string()))
                .collect())
        }
        ("premiere", "workspace") => {
            let versions = pick_versions(
                list_versions_for("Premiere Pro").unwrap_or_default(),
                &install_targets.premiere_pro,
            );
            if versions.is_empty() {
                return Err(PathError::NoVersion {
                    app: "Adobe Premiere Pro".into(),
                });
            }
            Ok(versions
                .into_iter()
                .map(|v| {
                    auto(
                        PathBuf::from(v.root)
                            .join(format!("Profile-{user}"))
                            .join("Layouts")
                            .to_string_lossy()
                            .to_string(),
                    )
                })
                .collect())
        }
        ("premiere", "keyboard") => {
            // Returns the Profile-<user> dir as the *base*; install code routes
            // each file into the Win/ or Mac/ subdir based on its `win/` or
            // `mac/` prefix.
            let versions = pick_versions(
                list_versions_for("Premiere Pro").unwrap_or_default(),
                &install_targets.premiere_pro,
            );
            if versions.is_empty() {
                return Err(PathError::NoVersion {
                    app: "Adobe Premiere Pro".into(),
                });
            }
            Ok(versions
                .into_iter()
                .map(|v| {
                    auto(
                        PathBuf::from(v.root)
                            .join(format!("Profile-{user}"))
                            .to_string_lossy()
                            .to_string(),
                    )
                })
                .collect())
        }
        // Version-agnostic types: single target.
        _ => Ok(vec![resolve_install_path(
            category,
            preset_type,
            folder_label,
        )?]),
    }
}

/// Given the full list of detected versions and the user's enabled-versions
/// list, return the versions to install to. Empty list = "default" = highest
/// version only.
fn pick_versions(
    detected: Vec<DetectedVersion>,
    enabled: &[String],
) -> Vec<DetectedVersion> {
    if detected.is_empty() {
        return Vec::new();
    }
    if enabled.is_empty() {
        return detected.into_iter().take(1).collect();
    }
    detected
        .into_iter()
        .filter(|v| enabled.iter().any(|e| e == &v.label))
        .collect()
}

fn list_versions_for(app_subpath: &str) -> Result<Vec<DetectedVersion>, PathError> {
    let parent = if app_subpath == "Adobe Media Encoder" {
        documents_dir()?.join("Adobe").join("Adobe Media Encoder")
    } else {
        documents_dir()?.join("Adobe").join(app_subpath)
    };
    Ok(list_version_folders(&parent))
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
        // Individual .prfpset files in Profile/Effects Presets/ aren't auto-scanned
        // by Premiere — preset folder structure lives in the Effect Presets database
        // file at the Profile root. Sharing requires right-click → Export Presets in
        // Premiere, then teammates right-click → Import Presets. Sync via a known
        // user-visible folder + show import instructions.
        ("premiere", "effect") => Ok(manual(manual_premiere_effect_dir(folder_label)?)),
        ("premiere", "sequence") => premiere_versioned_path(
            &user,
            &["Profile-", "/Settings/Custom"],
            "Premiere Pro",
        )
        .map(auto),
        ("premiere", "caption") => Ok(auto(
            adobe_common_text_styles_path()?
                .to_string_lossy()
                .to_string(),
        )),
        ("premiere", "lumetri") => Ok(auto(
            adobe_common_lut_path("Creative")?.to_string_lossy().to_string(),
        )),
        ("premiere", "lut") => Ok(auto(
            adobe_common_lut_path("Technical")?.to_string_lossy().to_string(),
        )),
        ("premiere", "mogrt") => Ok(auto(
            // AppData\Roaming (Win) / ~/Library/Application Support (Mac) — NOT Documents.
            appdata_roaming()?
                .join("Adobe")
                .join("Common")
                .join("Motion Graphics Templates")
                .to_string_lossy()
                .to_string(),
        )),
        ("premiere", "audio") => audition_versioned_path(&user).map(auto),
        ("premiere", "workspace") => premiere_versioned_path(
            &user,
            &["Profile-", "/Layouts"],
            "Premiere Pro",
        )
        .map(auto),
        ("premiere", "keyboard") => {
            // Publisher scans the OS-specific subfolder; install code uses
            // resolve_install_paths (multi) and routes per-file from the parent.
            let subfolder = if cfg!(target_os = "macos") { "Mac" } else { "Win" };
            premiere_versioned_path(
                &user,
                &["Profile-", &format!("/{subfolder}")],
                "Premiere Pro",
            )
            .map(auto)
        }
        ("premiere", "project-template") => Ok(manual(manual_project_template_dir(folder_label)?)),
        ("resolve", "lut") => Ok(auto(
            resolve_lut_path()?.to_string_lossy().to_string(),
        )),
        ("resolve", "fusion") => Ok(auto(
            resolve_support_dir()?
                .join("Fusion")
                .join("Templates")
                .to_string_lossy()
                .to_string(),
        )),
        ("resolve", "fairlight") => Ok(auto(
            resolve_fairlight_presets_path()?.to_string_lossy().to_string(),
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
    // Both platforms: AppData\Roaming (Win) / ~/Library/Application Support (Mac).
    // NOT Documents — Adobe's LUT scanner reads AppData/Roaming, not Documents.
    Ok(appdata_roaming()?
        .join("Adobe")
        .join("Common")
        .join("LUTs")
        .join(kind))
}

fn adobe_common_text_styles_path() -> Result<PathBuf, PathError> {
    // Caption Track Style files (.prtextstyle) — both platforms store under
    // Documents/Adobe/Common/Assets/Text Styles (not Library/AppData).
    Ok(documents_dir()?
        .join("Adobe")
        .join("Common")
        .join("Assets")
        .join("Text Styles"))
}

fn resolve_lut_path() -> Result<PathBuf, PathError> {
    // Install to the root LUT folder — no <label> subfolder — so team LUTs
    // appear alongside the user's personal LUTs in Resolve's browser.
    if cfg!(target_os = "windows") {
        Ok(programdata_dir()?
            .join("Blackmagic Design")
            .join("DaVinci Resolve")
            .join("Support")
            .join("LUT"))
    } else {
        // macOS: prefer system /Library (where Resolve reads by default), but
        // fall back to ~/Library if the system path isn't writable (SIP or perms).
        let system = programdata_dir()?
            .join("Blackmagic Design")
            .join("DaVinci Resolve")
            .join("LUT");
        if system.exists() || system.parent().map(|p| is_writable(p)).unwrap_or(false) {
            Ok(system)
        } else {
            // User-level LUT dir — writable without sudo; Resolve scans both.
            Ok(appdata_roaming()?
                .join("Blackmagic Design")
                .join("DaVinci Resolve")
                .join("LUT"))
        }
    }
}

fn resolve_fairlight_presets_path() -> Result<PathBuf, PathError> {
    // Fairlight presets live under "Preferences", not "Support".
    // On macOS the base is ~/Library/Preferences, not Application Support.
    if cfg!(target_os = "windows") {
        Ok(appdata_roaming()?
            .join("Blackmagic Design")
            .join("DaVinci Resolve")
            .join("Preferences")
            .join("Fairlight")
            .join("Presets"))
    } else {
        Ok(home_dir()?
            .join("Library")
            .join("Preferences")
            .join("Blackmagic Design")
            .join("DaVinci Resolve")
            .join("Fairlight")
            .join("Presets"))
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

fn manual_premiere_effect_dir(folder_label: &str) -> Result<PathBuf, PathError> {
    Ok(documents_dir()?
        .join(format!("{folder_label} Presets"))
        .join("Premiere Effect Bundles"))
}

fn manual_project_template_dir(folder_label: &str) -> Result<PathBuf, PathError> {
    Ok(documents_dir()?
        .join(format!("{folder_label} Presets"))
        .join("Project Templates"))
}

#[tauri::command]
pub fn resolve_target(
    category: String,
    preset_type: String,
    folder_label: String,
) -> Result<ResolvedTarget, PathError> {
    resolve_install_path(&category, &preset_type, &folder_label)
}
