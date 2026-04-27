import { describe, expect, it } from 'vitest';
import { parseLoadingScreenLine } from '../parsers/loading-screen-parser';

describe('parseLoadingScreenLine', () => {
  it('parses game scene start and end lines', () => {
    expect(
      parseLoadingScreenLine(
        'D 00:00:00.0000000 LoadingScreen - Start loading GamePlay scene',
      ),
    ).toMatchObject({ type: 'game-scene-started' });
    expect(
      parseLoadingScreenLine(
        'D 00:00:10.0000000 LoadingScreen - End unloading GamePlay scene',
      ),
    ).toMatchObject({ type: 'game-scene-ended' });
  });
});
