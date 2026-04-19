import { useEffect, useState } from 'react';

interface HearthMirrorStatus {
  isAlive: boolean;
  playerName: string | null;
}

export function useHearthMirrorStatus(): HearthMirrorStatus {
  const [isAlive, setIsAlive] = useState(false);
  const [playerName, setPlayerName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const alive = await window.hdt.hearthmirror.isAlive().catch(() => false);
      if (cancelled) return;
      setIsAlive(alive);

      if (alive) {
        const tag = await window.hdt.hearthmirror.getBattleTag().catch(() => null);
        if (!cancelled && tag) {
          setPlayerName(tag.name);
        }
      } else {
        setPlayerName(null);
      }
    }

    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { isAlive, playerName };
}
