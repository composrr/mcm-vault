# MCM Vault — App Overview

A plain-English description of what MCM Vault is and everything it currently does. Use this as a starting point for design / product conversations.

## The pitch

MCM Vault is a small desktop app that keeps a creative team's preset library (Premiere Pro and DaVinci Resolve) automatically in sync with one shared GitHub repo. One person on the team — the maintainer — saves presets they want to share, hits "Publish," and everyone else sees the new files appear in the right Adobe/BMD folders the next time they update.

Inspired by **OvGME** (a mod manager for DCS World): minimal UI, set-and-forget, "the latest version of everything is always there." Hardcoded to one team's GitHub repo (single-tenant, not multi-team).

Available on **Windows** and **macOS** (Intel and Apple Silicon). Linux is out of scope.

## Two modes (one app, one toggle)

The app runs in **Receive** mode by default — what teammates use. There's a hidden **Publisher** mode that the maintainer enables in Settings; once on, a small `Receive | Publish` toggle appears under the header so they can flip between the two.

### Receive mode (everyone)

- Header (logo + tagline + ⚙ settings).
- Bundle list — one row per preset bundle (e.g. "Premiere Pro Sequence Presets," "DaVinci Resolve LUTs"). Each row shows:
  - **Status icon**: green check (installed and up-to-date), blue arrow (update available), gray circle (not installed), red triangle (install error), spinner (installing).
  - **Bundle name and meta** (e.g. "Premiere Pro · Export · 3 files").
  - **Version number** (right side).
  - **Tiny iOS-style toggle** (right edge) — turn syncing for that bundle off if you don't want it on this machine. Disabled bundles dim to 40%, label changes to "Not syncing," and they're skipped by Update all.
- "Update all (N)" button — manual install/update for everything that's outdated or not installed and not disabled. Nothing happens automatically; the user always clicks.
- "Open folder" button — opens `Documents/<label> Presets/` (where manual-import files like Resolve PowerGrades land).
- Status bar at the bottom shows "Last checked: …" relative time, the app's version, and a manual refresh icon (re-fetches the manifest only — never installs).

### Publisher mode (maintainer only)

- Same header, plus a `Receive | Publish` toggle.
- Bundle dropdown at top with **"All preset bundles"** as default (shows everything stacked) or pick a single bundle to focus on.
- Per bundle:
  - Header line with name, version, and counts ("3 in bundle · 2 on other machine").
  - "Open folder" button to reveal the source folder where the maintainer's loose preset files live.
  - File list: each file gets a checkbox, an **extension chip** (`EPR`/`PRFPSET`/`CUBE`...), file size, and a **status pill** (`will add` / `in bundle` / `will remove` / `modified` / `available`).
  - Empty state: a dashed-border card explaining the workflow.
  - Source path is hidden behind a "Show source path" disclosure so it doesn't clutter the default view.
- "Publish (N bundles)" button at the bottom — pushes only checked files to the GitHub repo via the maintainer's local `git` credentials. No paid token needed.

## Preset types and where they install

| Bundle preset type | What it is | Where it goes (Windows) | Manual import? |
|---|---|---|---|
| Premiere Pro Sequence Presets | `.sqpreset` files | `Documents/Adobe/Premiere Pro/<ver>/Profile-<user>/Settings/Custom/` | No |
| Premiere Pro Export Presets | `.epr` files | `Documents/Adobe/Adobe Media Encoder/<ver>/Presets/` | No |
| Premiere Pro LUTs | `.cube`, `.3dl` | `Documents/Adobe/Common/LUTs/Technical/` | No |
| Premiere Pro Audio Presets | `.prfpset` bundles | `Documents/<label> Presets/Premiere Effect Bundles/` | **Yes** — right-click in Effects panel → Import Presets |
| Premiere Pro Motion Graphics Templates | `.mogrt` | `Documents/Adobe/Common/Motion Graphics Templates/` | No |
| DaVinci Resolve LUTs | `.cube`, `.3dl` | `ProgramData/Blackmagic Design/DaVinci Resolve/Support/LUT/<label>/` | No |
| DaVinci Resolve PowerGrades | `.drx` | `Documents/<label> Presets/Resolve/PowerGrades/` | **Yes** — Color page Gallery → right-click → Import |
| DaVinci Resolve Fairlight Presets | `.preset` | `AppData/Roaming/Blackmagic Design/DaVinci Resolve/Support/Fairlight/Presets/` | No |

For preset types that require manual import after sync, clicking the row opens a step-by-step modal (matching the Resolve PowerGrades pattern), with a "Reveal in Explorer/Finder" button that creates and opens the sync folder even when nothing's been installed yet.

