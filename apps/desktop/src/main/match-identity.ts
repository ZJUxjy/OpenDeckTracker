export interface LiveMatchIdentity {
  fingerprint: string;
  startedAt: number;
}

export interface LiveMatchIdentityStore {
  beginLiveMatch(startedAt: number): LiveMatchIdentity;
  current(): LiveMatchIdentity | null;
  clear(): void;
}

export function createLiveMatchIdentityStore(): LiveMatchIdentityStore {
  let sequence = 0;
  let currentIdentity: LiveMatchIdentity | null = null;

  return {
    beginLiveMatch(startedAt) {
      sequence += 1;
      currentIdentity = {
        fingerprint: `match-v2-${startedAt}-${sequence}`,
        startedAt,
      };
      return currentIdentity;
    },

    current() {
      return currentIdentity;
    },

    clear() {
      currentIdentity = null;
    },
  };
}

export const liveMatchIdentity = createLiveMatchIdentityStore();
