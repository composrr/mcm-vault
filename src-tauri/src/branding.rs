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
    let base = format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        REPO_OWNER, REPO_NAME, REPO_BRANCH, bundle_path
    );
    // Percent-encode only bytes that must be encoded in URL path segments.
    // Unreserved chars + common sub-delimiters + path separator are left as-is.
    let encoded: String = file_name.bytes().flat_map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
        | b'-' | b'_' | b'.' | b'~' | b'/'  // unreserved + path sep
        | b',' | b'!' | b'$' | b'&' | b'\'' | b'(' | b')' | b'*' | b'+' | b';' | b'=' | b'@' => {
            vec![b as char]
        }
        b => format!("%{b:02X}").chars().collect::<Vec<_>>(),
    }).collect();
    format!("{base}/{encoded}")
}
