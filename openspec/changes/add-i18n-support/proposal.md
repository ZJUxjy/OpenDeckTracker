## Why

The development plan reserves `resources/locales/` and a language setting, while the current desktop UI still mixes hard-coded English and Chinese strings with fixed card image locale behavior. This change makes localization an explicit product capability before more UI surfaces are added, so future desktop and overlay work can share the same translation and locale-selection contract.

## What Changes

- Add a renderer-safe i18n runtime that resolves UI strings from locale dictionaries with deterministic fallback to English.
- Add English and Simplified Chinese locale resources for the existing desktop deck-tracker, opponent, card display, and settings surfaces.
- Add a persisted language setting with `system`, `en-US`, and `zh-CN` choices.
- Connect card text/card image locale selection to the active app locale while preserving `enUS` fallback for missing Hearthstone assets.
- Add tests that verify translation lookup, fallback behavior, settings persistence, and representative localized UI rendering.

## Non-goals

- Do not redesign the desktop navigation, settings layout, or overlay visuals.
- Do not add runtime translation downloads, cloud sync, or community language-pack installation.
- Do not regenerate the card-data pipeline beyond consuming existing generated `enUS` and `zhCN` artifacts.
- Do not localize logs emitted by core packages, Rust/native processes, or developer-facing CLI scripts.
- Do not add non-English languages beyond Simplified Chinese in this change.

## Capabilities

### New Capabilities

- `i18n-support`: Locale resources, translation lookup, user language preference, and app/card locale behavior for desktop UI surfaces.

### Modified Capabilities

- `deck-tracker-core`: Existing renderer-facing deck-tracker UI requirements that allow English or Chinese copy now use the active i18n locale instead of ad hoc hard-coded strings.

## Impact

- Affects desktop renderer components, hooks, stores, tests, and settings UI under `apps/desktop/src/renderer/`.
- Affects desktop main/preload settings IPC only if the current settings persistence API cannot already store the language preference.
- Affects `@hdt/hearthdb` consumers by selecting localized generated card data or localized card fields according to the active app locale.
- Affects card image loading by deriving Hearthstone art locale from the active app locale with existing `enUS` fallback semantics.
- Adds static locale resources under `resources/locales/` or the closest existing project resource location.
