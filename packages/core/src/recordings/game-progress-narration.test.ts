import { describe, expect, it } from 'vitest';
import type { GameProgressAnalysisEvent } from './game-progress-analysis';
import { narrateGameProgressEvents } from './game-progress-narration';

const event = (overrides: Partial<GameProgressAnalysisEvent>): GameProgressAnalysisEvent => ({
  sequence: overrides.sequence ?? 0,
  kind: overrides.kind ?? 'card-played',
  actor: overrides.actor ?? 'local',
  sourceEventIndex: overrides.sourceEventIndex ?? 3,
  ...overrides,
});

describe('narrateGameProgressEvents', () => {
  it('uses localized card names for local card plays', () => {
    const [frame] = narrateGameProgressEvents([
      event({ cardId: 'MEND_300', entityId: 10, controllerId: 1 }),
    ], {
      resolveCardName: (cardId) => (cardId === 'MEND_300' ? '驯服宠物' : null),
    });

    expect(frame).toMatchObject({
      sequence: 0,
      sourceEventIndex: 3,
      eventKind: 'card-played',
      facts: {
        cardId: 'MEND_300',
        actor: 'local',
      },
    });
    expect(frame?.text).toContain('我方使用了驯服宠物');
  });

  it('uses localized card names for opponent card plays', () => {
    const [frame] = narrateGameProgressEvents([
      event({
        sequence: 2,
        actor: 'opponent',
        cardId: 'CORE_EX1_339',
        entityId: 30,
        controllerId: 2,
      }),
    ], {
      resolveCardName: (cardId) => (cardId === 'CORE_EX1_339' ? '心灵咒术师' : null),
    });

    expect(frame?.text).toContain('对手使用了心灵咒术师');
    expect(frame?.facts).toMatchObject({ cardId: 'CORE_EX1_339', actor: 'opponent' });
  });

  it('falls back to card IDs when no localized name exists', () => {
    const [frame] = narrateGameProgressEvents([
      event({ cardId: 'UNKNOWN_CARD' }),
    ], {
      resolveCardName: () => null,
    });

    expect(frame?.text).toContain('UNKNOWN_CARD');
  });

  it('uses generic text when an opponent card is hidden', () => {
    const [frame] = narrateGameProgressEvents([
      event({ kind: 'card-drawn', actor: 'opponent' }),
    ], {
      resolveCardName: () => 'SECRET_SHOULD_NOT_LEAK',
    });

    expect(frame?.text).toBe('对手抽了一张牌。');
    expect(frame?.text).not.toContain('SECRET_SHOULD_NOT_LEAK');
    expect(frame?.facts).not.toHaveProperty('cardId');
  });

  it('is deterministic for the same inputs and resolver', () => {
    const events = [
      event({ kind: 'turn-start', actor: 'game', turnNumber: 4 }),
      event({ sequence: 1, cardId: 'MEND_300' }),
    ];
    const options = { resolveCardName: (cardId: string) => (cardId === 'MEND_300' ? '驯服宠物' : null) };

    expect(narrateGameProgressEvents(events, options)).toEqual(
      narrateGameProgressEvents(events, options),
    );
  });
});
