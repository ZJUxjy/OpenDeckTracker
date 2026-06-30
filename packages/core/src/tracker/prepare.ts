export const PREPARE_COUNTER_KEY = 'prepareCountThisGame';

export interface PrepareCardMetadata {
  mechanics?: readonly string[];
  referencedTags?: readonly string[];
}

export function isPrepareCaster(metadata: PrepareCardMetadata | null | undefined): boolean {
  return hasToken(metadata?.mechanics, 'PREPARE');
}

export function isPreparePayoff(metadata: PrepareCardMetadata | null | undefined): boolean {
  return hasToken(metadata?.referencedTags, 'PREPARE') && !isPrepareCaster(metadata);
}

export function isPrepareRelatedCard(metadata: PrepareCardMetadata | null | undefined): boolean {
  return isPrepareCaster(metadata) || hasToken(metadata?.referencedTags, 'PREPARE');
}

function hasToken(values: readonly string[] | undefined, token: string): boolean {
  const expected = token.trim().toUpperCase();
  return (values ?? []).some((value) => value.trim().toUpperCase() === expected);
}
