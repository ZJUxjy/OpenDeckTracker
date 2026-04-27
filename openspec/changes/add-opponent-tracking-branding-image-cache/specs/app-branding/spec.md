## ADDED Requirements

### Requirement: OpenDeckTracker user-facing branding

The desktop app SHALL use `OpenDeckTracker` as the user-facing project and product name.

The rename MUST cover:

- Window title and renderer HTML title.
- App chrome/sidebar/header labels.
- Package metadata descriptions where they describe the user-facing app.
- README quickstart and user-facing docs.
- Test expectations that previously asserted legacy brand text.

Internal package names such as `@hdt/core` MAY remain unchanged in this change.

#### Scenario: App title uses OpenDeckTracker

- **WHEN** the desktop renderer is loaded
- **THEN** the document title or visible app shell branding uses `OpenDeckTracker`
- **AND** it does not show `Fireplace` or `FIRESTONE`

#### Scenario: Docs use OpenDeckTracker

- **WHEN** a user reads the README quickstart or project overview
- **THEN** the project is identified as `OpenDeckTracker`
- **AND** legacy prototype names are not presented as the product name

### Requirement: Legacy brand regression guard

The repository SHALL include automated or scripted checks that prevent legacy prototype brand strings from returning to user-facing renderer surfaces.

The guard MUST check at least:

- `apps/desktop/src/renderer/src`
- `apps/desktop/src/renderer/tests`
- `README.md`

#### Scenario: Legacy brand scan passes

- **WHEN** the branding validation command or relevant test suite runs
- **THEN** no user-facing `Fireplace` or `FIRESTONE` product label remains
