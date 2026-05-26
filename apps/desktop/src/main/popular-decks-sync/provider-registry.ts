import { createHsguruProvider } from './hsguru-provider';
import {
  PopularDeckProviderError,
  type PopularDeckProvider,
  type PopularDeckSourceId,
} from './provider-types';

export interface UnsupportedProviderInit {
  id: Exclude<PopularDeckSourceId, 'hsguru'>;
  label: string;
  reason: string;
}

export function createUnsupportedProvider(init: UnsupportedProviderInit): PopularDeckProvider {
  return {
    id: init.id,
    label: init.label,
    defaultEnabled: false,
    getStatus: () => ({ status: 'unsupported', reason: init.reason }),
    async sync() {
      throw new PopularDeckProviderError(
        'unsupported',
        `${init.label} is not available for automatic popular deck sync`,
        init.reason,
      );
    },
  };
}

export function createPopularDeckProviders(): PopularDeckProvider[] {
  return [
    createHsguruProvider(),
    createUnsupportedProvider({
      id: 'hsreplay',
      label: 'HSReplay',
      reason: 'blocked-by-cloudflare',
    }),
    createUnsupportedProvider({
      id: 'lushi',
      label: 'Lushi',
      reason: 'no-public-deck-api-found',
    }),
  ];
}
