import type { MatchResult } from '../stats/match-history';
import type { Zone } from '../game/types';

export type MatchRecordingStatus = 'in-progress' | 'completed' | 'incomplete';

export interface RecordedCardRef {
  entityId: number;
  cardId: string;
  controllerId: number;
}

export interface RecordedDeckCard {
  cardId: string;
  count: number;
}

export interface RecordedEntityState {
  entityId: number;
  controllerId: number;
  zone: Zone;
  hidden: boolean;
  cardId?: string;
}

export interface MatchRecordingMetadata {
  deckId: number | null;
  deckName: string | null;
  opponentName: string | null;
  result: MatchResult;
  gameType: number | null;
  formatType: number | null;
  missionId: number | null;
}

export interface MatchRecordingInitialState {
  originalDeck: RecordedDeckCard[];
  startingHand: RecordedCardRef[];
  postMulliganHand: RecordedCardRef[];
}

export interface RawEventRef {
  index: number;
  type: string;
}

export interface BaseTimelineEvent {
  kind:
    | 'game-started'
    | 'starting-hand'
    | 'post-mulligan-hand'
    | 'turn-start'
    | 'draw'
    | 'play-card'
    | 'opponent-reveal'
    | 'shuffle-deck'
    | 'game-completed';
  sourceEventIndex: number;
}

export interface DrawTimelineEvent extends BaseTimelineEvent {
  kind: 'draw';
  entityId: number;
  cardId: string;
  controllerId: number;
}

export interface PlayCardTimelineEvent extends BaseTimelineEvent {
  kind: 'play-card';
  entityId: number;
  cardId: string;
  controllerId: number;
  targetEntityId: number | null;
}

export interface OpponentRevealTimelineEvent extends BaseTimelineEvent {
  kind: 'opponent-reveal';
  entityId: number;
  cardId: string;
  controllerId: number;
}

export interface ShuffleDeckTimelineEvent extends BaseTimelineEvent {
  kind: 'shuffle-deck';
  playerId: number | null;
}

export interface TurnStartTimelineEvent extends BaseTimelineEvent {
  kind: 'turn-start';
  turnNumber: number | null;
  controllerId: number | null;
}

export interface SimpleTimelineEvent extends BaseTimelineEvent {
  kind: 'game-started' | 'starting-hand' | 'post-mulligan-hand' | 'game-completed';
}

export type MatchTimelineEvent =
  | DrawTimelineEvent
  | PlayCardTimelineEvent
  | OpponentRevealTimelineEvent
  | ShuffleDeckTimelineEvent
  | TurnStartTimelineEvent
  | SimpleTimelineEvent;

export interface MatchRecordingSummary {
  recordingId: string;
  status: MatchRecordingStatus;
  startedAt: number;
  endedAt: number | null;
  deckId: number | null;
  deckName: string | null;
  opponentName: string | null;
  result: MatchResult;
  timelineEventCount: number;
}

export interface MatchRecording {
  recordingId: string;
  status: MatchRecordingStatus;
  startedAt: number;
  endedAt: number | null;
  metadata: MatchRecordingMetadata;
  initialState: MatchRecordingInitialState;
  finalSummary: MatchRecordingSummary | null;
  timeline: MatchTimelineEvent[];
  rawEventRefs: RawEventRef[];
  entities: RecordedEntityState[];
}

export interface MatchRecordingDetail extends MatchRecording {
  rawEvents: unknown[];
}

export function createEmptyMatchRecording(args: {
  recordingId: string;
  startedAt: number;
}): MatchRecording {
  return {
    recordingId: args.recordingId,
    status: 'in-progress',
    startedAt: args.startedAt,
    endedAt: null,
    metadata: {
      deckId: null,
      deckName: null,
      opponentName: null,
      result: 'unknown',
      gameType: null,
      formatType: null,
      missionId: null,
    },
    initialState: {
      originalDeck: [],
      startingHand: [],
      postMulliganHand: [],
    },
    finalSummary: null,
    timeline: [],
    rawEventRefs: [],
    entities: [],
  };
}

export function buildMatchRecordingSummary(recording: MatchRecording): MatchRecordingSummary {
  return {
    recordingId: recording.recordingId,
    status: recording.status,
    startedAt: recording.startedAt,
    endedAt: recording.endedAt,
    deckId: recording.metadata.deckId,
    deckName: recording.metadata.deckName,
    opponentName: recording.metadata.opponentName,
    result: recording.metadata.result,
    timelineEventCount: recording.timeline.length,
  };
}
