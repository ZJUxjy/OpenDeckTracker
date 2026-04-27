export const CREATE_GAME_RE = /^CREATE_GAME\b/;
export const FULL_ENTITY_RE = /^FULL_ENTITY\s+-\s+Creating ID=(\d+)(?:\s+CardID=([A-Za-z0-9_]*))?/;
export const SHOW_ENTITY_RE = /^SHOW_ENTITY\s+-\s+Updating Entity=(.+?)\s+CardID=([A-Za-z0-9_]*)/;
export const HIDE_ENTITY_RE = /^HIDE_ENTITY\s+-\s+Entity=(.+?)(?:\s|$)/;
export const CHANGE_ENTITY_RE = /^CHANGE_ENTITY\s+-\s+Updating Entity=(.+?)\s+CardID=([A-Za-z0-9_]*)/;
// Trailing \s* before $ tolerates trailing whitespace in log lines.
export const TAG_CHANGE_RE = /^TAG_CHANGE\s+Entity=(.+?)\s+tag=([A-Za-z0-9_]+)\s+value=([^\s]+)\s*$/;
export const BLOCK_START_RE = /^BLOCK_START\s+BlockType=([A-Za-z0-9_]+)\s+Entity=(.*?)\s+EffectCardId=([A-Za-z0-9_]*)\s+Target=(.*?)\s+SubOption=(-?\d+)/;
export const BLOCK_END_RE = /^BLOCK_END\b/;
export const SHUFFLE_DECK_RE = /^SHUFFLE_DECK(?:\s+PlayerID=(\d+))?/;
