# macOS log-based tracking support — path discovery + opt-in log config utilities

- **Date:** 2026-06-16
- **Status:** Design (awaiting review)
- **Package:** `@hdt/hearthwatcher`
- **Reference implementation studied:** [HSTracker](https://github.com/HearthSim/HSTracker) (`/Users/xu/Code/HSTracker`)

## Background

OpenDeckTracker tracks Hearthstone two ways: reading process memory via the
Windows-only `@hdt/hearthmirror` native binding, and tailing `Power.log` via
`@hdt/hearthwatcher`. On macOS the memory path is a no-op stub, and the log path
does not work either: `discoverPowerLog` in
`packages/hearthwatcher/src/log-paths.ts` only generates Windows candidates
(`LOCALAPPDATA`, `ProgramFiles`), and `detectHearthstoneInstallDir` returns
`null` unless `process.platform === 'win32'`. So on macOS the watcher finds
nothing and the app cannot track games.

This change makes the **log-based** path work on macOS. It is the cheaper of the
two routes HSTracker uses (HSTracker is hybrid: logs for in-game events, memory
for collection/deck/medal data). Memory reading on macOS (Mach `task_for_pid` +
Mono reflection + code-signing/entitlements) is explicitly out of scope here.

### Empirically confirmed on the target machine (2026-06-16)

- Hearthstone is installed at `/Applications/Hearthstone/Hearthstone.app`.
- Hearthstone writes logs to **`/Applications/Hearthstone/Logs/`**, into a
  per-session subdirectory: `/Applications/Hearthstone/Logs/Hearthstone_2026_06_15_11_25_29/`.
  This name matches the **existing** timestamped-dir regex in
  `log-paths.ts:179` (`/^Hearthstone_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}$/`).
- `~/Library/Logs/Blizzard/Hearthstone` does **not** exist — earlier assumptions
  that this was the primary macOS path were wrong; it is at best an unverified
  fallback.
- `~/Library/Preferences/Blizzard/Hearthstone/` exists but has **no
  `log.config`** — which is exactly why no `Power.log` is produced.
- `/Applications/Hearthstone/` is writable by the user on this machine (so
  `client.config` writes would succeed here, but other installs may differ).

### Governing project constraint (must respect)

The archived `add-hearthwatcher` change made a deliberate decision:

- `openspec/changes/archive/2026-04-28-add-hearthwatcher/design.md:24` — non-goal:
  "Automatic mutation of the user's `log.config`."
- `design.md:203` — "Do not silently write `log.config`; surface a diagnostic
  with the expected path and missing file names."
- `proposal.md:20` — "Do not silently edit the user's Hearthstone `log.config`;
  this change should detect missing logs and report actionable diagnostics."
- `design.md:219` — open question: "Should the app offer a guided `log.config`
  creation flow later, or keep configuration manual to avoid touching game
  files?"

Therefore: the config writers in this change are **pure, opt-in utility
functions that are never auto-invoked**. They are the building blocks for a
future user-consented guided flow (answering the open question above), and they
do not run on startup.

## Goals

1. macOS `Power.log` discovery in `@hdt/hearthwatcher`, reusing the existing
   timestamped-subdirectory scan.
2. A pure, opt-in `ensureLogConfig()` utility that writes/merges the minimal
   `log.config` needed to make Hearthstone emit the logs this project parses.
3. A pure, best-effort, opt-in `ensureClientConfig()` utility (disables the log
   file-size limit), with explicit write-permission handling.
4. An enhanced, actionable `missing-log` diagnostic that tells the user the
   exact `log.config` path and contents to create manually.
5. Unit tests (vitest, injected fs) that pass on the actual dev runner (macOS).

## Non-goals

- Auto-invoking the writers on startup (forbidden by the project decision above).
- Wiring any of this into the Electron app / preload / IPC / renderer UI.
- Live end-to-end verification with a running game.
- macOS process memory reading (HearthMirror / Mach / Mono).
- Enabling any `log.config` zone beyond `[Power]` (see rationale below).
- Detecting non-default macOS install directories from the running process
  (the existing `overridePath` / `candidatePaths` / `installDirs` options and the
  `/Applications/Hearthstone` default cover the common case; auto-detection can
  be a later enhancement).

## Detailed design

### Component 1 — macOS path discovery (`log-paths.ts`)

Extend `standardPowerLogPaths(env)` with a macOS branch. The function currently
emits candidates only under Windows env-var guards, so on macOS it returns `[]`.

```ts
export function standardPowerLogPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates: string[] = [];
  if (env.LOCALAPPDATA) { /* … unchanged … */ }
  if (env.ProgramFiles) { /* … unchanged … */ }
  if (env['ProgramFiles(x86)']) { /* … unchanged … */ }

  // macOS. Gate on env.HOME (a reliable POSIX proxy): Windows builds and the
  // existing env-injected unit tests pass no HOME, so they emit no macOS paths
  // and stay unchanged. Order = confirmed-first, then unverified fallbacks.
  if (env.HOME) {
    candidates.push('/Applications/Hearthstone/Logs/Power.log'); // confirmed on disk
    candidates.push(join(env.HOME, 'Library', 'Logs', 'Hearthstone', 'Power.log'));        // unverified fallback
    candidates.push(join(env.HOME, 'Library', 'Logs', 'Blizzard', 'Hearthstone', 'Power.log')); // unverified fallback
  }
  return [...new Set(candidates)];
}
```

**No change to `scanTimestampedLogDirs`.** `discoverPowerLog` already seeds
`standardPowerLogPaths(env)` into `searchedPaths` (lines 44–47), and
`scanTimestampedLogDirs` derives its scan parents by stripping `/Power.log` from
every `searchedPath` (line 159, regex `/[\\/]Power\.log$/i`, which matches the
forward slashes `join()` produces on darwin). So seeding
`/Applications/Hearthstone/Logs/Power.log` automatically makes the scan look in
`/Applications/Hearthstone/Logs` for `Hearthstone_*` session subdirs and return
the newest one's `Power.log`. This is the exact path layout confirmed on disk.

**Why `env.HOME`, not `process.platform`:** keeps `standardPowerLogPaths` fully
injectable (it already reads `options.env ?? process.env`), matches the file's
existing all-env-gated style, and leaves the existing env-injected tests
unaffected. (Note: the verification's "this keeps the Windows test green on Mac"
rationale was false and is *not* the reason — see the testing section.)

Non-default installs (e.g. a custom drive, the CN client) remain supported via
the existing `overridePath`, `candidatePaths`, and `installDirs` options.

### Component 2 — `ensureLogConfig()` (new module `log-config.ts`)

A pure, injectable, **opt-in** utility. Not called anywhere automatically.

```ts
export interface LogConfigOptions {
  env?: NodeJS.ProcessEnv;
  configPath?: string;                                   // override target path
  readFile?: (path: string) => Promise<string | null>;  // null when missing
  writeFile?: (path: string, contents: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
}

export interface LogConfigResult {
  path: string;
  changed: boolean;   // true if the file was created or modified
  contents: string;   // the resulting file contents
}

export async function ensureLogConfig(options?: LogConfigOptions): Promise<LogConfigResult>;
```

- **Target path:** `$HOME/Library/Preferences/Blizzard/Hearthstone/log.config`
  on macOS; `%LOCALAPPDATA%\Blizzard\Hearthstone\log.config` on Windows (the
  util is cross-platform; macOS is the immediate need). Overridable via
  `configPath`. Verified against HSTracker `CoreManager.swift:443-446`.
- **Required zone — `[Power]` only:**

  ```ini
  [Power]
  LogLevel=1
  FilePrinting=true
  ConsolePrinting=false
  ScreenPrinting=false
  Verbose=true
  ```

  `Verbose=true` is required for `[Power]` (it is the source of the indented
  `tag=…` continuation lines `PowerLineStreamingParser` re-emits, and HSTracker
  marks Power as the only verbose zone). Keys/values/casing match HSTracker
  `LogLineZone.swift:24-42` exactly.
- **Why Power-only (not `[LoadingScreen]`):** the package tails exactly one file
  (`Power.log`) and parses only Power-zone records. `parseLoadingScreenLine` is
  exported but **dead in the runtime pipeline** — zero callers in
  `log-watcher.ts`. On macOS, LoadingScreen events would come from a *separate*
  `LoadingScreen.log` that nothing opens. Enabling `[LoadingScreen]` today would
  produce a file no code reads. If loading-screen tracking is wired up later, it
  needs both a `[LoadingScreen]` stanza here **and** a second watcher — out of
  scope now.
- **Idempotent merge:** parse the existing file (a minimal INI: `[Zone]` headers
  + `Key=Value` lines), preserve all unknown zones and keys verbatim, ensure the
  `[Power]` zone has the required keys at the required values (inserting the
  zone if absent, correcting values if wrong), and only return `changed: true`
  (and write) if the serialized result differs from the original. Never discards
  the user's other zones.
- **Restart semantics:** Hearthstone reads `log.config` only at launch. `changed`
  is the caller's signal that a running game must be restarted; this util does
  not detect running processes (the future guided flow owns that messaging).

A small dependency-free INI reader/writer lives in this module (the package only
depends on `@hdt/core`; no new deps).

### Component 3 — `ensureClientConfig()` (in `log-config.ts`)

Pure, **best-effort, opt-in**. Disables Hearthstone's log file-size cap so long
games are not truncated. Verified against HSTracker `Helper.swift:60-78`.

```ts
export interface ClientConfigOptions {
  installDir?: string;                                   // default '/Applications/Hearthstone'
  readFile?: (path: string) => Promise<string | null>;
  writeFile?: (path: string, contents: string) => Promise<void>;
}

export interface ClientConfigResult {
  path: string;
  changed: boolean;
  written: boolean;     // false when skipped, e.g. install dir not writable
  error?: string;       // populated when a write was attempted but failed
}
```

- **Target path:** `<installDir>/client.config`, default
  `/Applications/Hearthstone/client.config` — **alongside** `Hearthstone.app`,
  not inside the bundle.
- **Exact contents:** `[Log]\nFileSizeLimit.Int=-1` (no trailing newline;
  26 bytes, matching HSTracker byte-for-byte). Idempotent: rewrite only when
  contents differ.
- **Permission handling:** unlike HSTracker (which swallows the error and can
  fail silently), this util catches write/permission failures and returns
  `{ written: false, error }` rather than throwing — the caller can surface it.
- Not auto-called; the future guided flow decides whether to invoke it.

### Component 4 — enhanced `missing-log` diagnostic (`log-paths.ts` + `types/diagnostics.ts`)

When discovery fails, make the diagnostic actionable per the project's stated
philosophy. Add two optional fields to `HearthWatcherDiagnostic`:

```ts
export interface HearthWatcherDiagnostic {
  // … existing fields …
  expectedLogConfigPath?: string;  // e.g. ~/Library/Preferences/Blizzard/Hearthstone/log.config
  requiredLogConfig?: string;      // the exact [Power] stanza to create
}
```

`missingDiagnostic` becomes platform-aware: on macOS its `message` instructs the
user to create `log.config` and restart Hearthstone, and it populates
`expectedLogConfigPath` + `requiredLogConfig` with the same content
`ensureLogConfig()` would write. This keeps configuration *manual by default*
(honoring `design.md:219`) while telling the user exactly what to do — and the
opt-in writer can later perform it on the user's behalf.

## Data flow

```
ensureLogConfig() [opt-in, user-consented]  ─writes if needed─▶  user (re)launches Hearthstone
        │                                                                  │
        └─ (future guided flow surfaces "restart HS" when changed)         ▼
                                                  HS writes /Applications/Hearthstone/Logs/
                                                            Hearthstone_<ts>/Power.log
                                                                           │
                                          discoverPowerLog() finds it ─────┴────▶ existing watcher → parser → reducer
                                                  │
                                 (if not found) actionable missing-log diagnostic
                                                  with expected log.config path + contents
```

## Testing (vitest, injected fs)

> **Known pre-existing condition:** the Windows-path assertions in
> `log-paths.test.ts` already **fail on darwin** (POSIX `path.join` emits
> forward slashes, so they never equal the hard-coded backslash literals). CI
> runs on `windows-latest`, where they pass. New macOS tests below must be
> written to pass on the dev machine (macOS). As a small in-scope cleanup, guard
> the existing Windows-only assertions behind a platform check so the suite is
> green on darwin; this is justified because we are adding macOS cases to the
> same file.

- **Discovery:**
  - `standardPowerLogPaths({ HOME: '/Users/me' })` includes
    `/Applications/Hearthstone/Logs/Power.log` first, then the `~/Library`
    fallbacks; with no `HOME`, returns no macOS paths.
  - `discoverPowerLog` with injected `env: { HOME }`, `readDir` returning a
    `Hearthstone_2026_06_15_11_25_29` dir, and `exists` true for its
    `Power.log` → returns that session `Power.log` (locks in the timestamped-scan
    reuse on macOS).
  - Windows behavior unchanged when `env` has only `LOCALAPPDATA`/`ProgramFiles`.
- **`ensureLogConfig`:** creates a fresh file with the `[Power]` stanza; merges
  while preserving an unrelated pre-existing zone; is idempotent (no rewrite when
  already correct, `changed:false`); corrects wrong values (e.g.
  `ConsolePrinting=true` → `false`, missing `Verbose`); writes to the correct
  per-platform path from injected `env`.
- **`ensureClientConfig`:** creates the file with exact contents at
  `<installDir>/client.config`; idempotent when present and correct; returns
  `{ written:false, error }` when the injected `writeFile` rejects (permission).
- **Diagnostic:** macOS `missing-log` diagnostic includes
  `expectedLogConfigPath` and a `requiredLogConfig` equal to what
  `ensureLogConfig` would write.

## Residual risks / follow-ups

- The `/Applications/Hearthstone/Logs` layout is confirmed on this machine but
  not across all macOS installs/clients; discovery probes multiple candidates and
  degrades to an actionable diagnostic, so a wrong guess fails loudly, not
  silently.
- End-to-end proof (write `log.config` → launch HS → `Power.log` appears and
  parses) is deferred to a later, app-wired change; this change ships only the
  package primitives + unit tests.
- Memory-based data (collection, deck contents, medals) remains unavailable on
  macOS until the separate HearthMirror-on-macOS effort.
