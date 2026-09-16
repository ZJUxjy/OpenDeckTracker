import { useEffect, useMemo, useRef, useState } from 'react';
import { indexReplayKeyEvents, reconstructReplayFrame, type MatchRecordingDetail, type RecordingAnnotation, type ReplayCard } from '@hdt/core';
import { useTranslation } from '../i18n';
import { useCardDef } from '../hooks/use-card-def';

export function ReplayAnalysisPanel({ recording }: { recording: MatchRecordingDetail }) {
  const { t } = useTranslation();
  const keys = useMemo(() => indexReplayKeyEvents(recording), [recording]);
  const [selected, setSelected] = useState(0);
  const [annotations, setAnnotations] = useState(recording.annotations ?? []);
  const [drafts, setDrafts] = useState<Record<number, RecordingAnnotation>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const frame = useMemo(() => reconstructReplayFrame(recording, selected), [recording, selected]);
  const draft = drafts[selected] ?? annotations.find(item => item.sourceEventIndex === selected)
    ?? { sourceEventIndex: selected, bookmarked: false, note: '' };
  const update = (patch: Partial<RecordingAnnotation>) => {
    setDrafts(previous => ({ ...previous, [selected]: { ...draft, ...patch } })); setSaved(false);
  };
  const select = (index: number) => { setSelected(index); setError(false); setSaved(false); };
  const save = async () => {
    setSaving(true); setError(false); setSaved(false);
    try {
      const result = await window.hdt.recordings.saveAnnotation(recording.recordingId, draft);
      if (!alive.current) return;
      setAnnotations(result);
      setDrafts(previous => { const next = { ...previous }; delete next[draft.sourceEventIndex]; return next; });
      setSaved(true);
    } catch { if (alive.current) setError(true); }
    finally { if (alive.current) setSaving(false); }
  };
  const prior = [...keys].reverse().find(key => key.sourceEventIndex < selected);
  const next = keys.find(key => key.sourceEventIndex > selected);
  const knownController = frame.friendlyControllerId;
  return <section className="space-y-3 rounded border border-border p-3" aria-label={t('analysis.replayTitle')}>
    <h3 className="font-semibold text-accent">{t('analysis.replayTitle')}</h3>
    <p className="text-xs text-text-mute">{t('analysis.replayHint')}</p>
    {recording.rawEvents.length === 0 ? <p>{t('analysis.replayNoEvents')}</p> : <>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" disabled={!prior || saving} onClick={() => prior && select(prior.sourceEventIndex)} className="text-accent disabled:opacity-40">{t('analysis.replayPrevious')}</button>
        <button type="button" disabled={!next || saving} onClick={() => next && select(next.sourceEventIndex)} className="text-accent disabled:opacity-40">{t('analysis.replayNext')}</button>
        <span>{t('analysis.replayPosition', { event: selected, turn: frame.turn ?? '—' })}</span>
      </div>
      <label className="block text-xs">{t('analysis.replaySeek')}
        <input type="range" className="w-full" min={0} max={recording.rawEvents.length - 1} value={selected} disabled={saving}
          onChange={event => select(Number(event.target.value))} />
      </label>
      <div className="flex gap-2 overflow-x-auto pb-2" aria-label={t('analysis.replayKeys')}>
        {keys.filter(key => key.sourceEventIndex < recording.rawEvents.length).map(key => <button type="button"
          key={key.sourceEventIndex} disabled={saving} aria-pressed={selected === key.sourceEventIndex}
          onClick={() => select(key.sourceEventIndex)} className="shrink-0 rounded border border-border p-1 aria-pressed:text-accent">
          #{key.sourceEventIndex} · {key.kinds.map(kind => t(`analysis.replayKinds.${kind}`)).join(' / ')}
        </button>)}
      </div>
      {frame.incomplete && <p role="status" className="text-yellow">{t('analysis.replayIncomplete')}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ReplayZone title={t('analysis.replayOpponentBoard')} cards={frame.board.filter(card => card.controllerId !== knownController || knownController === null)} />
        <ReplayZone title={t('analysis.replayFriendlyBoard')} cards={frame.board.filter(card => knownController !== null && card.controllerId === knownController)} />
        <ReplayZone title={t('analysis.replayOpponentHand')} cards={frame.opponentHand} />
        <ReplayZone title={t('analysis.replayFriendlyHand')} cards={frame.friendlyHand} />
      </div>
      <div className="space-y-2 border-t border-border pt-2">
        <label className="flex gap-2 items-center"><input type="checkbox" checked={draft.bookmarked} disabled={saving}
          onChange={event => update({ bookmarked: event.target.checked })} />{t('analysis.replayBookmark')}</label>
        <label className="block">{t('analysis.replayNote')}
          <textarea className="block w-full rounded bg-overlay border border-border p-2" rows={3} maxLength={4000}
            value={draft.note} disabled={saving} onChange={event => update({ note: event.target.value })} />
        </label>
        <button type="button" className="text-accent disabled:opacity-40" disabled={saving} onClick={() => void save()}>{t('analysis.replaySave')}</button>
        {Object.keys(drafts).length > 0 && <p className="text-xs text-yellow">{t('analysis.replayUnsaved')}</p>}
        {error && <p role="alert" className="text-red">{t('analysis.replaySaveFailed')}</p>}
        {saved && <p role="status">{t('analysis.replaySaved')}</p>}
      </div>
    </>}
    {annotations.length > 0 && <ul aria-label={t('analysis.replayBookmarks')} className="space-y-1">
      {annotations.map(item => <li key={item.sourceEventIndex}><button type="button" className="text-left text-accent break-words"
        disabled={saving || item.sourceEventIndex >= recording.rawEvents.length} onClick={() => select(item.sourceEventIndex)}>
        {item.bookmarked ? '★ ' : ''}#{item.sourceEventIndex} {item.note}
      </button></li>)}
    </ul>}
  </section>;
}

function ReplayZone({ title, cards }: { title: string; cards: ReplayCard[] }) {
  return <section className="rounded bg-overlay p-2"><h4 className="font-semibold">{title} ({cards.length})</h4>
    <ul className="space-y-1 text-xs">{cards.map(card => <ReplayCardRow key={card.entityId} card={card} />)}</ul>
  </section>;
}
function ReplayCardRow({ card }: { card: ReplayCard }) {
  const { t } = useTranslation();
  const definition = useCardDef(card.cardId ?? '');
  return <li className="break-words">#{card.entityId} · {card.cardId ? definition?.name ?? card.cardId : t('analysis.unknown')}
    {card.attack !== null && <span> · {t('analysis.replayAttack', { n: card.attack })}</span>}
    {card.health !== null && <span> · {t('analysis.replayHealth', { n: card.damage === null ? `${card.health} − ?` : Math.max(0, card.health - card.damage) })}</span>}
    {card.armor !== null && <span> · {t('analysis.replayArmor', { n: card.armor })}</span>}
  </li>;
}
