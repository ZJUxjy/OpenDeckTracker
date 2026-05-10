import { useEffect, useState, type ReactElement } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { Copy, X } from 'lucide-react';

import { useTranslation } from '../i18n';

export interface DeckExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
}

export function DeckExportDialog({ open, onOpenChange, deckId }: DeckExportDialogProps): ReactElement {
  const { t } = useTranslation();
  const [deckstring, setDeckstring] = useState<string | null>(null);
  const [json, setJson] = useState<string>('');
  const [deckstringError, setDeckstringError] = useState<string | null>(null);
  const [copyAck, setCopyAck] = useState<'deckstring' | 'json' | null>(null);

  useEffect(() => {
    if (!open) return;
    setDeckstring(null);
    setDeckstringError(null);
    setCopyAck(null);

    void window.hdt.decks
      .exportDeckstring(deckId)
      .then((s) => setDeckstring(s))
      .catch((err: Error & { name?: string }) => {
        if (err.name === 'IllegalDeckExportError') {
          setDeckstringError(t('decks.export.illegalDeck'));
        } else {
          setDeckstringError(err.message);
        }
      });

    void window.hdt.decks
      .exportJson(deckId)
      .then((s) => setJson(s))
      .catch((err: Error) => {
        setJson(`Error: ${err.message}`);
      });
  }, [open, deckId, t]);

  const copy = (which: 'deckstring' | 'json', text: string): void => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopyAck(which);
    setTimeout(() => setCopyAck(null), 1200);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay-dialog" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[600px] max-w-[95vw] bg-overlay-elevated backdrop-blur-xl border border-border rounded-md text-text">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Dialog.Title className="text-lg font-bold text-text">
              {t('decks.export.title')}
            </Dialog.Title>
            <Dialog.Description className="sr-only">{t('decks.export.title')}</Dialog.Description>
            <Dialog.Close asChild>
              <button aria-label="Close" className="p-1 hover:bg-overlay-hover rounded">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <Tabs.Root defaultValue="deckstring" className="p-4">
            <Tabs.List className="flex border-b border-border mb-3">
              <Tabs.Trigger
                value="deckstring"
                className="px-4 py-2 text-sm data-[state=active]:text-text data-[state=active]:border-b-2 data-[state=active]:border-accent text-text-dim"
              >
                {t('decks.export.deckstring')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="json"
                className="px-4 py-2 text-sm data-[state=active]:text-text data-[state=active]:border-b-2 data-[state=active]:border-accent text-text-dim"
              >
                {t('decks.export.json')}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="deckstring" className="space-y-3" data-testid="tab-deckstring">
              {deckstringError !== null ? (
                <div
                  className="text-sm text-amber bg-amber/10 border border-amber/30 px-3 py-2 rounded"
                  data-testid="deckstring-illegal"
                >
                  {deckstringError}
                </div>
              ) : (
                <pre
                  className="text-xs bg-overlay-input border border-border rounded p-3 break-all whitespace-pre-wrap font-mono"
                  data-testid="deckstring-content"
                >
                  {deckstring ?? '...'}
                </pre>
              )}
              <button
                onClick={() => deckstring && copy('deckstring', deckstring)}
                disabled={deckstring === null}
                className="px-3 py-1.5 text-sm bg-overlay-elevated hover:bg-overlay-hover rounded inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="copy-deckstring"
              >
                <Copy size={14} />
                {copyAck === 'deckstring' ? t('decks.export.copied') : t('decks.export.copy')}
              </button>
            </Tabs.Content>

            <Tabs.Content value="json" className="space-y-3" data-testid="tab-json">
              <pre
                className="text-xs bg-overlay-input border border-border rounded p-3 break-all whitespace-pre-wrap font-mono max-h-[300px] overflow-y-auto"
                data-testid="json-content"
              >
                {json || '...'}
              </pre>
              <button
                onClick={() => copy('json', json)}
                disabled={json === ''}
                className="px-3 py-1.5 text-sm bg-overlay-elevated hover:bg-overlay-hover rounded inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Copy size={14} />
                {copyAck === 'json' ? t('decks.export.copied') : t('decks.export.copy')}
              </button>
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
