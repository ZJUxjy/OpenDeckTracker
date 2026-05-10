## MODIFIED Requirements

### Requirement: window.hdt.decks IPC surface

The Electron preload script SHALL expose a `window.hdt.decks` object on
the renderer side, mirroring the patterns of `window.hdt.cards.*` and
`window.hdt.matchHistory.*`. All methods MUST be promise-returning RPC
calls implemented via `ipcRenderer.invoke` against handlers registered
in the main process.

The surface MUST include:

- `list(): Promise<DeckSummary[]>`
- `getById(id: string): Promise<DeckDetail | null>`
- `create(input: CreateDeckInput): Promise<DeckDetail>`
- `update(id: string, patch: UpdateDeckPatch): Promise<DeckDetail>`
- `duplicate(id: string): Promise<DeckDetail>`
- `delete(id: string): Promise<void>`
- `importDeckstring(text: string): Promise<DeckDetail>`
- `importJson(text: string): Promise<DeckDetail>`
- `exportDeckstring(id: string): Promise<string>`
- `exportJson(id: string): Promise<string>`
- `saveFromLive(input: LiveDeckSnapshotInput): Promise<DeckDetail>`
- `syncFromLive(): Promise<LiveDeckSyncResult>`
- `setSortIndex(id: string, sortIndex: number): Promise<void>`

The TypeScript type for `window.hdt.decks` MUST be declared in
`apps/desktop/src/renderer/src/env.d.ts` or inferred from the preload
bridge so renderer call-sites get strict-mode autocomplete and parameter
checking.

#### Scenario: Renderer can list decks via the bridge

- **GIVEN** the main process has registered the deck IPC handlers
  and the preload script has loaded
- **WHEN** the renderer calls `window.hdt.decks.list()`
- **THEN** the returned promise resolves to the same array shape as
  `DeckStore.list()`

#### Scenario: Renderer can request live deck sync

- **GIVEN** the main process has registered the live deck sync handler
- **WHEN** the renderer calls `window.hdt.decks.syncFromLive()`
- **THEN** the returned promise resolves to a `LiveDeckSyncResult`
- **AND** normal Hearthstone-unavailable cases resolve with `ok: false`
  instead of rejecting

#### Scenario: env.d.ts shapes match the preload bridge

- **GIVEN** a type-check pass over the renderer
- **WHEN** the renderer reads any property of `window.hdt.decks`
- **THEN** TypeScript reports the property's signature without
  implicit-any errors
