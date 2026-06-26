use serde::{Deserialize, Serialize};

use crate::{branding, state};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub category: String,
    pub install_type: String,
    pub preset_type: String,
    pub path: String,
    pub files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub import_instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_dates: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema_version: u32,
    pub updated_at: String,
    pub bundles: Vec<Bundle>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ManifestError {
    #[serde(rename_all = "camelCase")]
    Network { message: String },
    #[serde(rename_all = "camelCase")]
    Status { code: u16, message: String },
    #[serde(rename_all = "camelCase")]
    Parse { message: String },
}

impl std::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ManifestError::Network { message } => write!(f, "network error: {message}"),
            ManifestError::Status { code, message } => {
                write!(f, "HTTP {code}: {message}")
            }
            ManifestError::Parse { message } => write!(f, "parse error: {message}"),
        }
    }
}

#[tauri::command]
pub async fn fetch_manifest() -> Result<Manifest, ManifestError> {
    // Cache-bust raw.githubusercontent.com's CDN so a freshly-pushed manifest
    // shows up immediately instead of after the ~5 minute TTL.
    let cb = chrono::Utc::now().timestamp_millis();
    let url = format!("{}?_={}", branding::manifest_url(), cb);
    state::log_event("INFO", format!("fetch_manifest GET {url}"));
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent(format!("{}/0.1", branding::APP_NAME))
        .build()
        .map_err(|e| ManifestError::Network {
            message: e.to_string(),
        })?
        .get(&url)
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .send()
        .await
        .map_err(|e| ManifestError::Network {
            message: e.to_string(),
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(ManifestError::Status {
            code: status.as_u16(),
            message: status
                .canonical_reason()
                .unwrap_or("unknown")
                .to_string(),
        });
    }

    let body = response
        .text()
        .await
        .map_err(|e| ManifestError::Network {
            message: e.to_string(),
        })?;

    let parsed = serde_json::from_str::<Manifest>(&body).map_err(|e| {
        state::log_event("ERROR", format!("manifest parse failed: {e}"));
        ManifestError::Parse {
            message: e.to_string(),
        }
    })?;
    state::log_event(
        "INFO",
        format!(
            "fetch_manifest OK ({} bundles, updatedAt={})",
            parsed.bundles.len(),
            parsed.updated_at
        ),
    );
    Ok(parsed)
}
