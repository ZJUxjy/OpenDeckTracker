## MODIFIED Requirements

### Requirement: Renderer exposes an appearance store

The renderer SHALL provide a Zustand store at
`apps/desktop/src/renderer/src/stores/appearance-store.ts` that owns the
presentation preferences governed by this capability:

| Field         | Type                                  | Default        |
|---------------|---------------------------------------|----------------|
| `density`     | `'comfortable' \| 'compact'`          | `'comfortable'`|
| `accent`      | `'cyan' \| 'teal' \| 'violet'`        | `'cyan'`       |
| `gameOverlay` | `boolean`                             | `false`        |

The store MUST:

- Read its initial state from `localStorage` key `hdt.appearance`
  (JSON-encoded). Missing key, malformed JSON, or unknown enum values
  fall back to the defaults silently. Missing `gameOverlay` (e.g. a
  payload written by an earlier app version) defaults to `false`.
- Persist every preference change to `localStorage` synchronously and
  swallow storage errors (mirroring the existing `useI18nStore` pattern).
- Expose `setDensity(next)`, `setAccent(next)`, and
  `setGameOverlay(next)` mutators that update in-memory state and
  write through to storage.
- The `setGameOverlay` mutator MUST additionally fire the
  `overlay:set-enabled` IPC (per the `overlay-window` capability) so
  the main process honors the new value without waiting for a reload.
- Export a frozen `ACCENT_PALETTE` map keyed by the accent id and
  yielding the corresponding `--accent` and `--accent-dim` CSS values
  exactly as authored in the design document. The Settings UI and the
  apply-effect MUST consume this map; no swatch may be hard-coded
  outside it.

#### Scenario: Defaults when nothing is stored

- **WHEN** the store initializes and `localStorage` has no
  `hdt.appearance` key
- **THEN** `density === 'comfortable'`, `accent === 'cyan'`,
  and `gameOverlay === false`

#### Scenario: Persisted preferences round-trip

- **GIVEN** a previous session set `density: 'compact'`,
  `accent: 'violet'`, and `gameOverlay: true`
- **WHEN** the renderer reloads
- **THEN** the store reads `density: 'compact'`, `accent: 'violet'`,
  and `gameOverlay: true` from `localStorage`

#### Scenario: Malformed storage falls back

- **GIVEN** `localStorage.hdt.appearance === '{ this is not json'`
- **WHEN** the store initializes
- **THEN** `density === 'comfortable'`, `accent === 'cyan'`,
  `gameOverlay === false`, and no exception escapes the store module

#### Scenario: Legacy payload without gameOverlay still loads

- **GIVEN** `localStorage.hdt.appearance === '{"density":"compact","accent":"violet"}'`
  (saved by an earlier app version that didn't have the field)
- **WHEN** the store initializes
- **THEN** `density === 'compact'`, `accent === 'violet'`,
  and `gameOverlay === false`
