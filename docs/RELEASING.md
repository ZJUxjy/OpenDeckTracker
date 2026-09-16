# Windows releases

The public feed is GitHub Releases in `ZJUxjy/OpenDeckTracker`. Windows NSIS installations check on launch and every six hours. Downloads require a player click; installation requires a separate restart confirmation. Normal exit never installs updates. ZIP and development builds offer the official download page instead.

## Prepare

1. Update workspace package versions, the native Cargo package version, and `RELEASE_NOTES.md`. Keep `appId`, `productName` and userData paths stable.
2. Run `pnpm install --frozen-lockfile`, `pnpm cards:sync`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
3. Run `pnpm --filter @hdt/hearthmirror-native build`, `pnpm notices`, `pnpm package`, `pnpm release:verify`, `pnpm release:smoke`. Packaging rebuilds SQLite for Electron after Node tests; it does not publish automatically.
4. Commit the intended source, push it and a matching `vX.Y.Z` tag. `.github/workflows/release.yml` repeats checks and builds on Windows, uploads all assets to a draft, and then publishes. Manual workflow runs must target a version tag.

The artifacts are `OpenDeckTracker-Setup-X.Y.Z.exe`, the matching `.exe.blockmap`, `OpenDeckTracker-X.Y.Z-win.zip`, and `latest.yml`. Do not hand-edit metadata or overwrite an already published version. The verifier checks version, installer size, SHA-512 and the packaged feed. Failed uploads leave an unpublished draft; inspect/remove that draft explicitly before rerunning CI.

For a local release after the same checks, use `gh release create` with `--draft --verify-tag --notes-file RELEASE_NOTES.md`, upload those four exact files, verify the attachments, then `gh release edit vX.Y.Z --draft=false --latest`. Do not run a competing local publisher while the tag workflow is active.

## Upgrade validation

`pnpm release:smoke` loads the actual packaged app.asar in Electron with isolated userData and cache. It simulates an older installed version and serves the real built installer from a loopback feed, rejects a deliberately corrupted first download, retries successfully, verifies the UI and explicit silent/relaunch install request. It intercepts installer execution so it cannot replace an existing installation. Results, logs and screenshots are written under ignored `tmp/`. CI runs this check before publication.

Use an isolated Windows installation and disposable userData to validate the two-version path: install version N, publish N+1 to a separate test feed, detect, download, defer, restart/install, and confirm the version and persisted data. Also exercise an interrupted download and retry. Unit tests cover state transitions and IPC/UI consent; they do not substitute for executing an installer.

v0.7.0 is the bootstrap release: older builds contain a placeholder feed and require one manual install of v0.7.0. Future releases with higher versions can update from inside the installed app. ZIP distributions do not replace themselves.

## Signing

Current beta packages are unsigned. Do not configure a placeholder `publisherName`: electron-updater interprets it as a certificate identity and would reject unsigned updates. HTTPS and the updater's SHA-512 checks remain enabled. When a real signing certificate is introduced, configure signing and the matching publisher identity together and retest the upgrade path.
