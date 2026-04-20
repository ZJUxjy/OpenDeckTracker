# Test Fixtures

This directory contains fixture files used by `hearthmirror-native` unit tests.

## Committed fixtures

| File | Description |
|------|-------------|
| `MinimalAssembly.dll` | A minimal .NET assembly (~3.5 KB) compiled from `MinimalAssembly.cs`. Contains `Blizzard.T5.Services.ServiceManager` and `Blizzard.T5.Services.IService` stubs with `s_runtimeServices` / `s_dynamicServices` static fields. Used for metadata reader unit tests (no EULA concerns). |
| `MinimalAssembly.cs` | C# source for the above DLL. Regenerate with `csc /target:library /optimize MinimalAssembly.cs`. |
| `MinimalAssembly.csproj` | MSBuild project for building MinimalAssembly.dll with `dotnet build` (requires .NET SDK). |

## Local fixtures (not committed)

The `.local/` subdirectory is git-ignored. It holds files extracted from the user's
local Hearthstone installation and must **not** be committed (large size + Blizzard EULA).

### Extracting real fixtures

Run the extraction script from the repository root:

```powershell
.\scripts\extract-hearthstone-fixtures.ps1
```

This copies `Assembly-CSharp.dll` from:

```
%ProgramFiles(x86)%\Hearthstone\Hearthstone_Data\Managed\Assembly-CSharp.dll
```

into `tests/fixtures/.local/Assembly-CSharp.dll`.

Set `HEARTHSTONE_DIR` to override the default path.

### Running real-fixture tests

After extraction, run:

```
cargo test -p hearthmirror-native --features real-fixtures
```

These tests are skipped in CI (no Hearthstone installation available).
