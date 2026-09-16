## 1. Update runtime

- [x] 1.1 Add failing lifecycle tests in apps/desktop/src/main/auto-update.test.ts; run pnpm exec vitest run apps/desktop/src/main/auto-update.test.ts and observe missing controller failure, then implement shared status and controller in apps/desktop/src/shared/app-update.ts and apps/desktop/src/main/auto-update.ts until green. Assertions include expect(updater.downloadUpdate).not.toHaveBeenCalled() before consent and expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true) after download. Commit: feat(updater): add user-controlled Windows update lifecycle.
- [x] 1.2 Wire typed status/actions/subscriptions in apps/desktop/src/preload/index.ts and main/about.ts; test IPC subscription cleanup in apps/desktop/src/preload/index.test.ts with pnpm exec vitest run apps/desktop/src/preload/index.test.ts, expecting all tests passing.

## 2. Player interface

- [x] 2.1 Add AppUpdatePanel.tsx and use-app-update.ts, integrate Settings.tsx and App.tsx, and add English/Chinese messages in resources/locales; run pnpm exec vitest run apps/desktop/src/renderer/tests/Settings.about.test.tsx apps/desktop/src/renderer/tests/AppUpdatePanel.test.tsx, expecting explicit download/restart and failure recovery coverage. Commit: feat(updater): show update progress and restart controls.

## 3. Release delivery

- [x] 3.1 Configure apps/desktop/electron-builder.yml GitHub feed, bump workspace versions to 0.7.0, add scripts/verify-release.mjs, .github/workflows/release.yml and docs/RELEASING.md; run pnpm release:verify after pnpm package, expecting matching manifest/version/hash and complete assets. Commit: build(release): prepare v0.7.0 and automate complete releases.
- [x] 3.2 Run pnpm lint, pnpm typecheck and pnpm test; build the NSIS/ZIP packages and inspect the packaged feed and native runtime. Record test and packaging results in docs/RELEASING.md.
- [ ] 3.3 Commit the approved release scope, push source and v0.7.0 tag, upload verified assets to a draft with gh release create/upload, then publish and verify the public release via gh release view. Expected result: published v0.7.0 with installer, ZIP, latest.yml and blockmap.
