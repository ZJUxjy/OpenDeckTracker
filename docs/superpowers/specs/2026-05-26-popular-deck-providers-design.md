# Popular Deck Providers Design

Date: 2026-05-26

## Summary

The popular deck sync pipeline should move from a single HSGuru-specific implementation to a provider-based architecture. HSGuru remains the only enabled automatic source. HSReplay and Lushi are represented as known providers with explicit unsupported statuses so the app can explain why they are not used for background sync.

This keeps the current feature stable while making future source additions smaller and safer.

## Research Findings

HSReplay has relevant deck content, but `https://hsreplay.net/decks/` currently responds with a Cloudflare JavaScript and cookie challenge when requested as a background HTTP client. That makes it unsuitable for unattended Electron main-process scraping without an official API, token, or documented export surface.

HSReplay robots metadata is available at `https://hsreplay.net/robots.txt`, but robots allowance is not enough to make the deck pages usable as an automated data source because the runtime challenge blocks direct fetches.

Lushi at `http://lushi.163.com/` is reachable, but the public site and its frontend bundles appear to be focused on product download and marketing content. No stable public popular-deck API was found in the public page assets. The implementation should not depend on private or reverse-engineered app endpoints.

## Goals

- Keep existing HSGuru sync behavior working.
- Introduce a provider abstraction for popular deck sources.
- Record provider-level status and diagnostics in synced snapshots.
- Register HSReplay and Lushi as known but unsupported providers.
- Make provider behavior independently testable.
- Avoid Cloudflare bypass, browser automation, private endpoints, or login flows.

## Non-Goals

- Do not scrape HSReplay through browser automation.
- Do not reverse engineer Lushi private app APIs.
- Do not change deck prediction behavior beyond consuming the same `PopularDeck` list.
- Do not require users to configure third-party accounts or credentials.
- Do not replace the existing seed fallback.

## Current Architecture

`apps/desktop/src/main/popular-decks-sync/index.ts` directly orchestrates the HSGuru flow:

1. Fetch the HSGuru meta page.
2. Parse legend archetypes.
3. Fetch variant pages for each archetype.
4. Parse deck variants.
5. Transform variants into `PopularDeck` records.
6. Persist a schema version 1 snapshot with `{ fetchedAt, decks }`.

The current structure works for one source but couples fetching, parsing, transformation, source identity, retry behavior, and sync diagnostics to HSGuru.

## Proposed Architecture

Add a `PopularDeckProvider` interface and move source-specific logic behind providers.

```ts
interface PopularDeckProvider {
  id: PopularDeckSourceId;
  label: string;
  defaultEnabled: boolean;
  getStatus(): PopularDeckProviderStatus;
  sync(context: PopularDeckProviderContext): Promise<PopularDeckProviderResult>;
}
```

`hsguru` implements the full sync path by wrapping the existing fetcher, parser, and transformer.

`hsreplay` and `lushi` implement metadata-only providers. Their `getStatus()` responses explain why they are not enabled:

- `hsreplay`: `unsupported`, reason `blocked-by-cloudflare`
- `lushi`: `unsupported`, reason `no-public-deck-api-found`

The sync orchestrator asks for all registered providers, filters to enabled and supported providers, runs them, combines successful deck results, and persists provider diagnostics.

## Data Model

Keep the existing `decks` array as the primary compatibility surface. Version 2 snapshots add provider diagnostics:

```ts
interface SyncedSnapshot {
  schemaVersion: 2;
  fetchedAt: string;
  decks: PopularDeck[];
  sources: PopularDeckSourceSnapshot[];
}

interface PopularDeckSourceSnapshot {
  id: PopularDeckSourceId;
  label: string;
  enabled: boolean;
  status: 'ok' | 'failed' | 'unsupported' | 'disabled';
  reason?: string;
  fetchedAt?: string;
  deckCount?: number;
  error?: string;
}
```

The loader accepts both schema version 1 and schema version 2 snapshots. Version 1 snapshots are treated as HSGuru-only snapshots with no source diagnostics.

`PopularDeck.author` remains a string and should continue to carry source identity such as `hsguru`.

## Sync Flow

1. Build the provider registry.
2. Create a shared sync context with fetch implementation, cache directory, card lookup, logger, limits, and timestamps.
3. Collect unsupported and disabled provider statuses before syncing.
4. Run enabled supported providers in a deterministic order.
5. Merge successful provider deck lists in provider order.
6. Persist all decks plus source diagnostics.
7. If every enabled provider fails, keep existing seed fallback behavior for consumers.

The first implementation keeps HSGuru as the only enabled provider, so user-visible deck data should remain unchanged except for new diagnostics.

## Error Handling

Provider failures are isolated. One provider failure records a source snapshot with `status: failed` and a sanitized error string. Other providers continue syncing.

Unsupported providers do not throw during normal sync. They return diagnostics only.

The orchestrator preserves existing phase logging for HSGuru and adds provider-level logging around each provider run.

## Testing

Add or update tests for:

- Provider registry includes `hsguru`, `hsreplay`, and `lushi`.
- HSReplay and Lushi providers report unsupported statuses and do not perform network requests.
- HSGuru provider returns the same transformed deck shape as the current orchestrator.
- Orchestrator persists schema version 2 snapshots with `sources`.
- Storage loader accepts both schema version 1 and schema version 2 snapshots.
- Provider failure is captured in source diagnostics without dropping successful provider results.

## Rollout

The change is internal and can ship without UI changes. If the UI later wants to show source health, it can read `sources` from the synced snapshot or a small IPC surface built on the same diagnostics.

No migration job is required. Existing schema version 1 snapshots remain readable, and the next successful sync writes schema version 2.
