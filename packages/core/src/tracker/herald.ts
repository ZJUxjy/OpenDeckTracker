export const HERALD_COUNTER_KEY = 'heraldCountThisGame';

export type HeraldTriggerTiming = 'play' | 'trigger' | 'power';

export interface HeraldCardMetadata {
  type?: string;
  mechanics?: readonly string[];
  referencedTags?: readonly string[];
  text?: string;
}

export function isHeraldCaster(metadata: HeraldCardMetadata | null | undefined): boolean {
  return hasToken(metadata?.mechanics, 'HERALD');
}

export function isHeraldPayoff(metadata: HeraldCardMetadata | null | undefined): boolean {
  return hasToken(metadata?.referencedTags, 'HERALD');
}

export function isHeraldRelatedCard(metadata: HeraldCardMetadata | null | undefined): boolean {
  return isHeraldCaster(metadata) || isHeraldPayoff(metadata);
}

export function heraldTriggerTiming(
  metadata: HeraldCardMetadata | null | undefined,
): HeraldTriggerTiming | null {
  if (!isHeraldCaster(metadata)) return null;
  if (normalize(metadata?.type) === 'LOCATION') return 'power';

  const text = stripMarkup(metadata?.text ?? '');
  if (/\bDeathrattle\s*:\s*.*\bHerald\b/i.test(text) || /亡语[：:]\s*.*兆示/.test(text)) {
    return 'trigger';
  }

  return 'play';
}

export function heraldBlockTypeForTiming(timing: Exclude<HeraldTriggerTiming, 'play'>): 'TRIGGER' | 'POWER' {
  return timing === 'trigger' ? 'TRIGGER' : 'POWER';
}

function hasToken(values: readonly string[] | undefined, token: string): boolean {
  const expected = normalize(token);
  return (values ?? []).some((value) => normalize(value) === expected);
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function stripMarkup(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
