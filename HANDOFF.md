# MCM Vault — Handoff for Claude Code on a New Machine

## What this is

**MCM Vault** is a Tauri 2 desktop app that syncs Adobe Premiere Pro and DaVinci Resolve presets between team members via a public GitHub repo. Built for Milestone Creative Media. Inspired by OvGME (the DCS mod manager).

Two repos:
- **App source (this one):** https://github.com/composrr/mcm-vault
- **Presets / manifest (the data):** https://github.com/composrr/mcm-vault-presets

The app runs in two modes via a settings toggle:
- **Receive** (default): pulls `manifest.json` from the presets repo on launch + on a schedule, installs new files into Adobe's canonical preset folders.
- **Publish** (maintainer mode): scans your local Adobe folders, lets you check which files belong to each bundle, commits + pushes them to the presets repo via your local `git` credentials.

## User context (read this before doing anything)

- GitHub: `composrr` (Jon Draper)
- Wants **terse responses with action steps clearly listed at the end**. Not walls of text. See `~/.claude/projects/<project>/memory/` on the Windows machine for the full preference notes.
- Auto mode is the default mode of operation — execute autonomously, minimize interruptions, prefer action over planning.

## Current state (as of this handoff)

Phases 0–5 done + several follow-up fixes:
- Tauri 2 + React + TypeScript + Tailwind v4 scaffolded
- All preset types resolved to canonical Adobe / Resolve folders (see `src-tauri/src/path_resolver.rs`)
- Manifest fetch with cache-busting (so post-publish refresh sees changes immediately)
- Local state in `%APPDATA%\MCMVault\state.json` (Windows) / `~/Library/Application Support/MCMVault/state.json` (Mac)
- Bundle list view, detail view, manual-import modal (Resolve PowerGrades), settings panel, first-run welcome, no-host-apps state, offline banner, scheduled checks, OS notifications
- Publisher mode: per-file checkboxes, dropdown selector with "All preset bundles" default, persisted check state, cross-machine semantics (other-machine files preserved on publish)
- Receive-side **never auto-deletes** files. Only overwrites same-name files on update. Files removed from a bundle stay on disk and become untracked. Explicit "Remove" button on a row deletes (user's intent).

Recent fixes in order:
1. Light mode locked (mockups are light, not OS-following)
2. Adobe LUT path moved to user-scoped `~/Documents/Adobe/Common/LUTs/` (was `Program Files`, needed admin)
3. Premiere export path moved to AME's `~/Documents/Adobe/Adobe Media Encoder/<ver>/Presets/` (was the legacy `Premiere Pro/<ver>/Profile-<user>/Settings/EPR/` which Premiere 22+ doesn't scan)
4. Podcast Audio Chain rerouted from Audition to Premiere effects (`.prfpset`)
5. "Open folder" button wired to open `~/Documents/MCM Vault Presets/`
6. Folder label setting (default "MCM Vault") so user can rename the user-visible folders
7. Refresh button only fetches; auto-install only fires once per launch
8. Cache-bust on manifest URL (avoids stale CDN reads)
9. Publisher checkboxes persist in `state.json` (survive tab switch + relaunch)

## Architecture notes

- `src-tauri/src/branding.rs` — hardcoded `composrr/mcm-vault-presets`. Edit before building for a different team.
- `src-tauri/src/manifest.rs` — `fetch_manifest` Tauri command. Cache-busts via `?_=<ts>` query.
- `src-tauri/src/state.rs` — read/write JSON state. Schema in `AppState` struct. Includes `publisher: BTreeMap<bundleId, PublisherBundleState>` for publisher-side per-bundle tracking.
- `src-tauri/src/path_resolver.rs` — resolves install paths per `(category, presetType, folderLabel)`. Detects highest installed Premiere/AME/Audition version. Only the highest version is targeted; older versions are not.
- `src-tauri/src/install.rs` — `install_bundle` (download + copy), `uninstall_bundle` (used only by explicit Remove), `reveal_path`, `open_vault_folder`.
- `src-tauri/src/publisher.rs` — `scan_publish_diffs` (returns added/modified/removed per bundle vs last-published baseline), `publish_bundles` (clones the presets repo to `%APPDATA%/MCMVault/publish/...`, mutates manifest, commits, pushes via shell-out to `git`), `publisher_default_source` (returns the canonical install path — same folder receive side targets).
- `src/components/PublisherView.tsx` — main publisher UI. Bundle dropdown at top with "All preset bundles" default; below is the file list with checkboxes per bundle. Persisted `includedFiles` in `state.publisher[id]`.
- `src/store/useAppStore.ts` — Zustand store. `installOne` no longer pre-uninstalls; just overwrites same names.

## Mac-specific things to know

