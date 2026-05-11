## Requirements

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

### Requirement: IPC handler registration on app boot

`apps/desktop/src/main/deck-ipc.ts` SHALL expose a
`registerDeckIpc(ipcMain, store)` function that registers exactly one
`ipcMain.handle` per surface method. The main entry point MUST call
this function exactly once during `whenReady`.

Re-registering the same channel MUST be safe: the registration helper
SHALL `removeHandler` before `handle` so hot-restart in dev mode does
not throw "second handler" errors.

#### Scenario: Re-registration is idempotent

- **GIVEN** the deck IPC has been registered once
- **WHEN** `registerDeckIpc(ipcMain, store)` is called a second time
- **THEN** it does not throw and subsequent renderer calls still
  resolve

### Requirement: IPC errors carry typed error names

Every deck IPC handler SHALL catch domain errors (`UnknownCardError`,
`DeckstringDecodeError`, `IllegalDeckExportError`,
`NonCollectibleSnapshotError`) and re-throw them as Electron-friendly
errors whose `name` and `message` round-trip to the renderer.

The renderer SHALL be able to discriminate error kinds via `error.name`
without parsing free-form messages.

#### Scenario: Unknown card import error preserves error name

- **GIVEN** a deckstring whose card list references an unknown
  `cardId`
- **WHEN** the renderer calls `window.hdt.decks.importDeckstring(text)`
- **THEN** the rejection's `error.name` equals `'UnknownCardError'`

#### Scenario: Illegal deck export error preserves error name

- **WHEN** the renderer calls `window.hdt.decks.exportDeckstring(id)`
  for a deck that fails `validateDeck`
- **THEN** the rejection's `error.name` equals `'IllegalDeckExportError'`

### Requirement: No push channel for deck mutations in this change

The deck IPC SHALL be request/response only in this change. There MUST
NOT be a `decks:changed` `webContents.send` channel — the renderer's
`useDecks` store rehydrates from the response of each mutation.

A future overlay window or multi-window scenario MAY add a push
channel; that change is out of scope here.

#### Scenario: No webContents.send is invoked from deck handlers

- **WHEN** any `window.hdt.decks.*` method is called from the
  renderer
- **THEN** the main process does not invoke `webContents.send` with
  any deck-related channel
