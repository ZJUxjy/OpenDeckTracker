# Card Image Bulk Download UI Design

## Goal
Expose the existing `window.hdt.cardImages.bulkDownload` preload API as a discoverable control in the renderer so users can pre-download all collectible card images without opening DevTools.

## Placement
Add a new **Data & Sync** category in the existing `Settings` page. It already has an unused `settings.data` i18n key, so this aligns with the planned settings structure.

Within that category, add a single settings row:

- **Title:** "Card images"
- **Description:** "Download all collectible card images (full art + tiles) ahead of time so they load instantly later."
- **Control:** a button group + status area.

## UI Behavior

### States

| State | Primary button | Secondary buttons | Progress |
|---|---|---|---|
| `idle` / `completed` / `completed-with-errors` / `failed` | "Download" | — | show last result / total count if completed |
| `running` | disabled "Downloading…" | "Pause" "Abort" | progress bar + `completed/total` |
| `paused` | "Resume" | "Abort" | progress bar frozen at last count |

- The primary action is always the next logical step: **Download** / **Resume** / **Downloading…**.
- Secondary actions only appear while running or paused.
- Progress is updated through `onProgress`.
- On mount, call `getStatus()` to show the current state if a download is already in progress from a previous session.

### Type selection

For the first iteration, download **both renders and tiles** (`['render', 'tile']`). The button simply starts the full pre-download. A future iteration can add checkboxes for individual types, but YAGNI.

### Error / result messages

- `failed`: show "Download failed" + `stats.failed` count.
- `completed-with-errors`: show "Completed with {n} errors".
- `insufficient-disk-space`: show "Not enough disk space".
- `already-running`: show "Download is already running".

### Cleanup on unmount

Unsubscribe from the progress listener returned by `onProgress`.

## Files to change

1. `apps/desktop/src/renderer/src/components/Settings.tsx`
   - Import `Database` icon from `lucide-react`.
   - Add `{ id: 'data', labelKey: 'settings.data', icon: Database }` to `categories`.
   - Add a `DataPanel` component with the download UI.
   - Render `DataPanel` when `activeCategory === 'data'`.
2. `resources/locales/zh-CN.json` / `resources/locales/en-US.json`
   - Add new keys under `settings.cardImages.*`.

## Technical notes

- Use existing Tailwind / reference classes: `reference-action-button`, `reference-ghost-button`, `reference-settings-hint`, `reference-settings-error`, `reference-progress-bar`, `reference-progress-caption`.
- Keep component state local; no new store needed.
- Reuse `SettingsRow` for consistent layout.

## Testing

- Add a renderer test that renders `<Settings />`, switches to the **Data & Sync** tab, clicks the download button, and verifies the preload API was invoked with `['render', 'tile']`.
- Mock `window.hdt.cardImages.bulkDownload` in the test.
