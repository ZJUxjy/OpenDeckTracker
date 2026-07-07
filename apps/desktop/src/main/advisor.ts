import { precheckLethal } from '@hdt/advisor';
import type { AdvisorAlert, AdvisorSuggestion } from '@hdt/advisor';
import type {
  DeckTrackerEvent,
  DeckTrackerEventName,
  DeckTrackerSnapshot,
  RecordedAdvisorHistoryEntry,
} from '@hdt/core';

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
  ask?(question: string): Promise<string>;
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
  ask(question: string, emitChunk?: (chunk: string) => void): Promise<string>;
  getHistory(): RecordedAdvisorHistoryEntry[];
}

const DEFAULT_DEBOUNCE_MS = 1_000;

function defaultShouldSuggestTurn(
  current: DeckTrackerSnapshot,
  previous: DeckTrackerSnapshot | null,
): boolean {
  return (
    current.phase === 'IN_MATCH' &&
    !current.isMulligan &&
    current.isLocalTurn === true &&
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
  let requestInFlight = false;
  let history: RecordedAdvisorHistoryEntry[] = [];
  let disposed = false;
  let currentSuggestion: AdvisorSuggestion | null = null;
  let currentAlerts: AdvisorAlert[] = [];
  let lastLethalFingerprint: string | null = null;

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

  function abortInFlight(options: { forceSessionAbort?: boolean; markStale?: boolean } = {}): void {
    const hadActiveWork = requestInFlight || turnTimer !== null;
    if (!hadActiveWork && !options.forceSessionAbort) return;
    requestSeq += 1;
    requestInFlight = false;
    clearTurnTimer();
    session?.abortInFlight?.();
    if (options.markStale && hadActiveWork) {
      emitState({ status: 'stale', suggestion: null, alerts: [], error: null });
    }
  }

  function runSuggestion(
    load: () => Promise<AdvisorSuggestion>,
    historyEntry: { kind: RecordedAdvisorHistoryEntry['kind']; turn: number | null } | null,
  ): void {
    const seq = ++requestSeq;
    requestInFlight = true;
    currentSuggestion = null;
    currentAlerts = [];
    emitState({ status: 'loading', suggestion: null, alerts: [], error: null });

    void Promise.resolve()
      .then(load)
      .then((suggestion) => {
        if (disposed || seq !== requestSeq) return;
        if (historyEntry !== null) {
          recordSuggestion(historyEntry.kind, historyEntry.turn, suggestion);
        }
        currentSuggestion = suggestion;
        currentAlerts = suggestion.alerts;
        emitState({
          status: 'ready',
          suggestion,
          alerts: suggestion.alerts,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (disposed || seq !== requestSeq) return;
        currentSuggestion = null;
        currentAlerts = [];
        emitState({
          status: 'error',
          suggestion: null,
          alerts: [],
          error: formatError(error),
        });
      })
      .finally(() => {
        if (seq === requestSeq) requestInFlight = false;
      });
  }

  function recordSuggestion(
    kind: RecordedAdvisorHistoryEntry['kind'],
    turn: number | null,
    suggestion: AdvisorSuggestion,
  ): void {
    const createdAt = now();
    history = [
      ...history,
      {
        id: `${kind}-${turn ?? 'unknown'}-${createdAt}`,
        kind,
        turn,
        createdAt,
        suggestion: cloneSuggestion(suggestion),
        followUps: [],
      },
    ];
  }

  function recordFollowUp(question: string, answer: string): void {
    const last = history.at(-1);
    if (last === undefined) return;
    history = [
      ...history.slice(0, -1),
      {
        ...last,
        followUps: [
          ...last.followUps,
          {
            question,
            answer,
            createdAt: now(),
          },
        ],
      },
    ];
  }

  function cloneSuggestion(suggestion: AdvisorSuggestion): RecordedAdvisorHistoryEntry['suggestion'] {
    return {
      reasoning: suggestion.reasoning,
      actions: suggestion.actions.map((action) => ({ ...action })),
      alerts: suggestion.alerts.map((alert) => ({ ...alert })),
    };
  }

  function cloneHistory(): RecordedAdvisorHistoryEntry[] {
    return history.map((entry) => ({
      ...entry,
      suggestion: {
        ...entry.suggestion,
        actions: entry.suggestion.actions.map((action) => ({ ...action })),
        alerts: entry.suggestion.alerts.map((alert) => ({ ...alert })),
      },
      followUps: entry.followUps.map((followUp) => ({ ...followUp })),
    }));
  }

  function maybeSuggestMulligan(snapshot: DeckTrackerSnapshot): void {
    if (!snapshot.isMulligan || mulliganSuggested) return;
    const currentSession = ensureSession(snapshot);
    if (currentSession === null) return;
    mulliganSuggested = true;
    const turn = typeof snapshot.turn === 'number' ? snapshot.turn : null;
    runSuggestion(() => currentSession.suggestMulligan(), { kind: 'mulligan', turn });
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
      const turnForHistory = scheduledTurn;
      scheduledTurn = null;
      runSuggestion(() => session!.suggestTurn(), { kind: 'turn', turn: turnForHistory });
    }, debounceMs);
  }

  function didTurnChange(snapshot: DeckTrackerSnapshot): boolean {
    return (
      previousSnapshot !== null &&
      typeof snapshot.turn === 'number' &&
      typeof previousSnapshot.turn === 'number' &&
      snapshot.turn !== previousSnapshot.turn
    );
  }

  function abortStaleTurnWork(snapshot: DeckTrackerSnapshot): void {
    if (didTurnChange(snapshot)) {
      abortInFlight({ markStale: true });
    }
  }

  function handleStateChange(event: DeckTrackerEvent): void {
    const { snapshot } = event;
    abortStaleTurnWork(snapshot);

    const lethalAlert = formatLethalAlert(snapshot);
    const lethalFingerprint =
      lethalAlert !== null ? `${lethalAlert.detail}` : null;

    if (lethalFingerprint !== lastLethalFingerprint) {
      lastLethalFingerprint = lethalFingerprint;
      if (lethalAlert !== null) {
        const alerts = [...currentAlerts, lethalAlert];
        emitState({
          status: 'ready',
          suggestion: currentSuggestion,
          alerts,
          error: null,
        });
      }
    }

    maybeSuggestMulligan(snapshot);
    maybeSuggestTurn(snapshot);
    previousSnapshot = snapshot;
  }

  function handleMatchStarted(event: DeckTrackerEvent): void {
    abortInFlight({ forceSessionAbort: true });
    session = createSession(event.snapshot);
    history = [];
    mulliganSuggested = false;
    suggestedTurn = null;
    scheduledTurn = null;
    currentSuggestion = null;
    currentAlerts = [];
    lastLethalFingerprint = null;
    previousSnapshot = event.snapshot;
    maybeSuggestMulligan(event.snapshot);
  }

  function handleMatchEnded(event: DeckTrackerEvent): void {
    abortInFlight({ forceSessionAbort: true });
    session = null;
    mulliganSuggested = false;
    suggestedTurn = null;
    scheduledTurn = null;
    currentSuggestion = null;
    currentAlerts = [];
    lastLethalFingerprint = null;
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
      abortInFlight({ forceSessionAbort: true });
      disposed = true;
      for (const dispose of disposers) dispose();
    },
    abortInFlight: () => abortInFlight({ forceSessionAbort: true }),
    async ask(question: string, emitChunk?: (chunk: string) => void): Promise<string> {
      if (session?.ask === undefined) {
        throw new Error('Advisor session does not support follow-up questions');
      }
      const answer = await session.ask(question);
      emitChunk?.(answer);
      recordFollowUp(question, answer);
      return answer;
    },
    getHistory: cloneHistory,
  };
}
