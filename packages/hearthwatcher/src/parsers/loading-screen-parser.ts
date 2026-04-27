import { parseLogLine, type LogLine } from '../log-line';
import type { LoadingScreenEvent } from '../types/loading-screen-events';

const GAME_SCENE_RE = /\b(?:GamePlay|Gameplay|Game|GAMEPLAY)\b/;
const START_RE = /\b(?:Start|Begin|Load|Enter|Loaded|Loading)\b/i;
const END_RE = /\b(?:End|Unload|Exit|Leave|Closed|Unloading)\b/i;

export function parseLoadingScreenLine(rawOrLine: string | LogLine): LoadingScreenEvent | null {
  const line = typeof rawOrLine === 'string' ? parseLogLine(rawOrLine) : rawOrLine;
  if (!GAME_SCENE_RE.test(line.content)) return null;

  const base = line.timestamp === undefined
    ? { raw: line.raw, content: line.content }
    : { raw: line.raw, content: line.content, timestamp: line.timestamp };
  if (START_RE.test(line.content)) {
    return { ...base, type: 'game-scene-started' };
  }
  if (END_RE.test(line.content)) {
    return { ...base, type: 'game-scene-ended' };
  }
  return null;
}
