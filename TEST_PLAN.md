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

---

## I. Publisher mode

### I1. Toggle publisher mode on
1. Settings → Publisher → toggle "Enable publisher mode" ON.
2. Back on main view: a `Receive | Publish` segmented control appears under the header.
3. Click **Publish** → Publisher view loads.

### I2. Per-bundle source folder + checkboxes
1. In Publish view: each bundle row shows the local source folder it scans plus a list of detected files with checkboxes.
2. Add a new file to one of the source folders (e.g. drop a new `.cube` into `Documents/MCM Vault Presets/<bundle>/`). Click **Rescan**.
3. Expect: the new file appears in the list, checked by default.
4. Uncheck a file you don't want to publish.

### I3. Publish a real change
1. Bump a bundle's version in the inline version field (or rely on auto-bump).
2. Click **Publish selected**.
3. Expect: progress UI, then green confirmation. No terminal window flashes (Windows: CREATE_NO_WINDOW flag).
4. Confirm `git log` on `presets-repo-staging` shows the new commit.
5. Refresh the manifest in the receive view → the new version is visible.

### I4. Cross-machine: receivers preserve their own files
1. Machine A publishes a bundle with files [a, b].
2. Machine B (which had files [a, c] from a previous publish) refreshes the manifest.
3. Expect: B's local install still has c (never auto-deleted), and gets b added on next install. The bundle metadata in the manifest = files Machine A actually published; receivers keep extras.

---

## J. Per-bundle opt-out

### J1. Disable a bundle on this machine
1. Toggle the per-row sync switch OFF on a bundle.
2. Row goes muted; "not syncing" status hidden from update count.
3. Push an update for that bundle from the maintainer machine.
4. Expect: **Update all** does NOT install it. Counter ignores it.
5. Toggle ON → bundle returns to normal flow on next refresh.

### J2. Disabled state persists across launches
1. Disable a bundle, relaunch app.
2. Expect: row remains muted/disabled (state in `state.json → disabledBundles`).

---

## K. Multi-version install targets

### K1. Default = highest only
1. Reset Install Targets in Settings (all rows show "HIGHEST ONLY").
2. Reinstall an export-preset bundle.
3. Expect: files land only in the highest installed AME version (e.g. `Documents/Adobe/Adobe Media Encoder/26.0/Presets/`).

### K2. Pick a second version
1. Settings → Install Targets → Adobe Media Encoder: click `v26.0` AND `v25.0`.
2. Reinstall the same bundle.
3. Expect: files land in **both** `26.0/Presets/` and `25.0/Presets/`. `state.installedBundles[id].files` lists both copies.

### K3. Per-app independence
1. Pin Premiere Pro to `26.0`, but Adobe Media Encoder to `26.0 + 25.0`.
2. Install a sequence-preset bundle (uses Premiere) and an export-preset bundle (uses AME).
3. Sequence presets land only in `26.0`; export presets land in both.

### K4. Reset to highest only
1. Click "Reset to highest only" on a row that has selections.
2. Selections clear; chip flips back to "HIGHEST ONLY".
3. Next install reverts to highest-version-only behavior.

### K5. Version-agnostic types unaffected
1. With multi-version targets set on AME, install a Lumetri/MOGRT/Resolve bundle.
2. Expect: those still use their single canonical path (Adobe Common, Resolve Support, etc.) — the version selector only affects export/sequence/audio presets.

---

## L. Restore previous version

### L1. Snapshot taken on update
1. Install bundle X at v1.0. State has installedBundles[X] with no `previousInstall`.
2. Push v1.1 of bundle X. Click **Update all** (or Reinstall on row).
3. Expect: `state.installedBundles[X].previousInstall` populated. Detail view "Details" panel now shows "Previous version v1.0 · <date>".
4. Inspect `<appdata>/MCMVault/snapshots/<bundleId>/1_0_<ts>/` — snapshot files exist with `NNN__<originalname>` prefixes.

### L2. Restore button
1. With L1 state, open bundle X's detail view.
2. Click **Restore previous version (v1.0)**. Confirm in dialog.
3. Expect: files on disk return to v1.0 contents. State updates: `installedBundles[X].version = "1.0"`, `previousInstall` cleared.
4. Detail view reflects v1.0 again; restore button hidden until next update.

