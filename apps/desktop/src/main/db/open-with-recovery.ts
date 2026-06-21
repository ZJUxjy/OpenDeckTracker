import Database from 'better-sqlite3';
import { renameSync } from 'node:fs';

/**
 * Opens a SQLite database with a corruption self-heal: if `integrity_check`
 * fails (or the file is so broken the check throws), the file is moved aside
 * and a fresh database is opened in its place so the app keeps working
 * instead of throwing on every subsequent query. WAL journal mode is applied
 * to the returned handle.
 *
 * Extracted from deck-store so match-history, player-profile and
 * collection-snapshot stores get the same recovery that decks.db already had.
 */
export function openWithIntegrityGuard(dbPath: string): Database.Database {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath);
    const row = db.pragma('integrity_check', { simple: true }) as string;
    if (row !== 'ok') {
      db.close();
      db = null;
      moveCorruptAside(dbPath);
      db = new Database(dbPath);
    }
  } catch {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      db = null;
    }
    moveCorruptAside(dbPath);
    db = new Database(dbPath);
  }
  db.pragma('journal_mode = WAL');
  return db;
}

/**
 * Renames a corrupt database file aside so it can be inspected later. Strips
 * either a `.db` or `.sqlite` extension (the stores use both) before appending
 * the `.corrupt-<timestamp>.db` suffix, so `stats.sqlite` becomes
 * `stats.corrupt-<ts>.db` rather than `stats.sqlite.corrupt-<ts>.db`.
 */
export function moveCorruptAside(dbPath: string): void {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    renameSync(dbPath, `${dbPath.replace(/\.(sqlite|db)$/i, '')}.corrupt-${ts}.db`);
  } catch {
    // already gone or unreadable; allow fresh open
  }
}
