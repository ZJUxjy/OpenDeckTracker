## 1. Core Stats Domain

- [x] 1.1 Add failing tests in `packages/core/src/stats/match-history.test.ts` for constructed classification, fingerprint idempotency, and completed-match normalization. Test code to add:
  ```ts
  it('classifies ranked and casual constructed formats only', () => {
    expect(isConstructedMatch({ gameType: 3, formatType: 2 })).toBe(true);
    expect(isConstructedMatch({ gameType: 4, formatType: 1 })).toBe(true);
    expect(isConstructedMatch({ gameType: 5, formatType: 2 })).toBe(false);
  });

  it('builds the same fingerprint for the same completed match', () => {
    const match = makeCompletedMatch({ startedAt: 1000, endedAt: 2000, deckId: 42 });
    expect(buildMatchFingerprint(match)).toBe(buildMatchFingerprint({ ...match }));
  });
  ```
  Run `pnpm --filter @hdt/core test -- src/stats/match-history.test.ts`; expected output: new tests fail because `src/stats/match-history.ts` does not exist.

- [x] 1.2 Implement `packages/core/src/stats/match-history.ts` with `MatchResult`, `PlayOrder`, `CompletedMatchSummary`, `MatchHistoryRecord`, `StatsTimeFilter`, `isConstructedMatch`, `buildMatchFingerprint`, and normalization helpers. Export them from `packages/core/src/index.ts`. Run `pnpm --filter @hdt/core test -- src/stats/match-history.test.ts`; expected output: match-history tests pass. Suggested commit message: `feat(core): add match history domain types`.

- [x] 1.3 Add failing aggregation tests in `packages/core/src/stats/stats-aggregation.test.ts` for empty history, unknown-result winrate exclusion, newest-first recent matches, best deck, and class winrates. Test code to add:
  ```ts
  it('returns empty stats for empty history', () => {
    expect(aggregateStats([], { filter: 'season', now: new Date('2026-04-27T00:00:00Z') }))
      .toMatchObject({ matchesPlayed: 0, wins: 0, losses: 0, overallWinrate: null, recentMatches: [] });
  });

  it('ignores unknown results in winrate denominator', () => {
    const summary = aggregateStats([winMatch(), lossMatch(), unknownMatch()], { filter: 'all-time', now: fixedNow });
    expect(summary.matchesPlayed).toBe(3);
    expect(summary.overallWinrate).toBe(50);
  });
  ```
  Run `pnpm --filter @hdt/core test -- src/stats/stats-aggregation.test.ts`; expected output: new tests fail because `aggregateStats` does not exist.

- [x] 1.4 Implement `packages/core/src/stats/stats-aggregation.ts` and export `StatsSummary`, `ClassWinrate`, `RecentMatchView`, `aggregateStats`, and `filterMatchesByTime`. Run `pnpm --filter @hdt/core test -- src/stats/stats-aggregation.test.ts`; expected output: aggregation tests pass.

- [x] 1.5 Run `pnpm --filter @hdt/core test` and `pnpm --filter @hdt/core typecheck`; expected output: all core tests pass and TypeScript exits 0. Suggested commit message: `feat(core): aggregate real match stats`.

## 2. DeckTracker Completed-Match Payload

- [x] 2.1 Add failing tests in `packages/core/src/tracker/deck-tracker.test.ts` for `match-ended` including `completedMatch` on constructed games and omitting it on Arena/unknown modes. Test code to add:
  ```ts
  it('emits completedMatch summary when a constructed match ends', async () => {
    const events: DeckTrackerEvent[] = [];
    const tracker = new DeckTracker({ mirror: makeMirrorForCompletedConstructedMatch() });
    tracker.on('match-ended', (event) => events.push(event));
    await runTrackerThroughMatchEnd(tracker);
    expect(events.at(-1)?.completedMatch).toMatchObject({ result: 'unknown', playOrder: 'unknown', deckId: 42 });
  });

  it('omits completedMatch summary for arena games', async () => {
    const event = await runArenaMatchToEnd();
    expect(event.completedMatch).toBeUndefined();
  });
  ```
  Run `pnpm --filter @hdt/core test -- src/tracker/deck-tracker.test.ts`; expected output: tests fail because `DeckTrackerEvent.completedMatch` does not exist.

