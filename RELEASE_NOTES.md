# OpenDeckTracker v0.5.0 beta

First public test build. Use this version to verify the installer / launch
path / Hearthstone integration on real machines. Data shape and IPC
contracts MAY shift before v1.0 — do not depend on saved decks / stats /
recordings surviving a future migration without notice.

## ⚠️ Install warnings you should know about

- **Windows SmartScreen will block the installer on first run.** This
  build is not yet code-signed; SmartScreen flags any unsigned `.exe`
  from a new publisher as "untrusted". To run it:
  1. Click "More info" on the SmartScreen prompt.
  2. Click "Run anyway".
  3. The installer then proceeds normally.
  A real OV/EV code-signing certificate is on the roadmap for v1.0 — at
  which point SmartScreen reputation builds up over the first few hundred
  installs and the prompt goes away.
- **The app installs per-user**, into `%LOCALAPPDATA%\Programs\OpenDeckTracker\`.
  No admin elevation is required. Uninstall via "Add or remove programs".
- **Anti-virus scanners**: a handful of low-reputation AVs (typically
  domestic) flag unsigned Electron apps as suspicious. False positive —
  the source is public; either whitelist the install directory or wait
  for code-signing.

## What's in this build

This is mostly internal hardening — the goal is to verify the install /
launch / persistence story on testers' real machines. User-facing
surface:

- **Main window**: Tracker / Decks / Stats / Collection + Settings nav.
  Three placeholder routes (Opponent / Lethal / Replay) and their
  Dashboard ad cards are hidden until they're real features.
- **Default UI style is macOS Tahoe**. Other styles (Tavern / Fallout 76
  / WeChat Dark) reachable via Settings → Appearance → UI style.
- **Live deck tracker overlay** + **opponent overlay** anchored to the
  Hearthstone game window. Each carries a four-tab panel: deck list,
  active global effects, graveyard, narration.
- **Live game narration panel** in the player overlay — a running
  transcript of who played what, generated from the same pipeline that
  feeds the post-match replay analyzer. zh-CN translated.
- **Ebonok (TIME_714) hover preview** showing which opponent minions
  remain from the prior opponent turn, with empty-pool highlight
  warning before you commit Ebonok.
- **Cost-reduction giant series** hover lines (current count → resulting
  cost) for Felfused Fel-Fisher etc.
- **Bottom version pill** for at-a-glance build identification.

## What's been hardened in this beta

- **Lethal calculator throttled** to turn boundaries instead of every
  Power.log event — large CPU reduction during the opponent's turn.
- **Hardened path-traversal in `recordings:get` IPC** — recordingId now
  goes through an allowlist + base-dir containment check.
- **Spectator round-trip no longer leaks per-match state** — entering
  spectator mid-match and starting a new live match cleared all the
  state that should have been cleared.
- **Native addons properly unpacked from app.asar** — fixed the
  silent failure path where `better-sqlite3` and `@hdt/hearthmirror-native`
  weren't loadable in packaged builds.
- **Auto-update wired to GitHub Releases** (this release feed).
- **userData moved to `%APPDATA%\OpenDeckTracker\`** (was previously
  `@hdt\desktop`). One-shot migration runs on first launch — existing
  data is preserved.

## Known limitations

- **Card art is fetched on demand from `art.hearthstonejson.com`** the
  first time each card appears. If that CDN is slow / blocked from your
  network, expect 200–500 ms latency for new cards and possible
  placeholder cards on a cold profile. After first fetch, images are
  cached locally and work offline.
- **Auto-update** check fires on launch and again every 6 hours. The
  prerelease channel is opt-in; users on a future stable channel will
  NOT auto-update into a beta.
- **Pre-existing test failure in core**: `hsdata-coverage` has one stale
  assertion against a specific set ID — known, accepted, does not affect
  runtime behavior. To be cleaned up in a follow-up.
- **No macOS / Linux build** in this beta. Windows x64 only.

## Reporting issues

File a GitHub issue at https://github.com/ZJUxjy/OpenDeckTracker/issues
with:

- App version (bottom-left pill, e.g. `v0.5.0 beta`)
- Hearthstone log directory + first error message from main-process
  stderr if you have one
- Repro steps

For crashes, the relevant log is at `%APPDATA%\OpenDeckTracker\logs\` —
attaching that file's tail is very helpful.

## File integrity

- Installer: `OpenDeckTracker-Setup-0.5.0-beta.exe` (95 MB)
- SHA-512: see the `sha512` field in `latest.yml` attached to this release

---

Not affiliated with Blizzard Entertainment. Hearthstone is a trademark of
Blizzard Entertainment, Inc.
