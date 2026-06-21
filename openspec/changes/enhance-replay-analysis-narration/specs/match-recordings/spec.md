## ADDED Requirements

### Requirement: Recordings include analysis and narration data

The match recording model SHALL persist analysis-ready public game progress in addition to raw events and the existing timeline.

Each `MatchRecording` and `MatchRecordingDetail` MUST include:

- `analysisEvents: GameProgressAnalysisEvent[]`
- `narrationFrames: GameProgressNarrationFrame[]`

Completed recording summaries MUST include `analysisEventCount` and `narrationFrameCount`. Existing recordings that do not contain these fields MUST remain loadable, and the store MUST return empty arrays/counts for missing analysis/narration data.

#### Scenario: New completed recording carries analysis counts

- **GIVEN** a match recording contains 12 analysis events and 12 narration frames
- **WHEN** the recording is completed and listed
- **THEN** its summary includes `analysisEventCount: 12`
- **AND** its summary includes `narrationFrameCount: 12`

#### Scenario: Legacy recording loads with empty analysis arrays

- **GIVEN** a previously persisted recording JSON has no analysis or narration fields
- **WHEN** the store loads the recording detail
- **THEN** the returned detail contains `analysisEvents: []`
- **AND** `narrationFrames: []`
- **AND** the summary counts are `0`

### Requirement: Recorder persists derived analysis incrementally

The main-process match recorder SHALL append analysis events and narration frames while handling live Power events.

For every raw event that produces one or more analysis events, the recorder MUST:

- append the raw event reference first;
- derive analysis events from the current public state transition;
- derive narration frames from those analysis events;
- append each derived item in source order;
- persist the in-progress recording after the append.

If narration derivation fails for one event, the recorder MUST continue preserving raw events and existing timeline data for the match.

#### Scenario: Card play creates persisted narration

- **GIVEN** an in-progress recording exists
- **WHEN** the recorder handles a public local card play event
- **THEN** the persisted recording contains the raw event reference
- **AND** it contains a `card-played` analysis event linked to that source event index
- **AND** it contains a narration frame linked to the same source event index

#### Scenario: Derivation failure does not lose raw events

- **GIVEN** an in-progress recording exists
- **WHEN** analysis or narration derivation throws for a single raw event
- **THEN** the raw event is still appended to `events.jsonl`
- **AND** the recording remains loadable
- **AND** later raw events can still append analysis and narration

### Requirement: Recording detail exposes narration for review

The existing read-only `recordings:get` API SHALL return analysis events and narration frames as part of `MatchRecordingDetail`.

The recording viewer SHALL render a compact narration section when narration frames exist. The section MUST preserve frame order and MUST NOT display hidden opponent card identities that are absent from the returned frames.

#### Scenario: Recording detail returns narration frames

- **GIVEN** a completed recording contains narration frames
- **WHEN** the renderer calls `window.hdt.recordings.get(recordingId)`
- **THEN** the returned detail includes those frames in sequence order

#### Scenario: Viewer shows empty narration state

- **GIVEN** a loaded recording has no narration frames
- **WHEN** the recording viewer renders
- **THEN** it shows an explicit empty state for narration instead of fabricated analysis text

### Requirement: Analysis data remains correlated with raw events

Every analysis event and narration frame persisted in a recording SHALL remain traceable back to the raw Power event that caused it.

The system MUST NOT persist analysis events or narration frames without `sourceEventIndex`. When loading a recording, frames whose `sourceEventIndex` is outside the raw event reference range MUST be ignored or diagnosed without preventing the rest of the recording from loading.

#### Scenario: Frame source index points to raw event

- **GIVEN** a recording has a narration frame with `sourceEventIndex: 7`
- **WHEN** the recording detail is loaded
- **THEN** raw event reference index `7` exists in the same detail

#### Scenario: Corrupt frame source does not break loading

- **GIVEN** a recording file contains one narration frame whose source event index is invalid
- **WHEN** the store loads the recording
- **THEN** the recording detail still loads
- **AND** valid narration frames remain available
