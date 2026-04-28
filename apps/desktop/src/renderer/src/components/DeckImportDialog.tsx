import { useState, type ReactElement } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Clipboard, X } from 'lucide-react';

import { useTranslation } from '../i18n';
import { useDecksStore } from '../stores/decks-store';

export interface DeckImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeckImportDialog({ open, onOpenChange }: DeckImportDialogProps): ReactElement {
  const { t } = useTranslation();
  const refresh = useDecksStore((s) => s.refresh);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const onImport = async (): Promise<void> => {
    setError(null);
    setImporting(true);
    try {
      await window.hdt.decks.importDeckstring(text);
      await refresh();
      setText('');
      onOpenChange(false);
    } catch (err) {
      const e = err as Error & { name?: string };
      const cardIdMatch = e.message.match(/cardId=([^\s]+)/);
      const cardId = cardIdMatch?.[1] ?? '';
      switch (e.name) {
        case 'UnknownCardError':
          setError(t('decks.import.error.unknownCard', { cardId }));
          break;
        case 'DeckstringDecodeError':
          setError(t('decks.import.error.decode'));
          break;
        default:
          setError(e.message);
      }
    } finally {
      setImporting(false);
    }
  };

  const onPasteFromClipboard = async (): Promise<void> => {
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[500px] max-w-[95vw] bg-[#14141A] border border-[#2A2A35] rounded-md text-slate-200">
          <div className="flex items-center justify-between p-4 border-b border-[#2A2A35]">
            <Dialog.Title className="text-lg font-bold text-white">
              {t('decks.import.title')}
            </Dialog.Title>
            <Dialog.Description className="sr-only">{t('decks.import.title')}</Dialog.Description>
            <Dialog.Close asChild>
              <button aria-label={t('decks.import.cancel')} className="p-1 hover:bg-[#2A2A35] rounded">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div className="p-4 space-y-3">
            <label className="text-xs text-slate-400 uppercase">
              {t('decks.import.deckstringLabel')}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('decks.import.deckstringPlaceholder')}
              rows={5}
              className="w-full px-3 py-2 bg-[#1a1a24] border border-[#2A2A35] rounded text-white text-sm font-mono"
              data-testid="deckstring-input"
            />
            <button
              onClick={() => void onPasteFromClipboard()}
              className="text-sm text-slate-400 hover:text-white inline-flex items-center gap-1"
            >
              <Clipboard size={14} />
              {t('decks.import.deckstringLabel')}
            </button>
            {error !== null && (
              <div
                className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded"
                data-testid="import-error"
              >
                {error}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-[#2A2A35]">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded text-sm hover:bg-[#2A2A35]">
                {t('decks.import.cancel')}
              </button>
            </Dialog.Close>
            <button
              disabled={importing || text.trim() === ''}
              onClick={() => void onImport()}
              className="px-4 py-2 rounded text-sm bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('decks.import.confirm')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
