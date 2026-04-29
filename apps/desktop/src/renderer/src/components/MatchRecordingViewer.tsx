import { useEffect, useState, type ReactElement } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { MatchRecordingDetail } from '@hdt/core';

import { useTranslation } from '../i18n';

export interface MatchRecordingViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingId: string | null;
}

export function MatchRecordingViewer({
  open,
  onOpenChange,
  recordingId,
}: MatchRecordingViewerProps): ReactElement {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<MatchRecordingDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || recordingId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void window.hdt.recordings
      .get(recordingId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, recordingId]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[700px] max-w-[95vw] max-h-[90vh] bg-[#14141A] border border-[#2A2A35] rounded-md text-slate-200 flex flex-col"
          data-testid="match-recording-viewer"
        >
          <div className="flex items-center justify-between p-4 border-b border-[#2A2A35]">
            <Dialog.Title className="text-lg font-bold text-white">
              {t('stats.recordingViewer.title')}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {t('stats.recordingViewer.title')}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button aria-label={t('stats.recordingViewer.close')} className="p-1 hover:bg-[#2A2A35] rounded">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto p-4 flex-1 space-y-4 text-sm">
            {loading && <div className="text-slate-500">…</div>}
            {!loading && !detail && (
              <div data-testid="recording-empty" className="text-slate-500">
                {t('stats.recordingViewer.empty')}
              </div>
            )}
            {detail && (
              <>
                <section data-testid="recording-deck">
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                    {t('stats.recordingViewer.deck')}
                  </h3>
                  <div className="text-slate-200">
                    {detail.metadata.deckName ?? '—'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {detail.initialState.originalDeck
                      .map((c) => `${c.cardId} ×${c.count}`)
                      .join(', ')}
                  </div>
                </section>
                <section data-testid="recording-starting-hand">
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                    {t('stats.recordingViewer.startingHand')}
                  </h3>
                  <div className="text-slate-300 text-xs">
                    {detail.initialState.startingHand.length === 0
                      ? '—'
                      : detail.initialState.startingHand.map((c) => c.cardId).join(', ')}
                  </div>
                </section>
                <section data-testid="recording-mulligan-hand">
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                    {t('stats.recordingViewer.postMulliganHand')}
                  </h3>
                  <div className="text-slate-300 text-xs">
                    {detail.initialState.postMulliganHand.length === 0
                      ? '—'
                      : detail.initialState.postMulliganHand.map((c) => c.cardId).join(', ')}
                  </div>
                </section>
                <section data-testid="recording-timeline">
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                    {t('stats.recordingViewer.timeline')}
                  </h3>
                  <ul className="text-xs space-y-0.5 max-h-[300px] overflow-y-auto">
                    {detail.timeline.length === 0 ? (
                      <li className="text-slate-500">—</li>
                    ) : (
                      detail.timeline.map((ev, i) => (
                        <li key={`${ev.kind}-${i}`} className="flex justify-between">
                          <span className="text-slate-300">{ev.kind}</span>
                          <span className="text-slate-500">#{i}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
