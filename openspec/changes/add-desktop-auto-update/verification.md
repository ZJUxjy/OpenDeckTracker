# v0.7.0 verification

- Full suite: 232 test files passed; 1769 tests passed and 1 skipped. The existing pretest ran SQLite rebuild from the workspace root without rebuilding the desktop dependency; corrected it to run the desktop rebuild script. Running development processes held older DLLs open, so their ignored build directories were retained under backup names while fresh test/runtime files were built.
- `pnpm typecheck`: all workspace checks passed.
- ESLint: zero errors, seven existing Fast Refresh export warnings. Targeted updater and release-script lint passed without warnings.
- Updater main/preload/settings/UI suite: 23 tests passed; final runtime cleanup was additionally checked by rerunning the 10 controller/UI tests.
- `pnpm package`: produced Windows x64 NSIS and ZIP artifacts with Electron-compatible SQLite and rebuilt HearthMirror native binding. Development-only out/node_modules is excluded from packages.
- `pnpm release:verify`: version 0.7.0, referenced installer size and SHA-512, nonempty ZIP/blockmap, and the packaged public GitHub provider all passed. Before packaging, the verifier correctly rejected stale 0.6.0 metadata.
- `pnpm release:smoke`: loaded the actual packaged app.asar in Electron using an isolated profile/cache and a simulated older installed version. It detected 0.7.0 from the loopback feed, rejected a deliberately corrupted installer, retried successfully, preserved a localStorage sentinel during download, surfaced the ready UI, and called quitAndInstall(true, true) only on the explicit action. Screenshot review confirmed the notice fits the desktop shell.
- The smoke test intercepts installer execution. A real Windows uninstall/install/relaunch across two installed versions was not executed on the user's machine. The first public bootstrap release still requires older clients to install it manually once.
- OpenSpec strict validation and application diff whitespace checks passed. The captured upstream HSGuru HTML test fixture retains its original whitespace.

## Published release

- Public latest release: https://github.com/ZJUxjy/OpenDeckTracker/releases/tag/v0.7.0 (published 2026-09-16T20:18:23Z).
- Release source: 61fcd24d805381556e62f228421f2ce9b289a8ac.
- Release workflow passed: https://github.com/ZJUxjy/OpenDeckTracker/actions/runs/35144697732.
- Independent main CI passed: https://github.com/ZJUxjy/OpenDeckTracker/actions/runs/35144697650.
- Published assets: latest.yml (359 bytes), installer (106118101 bytes), blockmap (110411 bytes), portable ZIP (143853763 bytes).
- Final public-network test used the actual packaged GitHub provider with an isolated cache and simulated older version. It discovered 0.7.0, downloaded the published installer and passed the updater SHA-512 verification. A missing old-version blockmap correctly fell back to a full download. The installer was not executed.

