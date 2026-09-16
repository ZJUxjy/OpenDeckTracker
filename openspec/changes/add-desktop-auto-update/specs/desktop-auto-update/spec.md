## ADDED Requirements

### Requirement: Automatic checks and explicit downloads
Installed Windows clients SHALL check on launch and every six hours, and SHALL download only after the player requests an update. Concurrent checks/downloads MUST be deduplicated. Stable clients MUST NOT automatically downgrade or opt into prereleases.

#### Scenario: New stable release
- **WHEN** a newer release is available
- **THEN** the desktop displays its version and an update action without starting a download

#### Scenario: Checking while an installer is ready
- **WHEN** a periodic or manual check occurs during download or after download
- **THEN** it preserves the current update and does not initiate another request

### Requirement: Progress, retry and installation consent
The client SHALL expose downloading progress, ready, installing, and recoverable error states. Installation MUST only run after download verification and explicit restart consent. Normal exit MUST NOT install an update.

#### Scenario: Successful update
- **WHEN** the player downloads an update and then confirms restart
- **THEN** the verified NSIS installer runs and relaunches the application, preserving userData

#### Scenario: Failed request
- **WHEN** a network or verification failure occurs
- **THEN** the client displays an error and a retry action without terminating the app

### Requirement: Supported installations
Development builds and Windows ZIP distributions SHALL report that automatic installation is unsupported. The UI SHALL offer the fixed official releases page as the manual installation path.

#### Scenario: ZIP application
- **WHEN** a packaged app has no NSIS installation marker
- **THEN** no update download or installation is started

### Requirement: Complete releases
Every stable release SHALL publish the matching installer, blockmap and latest.yml with increasing application version. CI SHALL validate the manifest version and checksum before publication.

#### Scenario: Incomplete artifacts
- **WHEN** release validation finds a missing installer or mismatching hash/version
- **THEN** publishing is blocked and the public update feed remains unchanged
