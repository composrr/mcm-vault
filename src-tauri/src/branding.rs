pub const APP_NAME: &str = "MCM Vault";
pub const APP_TAGLINE: &str = "Creative Media Repository";
pub const TEAM_NAME: &str = "Milestone Creative Media";

pub const REPO_OWNER: &str = "composrr";
pub const REPO_NAME: &str = "mcm-vault-presets";
pub const REPO_BRANCH: &str = "main";

pub const PRIMARY_COLOR: &str = "#3B6EA8";
pub const PRIMARY_COLOR_70: &str = "#3B6EA8B2";
pub const PRIMARY_COLOR_45: &str = "#3B6EA873";
pub const PRIMARY_COLOR_25: &str = "#3B6EA840";

pub const INK_COLOR: &str = "#1A1D24";
pub const SURFACE_COLOR: &str = "#FAFAFA";

pub fn manifest_url() -> String {
    format!(
        "https://raw.githubusercontent.com/{}/{}/{}/manifest.json",
        REPO_OWNER, REPO_NAME, REPO_BRANCH
    )
}

pub fn bundle_file_url(bundle_path: &str, file_name: &str) -> String {
    format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}/{}",
        REPO_OWNER, REPO_NAME, REPO_BRANCH, bundle_path, file_name
    )
}
