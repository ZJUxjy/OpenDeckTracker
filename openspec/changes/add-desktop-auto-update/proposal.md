## Why

The distribution work in DEVELOPMENT_PLAN.md has an updater scaffold, but its placeholder feed and incomplete UI prevent players from updating in the app. Complete the Windows installer update path and ship v0.7.0 as the first release with a working feed.

## What Changes

- Use public GitHub Releases as the update feed.
- Check automatically; download and restart only on explicit player actions, with progress and retry states.
- Expose shared updater state to the desktop UI and preserve user data.
- Add repeatable release packaging, metadata validation, and GitHub release automation.

## Capabilities

### New Capabilities
- `desktop-auto-update`: User-controlled Windows NSIS updates and complete release artifacts.

### Modified Capabilities
None.

## Non-goals

Portable ZIP self-replacement, macOS/Linux updates, forced restarts, a custom CDN, and purchasing signing certificates.

## Impact

Electron main/preload, React settings and global notification, localization, electron-builder configuration, release scripts/workflow, version manifests, and release documentation. Existing userData storage remains stable.
