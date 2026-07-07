import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AdvisorConfig, AdvisorLanguage, AdvisorProvider } from '@hdt/advisor';

export const DEFAULT_ADVISOR_CONFIG: AdvisorConfig = {
  enabled: false,
  autoSuggest: true,
  provider: 'openai',
  model: '',
  language: 'zh',
};

const ADVISOR_PROVIDERS = new Set<AdvisorProvider>([
  'openai',
  'anthropic',
  'google',
  'openai-compatible',
]);
const ADVISOR_LANGUAGES = new Set<AdvisorLanguage>(['zh', 'en']);

interface AdvisorConfigFile {
  schemaVersion: 1;
  config: Partial<AdvisorConfig>;
  secrets: Record<string, string>;
}

export interface AdvisorConfigStore {
  get(): AdvisorConfig;
  set(config: AdvisorConfig): AdvisorConfig;
  setApiKey(provider: AdvisorProvider, apiKey: string): string;
  getApiKey(ref: string | undefined): string | null;
  isConfigured(config?: AdvisorConfig): boolean;
}

export function defaultAdvisorConfigPath(userDataPath: string): string {
  return join(userDataPath, 'advisor', 'config.json');
}

export function isAdvisorConfigured(
  config: AdvisorConfig,
  resolveApiKey: (ref: string) => string | null,
): boolean {
  if (!config.enabled) return false;
  if (config.model.trim().length === 0) return false;
  if (config.provider === 'openai-compatible' && config.baseURL?.trim()) {
    return true;
  }
  if (!config.apiKeyRef) return false;
  return (resolveApiKey(config.apiKeyRef)?.trim().length ?? 0) > 0;
}

export function createAdvisorConfigStore(filePath: string): AdvisorConfigStore {
  let file = readConfigFile(filePath);

  function persist(): void {
    mkdirSync(dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    renameSync(tmpPath, filePath);
  }

  return {
    get() {
      return normalizeAdvisorConfig(file.config);
    },
    set(config) {
      const normalized = normalizeAdvisorConfig(config);
      file = { ...file, config: normalized };
      persist();
      return normalized;
    },
    setApiKey(provider, apiKey) {
      const ref = `provider:${provider}`;
      const trimmed = apiKey.trim();
      if (trimmed.length > 0) {
        file.secrets = { ...file.secrets, [ref]: trimmed };
      } else {
        const { [ref]: _removed, ...rest } = file.secrets;
        file.secrets = rest;
      }
      const nextInput = { ...file.config, provider };
      if (trimmed.length > 0) {
        nextInput.apiKeyRef = ref;
      } else {
        delete nextInput.apiKeyRef;
      }
      const next = normalizeAdvisorConfig(nextInput);
      file = { ...file, config: next };
      persist();
      return ref;
    },
    getApiKey(ref) {
      if (!ref) return null;
      return file.secrets[ref] ?? null;
    },
    isConfigured(config = normalizeAdvisorConfig(file.config)) {
      return isAdvisorConfigured(config, (ref) => file.secrets[ref] ?? null);
    },
  };
}

function readConfigFile(filePath: string): AdvisorConfigFile {
  if (!existsSync(filePath)) return emptyConfigFile();
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<AdvisorConfigFile>;
    return {
      schemaVersion: 1,
      config: isRecord(parsed.config) ? parsed.config : {},
      secrets: normalizeSecrets(parsed.secrets),
    };
  } catch {
    return emptyConfigFile();
  }
}

function emptyConfigFile(): AdvisorConfigFile {
  return { schemaVersion: 1, config: {}, secrets: {} };
}

function normalizeAdvisorConfig(input: Partial<AdvisorConfig>): AdvisorConfig {
  const provider = ADVISOR_PROVIDERS.has(input.provider as AdvisorProvider)
    ? (input.provider as AdvisorProvider)
    : DEFAULT_ADVISOR_CONFIG.provider;
  const language = ADVISOR_LANGUAGES.has(input.language as AdvisorLanguage)
    ? (input.language as AdvisorLanguage)
    : DEFAULT_ADVISOR_CONFIG.language;
  const config: AdvisorConfig = {
    enabled: input.enabled === true,
    autoSuggest: input.autoSuggest !== false,
    provider,
    model: normalizeString(input.model),
    language,
  };

  const baseURL = normalizeOptionalString(input.baseURL);
  if (baseURL !== undefined) config.baseURL = baseURL;
  const apiKeyRef = normalizeOptionalString(input.apiKeyRef);
  if (apiKeyRef !== undefined) config.apiKeyRef = apiKeyRef;
  const maxToolRounds = normalizePositiveInteger(input.maxToolRounds);
  if (maxToolRounds !== undefined) config.maxToolRounds = maxToolRounds;

  return config;
}

function normalizeSecrets(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, secret] of Object.entries(value)) {
    if (typeof secret === 'string' && secret.trim().length > 0) {
      result[key] = secret;
    }
  }
  return result;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return undefined;
  return Math.floor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
