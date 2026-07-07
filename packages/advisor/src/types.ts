export type SuggestedActionKind =
  | 'play'
  | 'attack'
  | 'heroPower'
  | 'trade'
  | 'hold'
  | 'endTurn';

export interface SuggestedAction {
  kind: SuggestedActionKind;
  cardId?: string;
  targetCardId?: string;
  note: string;
}

export type AdvisorAlertType = 'lethal' | 'danger';

export interface AdvisorAlert {
  type: AdvisorAlertType;
  detail: string;
}

export interface AdvisorSuggestion {
  actions: SuggestedAction[];
  reasoning: string;
  alerts: AdvisorAlert[];
}

export type AdvisorProvider = 'openai' | 'anthropic' | 'google' | 'openai-compatible';

export type AdvisorLanguage = 'zh' | 'en';

export interface AdvisorConfig {
  enabled: boolean;
  autoSuggest: boolean;
  provider: AdvisorProvider;
  model: string;
  baseURL?: string;
  apiKeyRef?: string;
  language: AdvisorLanguage;
  maxToolRounds?: number;
}
