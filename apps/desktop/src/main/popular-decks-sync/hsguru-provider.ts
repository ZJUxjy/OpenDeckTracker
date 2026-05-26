import type { PopularDeck } from '@hdt/core';
import {
  ARCHETYPE_DELAY_MS,
  fetchHsguruArchetypeVariants,
  fetchHsguruMeta,
} from './fetcher';
import { parseDeckVariants, parseLegendArchetypes } from './parser';
import { transformVariant } from './transformer';
import {
  PopularDeckProviderError,
  type PopularDeckProvider,
  type PopularDeckProviderContext,
  type PopularDeckProviderResult,
} from './provider-types';

export function createHsguruProvider(): PopularDeckProvider {
  return {
    id: 'hsguru',
    label: 'HSGuru',
    defaultEnabled: true,
    getStatus: () => ({ status: 'supported' }),
    sync: syncHsguru,
  };
}

async function syncHsguru(
  ctx: PopularDeckProviderContext,
): Promise<PopularDeckProviderResult> {
  console.log('[popular-decks-sync] provider hsguru start', { fetchedAt: ctx.fetchedAt });

  ctx.progressCb({ phase: 'meta', completed: 0, total: 1 });
  let metaHtml: string;
  const metaStart = Date.now();
  try {
    metaHtml = await fetchHsguruMeta({ fetchImpl: ctx.fetchImpl, delay: ctx.delay }, ctx.signal);
  } catch (e) {
    console.error('[popular-decks-sync] hsguru meta fetch failed', {
      elapsedMs: Date.now() - metaStart,
      name: (e as Error)?.name,
      message: (e as Error)?.message,
    });
    throw toProviderError(e, 'network-failed');
  }

  console.log('[popular-decks-sync] hsguru meta fetched', {
    elapsedMs: Date.now() - metaStart,
    bytes: metaHtml.length,
  });

  const archetypes = parseLegendArchetypes(metaHtml, ctx.archetypeLimit);
  if (archetypes.length === 0) {
    console.warn('[popular-decks-sync] hsguru meta parse yielded 0 archetypes');
    throw new PopularDeckProviderError('parse-failed', 'HSGuru meta page yielded no archetypes');
  }
  ctx.progressCb({ phase: 'meta', completed: 1, total: 1 });

  const variantsByArchetype: Array<{
    archetype: typeof archetypes[number];
    variants: ReturnType<typeof parseDeckVariants>;
  }> = [];

  for (let i = 0; i < archetypes.length; i++) {
    if (ctx.signal.aborted) {
      throw new PopularDeckProviderError('aborted', 'HSGuru sync was aborted');
    }
    const archetype = archetypes[i]!;
    ctx.progressCb({
      phase: 'variants',
      completed: i,
      total: archetypes.length,
      currentLabel: archetype.archetype,
    });

    let result: { html: string; url: string } | null;
    const variantStart = Date.now();
    try {
      result = await fetchHsguruArchetypeVariants(
        archetype.archetype,
        { fetchImpl: ctx.fetchImpl, delay: ctx.delay },
        ctx.signal,
      );
    } catch (e) {
      console.error('[popular-decks-sync] hsguru variants fetch failed', {
        archetype: archetype.archetype,
        elapsedMs: Date.now() - variantStart,
        name: (e as Error)?.name,
        message: (e as Error)?.message,
      });
      throw toProviderError(e, 'network-failed');
    }

    const variants = result ? parseDeckVariants(result.html, ctx.variantLimit) : [];
    console.log(
      `[popular-decks-sync] hsguru variants ${i + 1}/${archetypes.length} ${archetype.archetype}: ${variants.length} decks (${Date.now() - variantStart}ms)`,
    );
    variantsByArchetype.push({ archetype, variants });
    if (i < archetypes.length - 1) await ctx.delay(ARCHETYPE_DELAY_MS);
  }

  ctx.progressCb({
    phase: 'variants',
    completed: archetypes.length,
    total: archetypes.length,
  });

  const decks: PopularDeck[] = [];
  const totalVariants = variantsByArchetype.reduce((sum, entry) => sum + entry.variants.length, 0);
  let processed = 0;
  ctx.progressCb({ phase: 'transform', completed: 0, total: Math.max(totalVariants, 1) });
  for (const { archetype, variants } of variantsByArchetype) {
    for (const variant of variants) {
      const deck = transformVariant(archetype, variant, ctx.fetchedAt, {
        findByDbfId: ctx.findByDbfId,
      });
      if (deck) decks.push(deck);
      processed++;
      ctx.progressCb({
        phase: 'transform',
        completed: processed,
        total: Math.max(totalVariants, 1),
        currentLabel: archetype.archetype,
      });
    }
  }

  console.log(
    `[popular-decks-sync] hsguru transform: ${decks.length} valid decks (skipped ${totalVariants - decks.length})`,
  );
  if (decks.length === 0) {
    throw new PopularDeckProviderError('parse-failed', 'HSGuru variants yielded no valid decks');
  }

  return {
    decks,
    source: {
      id: 'hsguru',
      label: 'HSGuru',
      enabled: true,
      status: 'ok',
      fetchedAt: ctx.fetchedAt,
      deckCount: decks.length,
    },
  };
}

function toProviderError(e: unknown, fallback: string): PopularDeckProviderError {
  const err = e as { name?: string; message?: string } | null;
  if (err?.name === 'AbortError' || err?.message === 'aborted') {
    return new PopularDeckProviderError('aborted', 'HSGuru sync was aborted');
  }
  return new PopularDeckProviderError(fallback, err?.message ?? fallback);
}
