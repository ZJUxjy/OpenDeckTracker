import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createAdvisorConfigStore,
  defaultAdvisorConfigPath,
  isAdvisorConfigured,
} from './advisor-config-store';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hdt-advisor-config-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('advisor config store', () => {
  it('returns disabled defaults when no config file exists', () => {
    const store = createAdvisorConfigStore(join(dir, 'advisor', 'config.json'));

    expect(store.get()).toEqual({
      enabled: false,
      autoSuggest: true,
      provider: 'openai',
      model: '',
      language: 'zh',
    });
  });

  it('persists normalized config across store instances', () => {
    const filePath = join(dir, 'advisor', 'config.json');
    const first = createAdvisorConfigStore(filePath);

    first.set({
      enabled: true,
      autoSuggest: false,
      provider: 'anthropic',
      model: 'claude-test',
      language: 'en',
      baseURL: '   ',
      maxToolRounds: 4.8,
    });

    const second = createAdvisorConfigStore(filePath);
    expect(second.get()).toEqual({
      enabled: true,
      autoSuggest: false,
      provider: 'anthropic',
      model: 'claude-test',
      language: 'en',
      maxToolRounds: 4,
    });
  });

  it('stores API keys locally and exposes only an apiKeyRef through config', () => {
    const filePath = join(dir, 'advisor', 'config.json');
    const store = createAdvisorConfigStore(filePath);

    const ref = store.setApiKey('openai', 'sk-local');

    expect(ref).toBe('provider:openai');
    expect(store.get()).toEqual(
      expect.objectContaining({
        provider: 'openai',
        apiKeyRef: 'provider:openai',
      }),
    );
    expect(store.getApiKey(ref)).toBe('sk-local');
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as {
      config: Record<string, unknown>;
      secrets: Record<string, string>;
    };
    expect(raw.config['apiKey']).toBeUndefined();
    expect(raw.secrets['provider:openai']).toBe('sk-local');
  });

  it('detects whether advisor can run without affecting the tracker when unconfigured', () => {
    expect(
      isAdvisorConfigured(
        { enabled: false, autoSuggest: true, provider: 'openai', model: 'gpt', language: 'zh' },
        () => 'sk',
      ),
    ).toBe(false);
    expect(
      isAdvisorConfigured(
        { enabled: true, autoSuggest: true, provider: 'openai', model: '', language: 'zh' },
        () => 'sk',
      ),
    ).toBe(false);
    expect(
      isAdvisorConfigured(
        {
          enabled: true,
          autoSuggest: true,
          provider: 'openai',
          model: 'gpt',
          language: 'zh',
          apiKeyRef: 'provider:openai',
        },
        () => null,
      ),
    ).toBe(false);
    expect(
      isAdvisorConfigured(
        {
          enabled: true,
          autoSuggest: true,
          provider: 'openai',
          model: 'gpt',
          language: 'zh',
          apiKeyRef: 'provider:openai',
        },
        () => 'sk',
      ),
    ).toBe(true);
    expect(
      isAdvisorConfigured(
        {
          enabled: true,
          autoSuggest: true,
          provider: 'openai-compatible',
          model: 'local-model',
          baseURL: 'http://localhost:11434/v1',
          language: 'zh',
        },
        () => null,
      ),
    ).toBe(true);
  });

  it('builds the default userData path under the advisor directory', () => {
    expect(defaultAdvisorConfigPath('C:\\Users\\me\\AppData\\OpenDeckTracker')).toBe(
      join('C:\\Users\\me\\AppData\\OpenDeckTracker', 'advisor', 'config.json'),
    );
  });
});
