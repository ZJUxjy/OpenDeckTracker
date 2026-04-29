## MODIFIED Requirements

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
