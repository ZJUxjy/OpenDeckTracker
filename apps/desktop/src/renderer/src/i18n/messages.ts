import type { AppLocale } from './locale';

export type MessageValue = string | MessageTree;
export interface MessageTree {
  readonly [key: string]: MessageValue;
}

export type MessagesByLocale = Record<AppLocale, MessageTree>;
export type InterpolationValues = Record<string, string | number | boolean>;

const FALLBACK_LOCALE: AppLocale = 'en-US';

export function translate(
  messages: MessagesByLocale,
  locale: AppLocale,
  key: string,
  values: InterpolationValues = {},
): string {
  const localized = resolveMessage(messages[locale], key);
  const fallback = resolveMessage(messages[FALLBACK_LOCALE], key);
  return interpolate(localized ?? fallback ?? key, values);
}

function resolveMessage(tree: MessageTree, key: string): string | null {
  let current: MessageValue | undefined = tree;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return null;
    }
    current = current[part];
  }
  return typeof current === 'string' ? current : null;
}

function interpolate(message: string, values: InterpolationValues): string {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}
