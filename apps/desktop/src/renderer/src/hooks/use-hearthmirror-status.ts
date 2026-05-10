import { useEffect, useState } from 'react';
import type { BattleTag, MedalInfo } from '@hdt/hearthmirror';

export interface CachedPlayerIdentity {
  battleTag: BattleTag;
  lastSeenAt: number;
}

export interface HearthMirrorStatus {
  isAlive: boolean;
  battleTag: BattleTag | null;
  medalInfo: MedalInfo | null;
  cachedIdentity: CachedPlayerIdentity | null;
  /** Live `battleTag` if available, otherwise the cached one for display. */
  displayBattleTag: BattleTag | null;
  lastUpdatedAt: number;
}

export function useHearthMirrorStatus(): HearthMirrorStatus {
  const [isAlive, setIsAlive] = useState(false);
  const [battleTag, setBattleTag] = useState<BattleTag | null>(null);
  const [medalInfo, setMedalInfo] = useState<MedalInfo | null>(null);
  const [cachedIdentity, setCachedIdentity] = useState<CachedPlayerIdentity | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refreshCachedIdentity(): Promise<void> {
      const profile = await window.hdt?.playerProfile?.get?.().catch(() => null);
      if (cancelled) return;
      if (profile !== null && profile !== undefined) {
        setCachedIdentity({
          battleTag: profile.battleTag,
          lastSeenAt: profile.lastSeenAt,
        });
      }
    }

    async function poll(): Promise<void> {
      // Defensive: `window.hdt` is provided by the preload bridge and
      // is undefined in unit tests / when the preload script fails to
      // load. Without this guard the first poll throws synchronously
      // before the `.catch`, which surfaces as an Unhandled Rejection.
      const api = window.hdt?.hearthmirror;
      if (!api) {
        if (!cancelled) {
          setIsAlive(false);
          setBattleTag(null);
          setMedalInfo(null);
          setLastUpdatedAt(Date.now());
        }
        return;
      }

      const alive = await api.isAlive().catch(() => false);
      if (cancelled) return;
      setIsAlive(alive);

      if (alive) {
        const tag = await api.getBattleTag().catch(() => null);
        if (cancelled) return;
        setBattleTag(tag);

        const medal = await api.getMedalInfo().catch(() => null);
        if (cancelled) return;
        setMedalInfo(medal);

        // A successful live read may have just refreshed the cache on
        // the main side; pull the latest snapshot so the fallback stays
        // in sync.
        if (tag !== null) {
          await refreshCachedIdentity();
        }
      } else {
        setBattleTag(null);
        setMedalInfo(null);
      }

      setLastUpdatedAt(Date.now());
    }

    void refreshCachedIdentity();
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const displayBattleTag = battleTag ?? cachedIdentity?.battleTag ?? null;

  return { isAlive, battleTag, medalInfo, cachedIdentity, displayBattleTag, lastUpdatedAt };
}
