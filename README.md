# MCM Vault

A small desktop app that keeps the Milestone Creative Media team's
Premiere Pro and DaVinci Resolve presets in sync. The app pulls from a
public GitHub repo of preset bundles and installs them into the right
Adobe / Blackmagic folders on each editor's machine.

Plain-English overview: see [OVERVIEW.md](./OVERVIEW.md).
Manual test scenarios: see [TEST_PLAN.md](./TEST_PLAN.md).
Release / signing checklist: see [RELEASE.md](./RELEASE.md).

## Two modes

- **Receive (default)** — fetches the manifest from the presets repo,
  shows what's available vs. installed, and installs to canonical Adobe
  / Resolve folders. Per-bundle opt-out toggle if a teammate doesn't
  want a given bundle. Per-bundle "Restore previous version" if an
  update goes wrong.
- **Publisher** — opt-in via Settings. Adds a Publish view for the
  maintainer to push their local preset folders to the GitHub repo.
  Uses local git credentials. Receivers preserve files they have
  locally that the maintainer doesn't (cross-machine merge).

## Repos

- **App** (this repo): `composrr/mcm-vault`
- **Presets** (manifest + binary preset files):
  `composrr/mcm-vault-presets`

The app fetches `manifest.json` and the preset blobs from the presets
repo over plain HTTPS — no GitHub token needed for receivers. Only the
maintainer (publisher mode) needs push access.

## Stack

- Tauri 2 (Rust + WebView)
- React 19, TypeScript, Tailwind v4
- Zustand for state
- Auto-updater via Tauri's plugin (minisign-signed releases on GitHub)

## Local development

```sh
cd mcm-vault
npm install
npm run tauri dev
```

Live state lives in `%APPDATA%/MCMVault/state.json` (Windows) or
`~/Library/Application Support/MCMVault/state.json` (macOS). Delete it
to simulate a first-run install.

## Local installer build (much faster than CI)

```sh
cd mcm-vault
npm run tauri build -- --bundles nsis
```

The NSIS installer drops out at
`src-tauri/target/release/bundle/nsis/MCM Vault_<version>_x64-setup.exe`.
Per-user install, no admin required.

## Releases

Tag-driven via GitHub Actions:

- `vX.Y.Z` → published as **Latest** on GitHub Releases. Auto-updater
  picks it up on next launch (signed by our minisign key).
- `vX.Y.Z-beta.N` → published as **Pre-release**. Doesn't trigger
  auto-update for end users — install manually for testing.

See [RELEASE.md](./RELEASE.md) for the full ship checklist (tag
conventions, signing key location, retracting a bad release).
