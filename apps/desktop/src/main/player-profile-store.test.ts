import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayerProfileStore } from './player-profile-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hdt-player-profile-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('player-profile-store', () => {
  it('persists battle tag and account id across reopen', () => {
    const dbPath = join(dir, 'profile.sqlite');
    const first = createPlayerProfileStore(dbPath);
    first.save({
      battleTag: { name: 'Player', fullBattleTag: 'Player#12345' },
      accountId: { hi: 1n, lo: 2n },
      now: 5_000,
    });
    first.close();

    const second = createPlayerProfileStore(dbPath);
    const snapshot = second.get();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.battleTag.fullBattleTag).toBe('Player#12345');
    expect(snapshot!.battleTag.name).toBe('Player');
    expect(snapshot!.accountId?.hi).toBe(1n);
    expect(snapshot!.accountId?.lo).toBe(2n);
    expect(snapshot!.lastSeenAt).toBe(5_000);
    second.close();
  });

  it('returns null when no profile has been saved', () => {
    const store = createPlayerProfileStore(join(dir, 'profile.sqlite'));
    expect(store.get()).toBeNull();
    store.close();
  });

  it('overwrites with newer save and refreshes timestamp', () => {
    const store = createPlayerProfileStore(join(dir, 'profile.sqlite'));
    store.save({
      battleTag: { name: 'Old', fullBattleTag: 'Old#1' },
      now: 1_000,
    });
    store.save({
      battleTag: { name: 'New', fullBattleTag: 'New#2' },
      now: 2_000,
    });
    const snapshot = store.get();
    expect(snapshot!.battleTag.fullBattleTag).toBe('New#2');
    expect(snapshot!.lastSeenAt).toBe(2_000);
    store.close();
  });

  it('persists profile when account id is omitted', () => {
    const store = createPlayerProfileStore(join(dir, 'profile.sqlite'));
    store.save({
      battleTag: { name: 'Player', fullBattleTag: 'Player#12345' },
      now: 1_000,
    });
    const snapshot = store.get();
    expect(snapshot!.accountId).toBeNull();
    store.close();
  });

  it('integrity guard renames a corrupt player-profile.sqlite and starts fresh', () => {
    const dbPath = join(dir, 'profile.sqlite');
    writeFileSync(dbPath, Buffer.from('this is not a sqlite file'));
    const store = createPlayerProfileStore(dbPath);
    try {
      expect(store.get()).toBeNull();
      const files = readdirSync(dir);
      expect(files).toContain('profile.sqlite');
      expect(files.some((f) => f.startsWith('profile.corrupt-') && f.endsWith('.db'))).toBe(true);
    } finally {
      store.close();
    }
  });
});
