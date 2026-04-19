# @hdt/hearthmirror-mono-spike

> **Exploratory.** Spike 02 validates ADR 0001 by checking that we can locate
> the Mono runtime inside Hearthstone, parse its PE export table to find
> `mono_get_root_domain`, and dereference the global root domain pointer to
> read MonoDomain offsets per `Rewrite_Design.md` §7.2. **Do not depend.** This
> package is deleted at the end of the `add-hearthmirror-bridge-mono-spike`
> change.

See `openspec/changes/add-hearthmirror-bridge-mono-spike/` for plan and ADR
0001 in `docs/adr/` for the architecture being validated.

## Build

```powershell
pnpm install
pnpm build
```
