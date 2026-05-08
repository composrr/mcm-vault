# Releasing MCM Vault

Three iteration loops, fastest to slowest.

## Loop 1 — Local hot reload (instant, for active dev)

```bash
npm run tauri dev
```

Compiles once (~5-15 min cold, seconds warm), then UI changes hot-reload, Rust changes auto-rebuild. Use this 99% of the time you're tweaking. No GitHub involved.

## Loop 2 — Local installer build (1-3 min, for testing the actual installable artifact)

When you want to verify the .msi/.dmg works the way it will for teammates without waiting on GitHub Actions:

```bash
npm run tauri build
```

Outputs land in:

- `src-tauri/target/release/bundle/msi/MCM Vault_<ver>_x64_en-US.msi` (Windows)
- `src-tauri/target/release/bundle/nsis/MCM Vault_<ver>_x64-setup.exe` (Windows, NSIS — installs per-user, no admin)
- `src-tauri/target/release/bundle/dmg/MCM Vault_<ver>_<arch>.dmg` (macOS)

Double-click to install. This installs the same binary the public release would, but the auto-updater won't see "an update" since the version matches what's published. Test, then bump version + tag for a real release.

## Loop 3 — GitHub Actions release (~15 min, for shipping to teammates)

### Stable release (your team auto-updates to it)

1. Bump version in three files (must match):
   - `package.json` → `version`
   - `src-tauri/Cargo.toml` → `[package].version`
   - `src-tauri/tauri.conf.json` → `version`
2. Commit + push:
   ```bash
   git add -A && git commit -m "Release v0.2.0"
   git push
   ```
3. Tag + push the tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. Watch https://github.com/composrr/mcm-vault/actions. ~15 min. The workflow auto-publishes the release as **Latest** when all platforms finish — no manual step.
5. Teammates' apps pick up the update on next launch (or via Settings → "Check for app updates").

### Beta release (your team does NOT auto-update; you can share manually)

Use a tag with a hyphen — anything matching `vX.Y.Z-something`:

```bash
git tag v0.2.0-beta.1
git push origin v0.2.0-beta.1
```

The workflow:
- Builds the same artifacts.
- Marks the GitHub Release as **Pre-release** (not "Latest").
- Auto-publishes out of draft, so it's visible immediately.

The auto-updater endpoint (`releases/latest/download/latest.json`) ignores pre-releases, so stable users won't be auto-upgraded. To install a beta on someone's machine: send them the direct link to the release page (e.g. https://github.com/composrr/mcm-vault/releases/tag/v0.2.0-beta.1), they download the .msi/.dmg, install. Once it's installed, the app runs at `0.2.0-beta.1` until the next stable release tag — at which point auto-update brings them down/up to that.

Common beta workflow:
```bash
git tag v0.2.0-beta.1 && git push origin v0.2.0-beta.1
# … iterate …
git tag v0.2.0-beta.2 && git push origin v0.2.0-beta.2
# … happy with it …
git tag v0.2.0 && git push origin v0.2.0   # promotes to stable for everyone
```

## One-time secret setup (already done)

The release workflow needs the minisign signing key so it can sign update bundles. This was set up once via GitHub repo secrets:

- `TAURI_SIGNING_PRIVATE_KEY` → contents of `~/.tauri/mcm-vault.key`
- (No password — we generated the key without one.)

The private key is at `C:\Users\jondr\.tauri\mcm-vault.key`. **Back this up somewhere safe.** If you lose it, you can't sign updates and everyone has to reinstall from a fresh-key release.

## What gets uploaded per release

For each release the workflow uploads:

- `MCM Vault_<ver>_x64-setup.exe` — Windows NSIS installer (per-user, no admin needed).
- `MCM Vault_<ver>_x64-setup.exe.sig` — auto-updater signature.
- `MCM Vault_<ver>_x64_en-US.msi` — Windows MSI (installs to Program Files, requires admin).
- `MCM Vault_<ver>_x64_en-US.msi.sig` — auto-updater signature.
- `MCM Vault_<ver>_aarch64.dmg` — macOS Apple Silicon disk image.
- `MCM Vault_<ver>_x64.dmg` — macOS Intel disk image.
- `MCM Vault.app.tar.gz` (per architecture) — what the auto-updater downloads on Mac.
- `latest.json` — the auto-updater manifest.

## How a teammate installs the first time

Send them: https://github.com/composrr/mcm-vault/releases/latest

- **Windows:** download the `.msi` (or `-setup.exe` if they don't want admin). Run. Click **More info → Run anyway** on the SmartScreen warning. Done.
- **macOS:** download the right `.dmg` (`aarch64` for M-series, `x64` for Intel). Open it, drag MCM Vault to Applications. First launch: right-click → Open → click Open in the dialog (Gatekeeper bypass for unsigned apps; one-time).

After that, **Settings → Check for app updates** is all they need.

## Recovering if you lose the signing key

Don't lose it. The file `C:\Users\jondr\.tauri\mcm-vault.key` should be in 1Password / encrypted backup.

If you do lose it: generate a new key with `npm run tauri signer generate -- --write-keys ~/.tauri/mcm-vault.key`, replace the `pubkey` in `tauri.conf.json` with the new public key, ship a release the **old** way (everyone reinstalls). Future updates resume.

## Troubleshooting

- **Workflow fails on signing step** — `TAURI_SIGNING_PRIVATE_KEY` repo secret is missing or wrong.
- **App says "Update failed: signature mismatch"** — pubkey in `tauri.conf.json` doesn't match the private key that signed the release.
- **App says "Could not fetch a valid release JSON from the remote"** — the `mcm-vault` repo went private (the updater fetches anonymously). Make it public.
- **Windows SmartScreen blocks every install** — unavoidable without a code-signing cert ($300+/year). Tell users "More info → Run anyway".