- [x] 2.2 Update `packages/core/src/tracker/deck-tracker.ts` to add `completedMatch?: CompletedMatchSummary` to `DeckTrackerEvent` and build the summary on constructed `match-ended` using current `matchInfo`, identified deck, `game.startedAt`, `game.endedAt`, opponent metadata, `unknown` result fallback, and `unknown` play-order fallback. Run `pnpm --filter @hdt/core test -- src/tracker/deck-tracker.test.ts`; expected output: new deck-tracker tests pass.

- [x] 2.3 Add focused tests in `packages/core/src/stats/match-history.test.ts` that `buildMatchFingerprint` changes when deck id, opponent name, start time, or result changes. Run `pnpm --filter @hdt/core test -- src/stats/match-history.test.ts`; expected output: all match-history tests pass.

- [x] 2.4 Run `pnpm --filter @hdt/core test` and `pnpm --filter @hdt/core typecheck`; expected output: all core tests pass and TypeScript exits 0. Suggested commit message: `feat(core): emit completed match summaries`.

## 3. Desktop Persistence and Recording

- [x] 3.1 Add the SQLite dependency with `pnpm --filter @hdt/desktop add better-sqlite3`. Expected output: `apps/desktop/package.json` gains `better-sqlite3` and the lockfile updates; do not hand-edit a guessed version.

- [x] 3.2 Add failing persistence tests in `apps/desktop/src/main/match-history-store.test.ts` using a temp database path. Test code to add:
  ```ts
  it('persists and reloads completed matches', () => {
    const dbPath = join(dir, 'stats.sqlite');
    createMatchHistoryStore(dbPath).record(makeCompletedMatch({ fingerprint: 'a' }));
    expect(createMatchHistoryStore(dbPath).listRecent({ filter: 'all-time', limit: 5 })).toHaveLength(1);
  });

  it('deduplicates by fingerprint', () => {
    const store = createMatchHistoryStore(join(dir, 'stats.sqlite'));
    store.record(makeCompletedMatch({ fingerprint: 'same' }));
    store.record(makeCompletedMatch({ fingerprint: 'same' }));
    expect(store.listRecent({ filter: 'all-time', limit: 10 })).toHaveLength(1);
  });
  ```
  Run `pnpm --filter @hdt/desktop test -- src/main/match-history-store.test.ts`; expected output: tests fail because `match-history-store.ts` does not exist.

- [x] 3.3 Implement `apps/desktop/src/main/match-history-store.ts` with schema initialization, `record`, `listRecent`, and `getAllForFilter` methods. Store dates as epoch milliseconds and enforce `UNIQUE(fingerprint)`. Run `pnpm --filter @hdt/desktop test -- src/main/match-history-store.test.ts`; expected output: persistence tests pass.

- [x] 3.4 Add failing host tests in `apps/desktop/src/main/stats-host.test.ts` for registering `stats:get-summary` and `stats:list-recent` handlers, returning serializable data, and using `aggregateStats`. Test code to add:
  ```ts
  it('registers stats IPC handlers', () => {
    registerStatsIpc(makeStoreWithMatches([winMatch()]));
    expect(mocks.ipcMain.handle).toHaveBeenCalledWith('stats:get-summary', expect.any(Function));
    expect(mocks.ipcMain.handle).toHaveBeenCalledWith('stats:list-recent', expect.any(Function));
  });
  ```
  Run `pnpm --filter @hdt/desktop test -- src/main/stats-host.test.ts`; expected output: tests fail because `stats-host.ts` does not exist.

- [x] 3.5 Implement `apps/desktop/src/main/stats-host.ts` with `createDefaultMatchHistoryStore(app.getPath('userData'))`, `recordCompletedMatch`, `registerStatsIpc`, and pure handler helpers. Run `pnpm --filter @hdt/desktop test -- src/main/stats-host.test.ts`; expected output: stats-host tests pass.

