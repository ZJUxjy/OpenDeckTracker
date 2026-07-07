import type { CollectionDiagnostic, Deck as LiveDeck } from '@hdt/hearthmirror';
import type {
  DeckSyncUnavailableDiagnostic,
  LiveDeckReadSummary,
} from './deck-sync-service';

export interface DeckSyncDiagnosticMirror {
  isAlive(): Promise<boolean>;
  getBoundPid(): Promise<number>;
  getReinitCount(): Promise<number>;
  getEditedDeck(): Promise<LiveDeck | null>;
  getCollectionDiagnostic(): Promise<CollectionDiagnostic | null>;
}

export async function readDeckSyncUnavailableDiagnostic(
  mirror: DeckSyncDiagnosticMirror,
): Promise<DeckSyncUnavailableDiagnostic> {
  const errors: string[] = [];

  const capture = async <T>(label: string, read: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await read();
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };

  const [mirrorAlive, runtimeBoundPid, runtimeReinitCount, editedDeck, collectionDiagnostic] =
    await Promise.all([
      capture('isAlive', () => mirror.isAlive()),
      capture('getBoundPid', () => mirror.getBoundPid()),
      capture('getReinitCount', () => mirror.getReinitCount()),
      capture('getEditedDeck', () => mirror.getEditedDeck()),
      capture('getCollectionDiagnostic', () => mirror.getCollectionDiagnostic()),
    ]);

  const diagnostic: DeckSyncUnavailableDiagnostic = {};
  if (mirrorAlive !== undefined) diagnostic.mirrorAlive = mirrorAlive;
  if (runtimeBoundPid !== undefined) diagnostic.runtimeBoundPid = runtimeBoundPid;
  if (runtimeReinitCount !== undefined) diagnostic.runtimeReinitCount = runtimeReinitCount;
  if (editedDeck !== undefined) {
    diagnostic.editedDeck = editedDeck === null ? null : summarizeLiveDeck(editedDeck);
  }
  if (collectionDiagnostic !== undefined) {
    diagnostic.collectionDiagnostic = collectionDiagnostic;
  }
  if (errors.length > 0) diagnostic.error = errors.join('; ');
  return diagnostic;
}

function summarizeLiveDeck(deck: LiveDeck): LiveDeckReadSummary {
  return {
    id: deck.id,
    name: deck.name,
    hero: deck.hero,
    formatType: deck.formatType,
    deckType: deck.deckType,
    cardSlots: deck.cards.length,
    cardCount: deck.cards.reduce((sum, card) => sum + card.count, 0),
  };
}
