import { useState } from 'react';
import { summarizeResources, type ResourceSummaryInput } from '@hdt/core';
import { useAnalysisPreferences } from '../hooks/use-analysis-preferences';
import { useCardDef } from '../hooks/use-card-def';
import { useTranslation } from '../i18n';

interface Props extends Omit<ResourceSummaryInput, 'cardIds'> {
  storageKey: string;
  choices: readonly string[];
}

export function ResourceGroupsPanel({ storageKey, choices, ...input }: Props) {
  const { t } = useTranslation();
  const { preferences, update, saved } = useAnalysisPreferences(storageKey);
  const [name, setName] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const saveGroup = () => {
    if (!name.trim() || selection.length === 0) return;
    const group = { id: editing ?? crypto.randomUUID(), name: name.trim(), cardIds: selection };
    update({ groups: editing ? preferences.groups.map(old => old.id === editing ? group : old) : [...preferences.groups, group] });
    setName(''); setSelection([]); setEditing(null);
  };
  return <section className="space-y-2 text-xs border-b border-border pb-3" aria-label={t('analysis.resources')}>
    <h2 className="font-semibold text-accent">{t('analysis.resources')}</h2>
    {input.predicted && <p className="text-text-mute">{t('analysis.resourcePredictionHint')}</p>}
    {preferences.groups.map(group => {
      const result = summarizeResources({ ...input, cardIds: group.cardIds });
      return <div key={group.id} className="rounded border border-border p-2 space-y-1">
        <h3 className="font-semibold">{group.name}</h3>
        <p>{t('analysis.resourceObserved', { original: result.observedOriginal, generated: result.observedGenerated })}</p>
        {input.predicted ? <p className="text-accent">{t('analysis.resourcePredicted', { n: result.predictedUnplayed ?? 0 })}</p>
          : input.hand !== undefined && input.remaining !== undefined
            ? <p>{t('analysis.resourceAvailable', { hand: result.inHand ?? 0, deck: result.inDeck ?? 0 })}</p>
            : <p className="text-text-mute">{t('analysis.resourceUnknown')}</p>}
        <ul className="text-text-mute">{group.cardIds.map(id => <ResourceCardName key={id} id={id} />)}</ul>
        <div className="flex gap-3">
          <button type="button" className="text-accent underline" onClick={() => { setEditing(group.id); setName(group.name); setSelection(group.cardIds); }}>{t('analysis.editGroup')}</button>
          <button type="button" className="text-red underline" onClick={() => {
            update({ groups: preferences.groups.filter(old => old.id !== group.id) });
            if (editing === group.id) { setEditing(null); setName(''); setSelection([]); }
          }}>{t('analysis.deleteGroup')}</button>
        </div>
      </div>;
    })}
    <details open={editing !== null || undefined}>
      <summary className="cursor-pointer text-accent">{t('analysis.configureGroups')}</summary>
      <div className="space-y-2 pt-2">
        <label className="block">{t('analysis.groupName')}
          <input type="text" maxLength={80} value={name} onChange={event => setName(event.target.value)}
            className="block w-full rounded border border-border bg-overlay-elevated p-1" />
        </label>
        <label className="block">{t('analysis.groupCards')}
          <select aria-label={t('analysis.groupCards')} multiple size={Math.min(6, Math.max(2, choices.length))} value={selection}
            onChange={event => setSelection(Array.from(event.target.selectedOptions).map(option => option.value))}
            className="block w-full rounded border border-border bg-overlay-elevated p-1">
            {[...new Set([...choices, ...selection])].map(id => <ResourceOption key={id} id={id} />)}
          </select>
        </label>
        <button type="button" disabled={!name.trim() || selection.length === 0 || (!editing && preferences.groups.length >= 30)}
          onClick={saveGroup} className="rounded bg-accent text-text-on-accent p-1 disabled:opacity-40">{t('analysis.saveGroup')}</button>
        {editing !== null && <button type="button" className="ml-3 text-text-mute underline" onClick={() => { setEditing(null); setName(''); setSelection([]); }}>{t('analysis.cancelEdit')}</button>}
      </div>
    </details>
    {!saved && <p role="alert" className="text-red">{t('analysis.saveFailed')}</p>}
  </section>;
}

function ResourceOption({ id }: { id: string }) {
  const card = useCardDef(id);
  return <option value={id}>{card?.name ?? id}</option>;
}
function ResourceCardName({ id }: { id: string }) {
  const card = useCardDef(id);
  return <li>{card?.name ?? id}</li>;
}
