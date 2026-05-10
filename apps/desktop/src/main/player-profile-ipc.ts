import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import type { AccountId, BattleTag } from '@hdt/hearthmirror';
import {
  createPlayerProfileStore,
  type PlayerProfileSnapshot,
  type PlayerProfileStore,
} from './player-profile-store';

let defaultStore: PlayerProfileStore | null = null;

export function createDefaultPlayerProfileStore(userDataPath: string): PlayerProfileStore {
  return createPlayerProfileStore(join(userDataPath, 'player-profile.sqlite'));
}

export function getPlayerProfileStore(): PlayerProfileStore {
  defaultStore ??= createDefaultPlayerProfileStore(app.getPath('userData'));
  return defaultStore;
}

export interface PlayerProfileIpcResult {
  battleTag: BattleTag;
  accountId: AccountId | null;
  lastSeenAt: number;
}

function snapshotToIpc(snapshot: PlayerProfileSnapshot): PlayerProfileIpcResult {
  return {
    battleTag: snapshot.battleTag,
    accountId:
      snapshot.accountId !== undefined && snapshot.accountId !== null
        ? snapshot.accountId
        : null,
    lastSeenAt: snapshot.lastSeenAt,
  };
}

export function registerPlayerProfileIpc(
  store: PlayerProfileStore = getPlayerProfileStore(),
): void {
  ipcMain.handle('player-profile:get', (): PlayerProfileIpcResult | null => {
    const snapshot = store.get();
    return snapshot === null ? null : snapshotToIpc(snapshot);
  });
}

/**
 * Update the persisted profile from a successful live HearthMirror read.
 * No-op if `battleTag` is null. The cache is never erased by null reads.
 */
export function refreshPlayerProfileFromLive(
  battleTag: BattleTag | null,
  accountId: AccountId | null,
  store: PlayerProfileStore = getPlayerProfileStore(),
): PlayerProfileSnapshot | null {
  if (battleTag === null) return store.get();
  return store.save({ battleTag, accountId });
}

export function closePlayerProfileStore(): void {
  defaultStore?.close();
  defaultStore = null;
}
