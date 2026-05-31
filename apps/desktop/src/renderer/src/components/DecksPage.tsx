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
      className="reference-page reference-decks flex-1 flex flex-col h-full min-h-0 overflow-hidden"
    >
      <Tabs.List
        aria-label={t('decks.tabs.ariaLabel')}
        className="reference-page-tabs flex shrink-0"
      >
        <Tabs.Trigger
          value="saved"
          className="reference-page-tab"
        >
          {t('decks.tabs.saved')}
        </Tabs.Trigger>
        <Tabs.Trigger
          value="finder"
          className="reference-page-tab"
        >
          {t('decks.tabs.finder')}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="saved" className="flex-1 min-h-0 overflow-hidden focus:outline-none">
        <SavedDecksTab
          openEditorForDeckId={openEditorForDeckId}
          onEditorOpened={() => setOpenEditorForDeckId(null)}
        />
      </Tabs.Content>
      <Tabs.Content value="finder" className="flex-1 min-h-0 overflow-hidden focus:outline-none">
        <DeckFinderTab onImported={onImportedFromFinder} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
