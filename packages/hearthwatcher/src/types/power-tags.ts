import type { Zone } from '@hdt/core';

export type PowerTagValue = string | number | boolean;
export type PowerTagMap = Record<string, PowerTagValue>;

export function normalizePowerTagName(tag: string): string {
  return tag.trim().toUpperCase();
}

export function parsePowerTagValue(value: string): PowerTagValue {
  const trimmed = value.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'True') return true;
  if (trimmed === 'False') return false;
  return trimmed;
}

export function zoneFromTagValue(value: PowerTagValue | undefined): Zone {
  if (value === 0 || value === 'INVALID') return 'INVALID';
  if (value === 1 || value === 'PLAY') return 'PLAY';
  if (value === 2 || value === 'DECK') return 'DECK';
  if (value === 3 || value === 'HAND') return 'HAND';
  if (value === 4 || value === 'GRAVEYARD') return 'GRAVEYARD';
  if (value === 5 || value === 'REMOVEDFROMGAME') return 'REMOVEDFROMGAME';
  if (value === 6 || value === 'SETASIDE') return 'SETASIDE';
  if (value === 7 || value === 'SECRET') return 'SECRET';
  return 'INVALID';
}
