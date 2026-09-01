export interface DisguiseCardMetadata {
  mechanics?: readonly string[];
}

export function isDisguised(metadata: DisguiseCardMetadata | null | undefined): boolean {
  return hasToken(metadata?.mechanics, 'DISGUISED');
}

function hasToken(values: readonly string[] | undefined, token: string): boolean {
  const expected = token.trim().toUpperCase();
  return (values ?? []).some((value) => value.trim().toUpperCase() === expected);
}
