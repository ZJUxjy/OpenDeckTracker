import type { MatchHistoryRecord } from './match-history';

export interface MatchupCell {
  wins: number;
  losses: number;
  /** Percent winrate over known-result matches; `null` when zero known. */
  winrate: number | null;
}

/**
 * Aggregated matchup grid keyed by `(playerClass, opponentClass)`.
 *
 * Indexing: `cells[playerClass][opponentClass]` returns the cell, or
 * `undefined` if no records hit that bucket. `playerClasses` and
 * `opponentClasses` are the sorted set of keys actually present so
 * renderers can drive a stable axis.
 *
 * Records whose `playerClass` is `null`/`undefined` are bucketed under
 * the literal `"Unknown"` row; same for `opponentClass`.
 */
export interface MatchupMatrix {
  cells: Record<string, Record<string, MatchupCell>>;
  playerClasses: string[];
  opponentClasses: string[];
}

const UNKNOWN_KEY = 'Unknown';

export function computeMatchupMatrix(matches: MatchHistoryRecord[]): MatchupMatrix {
  const cells: Record<string, Record<string, MatchupCell>> = {};
  const players = new Set<string>();
  const opponents = new Set<string>();

  for (const m of matches) {
    const playerKey = m.playerClass ?? UNKNOWN_KEY;
    const opponentKey = m.opponentClass ?? UNKNOWN_KEY;
    players.add(playerKey);
    opponents.add(opponentKey);

    const row = cells[playerKey] ?? (cells[playerKey] = {});
    const cell = row[opponentKey] ?? (row[opponentKey] = { wins: 0, losses: 0, winrate: null });

    if (m.result === 'win') cell.wins += 1;
    else if (m.result === 'loss') cell.losses += 1;
    // 'unknown' results are not counted toward wins/losses (consistent with
    // `Stats queries and aggregation`'s overallWinrate semantics).
  }

  // Compute winrates per cell.
  for (const row of Object.values(cells)) {
    for (const cell of Object.values(row)) {
      const known = cell.wins + cell.losses;
      cell.winrate = known === 0 ? null : Math.round((cell.wins / known) * 1000) / 10;
    }
  }

  return {
    cells,
    playerClasses: [...players].sort(),
    opponentClasses: [...opponents].sort(),
  };
}
