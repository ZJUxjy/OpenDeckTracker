# hearthmirror-mono-probe Specification

## Purpose
TBD - created by archiving change fix-hearthmirror-probe-error-msg. Update Purpose after archive.
## Requirements
### Requirement: probe_field_offset MUST identify the probe site in error messages

The `probe_field_offset` helper SHALL accept caller-supplied `owner_class: &str` and `owner_field: &str` parameters that identify the structure and field being probed. When no candidate slot validates, the returned `ScryError::FieldNotFound` SHALL contain those caller-supplied identifiers (not placeholder strings such as `"<probe>"` / `"<probed>"`).

#### Scenario: Probe failure surfaces caller-supplied identifiers

- **GIVEN** a caller invokes `probe_field_offset(memory, base, "MonoDomain", "loaded_images", validator)`
- **WHEN** no slot in the scan window validates
- **THEN** the returned `Err(ScryError::FieldNotFound { class, field })` SHALL satisfy `class == "MonoDomain"` AND `field == "loaded_images"`
- **AND** the corresponding Display string SHALL equal `"mono field not found: MonoDomain.loaded_images"`

#### Scenario: Existing FieldNotFound Display format preserved

- **GIVEN** a `ScryError::FieldNotFound { class: "X", field: "y" }` value
- **WHEN** its Display impl is invoked
- **THEN** the output string SHALL equal `"mono field not found: X.y"`
- **AND** the `error.rs::tests::napi_error_conversion_preserves_message` test SHALL continue to pass without modification

### Requirement: All callers MUST pass non-placeholder identifiers

Every call site of `probe_field_offset` in the `hearthmirror-native` crate SHALL pass identifier strings that name the actual structure and field being probed. Placeholder values such as `"<probe>"`, `"<probed>"`, `"unknown"`, or empty strings are NOT permitted.

#### Scenario: All existing callers updated

- **GIVEN** the `hearthmirror-native` crate after this change is implemented
- **WHEN** `Get-ChildItem -Path packages/hearthmirror/native/src -Filter *.rs -Recurse | Select-String "probe_field_offset\("` is executed
- **THEN** every match SHALL pass concrete identifier string literals as the 3rd and 4th arguments
- **AND** zero matches SHALL contain `"<probe>"` or `"<probed>"` literal strings

#### Scenario: probe.rs source contains no placeholder error literals

- **GIVEN** the file `packages/hearthmirror/native/src/mono/probe.rs` after this change
- **WHEN** searched for the string `"<probe>"` or `"<probed>"`
- **THEN** zero matches SHALL be found

