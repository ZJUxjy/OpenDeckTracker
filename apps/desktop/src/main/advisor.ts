import { precheckLethal } from '@hdt/advisor';
import type { AdvisorAlert, AdvisorSuggestion } from '@hdt/advisor';
import type { DeckTrackerEvent, DeckTrackerEventName, DeckTrackerSnapshot } from '@hdt/core';

type AdvisorTrackerEventName = Extract<
  DeckTrackerEventName,
  'state-change' | 'match-started' | 'match-ended'
>;
type TimerHandle = ReturnType<typeof setTimeout>;

export interface AdvisorTrackerLike {
  on(
    event: AdvisorTrackerEventName,
    handler: (event: DeckTrackerEvent) => void,
  ): (() => void) | void;
}

export interface AdvisorSessionLike {
  suggestMulligan(): Promise<AdvisorSuggestion>;
  suggestTurn(): Promise<AdvisorSuggestion>;
  abortInFlight?(): void;
}

export interface AdvisorMainState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'stale';
  suggestion: AdvisorSuggestion | null;
  alerts: AdvisorAlert[];
  error: string | null;
  updatedAt: number;
}

export interface StartAdvisorOptions {
  tracker: AdvisorTrackerLike;
  createSession: (snapshot: DeckTrackerSnapshot) => AdvisorSessionLike | null;
  broadcast: (channel: 'advisor:state', payload: AdvisorMainState) => void;
  shouldSuggestTurn?: (
    current: DeckTrackerSnapshot,
    previous: DeckTrackerSnapshot | null,
  ) => boolean;
  debounceMs?: number;
  now?: () => number;
  setTimeoutFn?: (callback: () => void, delay: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
}

export interface AdvisorServiceHandle {
  dispose(): void;
  abortInFlight(): void;
}

const DEFAULT_DEBOUNCE_MS = 1_000;

function defaultShouldSuggestTurn(
  current: DeckTrackerSnapshot,
  previous: DeckTrackerSnapshot | null,
): boolean {
  return (
    current.phase === 'IN_MATCH' &&
    !current.isMulligan &&
    typeof current.turn === 'number' &&
    current.turn !== previous?.turn
  );
}

function formatLethalAlert(snapshot: DeckTrackerSnapshot): AdvisorAlert | null {
  const result = precheckLethal(snapshot);
  if (!result.hasLethal || result.requiredHealth === null) return null;
  return {
    type: 'lethal',
    detail: `${result.damage} damage available against ${result.requiredHealth} effective health.`,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
}

export function startAdvisor(options: StartAdvisorOptions): AdvisorServiceHandle {
  const {
    tracker,
    createSession,
    broadcast,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    now = () => Date.now(),
    shouldSuggestTurn = defaultShouldSuggestTurn,
    setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn = (handle) => clearTimeout(handle),
  } = options;

  let session: AdvisorSessionLike | null = null;
  let previousSnapshot: DeckTrackerSnapshot | null = null;
  let mulliganSuggested = false;
  let turnTimer: TimerHandle | null = null;
  let scheduledTurn: number | null = null;
  let suggestedTurn: number | null = null;
  let requestSeq = 0;
  let disposed = false;

  function emitState(state: Omit<AdvisorMainState, 'updatedAt'>): void {
    if (disposed) return;
    broadcast('advisor:state', { ...state, updatedAt: now() });
  }

  function ensureSession(snapshot: DeckTrackerSnapshot): AdvisorSessionLike | null {
    if (session === null) session = createSession(snapshot);
    return session;
  }

  function clearTurnTimer(): void {
    if (turnTimer === null) return;
    clearTimeoutFn(turnTimer);
    turnTimer = null;
    scheduledTurn = null;
  }

  function abortInFlight(): void {
    requestSeq += 1;
    clearTurnTimer();
    session?.abortInFlight?.();
  }

  function runSuggestion(load: () => Promise<AdvisorSuggestion>): void {
    const seq = ++requestSeq;
    emitState({ status: 'loading', suggestion: null, alerts: [], error: null });

    void load()
      .then((suggestion) => {
        if (disposed || seq !== requestSeq) return;
        emitState({
          status: 'ready',
          suggestion,
          alerts: suggestion.alerts,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (disposed || seq !== requestSeq) return;
        emitState({
          status: 'error',
          suggestion: null,
          alerts: [],
          error: formatError(error),
        });
      });
  }

  function maybeSuggestMulligan(snapshot: DeckTrackerSnapshot): void {
    if (!snapshot.isMulligan || mulliganSuggested) return;
    const currentSession = ensureSession(snapshot);
    if (currentSession === null) return;
    mulliganSuggested = true;
    runSuggestion(() => currentSession.suggestMulligan());
  }

  function maybeSuggestTurn(snapshot: DeckTrackerSnapshot): void {
    if (!shouldSuggestTurn(snapshot, previousSnapshot)) return;
    const currentSession = ensureSession(snapshot);
    if (currentSession === null) return;

    const turn = typeof snapshot.turn === 'number' ? snapshot.turn : null;
    if (turn !== null && suggestedTurn === turn) return;

    clearTurnTimer();
    scheduledTurn = turn;
    emitState({ status: 'loading', suggestion: null, alerts: [], error: null });
    turnTimer = setTimeoutFn(() => {
      turnTimer = null;
      if (disposed || session === null) return;
      if (scheduledTurn !== null) suggestedTurn = scheduledTurn;
      scheduledTurn = null;
      runSuggestion(() => session!.suggestTurn());
    }, debounceMs);
  }

  function handleStateChange(event: DeckTrackerEvent): void {
    const { snapshot } = event;
    const lethalAlert = formatLethalAlert(snapshot);
    if (lethalAlert !== null) {
      emitState({
        status: 'ready',
        suggestion: null,
        alerts: [lethalAlert],
        error: null,
      });
    }

    maybeSuggestMulligan(snapshot);
    maybeSuggestTurn(snapshot);
    previousSnapshot = snapshot;
  }

  function handleMatchStarted(event: DeckTrackerEvent): void {
    abortInFlight();
    session = createSession(event.snapshot);
    mulliganSuggested = false;
    suggestedTurn = null;
    scheduledTurn = null;
    previousSnapshot = event.snapshot;
    maybeSuggestMulligan(event.snapshot);
  }

  function handleMatchEnded(event: DeckTrackerEvent): void {
    abortInFlight();
    session = null;
    mulliganSuggested = false;
    suggestedTurn = null;
    scheduledTurn = null;
    previousSnapshot = event.snapshot;
    emitState({ status: 'idle', suggestion: null, alerts: [], error: null });
  }

  const disposers = [
    tracker.on('state-change', handleStateChange),
    tracker.on('match-started', handleMatchStarted),
    tracker.on('match-ended', handleMatchEnded),
  ].filter((dispose): dispose is () => void => typeof dispose === 'function');

  return {
    dispose() {
      if (disposed) return;
      abortInFlight();
      disposed = true;
      for (const dispose of disposers) dispose();
    },
    abortInFlight,
  };
}