The Adobe paths use the **highest installed version** of Premiere Pro and Adobe Media Encoder. (User has 7 versions on disk; only the latest gets new files. A "Install to all detected versions" option per app type is on the to-build list.)

The folder label ("MCM Vault" by default) is configurable in Settings — if you change it, the user-visible folders rename on next install. App data folder stays `MCMVault` regardless.

## Cross-machine sync

The maintainer can publish from either Windows or macOS. The bundle's file list lives in `manifest.json` on GitHub, which is the authoritative truth. Files in a bundle that aren't locally present (because they're managed from the other machine) are **preserved on publish** — you don't accidentally remove them by publishing from a machine that doesn't have them.

Per-machine sync toggles are local — disabling a bundle on Windows doesn't disable it on Mac. Each machine decides what it wants.

## Settings

- **Folder label** — the name used for `Documents/<label> Presets` and Resolve's `LUT/<label>` subfolder.
- **Show notifications when bundles update** — OS notification when an update is applied.
- **Check for updates every** — `1h` / `4h` / `12h` / `24h`. Controls how often the manifest is re-fetched in the background. (Just the fetch — never auto-installs.)
- **Enable publisher mode** toggle — adds the Publish view.
- **Recent activity** panel — last 20 events from the app's log file (`<appdata>/logs/app.log`), parsed into friendly sentences with relative timestamps. Refresh button + "Open log folder" link below.
- **Run diagnostics** — scans the user's filesystem and reports where Premiere Pro / Audition / DaVinci Resolve are installed, what versions, and whether each preset folder exists and is writable. Returns JSON; useful for verifying the app is targeting the right paths on a new machine.
- **APP UPDATES** — "Check for app updates" button. Talks to GitHub Releases, verifies the new build's signature against the public minisign key baked into the app, downloads, installs, restarts.
- **About** — app version + "Built for Milestone Creative Media."

## First run

When `state.json` doesn't exist (fresh install), the app shows:

1. Welcome screen with the brand mark + tagline + "Detected on your computer" card listing Premiere/Resolve versions found.
2. "Install presets" → progress card ("Installing X · 2 of 7" with a progress bar).
3. "You're all set" success screen with a note about manual-import bundles if any are in the manifest.
4. Subsequent launches skip straight to the main window.

If neither Premiere nor Resolve is installed on the machine, a dedicated "No supported apps detected" empty state shows instead.

## Errors and offline behavior

- **Network down**: amber "Can't reach the preset repository — showing last known state" banner. Retry button. Last cached manifest still renders the bundle list (so users see what they have, even offline).
- **Single bundle install fails**: that row shows the error inline ("Install failed · Permission denied" with a Retry button). Other bundles continue.
- **Disabled bundles never trigger errors** because they're skipped entirely.
- **Bad placeholder files** (early experiment) caused Premiere to crash. We empty the bundle in the manifest if needed; the receive-side update no longer auto-deletes anything, so file removal is intentional only.

## How it actually distributes

### Maintainer publishing

The publisher action does this on the maintainer's machine:

1. If not yet cloned, `git clone https://github.com/composrr/mcm-vault-presets` into `<appdata>/MCMVault/publish/`.
2. `git fetch + reset --hard origin/main` to make sure we're on top of the latest remote (avoids overwriting a teammate's concurrent publish).
3. For each bundle changed: copy the locally-checked files into `bundles/<id>/`, remove orphans, rebuild that bundle's `files` list in `manifest.json`, bump its patch version.
4. `git add + commit + push` — uses whatever `git` credential helper the user has set up (Git Credential Manager on Windows, Keychain on Mac). No paid token; reuses existing auth.
5. On Windows, all `git` invocations use `CREATE_NO_WINDOW` so no console flashes during publish.

### Receivers updating

