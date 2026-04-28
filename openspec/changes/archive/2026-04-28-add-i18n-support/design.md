## Context

The desktop renderer currently hard-codes visible UI copy in components such as `App.tsx`, `Sidebar.tsx`, `Settings.tsx`, `LiveDeckPanel.tsx`, and opponent/card display components. The development plan already reserves `resources/locales/` and calls out a general language setting, and prior card-data work already generates localized `enUS` and `zhCN` card JSON.

Current card lookup is main-process scoped through `apps/desktop/src/main/cards.ts`, which loads `data/cards/generated/cards.all.enUS.json` once. Card images already support a locale segment in the cache path and remote URL, but renderer calls do not pass an active app locale. Settings in the current renderer are local component state, so this change needs a small persisted language preference before broader settings storage exists.

Stakeholders are desktop users who need either English or Simplified Chinese UI, future overlay work that should reuse the same translation contract, and developers adding new UI surfaces.

## Goals / Non-Goals

**Goals:**

- Provide a typed renderer i18n runtime with `system`, `en-US`, and `zh-CN` language choices.
- Bundle English and Simplified Chinese translations for existing desktop UI surfaces touched by the tracker workflow.
- Persist the user's language preference and apply locale changes without restarting the app.
- Resolve card names and card images with locale-aware behavior while preserving deterministic `enUS` fallback.
- Add tests for translation fallback, locale preference persistence, card locale routing, and representative localized rendering.

**Non-Goals:**

- No new external translation service, dynamic language-pack installation, or remote locale downloads.
- No broad settings-store architecture beyond what is needed for the language preference.
- No card-data conversion changes beyond using the existing generated `enUS` and `zhCN` files.
- No localization of native/Rust logs, CLI output, or developer diagnostics.
- No additional product languages beyond `en-US` and `zh-CN`.

## Decisions

### D1: Translation runtime

**Context:** The app needs offline bundled strings, TypeScript strictness, and no runtime network dependency.

**Options:**

- Add `i18next` / `react-i18next`.
- Use a small local runtime backed by typed JSON dictionaries.
- Keep string constants near each component.

**Choice:** Use a small local runtime under `apps/desktop/src/renderer/src/i18n/`.

**Rationale:** The current scope is two bundled locales and simple interpolation/plural text. A local runtime avoids a new dependency surface and gives direct control over fallback semantics. External dependency version check: no new external dependency is introduced by this design; if a future change outgrows the local runtime, it must re-check the current supported versions of `i18next` and React bindings at that time.

### D2: Locale resource layout and typing

**Context:** The development plan reserves `resources/locales/`, but Vite renderer tests are simplest when translation JSON is importable from renderer code.

**Options:**

- Store JSON only in root `resources/locales/` and load it through IPC/file reads.
- Store importable JSON in renderer source and copy/export later.
- Store canonical JSON in `resources/locales/` and expose typed renderer imports through a thin module.

**Choice:** Store canonical dictionaries in `resources/locales/` and add renderer modules that import or re-export them through Vite-supported JSON imports.

**Rationale:** This matches the planned repository layout while keeping translation lookup synchronous in React render paths. If the build cannot import from root resources cleanly, implementation may place a generated mirror under renderer source, but `resources/locales/` remains the canonical location.

Final structure:

```text
resources/
  locales/
    en-US.json
    zh-CN.json
apps/desktop/src/renderer/src/
  i18n/
    index.ts
    locale.ts
    messages.ts
    i18n-store.ts
```

### D3: Locale preference persistence

**Context:** There is no shared durable app settings service yet; `Settings.tsx` currently keeps settings in component state.

**Options:**

- Persist language in renderer `localStorage`.
- Add a main-process settings IPC backed by JSON or SQLite.
- Wait for a future settings-store change.

**Choice:** Persist `languagePreference` in renderer `localStorage` through an `i18n-store.ts` Zustand store, with an API shape that can later be backed by main-process settings.

**Rationale:** The preference only affects renderer rendering plus locale arguments passed to existing IPC calls. `localStorage` is durable in Electron's user data profile and keeps this change independently deliverable. The store should hide persistence behind `getLanguagePreference` / `setLanguagePreference` style functions so a later settings-store migration is mechanical.

### D4: Card locale routing

**Context:** `ensureCardDb()` currently caches a single `enUS` database. Generated data contains both `cards.all.enUS.json` and `cards.all.zhCN.json`, and card images already use Hearthstone locale codes.

**Options:**

- Keep card definitions English-only and localize only chrome UI.
- Load both card databases eagerly in main.
- Cache card databases by requested Hearthstone locale on demand.

**Choice:** Cache card databases by Hearthstone locale on demand in main process and pass the active app locale through `cards:*` and `card-images:get` IPC calls.

**Rationale:** This preserves startup cost for English users and enables card names to follow the app language. Locale mapping is explicit: `en-US -> enUS`, `zh-CN -> zhCN`; `system` resolves first through `navigator.language` in renderer. Unsupported or missing card data falls back to `enUS`.

### D5: React integration

**Context:** Existing components call hooks and stores directly; adding a provider should not force broad routing changes.

**Options:**

- Add a React context provider and `useTranslation()` hook.
- Export a module-level `t()` function only.
- Use compile-time string replacement.

**Choice:** Add an `I18nProvider` at the app root plus `useTranslation()` and `useLocale()` hooks for components.

**Rationale:** Context makes active-locale re-rendering predictable when the setting changes. A module-level `translate()` helper can still support non-component utility tests, but UI should use hooks.

## Risks / Trade-offs

- [Performance] Loading multiple card databases can increase memory use. -> Mitigation: load locale DBs lazily and cache at most the requested locale plus `enUS` fallback.
- [Security] Translation keys or interpolation values could be rendered as HTML. -> Mitigation: render translated values as React text only; do not add HTML interpolation.
- [Compatibility] Vite/Electron packaging may not include root `resources/locales/` by default. -> Mitigation: add tests/build config coverage and keep renderer import paths explicit.
- [Compatibility] `navigator.language` can produce `zh-Hans-CN`, `zh`, or other variants. -> Mitigation: normalize all Chinese variants to `zh-CN` and all unsupported locales to `en-US`.
- [Product] Some strings originate from Hearthstone data, not UI dictionaries. -> Mitigation: route card DB/image locale separately from UI strings and document fallback behavior.

## Migration Plan

1. Add locale dictionaries and renderer i18n runtime with unit tests.
2. Add the persisted language setting in Settings and wrap the app in `I18nProvider`.
3. Replace user-visible strings in the current desktop tracker path with translation keys.
4. Update card definition hooks, card search IPC calls, and card-image IPC calls to pass the active locale.
5. Add focused renderer tests for English and Chinese rendering, plus main/preload tests where IPC signatures change.
6. Rollback by switching the provider default to `en-US` and leaving dictionaries unused; card DB fallback remains `enUS`.

## Open Questions

- Should future packaged builds copy `resources/locales/` as external resources, or should Vite bundle dictionaries into renderer assets?
- Should language preference later move from `localStorage` into the planned SQLite/settings store once that store exists?