- The Mac path branches in `path_resolver.rs` exist but **haven't been tested on real hardware**. First time on Mac, expect potential path drift.
- The Resolve LUT path on Mac currently resolves to `/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT/<label>` which is system-wide and may need admin rights. If install fails with permission denied, switch it to `~/Library/Application Support/...` — same change pattern as the Adobe LUT fix that already shipped.
- Adobe Media Encoder version detection: `~/Documents/Adobe/Adobe Media Encoder/<ver>/Presets/` (same as Windows minus the drive letter).
- `dirs::data_dir()` on Mac returns `~/Library/Application Support` (this is where `MCMVault/state.json` lives on Mac).
- Tauri uses macOS title bar overlay style on Mac per `tauri.conf.json`. The app should look closer to mockup `01-main-window.html` on Mac than on Windows (where the OS title bar is dark).

## Setup for first run on Mac

1. **Install prerequisites:**
   ```bash
   xcode-select --install
   brew install node
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   brew install gh
   gh auth login   # if not already authed
   ```
2. **Clone the app:**
   ```bash
   gh repo clone composrr/mcm-vault
   cd mcm-vault
   npm install
   ```
3. **Run dev:**
   ```bash
   npm run tauri dev
   ```
   First Tauri build will take 5–10 minutes (downloads + compiles all Rust crates).
4. **First-run flow** in the app: detected apps card should show your installed Premiere Pro and DaVinci Resolve versions. Click "Install presets" to pull all bundles from GitHub and drop them into the canonical Adobe / Resolve folders.

## How to verify Mac path resolution before installing anything

In the running app: Settings → Run diagnostics. Returns a JSON tree showing where Premiere / Audition / Resolve preset folders are on this Mac and whether each is writable. Compare against expected paths in `path_resolver.rs`. Any "exists: false / writable: false" entry is a candidate to fix.

## Cross-machine publishing

Publisher mode shares state via the manifest itself (`bundle.files`). Each machine sees the union; locally-present files are the only ones a machine can publish or unpublish. Files not on this machine are preserved on publish (other machine owns them). So:
- If you check `MCM_YT_4K.epr` on Windows and publish, that file is in `bundle.files`.
- On Mac, if you don't have `MCM_YT_4K.epr` locally, you can't uncheck it — it's preserved.
- If you do have it locally, you can uncheck it and publish; that removes it from the bundle on the receive side too.

## Things still worth doing

- **Phase 6 (distribution):** Apple Developer ID signing, Windows code-signing cert, Tauri auto-updater, GitHub Releases pipeline.
- **Multi-version install toggle:** currently only the highest installed Premiere/AME version is targeted. A "Install to all detected versions" toggle would land presets in v25, v26, etc.
- **Archive folder option:** when files are removed from a bundle, optionally move them to `~/Documents/<label>/Archive/<bundle>/` instead of just untracking. (Currently we leave them in the install folder.)
- **Confirmation dialog on Remove:** the explicit Remove button still deletes without prompting.
- **Test plan:** see `TEST_PLAN.md` in this repo for the manual smoke tests.

## Key files at a glance

| Purpose | Path |
|---------|------|
| Brand constants + repo URL | `src-tauri/src/branding.rs` |
| Manifest fetch (Rust) | `src-tauri/src/manifest.rs` |
| State I/O (Rust) | `src-tauri/src/state.rs` |
| Path resolution (Rust) | `src-tauri/src/path_resolver.rs` |
| Install/uninstall (Rust) | `src-tauri/src/install.rs` |
| Publisher logic (Rust) | `src-tauri/src/publisher.rs` |
| Tauri command registration | `src-tauri/src/lib.rs` |
| Tauri config (window size, identifier) | `src-tauri/tauri.conf.json` |
| Capabilities (permissions) | `src-tauri/capabilities/default.json` |
| Frontend store | `src/store/useAppStore.ts` |
| Main UI shell | `src/App.tsx` |
| Publisher UI | `src/components/PublisherView.tsx` |
| Bundle detail UI | `src/components/BundleDetailView.tsx` |
| Manual-import modal | `src/components/ManualImportModal.tsx` |
| Settings panel | `src/components/SettingsPanel.tsx` |
| First-run welcome | `src/components/FirstRunWelcome.tsx` |
| Tauri ↔ JS bindings | `src/lib/tauri.ts` |
| Test plan | `TEST_PLAN.md` |

## How the user works with you

- They're the maintainer; teammates are receivers.
- They iterate fast, change direction mid-feature; absorb and adapt.
- Save them time. Don't re-explain things they've already heard. If they ask a question, answer it directly.
- They want the simplest thing that works. Push back on over-engineering.
- They explicitly asked for terse replies with action steps at the end. **Stick to that.**
