# MCM Vault — Manual Test Plan

Walk through these scenarios in order on a real Windows machine with Premiere Pro installed. Each section calls out the setup, the steps, and the expected outcome. ~30 minutes end-to-end.

The presets repo: https://github.com/composrr/mcm-vault-presets

## 0. Setup

- Tauri dev running: `cd mcm-vault && npm run tauri dev`
- Local app data folder: `C:\Users\jondr\AppData\Roaming\MCMVault\state.json`
- A second checkout of the presets repo on disk for editing the manifest. The current copy is at `presets-repo-staging/`.

A handy helper to reset state between tests:
```
del "C:\Users\jondr\AppData\Roaming\MCMVault\state.json"
```

---

## A. Foundation

### A1. App opens and renders the live manifest
1. Launch the app.
2. Expect: 7 bundle rows, "Last checked: just now", manifest matches GitHub.
3. Inspect `state.json` — `lastSuccessfulSync` is current timestamp, `lastKnownManifest` populated.

### A2. Window respects size/light theme
- Window opens at 520×640, white background, light gray header. (Windows itself draws the OS title bar; that's expected.)

---

## B. Install / uninstall

### B1. Single-bundle install via row click
1. Reset state (delete `state.json`), launch app, click "Open MCM Vault" past the welcome.
2. After auto-install completes, click `YouTube Export Presets` row → detail view.
3. Click **Remove** → row returns to "Not installed", files gone from `Documents\Adobe\Premiere Pro\26.0\Profile-jondr\Settings\EPR\MCM_YT_*.epr`.
4. Click the row again → **Install**. Files reappear.

### B2. Reinstall preserves correct files
1. With `YouTube Export Presets` installed, manually delete one of the `.epr` files from the EPR folder.
2. In app: click row → **Reinstall** → all 3 files present again.

### B3. Update flow with old files cleaned up
1. In `presets-repo-staging`, rename `MCM_YT_1080p.epr` to `MCM_YT_HD.epr`. Edit `manifest.json` to match (rename the file in `files[]` and bump version `2.1` → `2.2`).
2. Commit + push.
3. In app: click refresh in status bar.
4. Expect row shows "Update available · v2.1 → v2.2".
5. Click **Update all** (or row → Reinstall).
6. Verify: in the EPR folder, **`MCM_YT_1080p.epr` is gone** and `MCM_YT_HD.epr` is present. State `installedBundles.youtube-export-presets.files` lists the new path, not the old.

### B4. Path lands in the highest-numbered Premiere version
- Diagnostic shows your machine has 14.0 through 26.0 installed.
- All Premiere installs target `26.0\Profile-jondr\…`. Open the row's **Reveal files** button and confirm the path is `26.0`.

---

## C. LUTs and other preset types

### C1. Lumetri / Technical LUT install — user-scoped path
1. Click `Client Delivery LUTs` row → ensure installed.
2. Verify files at `Documents\Adobe\Common\LUTs\Technical\MCM_*.cube` (NOT `Program Files`).

### C2. MOGRTs land in Common Motion Graphics Templates
1. `Social Media Templates` installed.
2. Verify files at `Documents\Adobe\Common\Motion Graphics Templates\MCM_*.mogrt`.

### C3. Premiere effect presets (the rerouted audio chain)
1. `Podcast Audio Chain` installed (v1.1+).
2. Verify files at `Documents\Adobe\Premiere Pro\26.0\Profile-jondr\Effects Presets\MCM_Voice_*.prfpset`.

---

## D. DaVinci Resolve

### D1. Resolve LUT auto-install
1. `Resolve Cinematic LUTs` installed.
2. Verify files at `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\LUT\MCM Vault\MCM_Resolve_*.cube`.
3. Open Resolve, Color page, drop a clip, check the LUT browser — `MCM Vault` folder appears.

### D2. Fairlight presets
1. `Fairlight Voice Presets` installed.
2. Verify at `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fairlight\Presets\MCM_Voice_*.preset`.

### D3. Manual-import (PowerGrades)
1. Click `Signature PowerGrades` row → modal appears with import steps.
2. Click **Reveal in Explorer** → opens `Documents\MCM Vault Presets\Resolve\` (or the bundle subfolder once installed).
3. Files synced to `Documents\MCM Vault Presets\Resolve\PowerGrades\` (or wherever `resolve_target` resolves them).

---

## E. Error handling

### E1. Network offline
1. Disable Wi-Fi / unplug Ethernet.
2. Click refresh in status bar.
3. Expect: amber offline banner under the header, last-known bundle list still visible (dimmed in spirit), status bar reads "Offline · …".
4. Re-enable network, click **Retry** in the banner → list refreshes, banner disappears.

### E2. Install failure on a single bundle (simulated)
1. In `presets-repo-staging`, edit one bundle's `files[]` to include a file name that does NOT exist in the folder (e.g. `MCM_GHOST.cube`). Bump version. Commit + push.
2. In app: click refresh, then **Update all**.
3. Expect: that one row shows the red error icon + "Install failed · HTTP 404 …". Other bundles continue installing successfully.
4. State: the failed bundle has no entry in `installedBundles` (all-or-nothing per bundle).
5. Reset the bad manifest entry, commit + push, retry — row recovers.

### E3. No host apps
- Only practical to test on a machine without Premiere or Resolve. Skip on this box.

---

## F. First-run + settings

### F1. First-run welcome (3 states)
1. Reset state (delete `state.json`), close + relaunch app.
2. Expect "Welcome to MCM Vault" with the detected apps card showing **Adobe Premiere Pro 26.0** and **DaVinci Resolve** with green checks.
3. Click **Install presets** → progress card appears, counts "Installing X · n of 7".
4. On complete: green check circle, "You're all set", info banner about manual-import bundles, **Open MCM Vault** button.
5. Click → main window. Subsequent relaunches skip the welcome.

### F2. Settings — toggle auto-update off
1. Settings → toggle "Check for updates on launch" OFF.
2. Push a manifest version bump for any bundle (e.g. `youtube-export-presets` 2.1 → 2.2).
3. Restart the app.
4. Expect: app fetches manifest, the bumped row shows "Update available", but the file is NOT auto-installed. User has to click **Update all** or the row's Reinstall.

### F3. Settings — change check interval
1. Set interval to 1h.
2. State should reflect `settings.checkInterval: "1h"`.
3. (Functional verification of the timer takes an hour — eyeball the persisted state instead.)

### F4. Settings — Run diagnostics
1. Click "Run diagnostics" — JSON tree appears with current OS, user, Premiere versions, all preset paths.
2. Check Lumetri/Technical LUT paths now read `…\Documents\Adobe\Common\LUTs\Creative` and `…\Technical` (not `Program Files`).

### F5. Open log folder
- "Open log folder" → opens `C:\Users\jondr\AppData\Roaming\MCMVault\` in Explorer.

### F6. "Open folder" from main window
- Bottom-right "Open folder" → opens `Documents\MCM Vault Presets\`.

---

## G. State integrity

### G1. State.json schema
Open `state.json` and verify:
- `schemaVersion: 1`
- `installedBundles[id].files` are absolute paths
- `installedBundles[id].version` matches what the manifest says
- `lastSuccessfulSync` is a recent ISO timestamp

### G2. Orphan cleanup on rename
- Covered by B3.

### G3. Resilience to a corrupted state.json
1. Hand-edit `state.json` to invalid JSON.
2. Restart app.
3. Expect the app to log a parse error and start fresh (treats as first-run). It should NOT crash to a blank window.

---

## H. Cross-machine smoke (when ready to roll out)

### H1. Fresh team member install
- On a different Windows machine: install MCM Vault binary (once you have one).
- App opens, runs first-run welcome, installs all 7 bundles to that machine's Adobe folders.
- Premiere/Resolve there sees the presets.

### H2. Maintainer pushes an update
- On the maintainer's machine: edit `manifest.json`, bump version, push.
- On the team member's machine: within the configured interval (or on app relaunch), the row shows "Update available" and the new version is auto-installed.
