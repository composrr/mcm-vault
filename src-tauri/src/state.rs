use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::branding;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledBundle {
    pub version: String,
    pub installed_at: String,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub auto_update_on_launch: bool,
    pub check_interval: String,
    pub show_notifications: bool,
    #[serde(default = "default_folder_label")]
    pub folder_label: String,
    #[serde(default)]
    pub publisher_mode: bool,
}

fn default_folder_label() -> String {
    "MCM Vault".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_update_on_launch: true,
            check_interval: "4h".into(),
            show_notifications: true,
            folder_label: default_folder_label(),
            publisher_mode: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PublisherFile {
    pub size: u64,
    pub mtime_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PublisherBundleState {
    pub source_path: String,
    #[serde(default)]
    pub last_published_files: BTreeMap<String, PublisherFile>,
    #[serde(default)]
    pub last_published_at: Option<String>,
    #[serde(default)]
    pub last_published_version: Option<String>,
    /// File names the user has checked for this bundle on this machine.
    /// Persisted so tab switches and app relaunches don't lose selection.
    #[serde(default)]
    pub included_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub schema_version: u32,
    #[serde(default)]
    pub last_checked: Option<String>,
    #[serde(default)]
    pub last_successful_sync: Option<String>,
    #[serde(default)]
    pub installed_bundles: BTreeMap<String, InstalledBundle>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub dismissed_tips: Vec<String>,
    #[serde(default)]
    pub last_known_manifest: Option<crate::manifest::Manifest>,
    #[serde(default)]
    pub publisher: BTreeMap<String, PublisherBundleState>,
    #[serde(default)]
    pub publisher_repo_path: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            last_checked: None,
            last_successful_sync: None,
            installed_bundles: BTreeMap::new(),
            settings: Settings::default(),
            dismissed_tips: Vec::new(),
            last_known_manifest: None,
            publisher: BTreeMap::new(),
            publisher_repo_path: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StateError {
    #[serde(rename_all = "camelCase")]
    Io { message: String },
    #[serde(rename_all = "camelCase")]
    Parse { message: String },
    #[serde(rename_all = "camelCase")]
    Path { message: String },
}

impl std::fmt::Display for StateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StateError::Io { message } => write!(f, "io error: {message}"),
            StateError::Parse { message } => write!(f, "parse error: {message}"),
            StateError::Path { message } => write!(f, "path error: {message}"),
        }
    }
}

pub fn app_data_dir() -> Result<PathBuf, StateError> {
    let base = dirs::data_dir().ok_or_else(|| StateError::Path {
        message: "could not resolve user data directory".into(),
    })?;
    Ok(base.join(format!("{}{}", folder_safe(branding::APP_NAME), "")))
}

fn folder_safe(name: &str) -> String {
    name.chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
}

pub fn state_file_path() -> Result<PathBuf, StateError> {
    Ok(app_data_dir()?.join("state.json"))
}

pub fn log_dir() -> Result<PathBuf, StateError> {
    Ok(app_data_dir()?.join("logs"))
}

pub fn log_event(level: &str, message: impl AsRef<str>) {
    let Ok(dir) = log_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("app.log");
    let now = chrono::Utc::now().to_rfc3339();
    let line = format!("{now} {level:<5} {}\n", message.as_ref());
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        use std::io::Write;
        let _ = f.write_all(line.as_bytes());
    }
}

#[tauri::command]
pub fn open_log_folder() -> Result<String, StateError> {
    let dir = log_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| StateError::Io {
        message: e.to_string(),
    })?;
    let _ = open::that(&dir);
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn read_state() -> Result<AppState, StateError> {
    let path = state_file_path()?;
    if !path.exists() {
        return Ok(AppState::default());
    }
    let bytes = tokio::fs::read(&path).await.map_err(|e| StateError::Io {
        message: e.to_string(),
    })?;
    serde_json::from_slice::<AppState>(&bytes).map_err(|e| StateError::Parse {
        message: e.to_string(),
    })
}

#[tauri::command]
pub async fn write_state(state: AppState) -> Result<(), StateError> {
    let dir = app_data_dir()?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| StateError::Io {
            message: e.to_string(),
        })?;
    let path = dir.join("state.json");
    let bytes = serde_json::to_vec_pretty(&state).map_err(|e| StateError::Parse {
        message: e.to_string(),
    })?;
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|e| StateError::Io {
            message: e.to_string(),
        })?;
    Ok(())
}

#[tauri::command]
pub async fn open_state_folder() -> Result<String, StateError> {
    let dir = app_data_dir()?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| StateError::Io {
            message: e.to_string(),
        })?;
    Ok(dir.to_string_lossy().to_string())
}
