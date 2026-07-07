import { describe, expect, it } from 'vitest';
import type { AdvisorConfig } from '@hdt/advisor';

import { createAdvisorModel } from './advisor-model';

function config(overrides: Partial<AdvisorConfig> = {}): AdvisorConfig {
  return {
    enabled: true,
    autoSuggest: true,
    provider: 'openai',
    model: 'gpt-4o',
    language: 'en',
    apiKeyRef: 'provider:openai',
    ...overrides,
  };
}

describe('createAdvisorModel', () => {
  it('returns null when model name is empty', () => {
    const result = createAdvisorModel(
      config({ model: '' }),
      () => 'sk-test',
    );
    expect(result).toBeNull();
  });

  it('returns null when API key is missing for a built-in provider', () => {
    const result = createAdvisorModel(
      config({ apiKeyRef: 'provider:openai' }),
      () => null,
    );
    expect(result).toBeNull();
  });

  it('returns null when apiKeyRef is not set for a built-in provider', () => {
    const c = config();
    delete c.apiKeyRef;
    const result = createAdvisorModel(c, () => 'sk-test');
    expect(result).toBeNull();
  });

  it('creates a model handle for the openai provider', () => {
    const result = createAdvisorModel(
      config({ provider: 'openai', model: 'gpt-4o' }),
      () => 'sk-test',
    );
    expect(result).not.toBeNull();
    expect(result!.model.id).toBe('gpt-4o');
    expect(result!.model.provider).toBe('openai');
    expect(typeof result!.streamFn).toBe('function');
  });

  it('creates a model handle for the anthropic provider', () => {
    const result = createAdvisorModel(
      config({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' }),
      () => 'sk-ant',
    );
    expect(result).not.toBeNull();
    expect(result!.model.provider).toBe('anthropic');
    expect(typeof result!.streamFn).toBe('function');
  });

  it('creates a model handle for the google provider', () => {
    const result = createAdvisorModel(
      config({ provider: 'google', model: 'gemini-2.0-flash' }),
      () => 'sk-google',
    );
    expect(result).not.toBeNull();
    expect(result!.model.provider).toBe('google');
    expect(typeof result!.streamFn).toBe('function');
  });

  it('creates a model handle for openai-compatible with baseURL and no API key', () => {
    const c = config({
      provider: 'openai-compatible',
      model: 'llama3',
      baseURL: 'http://localhost:11434/v1',
    });
    delete c.apiKeyRef;
    const result = createAdvisorModel(c, () => null);
    expect(result).not.toBeNull();
    expect(result!.model.id).toBe('llama3');
    expect(result!.model.provider).toBe('openai-compatible');
    expect(result!.model.baseUrl).toBe('http://localhost:11434/v1');
    expect(typeof result!.streamFn).toBe('function');
  });

  it('returns null for openai-compatible without baseURL', () => {
    const c = config({
      provider: 'openai-compatible',
      model: 'llama3',
    });
    delete c.baseURL;
    const result = createAdvisorModel(c, () => null);
    expect(result).toBeNull();
  });

  it('creates a model handle for openai-compatible with API key', () => {
    const result = createAdvisorModel(
      config({
        provider: 'openai-compatible',
        model: 'qwen',
        baseURL: 'http://localhost:8080/v1',
        apiKeyRef: 'provider:openai-compatible',
      }),
      (ref) => (ref === 'provider:openai-compatible' ? 'sk-local' : null),
    );
    expect(result).not.toBeNull();
    expect(result!.model.id).toBe('qwen');
    expect(result!.model.baseUrl).toBe('http://localhost:8080/v1');
  });

  it('constructs a custom model when the model name is not in the built-in catalog', () => {
    const result = createAdvisorModel(
      config({ provider: 'openai', model: 'my-custom-finetune' }),
      () => 'sk-test',
    );
    expect(result).not.toBeNull();
    expect(result!.model.id).toBe('my-custom-finetune');
    expect(result!.model.provider).toBe('openai');
    expect(typeof result!.streamFn).toBe('function');
  });
});
