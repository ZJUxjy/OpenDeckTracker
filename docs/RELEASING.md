# Windows releases

The public feed is GitHub Releases in `ZJUxjy/OpenDeckTracker`. Windows NSIS installations and portable ZIP builds check on launch and every six hours. Downloads require a player click; installation requires a separate restart confirmation. Normal exit never installs updates. Development builds offer the official download page instead.

## Prepare

1. Update workspace package versions, the native Cargo package version, and `RELEASE_NOTES.md`. Keep `appId`, `productName` and userData paths stable.
2. Run `pnpm install --frozen-lockfile`, `pnpm cards:sync`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
3. Run `pnpm --filter @hdt/hearthmirror-native build`, `pnpm notices`, `pnpm package`, `pnpm release:verify`, `pnpm release:smoke`, `pnpm release:smoke:portable`. Packaging rebuilds SQLite for Electron after Node tests and appends ZIP metadata; it does not publish automatically.
4. Commit the intended source, push it and a matching `vX.Y.Z` tag. `.github/workflows/release.yml` repeats checks and builds on Windows, uploads all assets to a draft, and then publishes. Manual workflow runs must target a version tag.

The artifacts are `OpenDeckTracker-Setup-X.Y.Z.exe`, the matching `.exe.blockmap`, `OpenDeckTracker-X.Y.Z-win.zip`, and `latest.yml`. Do not hand-edit metadata or overwrite an already published version. The verifier checks version, installer/ZIP sizes and SHA-512, the packaged helper and feed. Failed uploads leave an unpublished draft; inspect/remove that draft explicitly before rerunning CI.

For a local release after the same checks, use `gh release create` with `--draft --verify-tag --notes-file RELEASE_NOTES.md`, upload those four exact files, verify the attachments, then `gh release edit vX.Y.Z --draft=false --latest`. Do not run a competing local publisher while the tag workflow is active.

## Upgrade validation

`pnpm release:smoke` loads the actual packaged app.asar in Electron with isolated userData and cache. It simulates an older installed version and serves the real built installer from a loopback feed, rejects a deliberately corrupted first download, retries successfully, verifies the UI and explicit silent/relaunch install request. It intercepts installer execution so it cannot replace an existing installation. Results, logs and screenshots are written under ignored `tmp/`. CI runs this check before publication.

Use an isolated Windows installation and disposable userData to validate the two-version path: install version N, publish N+1 to a separate test feed, detect, download, defer, restart/install, and confirm the version and persisted data. Also exercise an interrupted download and retry. Unit tests cover state transitions and IPC/UI consent; they do not substitute for executing an installer.

`pnpm release:smoke:portable` exercises the packaged portable updater against a loopback feed, rejects a corrupt ZIP, retries, validates/extracts the real ZIP and confirms the explicit install request without replacing the running application. It then runs the real Windows helper against disposable executable fixtures: successful replacement and relaunch, preservation of unrelated files, rollback after a locked file, and rejection of invalid checksums, traversal, duplicates and invalid Windows names. No existing installation or player profile is modified.

For isolated build outputs, set `HDT_RELEASE_DIR` to the absolute output path for metadata generation, validation and smoke scripts. Pass the same path to electron-builder with `--config.directories.output=...`.

v0.7.0 is the installer bootstrap release: older builds contain a placeholder feed and require one manual install. v0.7.1 is the portable bootstrap release: portable v0.7.0 does not contain the ZIP updater, so those users need one manual upgrade to v0.7.1. Do not overwrite an older release to add the feature.

## Portable replacement

Portable updates use the ZIP in `latest.yml.files`; NSIS continues to select the EXE. Keep the ZIP artifact name `OpenDeckTracker-X.Y.Z-win.zip`. The app uses the existing updater's stable version policy, download cache, progress and SHA-512 validation. A bundled PowerShell 5.1 helper verifies the checksum again, safely extracts into a unique `.opendecktracker-update-*` directory beside the executable and validates the application layout before offering restart.

After confirmation the helper validates staged files, acknowledges readiness, waits for the parent to exit, backs up replaced files, applies the update and starts `OpenDeckTracker.exe`. Failures roll back completed changes and restart the old copy; the error is displayed under Settings → About. Configuration and databases remain in the existing userData directory, and unrelated files in the extraction directory are preserved. Old release files absent from the new ZIP are retained. Directory names containing spaces and brackets are supported. Updates require a writable local folder and enabled Windows PowerShell; they never elevate or kill processes holding files open.

The app-owned staging directory is removed after a successful update. If the player exits without applying, staged files can remain; a later download prepares a fresh directory. Failed replacement backups are retained for recovery. Do not delete a staging directory while its update helper is running. Cross-file replacement is not atomic under power loss, and launching successfully does not guarantee that a new version has no application-level bugs.

### Validation record (2026-09-16)

- `pnpm lint`: zero errors, seven existing Fast Refresh warnings.
- `pnpm typecheck`: passed across the workspace.
- `pnpm test`: 233 test files passed, 1773 tests passed and one existing skip.
- Targeted update/UI suite: 21 tests passed.
- Isolated Windows packaging at `tmp/portable-release`, ZIP metadata generation and `pnpm release:verify`: passed, including exact packaged-helper comparison.
- `pnpm release:smoke` and `pnpm release:smoke:portable`: packaged downloads, checksum rejection/retry, staged extraction and explicit update request passed. Installation calls in the packaged-app tests are intercepted; the separate PowerShell test actually replaces and restarts disposable executable fixtures, including rollback and old-executable restart after a locked file.
- GitHub v0.7.0 assets were not modified and no new release was published for this change.

## Signing

Current beta packages are unsigned. Do not configure a placeholder `publisherName`: electron-updater interprets it as a certificate identity and would reject unsigned updates. HTTPS and the updater's SHA-512 checks remain enabled. When a real signing certificate is introduced, configure signing and the matching publisher identity together and retest the upgrade path.
