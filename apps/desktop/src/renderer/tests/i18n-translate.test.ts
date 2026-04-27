import { describe, expect, it } from 'vitest';
import { translate, type MessagesByLocale } from '../src/i18n';

const messages: MessagesByLocale = {
  'en-US': {
    settings: {
      title: 'Settings',
    },
    deck: {
      extraCards: '+{count} extra cards',
    },
    fallbackOnly: 'English fallback',
  },
  'zh-CN': {
    settings: {
      title: '设置',
    },
    deck: {
      extraCards: '+{count} 张额外卡牌',
    },
  },
};

describe('translate', () => {
  it('resolves keys in the active locale', () => {
    expect(translate(messages, 'zh-CN', 'settings.title')).toBe('设置');
  });

  it('falls back to English when the active locale misses a key', () => {
    expect(translate(messages, 'zh-CN', 'fallbackOnly')).toBe('English fallback');
  });

  it('returns the key when no dictionary contains it', () => {
    expect(translate(messages, 'zh-CN', 'missing.key')).toBe('missing.key');
  });

  it('interpolates named values', () => {
    expect(translate(messages, 'en-US', 'deck.extraCards', { count: 2 })).toBe(
      '+2 extra cards',
    );
  });
});
