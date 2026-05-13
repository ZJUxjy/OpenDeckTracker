## ADDED Requirements

### Requirement: Recording summaries expose match fingerprint

The recording system SHALL persist the match-history fingerprint for a live game when that fingerprint is available at recording start or before recording finalization. Completed recording summaries returned by `recordings:list` MUST include `matchFingerprint` when the recording has one.

Existing recordings that do not contain `matchFingerprint` MUST remain loadable by their original `recordingId`.

#### Scenario: Completed recording summary carries fingerprint

- **GIVEN** a live game has current match fingerprint `match-v2-1000-1`
- **WHEN** the match-recording recorder finalizes the recording for that game
- **THEN** the persisted recording metadata includes `matchFingerprint: match-v2-1000-1`
- **AND** `recordings:list` returns a summary containing `matchFingerprint: match-v2-1000-1`

#### Scenario: Legacy recording without fingerprint remains listable

- **GIVEN** a completed recording created before this change has no `matchFingerprint`
- **WHEN** the recording store lists completed recordings
- **THEN** the recording summary is still returned
- **AND** the summary does not fabricate a fingerprint from `endedAt`

### Requirement: Recording detail lookup accepts match fingerprint

The recording IPC detail lookup SHALL accept either a recording's `recordingId` or its `matchFingerprint`. When a lookup key matches a completed recording's `matchFingerprint`, the system MUST return that recording detail without requiring the renderer to know the filesystem recording directory id.

The lookup MUST NOT fall back to `endedAt` matching when no recording id or `matchFingerprint` matches.

#### Scenario: Renderer loads recording by match fingerprint

- **GIVEN** a completed recording has `recordingId: rec-1`
- **AND** the recording metadata has `matchFingerprint: match-v2-1000-1`
- **WHEN** the renderer calls `window.hdt.recordings.get('match-v2-1000-1')`
- **THEN** the main process returns the detail for `rec-1`

#### Scenario: Renderer can still load recording by recording id

- **GIVEN** a completed recording has `recordingId: rec-legacy`
- **AND** the recording has no `matchFingerprint`
- **WHEN** the renderer calls `window.hdt.recordings.get('rec-legacy')`
- **THEN** the main process returns the detail for `rec-legacy`

#### Scenario: End time alone does not resolve recording detail

- **GIVEN** a completed recording has `endedAt: 5000`
- **AND** the recording has no `recordingId` or `matchFingerprint` equal to `match-v2-1000-1`
- **WHEN** the renderer calls `window.hdt.recordings.get('match-v2-1000-1')`
- **THEN** the main process returns `null`
