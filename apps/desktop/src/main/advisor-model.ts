import {
  type Api,
  type ApiKeyCredential,
  type AssistantMessageEventStream,
  type AuthResult,
  type Context,
  type Credential,
  type CredentialStore,
  type Model,
  type SimpleStreamOptions,
  createModels,
  createProvider,
} from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import type { Provider } from '@earendil-works/pi-ai';
import type { AdvisorConfig, AdvisorProvider } from '@hdt/advisor';

export interface AdvisorModelHandle {
  model: Model<any>;
  streamFn: (
    model: Model<any>,
    context: Context,
    options?: SimpleStreamOptions,
  ) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;
}

type ProviderFactory = () => Provider;

const BUILTIN_PROVIDER_FACTORIES: Partial<Record<AdvisorProvider, ProviderFactory>> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
};

const BUILTIN_PROVIDER_IDS: Partial<Record<AdvisorProvider, string>> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
};

/**
 * Build a pi-ai `Model` + `streamFn` from an `AdvisorConfig`.
 *
 * Returns `null` when the config is incomplete (no model name, no API key
 * for non-local providers). The caller should treat `null` as "advisor
 * stays dormant".
 *
 * @param config  The advisor configuration.
 * @param resolveApiKey  Callback that resolves an `apiKeyRef` to the actual
 *   secret string (or `null` if not found). In production this reads from
 *   the advisor config store's secrets.
 */
export function createAdvisorModel(
  config: AdvisorConfig,
  resolveApiKey: (ref: string) => string | null,
): AdvisorModelHandle | null {
  if (config.model.trim().length === 0) return null;

  const apiKey = config.apiKeyRef ? resolveApiKey(config.apiKeyRef) : null;

  if (config.provider === 'openai-compatible') {
    return createOpenAICompatibleModel(config, apiKey);
  }

  const factory = BUILTIN_PROVIDER_FACTORIES[config.provider];
  const providerId = BUILTIN_PROVIDER_IDS[config.provider];
  if (!factory || !providerId) return null;

  if (!apiKey) return null;

  const credentialStore = new StaticCredentialStore(providerId, {
    key: apiKey,
  });
  const models = createModels({ credentials: credentialStore });
  models.setProvider(factory());

  const model = models.getModel(providerId, config.model);
  if (model) {
    return { model, streamFn: models.streamSimple.bind(models) };
  }

  // The model name from config isn't in the built-in catalog — construct
  // a minimal Model object that uses the provider's baseUrl and api.
  const provider = models.getProvider(providerId);
  if (!provider) return null;

  const builtinModels = provider.getModels();
  const template = builtinModels[0];
  const customModel: Model<any> = {
    id: config.model,
    name: config.model,
    api: template?.api ?? 'openai-completions',
    provider: providerId,
    baseUrl: template?.baseUrl ?? '',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  };

  return { model: customModel, streamFn: models.streamSimple.bind(models) };
}

function createOpenAICompatibleModel(
  config: AdvisorConfig,
  apiKey: string | null,
): AdvisorModelHandle | null {
  const baseURL = config.baseURL?.trim();
  if (!baseURL) return null;

  const providerId = 'openai-compatible';
  const credentialStore = apiKey
    ? new StaticCredentialStore(providerId, { key: apiKey })
    : undefined;
  const models = createModels(
    credentialStore ? { credentials: credentialStore } : undefined,
  );

  const provider = createProvider({
    id: providerId,
    name: 'OpenAI Compatible',
    baseUrl: baseURL,
    auth: {
      apiKey: {
        name: 'API Key',
        resolve: async ({ model }): Promise<AuthResult | undefined> => {
          const header = model.headers?.['Authorization'];
          if (header) {
            return {
              auth: { headers: { Authorization: header } },
              source: 'config',
            };
          }
          if (!apiKey) return undefined;
          return {
            auth: { headers: { Authorization: `Bearer ${apiKey}` } },
            source: 'config',
          };
        },
      },
    },
    models: [
      {
        id: config.model,
        name: config.model,
        api: 'openai-completions' as Api,
        provider: providerId,
        baseUrl: baseURL,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
      },
    ],
    api: openAICompletionsApi(),
  });

  models.setProvider(provider);

  const model = models.getModel(providerId, config.model);
  if (!model) return null;

  return { model, streamFn: models.streamSimple.bind(models) };
}

/**
 * Minimal `CredentialStore` that always returns a fixed API key credential
 * for a single provider. Used to inject the advisor config's API key into
 * pi-ai's auth resolution without a persistent store.
 */
class StaticCredentialStore implements CredentialStore {
  private readonly providerId: string;
  private readonly credential: ApiKeyCredential;

  constructor(providerId: string, credential: { key: string }) {
    this.providerId = providerId;
    this.credential = { type: 'api_key', key: credential.key };
  }

  read(providerId: string): Promise<Credential | undefined> {
    if (providerId === this.providerId) {
      return Promise.resolve(this.credential as Credential);
    }
    return Promise.resolve(undefined);
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    if (providerId === this.providerId) {
      return fn(this.credential as Credential);
    }
    return fn(undefined);
  }

  delete(providerId: string): Promise<void> {
    void providerId;
    return Promise.resolve();
  }
}
