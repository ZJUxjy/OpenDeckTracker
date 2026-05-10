import { useState, type ReactElement } from 'react';
import * as Tabs from '@radix-ui/react-tabs';

import { useTranslation } from '../i18n';
import { SavedDecksTab } from './SavedDecksTab';
import { DeckFinderTab } from './DeckFinderTab';

type ActiveTab = 'saved' | 'finder';

/**
 * Container for the `/decks` route. Hosts a Saved / Finder tab strip per
 * the OpenDeckTracker UI v2 design. The Saved tab keeps the existing
 * deck-management surface; the Finder tab is the popular-deck browser.
 */
export function DecksPage(): ReactElement {
  const { t } = useTranslation();
  const [active, setActive] = useState<ActiveTab>('saved');
  const [openEditorForDeckId, setOpenEditorForDeckId] = useState<string | null>(null);

  const onImportedFromFinder = (deckId: string): void => {
    setOpenEditorForDeckId(deckId);
    setActive('saved');
  };

  return (
    <Tabs.Root
      value={active}
      onValueChange={(v) => setActive(v as ActiveTab)}
      className="flex-1 flex flex-col h-full overflow-hidden"
    >
      <Tabs.List
        aria-label={t('decks.tabs.ariaLabel')}
        className="flex shrink-0 border-b border-border px-6"
      >
        <Tabs.Trigger
          value="saved"
          className="px-4 py-3 text-sm font-medium text-text-dim data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent hover:text-text transition-colors"
        >
          {t('decks.tabs.saved')}
        </Tabs.Trigger>
        <Tabs.Trigger
          value="finder"
          className="px-4 py-3 text-sm font-medium text-text-dim data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent hover:text-text transition-colors"
        >
          {t('decks.tabs.finder')}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="saved" className="flex-1 overflow-hidden focus:outline-none">
        <SavedDecksTab
          openEditorForDeckId={openEditorForDeckId}
          onEditorOpened={() => setOpenEditorForDeckId(null)}
        />
      </Tabs.Content>
      <Tabs.Content value="finder" className="flex-1 overflow-hidden focus:outline-none">
        <DeckFinderTab onImported={onImportedFromFinder} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