- [x] 3.6 Update `apps/desktop/src/main/deck-tracker.ts` to record `event.completedMatch` inside the existing `match-ended` handler before broadcasting the event. Add or update `apps/desktop/src/main/deck-tracker.test.ts` so a fake match-ended event with `completedMatch` calls `recordCompletedMatch` once. Run `pnpm --filter @hdt/desktop test -- src/main/deck-tracker.test.ts src/main/stats-host.test.ts`; expected output: both files pass. Suggested commit message: `feat(desktop): persist completed match history`.

## 4. Preload and Renderer Stats UI

- [x] 4.1 Add failing preload API tests or update existing preload type tests so `window.hdt.stats.getSummary(filter)` and `window.hdt.stats.listRecent(filter, limit)` invoke `stats:get-summary` and `stats:list-recent`. Run `pnpm --filter @hdt/desktop test -- src/preload/index.test.ts`; expected output: tests fail until the preload namespace is added.

- [x] 4.2 Update `apps/desktop/src/preload/index.ts` to expose the `stats` namespace and import shared Stats types from `@hdt/core`. Run `pnpm --filter @hdt/desktop test -- src/preload/index.test.ts` and `pnpm --filter @hdt/desktop typecheck`; expected output: preload tests pass and TypeScript exits 0.

- [x] 4.3 Add failing renderer tests in `apps/desktop/src/renderer/tests/Stats.test.tsx` for empty state and real data rendering. Test code to add:
  ```tsx
  it('shows empty states instead of mock matches when history is empty', async () => {
    mockStatsApi({ summary: emptyStatsSummary(), recent: [] });
    render(<Stats />);
    expect(await screen.findByText(/no tracked matches/i)).toBeInTheDocument();
    expect(screen.queryByText('Frost Mage')).not.toBeInTheDocument();
    expect(screen.queryByText('1,245')).not.toBeInTheDocument();
  });

  it('renders recent matches returned by the stats API', async () => {
    mockStatsApi({ summary: summaryWithOneWin(), recent: [recentWin()] });
    render(<Stats />);
    expect(await screen.findByText('Recorded Real Deck')).toBeInTheDocument();
    expect(screen.getByText(/vs Mage/i)).toBeInTheDocument();
  });
  ```
  Run `pnpm --filter @hdt/desktop test -- src/renderer/tests/Stats.test.tsx`; expected output: tests fail because `Stats.tsx` still uses mock arrays.

- [x] 4.4 Implement `apps/desktop/src/renderer/src/stores/stats-store.ts` or local `Stats.tsx` loading state to call `window.hdt.stats`, support `today`, `week`, `season`, and `all-time`, and render loading/error/empty states. Run `pnpm --filter @hdt/desktop test -- src/renderer/tests/Stats.test.tsx`; expected output: Stats renderer tests pass.

- [x] 4.5 Remove `mockMatchHistory`, `classWinrates`, and fixed summary numbers from `apps/desktop/src/renderer/src/components/Stats.tsx`. Run `rg "mockMatchHistory|classWinrates|1,245|58.4%|Frost Mage" apps/desktop/src/renderer/src/components/Stats.tsx`; expected output: no matches. Suggested commit message: `feat(renderer): show real match history stats`.

## 5. Integration Verification

- [x] 5.1 Run `pnpm --filter @hdt/core test`, `pnpm --filter @hdt/core typecheck`, `pnpm --filter @hdt/desktop test`, and `pnpm --filter @hdt/desktop typecheck`; expected output: all commands exit 0.

- [x] 5.2 Run `openspec validate add-real-match-history-stats --strict`; expected output: strict validation passes for proposal, design, specs, and tasks.

- [x] 5.3 Manually run `pnpm dev`, complete or simulate one constructed match, open Stats, and verify the Recent Matches list shows the real completed match after restart. Expected output: no fabricated rows appear, and the recorded match persists after closing and reopening the app.

- [x] 5.4 Update `openspec/changes/add-real-match-history-stats/tasks.md` checkboxes as tasks complete and commit final verified work with message `feat: record real match history stats`.
