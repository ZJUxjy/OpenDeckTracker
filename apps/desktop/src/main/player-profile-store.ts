import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openWithIntegrityGuard } from './db/open-with-recovery';
import type { AccountId, BattleTag } from '@hdt/hearthmirror';

export interface PlayerProfileSnapshot {
  battleTag: BattleTag;
  accountId?: AccountId | null;
  lastSeenAt: number;
}

export interface SavePlayerProfileInput {
  battleTag: BattleTag;
  accountId?: AccountId | null;
  /** Override timestamp; defaults to `Date.now()`. Provided for tests. */
  now?: number;
}

export interface PlayerProfileStore {
  get(): PlayerProfileSnapshot | null;
  save(input: SavePlayerProfileInput): PlayerProfileSnapshot;
  close(): void;
}

interface PlayerProfileRow {
  id: number;
  battle_tag_name: string;
  full_battle_tag: string;
  account_id_hi: string | null;
  account_id_lo: string | null;
  last_seen_at: number;
}

export function createPlayerProfileStore(dbPath: string): PlayerProfileStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openWithIntegrityGuard(dbPath);
  initializeSchema(db);

  const upsertStmt = db.prepare(`
    INSERT INTO player_profile (id, battle_tag_name, full_battle_tag, account_id_hi, account_id_lo, last_seen_at)
    VALUES (1, @battleTagName, @fullBattleTag, @accountIdHi, @accountIdLo, @lastSeenAt)
    ON CONFLICT(id) DO UPDATE SET
      battle_tag_name = excluded.battle_tag_name,
      full_battle_tag = excluded.full_battle_tag,
      account_id_hi = excluded.account_id_hi,
      account_id_lo = excluded.account_id_lo,
      last_seen_at = excluded.last_seen_at
  `);

  const selectStmt = db.prepare('SELECT * FROM player_profile WHERE id = 1');

  return {
    get(): PlayerProfileSnapshot | null {
      const row = selectStmt.get() as PlayerProfileRow | undefined;
      if (row === undefined) return null;
      return rowToSnapshot(row);
    },

    save(input): PlayerProfileSnapshot {
      const lastSeenAt = input.now ?? Date.now();
      upsertStmt.run({
        battleTagName: input.battleTag.name,
        fullBattleTag: input.battleTag.fullBattleTag,
        accountIdHi:
          input.accountId !== undefined && input.accountId !== null
            ? input.accountId.hi.toString()
            : null,
        accountIdLo:
          input.accountId !== undefined && input.accountId !== null
            ? input.accountId.lo.toString()
            : null,
        lastSeenAt,
      });
      return {
        battleTag: { ...input.battleTag },
        accountId:
          input.accountId !== undefined && input.accountId !== null
            ? { hi: input.accountId.hi, lo: input.accountId.lo }
            : null,
        lastSeenAt,
      };
    },

    close(): void {
      db.close();
    },
  };
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_profile (
      id INTEGER PRIMARY KEY,
      battle_tag_name TEXT NOT NULL,
      full_battle_tag TEXT NOT NULL,
      account_id_hi TEXT,
      account_id_lo TEXT,
      last_seen_at INTEGER NOT NULL
    );
  `);
}

function rowToSnapshot(row: PlayerProfileRow): PlayerProfileSnapshot {
  const accountId =
    row.account_id_hi !== null && row.account_id_lo !== null
      ? { hi: BigInt(row.account_id_hi), lo: BigInt(row.account_id_lo) }
      : null;
  return {
    battleTag: { name: row.battle_tag_name, fullBattleTag: row.full_battle_tag },
    accountId,
    lastSeenAt: row.last_seen_at,
  };
}
