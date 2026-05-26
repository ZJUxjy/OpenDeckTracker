import {
  PopularDeckProviderError,
  type PopularDeckProvider,
} from './provider-types';

export function createHsguruProvider(): PopularDeckProvider {
  return {
    id: 'hsguru',
    label: 'HSGuru',
    defaultEnabled: true,
    getStatus: () => ({ status: 'supported' }),
    async sync() {
      throw new PopularDeckProviderError(
        'provider-unavailable',
        'HSGuru provider scaffold was called before the provider extraction task',
      );
    },
  };
}
