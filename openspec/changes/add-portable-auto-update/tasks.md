## 1. Routing and download

- [x] 1.1 Add failing distribution and ZIP selection tests in `apps/desktop/src/main/auto-update.test.ts` and `portable-updater.test.ts`; run `node node_modules/vitest/vitest.mjs run apps/desktop/src/main/auto-update.test.ts apps/desktop/src/main/portable-updater.test.ts`; assert `expect(getUpdateDistribution(true, 'win32', false)).toBe('portable')` and reject a manifest without ZIP.
- [x] 1.2 Implement `apps/desktop/src/main/portable-updater.ts` and route in `auto-update.ts`; same test command passes; assert preparation completes before `update-downloaded`, errors prevent restart, installer routing remains intact.

## 2. Replacement helper

- [x] 2.1 Add `scripts/smoke-portable-update.ps1` with assertions for replacement, preserved extras, traversal rejection and locked-file rollback; `powershell -NoProfile -File scripts/smoke-portable-update.ps1` fails before implementation. Assertions include `if ((Get-Content -LiteralPath $asset) -ne 'old') { throw 'Rollback failed' }`.
- [x] 2.2 Implement safe extraction and checksum validation in `apps/desktop/build/portable-update.ps1`; smoke preparation cases pass without changing target files.
- [x] 2.3 Implement parent-exit wait, backup, replacement, recovery and restart in `apps/desktop/build/portable-update.ps1`; same smoke command passes success and rollback cases.
- [x] 2.4 Implement handshake, staging and failure reporting in `apps/desktop/src/main/portable-update-helper.ts`; `pnpm typecheck` passes and helper failure keeps app running. Commit: `feat(desktop): support portable ZIP auto updates`.

## 3. Distribution

- [x] 3.1 Add `scripts/add-portable-update-metadata.mjs`, update `apps/desktop/package.json`, `apps/desktop/electron-builder.yml`, `scripts/verify-release.mjs` and `.github/workflows/release.yml`; `pnpm release:verify` checks ZIP SHA-512 and bundled helper.
- [x] 3.2 Update `resources/locales/en-US.json`, `resources/locales/zh-CN.json`, `README.md`, `docs/RELEASING.md` and affected About tests; `rg '便携版|portable' README.md docs/RELEASING.md` shows supported Windows ZIP and first-upgrade instructions. Commit: `build: publish portable update metadata`.

## 4. Validation

- [x] 4.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`; all pass apart from existing warnings/skipped test.
- [x] 4.2 Build isolated Windows artifacts, run `pnpm release:verify`, installed updater smoke and `powershell -NoProfile -File scripts/smoke-portable-update.ps1`; verify successful replacement/relaunch and failed replacement recovery. Record commands/results in `docs/RELEASING.md` and this file.
