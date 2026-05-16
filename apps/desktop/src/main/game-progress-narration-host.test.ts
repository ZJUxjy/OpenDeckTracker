import { describe, expect, it, vi } from 'vitest';
import type { GameProgressNarrationFrame } from '@hdt/core';
import { createGameProgressNarrationHost } from './game-progress-narration-host';

const frame = (sequence: number): GameProgressNarrationFrame => ({
  sequence,
  sourceEventIndex: sequence,
  eventKind: 'card-played',
  text: `frame ${sequence}`,
  facts: { sequence },
});

describe('createGameProgressNarrationHost', () => {
  it('appends frames and returns a defensive recent buffer copy', () => {
    const host = createGameProgressNarrationHost({ maxFrames: 10 });
    host.appendFrame(frame(1));

    const recent = host.getRecentFrames();
    recent.push(frame(2));

    expect(host.getRecentFrames()).toEqual([frame(1)]);
  });

  it('keeps only the bounded recent frames', () => {
    const host = createGameProgressNarrationHost({ maxFrames: 2 });
    host.appendFrame(frame(1));
    host.appendFrame(frame(2));
    host.appendFrame(frame(3));

    expect(host.getRecentFrames()).toEqual([frame(2), frame(3)]);
  });

  it('notifies subscribers in append order and supports unsubscribe', () => {
    const host = createGameProgressNarrationHost({ maxFrames: 10 });
    const listener = vi.fn();
    const unsubscribe = host.subscribe(listener);

    host.appendFrame(frame(1));
    host.appendFrame(frame(2));
    unsubscribe();
    host.appendFrame(frame(3));

    expect(listener).toHaveBeenNthCalledWith(1, frame(1));
    expect(listener).toHaveBeenNthCalledWith(2, frame(2));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('clears the live buffer for a new game', () => {
    const host = createGameProgressNarrationHost({ maxFrames: 10 });
    host.appendFrame(frame(1));

    host.clear();

    expect(host.getRecentFrames()).toEqual([]);
  });
});
