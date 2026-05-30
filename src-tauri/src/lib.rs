mod branding;
mod install;
mod manifest;
mod path_resolver;
mod publisher;
mod state;

#[tauri::command]
fn app_branding() -> serde_json::Value {
    serde_json::json!({
        "appName": branding::APP_NAME,
        "appTagline": branding::APP_TAGLINE,
        "teamName": branding::TEAM_NAME,
        "repoOwner": branding::REPO_OWNER,
        "repoName": branding::REPO_NAME,
        "repoBranch": branding::REPO_BRANCH,
        "manifestUrl": branding::manifest_url(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            app_branding,
            manifest::fetch_manifest,
            state::read_state,
            state::write_state,
            state::open_state_folder,
            state::open_log_folder,
            state::read_recent_log,
            path_resolver::scan_host_apps,
            path_resolver::resolve_target,
            path_resolver::list_install_target_versions,
            install::install_bundle,
            install::uninstall_bundle,
            install::reveal_path,
            install::open_vault_folder,
            install::reveal_bundle_folder,
            install::restore_previous_install,
            publisher::scan_publish_diffs,
            publisher::publish_bundles,
            publisher::publisher_default_source,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