Each app fetches `manifest.json` from `https://raw.githubusercontent.com/composrr/mcm-vault-presets/main/manifest.json` (cache-busted with a timestamp query so freshly-pushed manifests show up immediately, not after the GitHub CDN's ~5 min TTL). Compares each bundle's manifest version to local installed version. Bundles that mismatch show as "Update available."

Manual click on Update all (or per-row Reinstall) triggers downloads:
1. For each bundle: download all files in `bundle.files` from `raw.githubusercontent.com` into a staging folder.
2. All-or-nothing per bundle: if any file fails, none install for that bundle.
3. Copy from staging into the canonical install folder (overwriting same-name files).
4. Save the absolute paths in `state.installedBundles[id].files`.
5. Removed files (unpublished by the maintainer) **stay on disk locally** — MCM Vault just stops tracking them. Only the explicit "Remove" button on a bundle (with confirmation prompt) actually deletes files.

### App updates (the binary itself)

- GitHub Actions builds installers on every `vX.Y.Z` tag push: Windows `.msi` + NSIS `.exe`, macOS `.dmg` for both Apple Silicon and Intel, plus a `.app.tar.gz` per architecture for the auto-updater.
- Each artifact is signed with a **minisign** keypair (free, generated locally — not paid Apple Developer ID or Windows code-signing certs).
- A `latest.json` file is auto-generated and uploaded with each release. The app fetches this from `https://github.com/composrr/mcm-vault/releases/latest/download/latest.json`.
- "Check for app updates" in Settings → talks to that URL → if a newer signed build is available, downloads + verifies + installs + restarts.
- Tags with a hyphen (`v0.2.0-beta.1`) are auto-marked as **Pre-release** by the workflow. Stable users' auto-updater ignores them. Beta testers grab them manually from the Releases page.

### Local iteration loops (for the maintainer who's also the developer)

1. `npm run tauri dev` — instant hot-reload. 99% of dev.
2. `npm run tauri build -- --bundles nsis` — builds a real installer locally in 1-2 minutes for testing without round-tripping through GitHub Actions.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` — only when ready to ship to teammates.

## What's persisted where

- **`<appdata>/MCMVault/state.json`** — local state. Includes installed bundle versions + tracked file paths, settings (folder label, check interval, notification toggle), publisher source folders, last-published file signatures, disabled bundles, last cached manifest. JSON, human-readable.
- **`<appdata>/MCMVault/logs/app.log`** — append-only log of key events (manifest fetch, install, publish). Surfaced in Settings → Recent Activity.
- **`<appdata>/MCMVault/publish/`** — the maintainer's local clone of the presets repo (publisher mode only).
- **`~/.tauri/mcm-vault.key`** + `.key.pub` — minisign keypair for signing app updates. Private key is also stored as a GitHub Actions secret so the workflow can sign release builds.

## Things deliberately NOT included

- **Auto-install on launch** — removed. Users always click Update all to actually install. Manifest still re-fetches in the background so update status stays current.
- **Auto-delete on receive** — removed. When a file is removed from a bundle on the maintainer side, receivers' local copies stay on disk. Only the explicit per-bundle Remove button deletes files (with confirmation).
- **Drag-drop into publisher mode** — declined; maintainer prefers explicit field control.
- **Adding new bundles from inside the app** — declined; bundles are added by hand-editing `manifest.json` in the GitHub repo. Keeps things simple.
- **Auto-favorite Premiere export presets** — investigated. Premiere's "favorites" tree lives in `PresetTree.xml`; modifying it is risky (Premiere caches it in memory, schema is undocumented). Manually favoriting once per preset is cheaper.
- **Section dividers** between Premiere/Resolve in the receive list — declined as cluttered.
- **In-app changelog modal** after auto-update — declined.
- **Keyboard shortcuts** — declined.
- **Code signing** — Apple Developer ID is $99/year, Windows EV certs are $300+/year. Skipped. Users get one-time SmartScreen / Gatekeeper warnings on first install; subsequent auto-updates are smooth.

## Things on the to-build list (asked-for, not done)

1. **"Install to all detected versions" toggle** per app type (Premiere Pro, Adobe Media Encoder, Audition, Resolve). Currently only the highest installed version receives new files; older versions miss out. Multi-version targeting is the biggest open ask.
2. **Restore previous version** of a bundle — undo for the most recent install. Snapshot the previous version's files to `<appdata>/snapshots/<bundle>/<version>/` before each install; one-click restore from the bundle detail view.

## Glossary

- **Bundle**: a group of related preset files shared as a unit. Has an ID (slug, used as a folder name in the repo and a key in state), a display name, a category (`premiere` or `resolve`), a preset type (`export`, `lut`, `effect`, etc.), and a list of files.
- **Manifest**: `manifest.json` at the root of the presets GitHub repo. Lists every bundle and its current files. Source of truth for what's "in" each bundle.
- **Install type**: `auto` (file drops into Adobe/BMD canonical folder) or `manual` (file syncs to a user-visible folder + the app shows import-instruction modal).
- **Receive mode**: pulls from the manifest, installs to canonical folders.
- **Publisher mode**: scans local source folders, pushes changes to the manifest.
- **Folder label**: user-configurable name used for created folders (default "MCM Vault"). Lets the maintainer rebrand the user-visible bits if they want.
- **Disabled bundle**: a bundle the user has opted out of on a specific machine via the toggle on the receive row. Never installs, never counts in Update all.

## Repos

- **App source**: https://github.com/composrr/mcm-vault (public)
- **Presets / data**: https://github.com/composrr/mcm-vault-presets (public)

Both are owned by `composrr` (Jon Draper).
