# @hdt/hearthmirror-spike

> **Exploratory.** This package validates ADR 0001 by checking whether 64-bit
> napi-rs + standard `ReadProcessMemory` can read the 32-bit Hearthstone.exe
> process. **Do not depend on this package.** It will be deleted at the end of
> the `add-hearthmirror-bridge-spike` change.

See `docs/spikes/0001-hearthmirror-spike.md` for context and acceptance
criteria, `docs/adr/0001-hearthmirror-bridge.md` for the architecture
decision being validated.

## Build

```powershell
pnpm install
pnpm build
```

Produces `hearthmirror-spike.win32-x64-msvc.node` + `index.cjs` + `index.d.ts`.
