import { useEffect, useState, type ReactElement } from 'react';
import type { DeckDetail } from '@hdt/core';

import { DeckEditor } from './DeckEditor';
import { DeckExportDialog } from './DeckExportDialog';
import { DeckImportDialog } from './DeckImportDialog';
import { SavedDecksList } from './Decklist';
import { useDecksStore } from '../stores/decks-store';

export interface SavedDecksTabHandle {
  /** Open the editor on a deck by id (used by Finder's IMPORT flow). */
  openEditor: (deckId: string) => Promise<void>;
}

interface SavedDecksTabProps {
  /** When provided, the editor for this id opens on mount (one-shot). */
  openEditorForDeckId?: string | null;
  /** Cleared after the one-shot fires. */
  onEditorOpened?: () => void;
}

export function SavedDecksTab({ openEditorForDeckId, onEditorOpened }: SavedDecksTabProps = {}): ReactElement {
  const refresh = useDecksStore((s) => s.refresh);
  const [editingDeck, setEditingDeck] = useState<DeckDetail | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportingDeckId, setExportingDeckId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onCreate = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await window.hdt.decks.create({
        name: '',
        class: 'DRUID',
        format: 'Standard',
      });
      await refresh();
      setEditingDeck(created);
    } finally {
      setBusy(false);
    }
  };

  const onImport = (): void => setImportOpen(true);

  const onEdit = async (id: string): Promise<void> => {
    const detail = await window.hdt.decks.getById(id);
    if (detail !== null) setEditingDeck(detail);
  };

  const onExport = (id: string): void => setExportingDeckId(id);

  const onEditorSave = async (id: string, patch: unknown): Promise<void> => {
    await window.hdt.decks.update(id, patch as Parameters<typeof window.hdt.decks.update>[1]);
    await refresh();
  };

  useEffect(() => {
    if (editingDeck === null) {
      void refresh();
    }
  }, [editingDeck, refresh]);

  // One-shot: open the editor on a deck id passed from the parent
  // (used by Deck Finder's IMPORT TO MY DECKS flow).
  useEffect(() => {
    if (!openEditorForDeckId) return;
    let cancelled = false;
    void (async () => {
      const detail = await window.hdt.decks.getById(openEditorForDeckId);
      if (!cancelled && detail !== null) {
        setEditingDeck(detail);
        onEditorOpened?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openEditorForDeckId, onEditorOpened]);

  return (
    <div className="flex-1 h-full overflow-hidden">
      <SavedDecksList
        onCreate={() => {
          void onCreate();
        }}
        onImport={onImport}
        onEdit={(id) => {
          void onEdit(id);
        }}
        onExport={onExport}
      />

      {editingDeck !== null && (
        <DeckEditor
          open
          onOpenChange={(next) => {
            if (!next) setEditingDeck(null);
          }}
          deck={editingDeck}
          onSave={onEditorSave}
        />
      )}

      <DeckImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {exportingDeckId !== null && (
        <DeckExportDialog
          open
          onOpenChange={(next) => {
            if (!next) setExportingDeckId(null);
          }}
          deckId={exportingDeckId}
        />
      )}
    </div>
  );
}
