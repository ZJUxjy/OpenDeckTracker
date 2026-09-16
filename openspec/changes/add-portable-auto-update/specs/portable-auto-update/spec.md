## ADDED Requirements

### Requirement: Portable distribution updates
Packaged Windows ZIP applications SHALL use the shared stable-release UI and download ZIP assets. Development applications MUST remain unsupported. NSIS applications SHALL retain their installer updater.

#### Scenario: Portable application finds a release
- **WHEN** a packaged Windows application without an uninstaller checks a newer stable release
- **THEN** it offers a verified ZIP download without installing or quitting automatically

#### Scenario: Development execution
- **WHEN** app.isPackaged is false
- **THEN** update actions remain unsupported

### Requirement: Verified preparation and explicit replacement
The application SHALL verify the ZIP checksum and safe extraction before offering restart. The helper MUST reject unsafe paths, links, duplicates and invalid app layouts. The application MUST wait for helper readiness before quitting.

#### Scenario: Invalid ZIP
- **WHEN** checksum or extraction fails
- **THEN** the app remains running and shows a retryable download error without changing application files

#### Scenario: Confirmed update
- **WHEN** the user confirms restart after preparation
- **THEN** the helper waits for the app to exit, backs up and replaces release files, and restarts the application

### Requirement: Preservation and recovery
The helper SHALL preserve userData and unrelated directory files, restore changed files after a replacement failure, and report the error on restart. It MUST NOT forcibly terminate another process or request elevation.

#### Scenario: Locked application file
- **WHEN** replacement fails because a file is locked
- **THEN** earlier changes are rolled back, existing data remains intact and the old application is restarted

### Requirement: Release metadata compatibility
Release generation SHALL include ZIP size and SHA-512 in latest.yml without changing NSIS installer selection.

#### Scenario: Release verification
- **WHEN** a release is built
- **THEN** validation checks both ZIP and installer hashes and the packaged update helper
