# OpenDeckTracker v0.6.0

Second public release. Builds on v0.5.0-beta — the first focused on
verifying install / launch / data-persistence on testers' real
machines; this one is where actual deck-tracking features land:
known-position tracking, opponent effect-summon filtering, and a much
tighter overlay-window experience.

Data shape and IPC contracts MAY still shift before v1.0 — do not
depend on saved decks / stats / recordings surviving a future
migration without notice.

## ⚠️ Install warnings you should know about

- **Windows SmartScreen will block the installer on first run.** This
  build is still not code-signed; SmartScreen flags any unsigned `.exe`
  from a new publisher as "untrusted". To run it:
  1. Click "More info" on the SmartScreen prompt.
  2. Click "Run anyway".
  3. The installer then proceeds normally.
  A real OV/EV code-signing certificate is on the roadmap for v1.0 — at
  which point SmartScreen reputation builds up over the first few
  hundred installs and the prompt goes away.
- **Anti-virus scanners**: a handful of low-reputation AVs (typically
  domestic) flag unsigned Electron apps as suspicious. False positive
  — the source is public; either whitelist the install directory or
  wait for code-signing.
- **The app installs per-user**, into
  `%LOCALAPPDATA%\Programs\OpenDeckTracker\`. No admin elevation is
  required. Uninstall via "Add or remove programs".

## What's new since v0.5.0 beta

### Known deck-position tracking
- A reusable extractor framework that learns the **exact position** of
  specific cards in your deck from Power.log events.
- First card wired: **Waveshaping (波涛形塑, TIME_701)** — the two
  cards you DIDN'T pick from the Discover-from-deck prompt show up in
  a dedicated **"牌库底" / "Bottom of deck"** section in the player
  panel, with a ↓ badge.
- The framework was designed to make future "put on top" / "put on
  bottom" cards a one-file addition. The Discover algorithm correctly
  handles HS's actual COPY-entity mechanic (it doesn't move originals
  to SETASIDE — it spawns three new copies, and the chosen card's
  ORIGINAL is what moves to your hand).

### Overlay window experience
- **Sub-second reconnect** when you alt-tab back to Hearthstone — a
  global process monitor drives the watcher's reconnect cadence on
  edge signals instead of waiting for the next poll tick.
- **STEP-gated visibility** — overlay no longer briefly flashes at
  the deck-picker screen between matches. Visibility advances on the
  mulligan/main-phase STEP tag rather than CREATE_GAME (which HS also
  fires for the deck-picker hero portrait animation).
- **Self-healing z-order** — fixes the intermittent "one of the two
  overlays didn't reappear after alt-tab" case where the OS dropped
  one window behind HS even though the tracker still thought it was
  on top.
- **Language preference syncs across BrowserWindows** — switching
  between EN / zh-CN in Settings now updates the overlay immediately
  instead of leaving its bootstrap locale stale.

### Friendly board attack updates live during your turn
- Previously the board-attack readout only refreshed at turn
  boundaries. Now your side recomputes on every entity update during
  your own turn — buffs, silences, weapon attaches, transforms all
  reflect immediately in the displayed total. The opponent's side
  keeps the original turn-boundary throttle so their pings/pongs /
  hero-power spam doesn't trigger constant taunt-search recomputes.

### Opponent panel — effect-summoned filtering
- Cards summoned by **effects** (Phaelarc the Firelight, Flashback,
  Infectious Breath's leeches, etc.) no longer pollute the opponent's
  "已打出 / Played" history. The graveyard tab still surfaces them
  when they die — that path is unaffected.

### Extra-display & hover tooltips
- **Ebonok (TIME_714)** hover preview shows which opponent minions
  remain from the prior opponent turn, with an empty-pool highlight
  warning before you commit Ebonok to play.
- **Cost-reduction giants series** hover lines (current count →
  resulting cost) for Felfused Fel-Fisher etc.
- Hover preview now fires **synchronously** on mouseenter — the 250 ms
  anti-flicker delay was removed at user request.

### Match recording & live narration
- Live narration overlay panel — a running zh-CN transcript of who
  played what, generated from the same pipeline that feeds the
  post-match replay analyzer.
- Narration frames persist alongside recordings; the replay viewer
  surfaces them turn-by-turn.

### UI polish
- Single source of truth for Collection's standard/wild filter — the
  redundant dropdown is gone, the segment toggle on the right is now
  authoritative.
- 牌库底 / 牌库顶 dedicated sections in the deck panel (separated from
  the main remaining list to avoid duplication).
- Console theme tokens tightened, placeholder routes hidden from the
  top nav.

## Stability fixes since v0.5.0 beta

- **Friendly/opposing attribution under second-player coin** — when
  HearthMirror's MatchInfo had a null `localPlayer` during PRE_MATCH
  bootstrap, the code used to default the controller ID to `1`. For
  players going SECOND on the coin (real TAG_CONTROLLER=2), this
  swapped every friendly/opposing filter — Discover bottoms, graveyard,
  revealed cards all attributed to the wrong side. The bootstrap path
  now defers identity assignment until MatchInfo is reliable, and
  re-applies at IN_MATCH.
- **Deck selection persistence across player-identity swaps** — fixed
  the case where picking a deck via the dialog right-side tracker
  didn't survive the IN_MATCH player-ID lock-in.
- **localControllerId on board-attack options is now required** — same
  shape as the controller-swap bug above; the optional default of `1`
  could have silently mis-attributed weapon + hero-attack on any
  caller that forgot to pass it.

## Known limitations

- **Card art is still fetched on demand from
  `art.hearthstonejson.com`** the first time each card appears. If
  that CDN is slow / blocked from your network, expect 200–500 ms
  latency for new cards and possible placeholder cards on a cold
  profile. After first fetch, images are cached locally and work
  offline.
- **No macOS / Linux build** in this beta. Windows x64 only.
- **No code-signing yet** — SmartScreen warning persists, see install
  notes above.
- **Pre-existing test failure in core** (`hsdata-coverage`) — one
  stale assertion against a specific set ID; known, accepted, does
  not affect runtime behavior. To be cleaned up in a follow-up.

## Feedback

Bug reports and suggestions: please open an issue at
<https://github.com/ZJUxjy/OpenDeckTracker/issues>.

中文反馈直接用中文写 issue 即可。