### L3. No restore option when there's no snapshot
- Fresh install of a bundle (no prior install): detail view does NOT show the restore button.
- After remove + reinstall: still no restore button (snapshots only fire when overwriting an existing install).

### L4. Snapshot survives across multi-version installs
- With install targets = [26.0, 25.0]: snapshots include all original_paths from both versions; restore returns each to its original location.

---

## M. Workspaces, keyboard shortcuts, project templates (v0.1.8)

### M1. Workspaces (`presetType: workspace`)
1. Add a bundle with `presetType: "workspace"` to the manifest, `files: ["edit.xml", "color.xml"]`.
2. Receive view → Install.
3. Expect: files copied to `Documents\Adobe\Premiere Pro\<ver>\Profile-<user>\Layouts\edit.xml` (and `color.xml`). On Mac: `~/Documents/Adobe/Premiere Pro/<ver>/Profile-<user>/Layouts/`.
4. With multi-version install targets enabled, expect copies in every selected version's `Layouts\` folder.
5. Open Premiere → Window → Workspaces → the new layouts appear in the list.

### M2. Project templates (`presetType: project-template`)
1. Add a bundle with `presetType: "project-template"`, `files: ["episodic.prproj", "branded-30s.prproj"]`.
2. Install. Expect files at `Documents\MCM Vault Presets\Project Templates\episodic.prproj` (etc).
3. The "Open Folder" button reveals the folder. Double-clicking a `.prproj` opens it in Premiere.
4. Reinstalling overwrites; previous-version snapshot captures the prior `.prproj` contents.
5. Multi-version install-targets settings have NO effect on project templates (version-agnostic).

### M3. Keyboard shortcuts (`presetType: keyboard`) — install
1. Add a bundle with `presetType: "keyboard"`, `files: ["win/mcm-default.kys", "mac/mcm-default.kys"]`. Bundle's repo layout has `win/mcm-default.kys` and `mac/mcm-default.kys` files.
2. **On Windows:** install. Expect `Documents\Adobe\Premiere Pro\<ver>\Profile-<user>\Win\mcm-default.kys` (no `win/` prefix in final filename). The `mac/*.kys` file is downloaded into staging but not copied to disk.
3. **On Mac:** install. Expect `~/Documents/Adobe/Premiere Pro/<ver>/Profile-<user>/Mac/mcm-default.kys` and the `win/*` file is skipped.
4. Open Premiere → Edit → Keyboard Shortcuts → the imported keymap appears in the dropdown.
5. With multi-version install targets enabled: copies land in every selected version's `Win\`/`Mac\` folder.

### M4. Keyboard shortcuts — publish (Windows publisher)
1. Enable Publisher mode. Add a `keyboard` bundle to the manifest (id only; empty `files`).
2. The publisher view's source folder for that bundle = `…\Profile-<user>\Win\`. Local `.kys` files appear flat in the file list.
3. Check one, click Publish.
4. Expect: file copied into the repo at `<bundle_path>/win/<name>.kys` (repo gets a `win/` subfolder). Manifest `files` array includes `["win/<name>.kys"]`.
5. State's `publisher[id].lastPublishedFiles` keys are flat (`<name>.kys`) — survives the next scan without showing as "removed."

### M5. Cross-platform publish coexistence
1. Windows publisher publishes `win/keys-A.kys`.
2. Manifest has `["win/keys-A.kys"]`.
3. (Hypothetical) Mac publisher publishes `mac/keys-B.kys`. Manifest now has `["mac/keys-B.kys", "win/keys-A.kys"]`.
4. Windows publisher publishes again with a new `win/keys-A.kys`. Expect: Mac entry preserved (not deleted by the Windows-side cleanup pass).

### M6. Receiver-side cross-platform skip
1. Manifest has `["win/foo.kys", "mac/foo.kys"]`.
2. Windows receiver installs: `installedBundles[id].files` lists ONE entry — the Win path. `mac/foo.kys` is downloaded to staging but skipped at copy time.
3. After uninstall + reinstall, snapshot only captures the Win file.
