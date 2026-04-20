import { useEffect, useState } from 'react';
import type { BattleTag, MedalInfo } from '@hdt/hearthmirror';

export interface HearthMirrorStatus {
  isAlive: boolean;
  battleTag: BattleTag | null;
  medalInfo: MedalInfo | null;
  lastUpdatedAt: number;
}

export function useHearthMirrorStatus(): HearthMirrorStatus {
  const [isAlive, setIsAlive] = useState(false);
  const [battleTag, setBattleTag] = useState<BattleTag | null>(null);
  const [medalInfo, setMedalInfo] = useState<MedalInfo | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const alive = await window.hdt.hearthmirror.isAlive().catch(() => false);
      if (cancelled) return;
      setIsAlive(alive);

      if (alive) {
        const tag = await window.hdt.hearthmirror.getBattleTag().catch(() => null);
        if (cancelled) return;
        setBattleTag(tag);

        const medal = await window.hdt.hearthmirror.getMedalInfo().catch(() => null);
        if (cancelled) return;
        setMedalInfo(medal);
      } else {
        setBattleTag(null);
        setMedalInfo(null);
      }

      setLastUpdatedAt(Date.now());
    }

    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { isAlive, battleTag, medalInfo, lastUpdatedAt };
}
