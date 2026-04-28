import { useEffect, useState, type ReactElement } from 'react';
import type { DeckDetail } from '@hdt/core';

import { DeckEditor } from './DeckEditor';
import { DeckExportDialog } from './DeckExportDialog';
import { DeckImportDialog } from './DeckImportDialog';
import { SavedDecksList } from './Decklist';
import { useDecksStore } from '../stores/decks-store';

/**
 * Container for the `/decks` route. Owns the open/close state of the
 * editor / import / export dialogs and wires `SavedDecksList`'s callbacks
 * to them. Without this layer, the list's row actions and empty-state
 * CTAs are no-ops (each component is self-contained but they don't know
 * about each other).
 */
export function DecksPage(): ReactElement {
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

  // Save handler for the editor: forward the patch to IPC and refresh.
  const onEditorSave = async (id: string, patch: unknown): Promise<void> => {
    await window.hdt.decks.update(id, patch as Parameters<typeof window.hdt.decks.update>[1]);
    await refresh();
  };

  // Refresh the list when the editor closes so the row reflects the latest
  // version / card count / name.
  useEffect(() => {
    if (editingDeck === null) {
      void refresh();
    }
  }, [editingDeck, refresh]);

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
