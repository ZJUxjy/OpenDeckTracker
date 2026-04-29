# i18n-support Specification

## Purpose

TBD - created by archiving change add-i18n-support. Update Purpose after archive.

## Requirements

### Requirement: Locale Preference Model

The desktop renderer SHALL support the language preferences `system`, `en-US`, and `zh-CN`. The renderer MUST resolve `system` to a concrete supported app locale using the host browser language, normalizing Chinese variants to `zh-CN` and all unsupported languages to `en-US`.

The active app locale MUST be available to renderer components through a typed hook or store, and changing the preference MUST update rendered UI without requiring an app restart.

#### Scenario: System Chinese locale resolves to zh-CN

- **WHEN** the language preference is `system` and the host language is `zh-Hans-CN`
- **THEN** the active app locale resolves to `zh-CN`

#### Scenario: Unsupported system locale falls back to English

- **WHEN** the language preference is `system` and the host language is `fr-FR`
- **THEN** the active app locale resolves to `en-US`

#### Scenario: Explicit preference overrides system locale

- **WHEN** the host language is `zh-CN` and the user selects `en-US`
- **THEN** the active app locale is `en-US`

### Requirement: Translation Lookup and Fallback

The renderer SHALL provide a translation lookup API for UI strings. Translation lookup MUST resolve keys from the active locale dictionary, fall back to the `en-US` dictionary when the active locale is missing a key, and return the key itself when no supported dictionary contains the key.

The translation API MUST support simple named interpolation values rendered as React text, and MUST NOT require HTML interpolation.

#### Scenario: Existing key resolves in active locale

- **WHEN** the active app locale is `zh-CN` and the renderer asks for a key present in `zh-CN`
- **THEN** the Chinese translation is returned

#### Scenario: Missing active-locale key falls back to English

- **WHEN** the active app locale is `zh-CN` and a key is absent from `zh-CN` but present in `en-US`
- **THEN** the English translation is returned

#### Scenario: Missing key returns stable fallback

- **WHEN** the renderer asks for a key absent from all bundled dictionaries
- **THEN** the translation API returns the original key string

### Requirement: Bundled Locale Resources

The repository SHALL contain bundled locale dictionaries for `en-US` and `zh-CN`. The dictionaries MUST cover visible copy for the current desktop shell, navigation, settings view, deck tracker panel, opponent card panel, deck selection dialog, card image empty/error states, generic status labels used by those surfaces, AND the Stats page surfaces introduced by `add-stats-analytics-deepening` (matchup matrix labels, format filter pills, time-series chart granularity toggle, play-order split labels, recording viewer dialog).

The locale dictionaries MUST use the same key set for supported locales unless a key is intentionally allowed to fall back to English and is covered by a fallback test.

The Stats page additions MUST be reachable via a `stats.*` namespace prefix in both dictionaries.

#### Scenario: Locale dictionaries have matching required keys

- **WHEN** the locale dictionary parity test runs
- **THEN** all required user-visible translation keys exist in both `en-US` and `zh-CN`

#### Scenario: Existing tracker surface renders without raw keys

- **WHEN** the desktop renderer mounts the tracker route with the active locale set to `zh-CN`
- **THEN** visible tracker chrome, empty states, and status labels render localized text rather than translation keys

#### Scenario: New stats analytics surfaces render without raw keys

- **WHEN** the desktop renderer mounts the Stats route with the active locale set to `zh-CN`
- **THEN** the format filter pills, matchup matrix headers, time-series granularity toggle, play-order split labels, and `View recording` affordance render localized text
- **AND** none of the rendered text equals a literal translation key (e.g. `stats.matchup.title`)

### Requirement: Language Setting Persistence

The Settings view SHALL expose a language control with options for `system`, `en-US`, and `zh-CN`. Selecting a language MUST persist the preference in the Electron user profile and MUST restore the same preference after renderer reload.

The setting label and option text MUST themselves be localized using the current active locale.

#### Scenario: User changes language from Settings

- **WHEN** the user selects `zh-CN` in Settings
- **THEN** the language preference is persisted as `zh-CN`
- **AND** the visible Settings copy changes to Chinese without restarting the app

#### Scenario: Persisted preference survives reload

- **WHEN** the persisted language preference is `zh-CN` and the renderer reloads
- **THEN** the active app locale initializes as `zh-CN`

### Requirement: Locale-Aware Card Data

Card definition IPC calls used by the renderer SHALL accept or derive the active app locale and return localized card definitions when localized generated card data exists. The main process MUST map app locales to Hearthstone data locales using `en-US -> enUS` and `zh-CN -> zhCN`.

When localized card data for the requested locale is missing or fails to load, card definition lookup MUST fall back to `enUS` data before returning `null`.

#### Scenario: Chinese locale returns Chinese card name

- **WHEN** the active app locale is `zh-CN` and the renderer looks up a card that exists in generated `zhCN` data
- **THEN** the returned card definition uses the `zhCN` localized name

#### Scenario: Missing localized card data falls back to enUS

- **WHEN** the active app locale maps to a missing Hearthstone locale file
- **THEN** the card lookup falls back to the `enUS` generated data

### Requirement: Locale-Aware Card Images

Card image requests from the renderer SHALL use the active app locale to choose the primary Hearthstone art locale. The image cache MUST key cached files by Hearthstone locale, size, and card ID, and MUST preserve the existing fallback behavior to `enUS` when the primary locale image is unavailable.

#### Scenario: Chinese locale requests zhCN card art

- **WHEN** the active app locale is `zh-CN` and the renderer requests an image for `EX1_277`
- **THEN** the primary remote image URL uses the `zhCN` locale segment

#### Scenario: Missing localized image falls back to English

- **WHEN** the primary `zhCN` image request fails for a card
- **THEN** the app attempts the `enUS` image and returns metadata indicating the fallback locale when successful
