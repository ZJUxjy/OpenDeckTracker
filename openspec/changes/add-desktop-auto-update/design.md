## Context

Electron 37, electron-builder 25.1.x and electron-updater 6.8.x are already installed. Local updater source confirms autoDownload, autoInstallOnAppQuit, downloadUpdate and quitAndInstall(boolean, boolean) are supported; newer v7-only APIs will not be used. Current main process downloads silently from a placeholder URL.

## Goals / Non-Goals

Complete the user-controlled NSIS update experience and publish v0.7.0 with consistent source and artifacts. No ZIP replacement, forced installation, CDN service, or new runtime dependency.

## Decisions

1. Context: an existing updater and public repository are available. Options: custom downloader or electron-updater GitHub provider. Choice: reuse electron-updater. Rationale: it owns version selection, checksum verification, caching and installer execution.
2. Context: players must choose when downloads and restarts happen. Options: auto-download/on-quit install or explicit actions. Choice: disable both automatic behaviors and expose a single main-process state machine over typed IPC. Rationale: avoids match interruptions and duplicate requests; periodic checks cannot discard a ready installer.
3. Context: NSIS and ZIP share binaries. Options: infer from app.isPackaged or detect the NSIS uninstaller beside the executable. Choice: packaged Windows plus the product-specific uninstaller. Rationale: packaged ZIP is not an installed app; unsupported clients get a fixed trusted release link.
4. Context: releases currently are unsigned. Options: claim a publisher certificate or keep the existing unsigned distribution. Choice: remove the placeholder publisherName, retain HTTPS and SHA-512 verification, document unsigned beta status. Rationale: a fictional publisher identity would reject every downloaded installer. Real signing remains future work.
5. Context: updates need discoverable UI. Options: settings only or global notice plus settings. Choice: reusable update panel in settings and a compact notice in the desktop shell. Rationale: background detection must be visible without opening settings; overlays remain unobstructed.

## File Layout

```text
apps/desktop/src/
  shared/app-update.ts
  main/auto-update.ts
  main/auto-update.test.ts
  renderer/src/components/AppUpdatePanel.tsx
  renderer/src/hooks/use-app-update.ts
scripts/verify-release.mjs
.github/workflows/release.yml
docs/RELEASING.md
```

## Risks / Trade-offs

- Performance: deduplicate network operations and check every six hours, with no automatic download.
- Security: use the fixed public GitHub feed, library checksum checks, no client credentials or renderer-provided URLs. Unsigned Windows builds retain their existing trust warning.
- Compatibility: older clients using the placeholder feed need one manual install of v0.7.0. ZIP users need the installer to opt into updates.
- Release integrity: verify manifest version, referenced files and SHA-512 before publishing; publish a draft only after all assets are uploaded.

## Migration Plan

Keep appId, productName and userData paths unchanged; bump workspace versions to 0.7.0. Validate unit/UI tests, lint, types, build and packaged feed/artifacts. Publish complete v0.7.0; never overwrite a published version. Withdraw a broken release and issue a higher patch version if needed.

## Open Questions

The release includes the current development snapshot together with the updater. Remaining tasks in complete-tracker-enhancements retain their existing in-progress status.
