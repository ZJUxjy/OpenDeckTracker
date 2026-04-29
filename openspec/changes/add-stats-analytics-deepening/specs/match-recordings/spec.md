## MODIFIED Requirements

### Requirement: Recording IPC

The Electron main process SHALL expose read-only recording APIs through the existing preload boundary and SHALL keep filesystem access out of the renderer.

The renderer's Stats page is one consumer of `recordings:get`: a per-row `View recording` affordance on each match in the recent-matches list calls `window.hdt.recordings.get(fingerprint)` to populate a viewer dialog. The IPC contract MUST keep this lookup keyed on the match `fingerprint` (the same idempotency key used in the match-history store), so the renderer can correlate a `MatchHistoryRecord.fingerprint` to a recording without an extra lookup table.

No new IPC channel is added by this change; the existing `recordings:list` and `recordings:get` shape is sufficient.

#### Scenario: Renderer lists recordings

- **WHEN** the renderer calls the recordings list API
- **THEN** the main process returns completed recording summaries as serializable plain objects

#### Scenario: Renderer loads recording detail

- **WHEN** the renderer calls the recording detail API with a recording ID
- **THEN** the main process returns the matching recording detail or `null`

#### Scenario: Renderer cannot write recording files directly

- **WHEN** the renderer uses the recording APIs
- **THEN** it receives no filesystem path, database handle, file handle, or write API for recording storage

#### Scenario: Stats viewer dialog reuses recordings:get

- **GIVEN** the renderer's Stats page has rendered a recent-matches list
- **WHEN** the user activates the `View recording` affordance on a row whose `fingerprint` has a stored recording
- **THEN** the renderer calls `window.hdt.recordings.get(fingerprint)`
- **AND** no new recording-specific IPC channel is invoked
