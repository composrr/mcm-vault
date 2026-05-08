# Releasing MCM Vault

Two parts: shipping the **first install** to a new team member, and shipping **subsequent updates** to people who already have the app.

## One-time setup (do this once on the GitHub repo)

The release workflow needs the minisign signing key in GitHub secrets so it can sign update bundles.

1. Get the key contents:
   ```bash
   cat ~/.tauri/mcm-vault.key
   ```
2. In a browser, go to https://github.com/composrr/mcm-vault/settings/secrets/actions and click **New repository secret**.
3. Name: `TAURI_SIGNING_PRIVATE_KEY` — Value: the full contents of the file (paste).
4. Add a second secret: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — Value: leave blank (the key was generated with no password).

You can also run `gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/mcm-vault.key` from the CLI.

That's it. The secrets persist across all future runs.

## Cutting a new release

1. Bump the version in three places (must match):
   - `package.json` → `version`
   - `src-tauri/Cargo.toml` → `[package].version`
   - `src-tauri/tauri.conf.json` → `version`
2. Commit:
   ```bash
   git add -A && git commit -m "Release v0.2.0"
   git push
   ```
3. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. Watch the workflow on the **Actions** tab. ~10–20 minutes total to build all three platforms.
5. When it's done, go to **Releases**. The release is in **Draft** state with all installers and a `latest.json` attached. Edit the notes if you want, then click **Publish release**.

The act of publishing flips it from draft to live. The auto-updater endpoint (`https://github.com/composrr/mcm-vault/releases/latest/download/latest.json`) only follows non-draft releases, so users won't see the update until you publish.

## What gets uploaded per release

For each release the workflow uploads:

- `MCM Vault_<ver>_x64-setup.exe` — Windows installer (NSIS).
- `MCM Vault_<ver>_x64-setup.exe.sig` — signature file used by the auto-updater.
- `MCM Vault_<ver>_x64-setup.nsis.zip` — zipped installer for the auto-updater (smaller delta).
- `MCM Vault_<ver>_aarch64.dmg` — Apple Silicon disk image.
- `MCM Vault_<ver>_x64.dmg` — Intel Mac disk image.
- `MCM Vault.app.tar.gz` (per architecture) — what the auto-updater downloads on Mac.
- `latest.json` — the manifest the auto-updater fetches.

## How a teammate installs it the first time

Send them the link to the GitHub Release page. They:

- **Windows:** Download the `.msi` (or `-setup.exe`). Run it. If Windows shows "Windows protected your PC", click **More info** → **Run anyway**. Install completes, app appears in the Start menu.
- **macOS:** Download the right `.dmg` (`aarch64` for Apple Silicon, `x64` for Intel). Open it, drag MCM Vault to Applications. First launch only: right-click the app in Applications → **Open** → click **Open** in the dialog. (Gatekeeper warning is normal for unsigned apps; this is a one-time confirmation.)

After the first install, `Settings → Check for app updates` does everything.

## How updates work after the first install

1. User clicks **Settings → Check for app updates** (or it can be triggered from anywhere we add a button later).
2. App fetches `latest.json` from the GitHub Release.
3. If a newer version exists, app downloads the platform-specific update artifact, verifies the minisign signature against the public key built into the binary, applies the update, restarts.
4. User is on the new version. No reinstall, no warning dialogs, no admin rights needed.

If signature verification fails, the update is rejected — the user keeps the old version. This is the protection you get without paid code-signing certs: the app trusts only updates signed with **your** key.

## Recovering if you lose the signing key

Don't. Back up `~/.tauri/mcm-vault.key` (and `.key.pub`) somewhere safe (1Password, encrypted drive, etc.).

If you do lose it: generate a new key, replace the `pubkey` in `tauri.conf.json` with the new one, ship a release the **old** way (everyone reinstalls from scratch). After that everyone is back on the new key for future auto-updates.

## Troubleshooting

- **Workflow fails on signing**: secret `TAURI_SIGNING_PRIVATE_KEY` is missing or wrong. Check the Actions log.
- **App says "update failed: signature mismatch"**: the public key in `tauri.conf.json` doesn't match the private key that signed the release. Re-check both ends.
- **macOS users say the app is "damaged"**: Gatekeeper quarantine. They can clear it with `xattr -d com.apple.quarantine /Applications/MCM\ Vault.app` in Terminal, or right-click → Open the first time.
- **Windows SmartScreen blocks every time**: SmartScreen reputation builds over time as more people install. Without a code-signing cert ($300+/year), this is unavoidable. Tell users to click "More info" → "Run anyway" the first time.
