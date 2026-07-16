import { useRef, type CSSProperties, type ReactElement } from 'react';
import type { AdvisorAlert, SuggestedAction, SuggestedActionKind } from '@hdt/advisor';
import { AlertTriangle, Bot, Loader2, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from '../i18n';
import { useCardDef } from '../hooks/use-card-def';
import { useCardPreview } from '../hooks/use-card-preview';
import { AdvisorFollowUpChat } from './AdvisorFollowUpChat';
import { useAdvisorStore } from '../stores/advisor-store';

export function AdvisorPanel(): ReactElement {
  const { t } = useTranslation();
  const status = useAdvisorStore((s) => s.status);
  const suggestion = useAdvisorStore((s) => s.suggestion);
  const alerts = useAdvisorStore((s) => s.alerts);
  const error = useAdvisorStore((s) => s.error);

  return (
    <div
      className="advisor-panel w-full h-full flex flex-col bg-overlay-surface"
      data-testid="advisor-panel"
    >
      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2 text-xs uppercase tracking-wider text-text-dim">
          <Sparkles size={14} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate">{t('advisor.title')}</span>
        </div>
        <StatusPill status={status} />
      </div>

      <div style={NO_DRAG} className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 text-xs">
        <StatusNotice status={status} error={error} hasSuggestion={suggestion !== null} />

        {alerts.map((alert, index) => (
          <AlertBanner key={`${alert.type}-${index}-${alert.detail}`} alert={alert} />
        ))}

        {suggestion ? (
          <section data-testid="advisor-suggestion" className="space-y-2">
            <div className="rounded border border-border bg-overlay px-2 py-2">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase text-text-dim">
                <Bot size={13} aria-hidden="true" />
                <span>{t('advisor.actionsTitle')}</span>
              </div>
              {suggestion.actions.length > 0 ? (
                <ol className="space-y-1.5">
                  {suggestion.actions.map((action, index) => (
                    <AdvisorActionRow
                      key={`${action.kind}-${action.cardId ?? ''}-${action.targetCardId ?? ''}-${index}`}
                      action={action}
                      index={index}
                    />
                  ))}
                </ol>
              ) : (
                <p className="text-text-mute">{t('advisor.noActions')}</p>
              )}
            </div>

            {suggestion.reasoning ? (
              <div className="rounded border border-border bg-overlay px-2 py-2">
                <div className="mb-1 text-[11px] font-semibold uppercase text-text-dim">
                  {t('advisor.reasoningTitle')}
                </div>
                <p className="leading-relaxed text-text">{suggestion.reasoning}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <AdvisorFollowUpChat />
      </div>
    </div>
  );
}

const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties;

function StatusPill({ status }: { status: ReturnType<typeof useAdvisorStore.getState>['status'] }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
        status === 'ready'
          ? 'border-green/40 text-green'
          : status === 'error'
            ? 'border-red/40 text-red'
            : status === 'stale'
              ? 'border-amber/40 text-amber'
              : 'border-border text-text-mute',
      )}
    >
      {t(`advisor.status.${status}`)}
    </span>
  );
}

function StatusNotice({
  status,
  error,
  hasSuggestion,
}: {
  status: ReturnType<typeof useAdvisorStore.getState>['status'];
  error: string | null;
  hasSuggestion: boolean;
}) {
  const { t } = useTranslation();
  if (status === 'ready') return null;
  if (status === 'idle' && hasSuggestion) return null;

  const testId = `advisor-state-${status}`;
  const message =
    status === 'error'
      ? (error ?? t('advisor.errorFallback'))
      : t(`advisor.state.${status}`);

  return (
    <div
      data-testid={testId}
      className={clsx(
        'rounded border px-2 py-2 leading-relaxed',
        status === 'error'
          ? 'border-red/40 bg-red/10 text-red'
          : status === 'stale'
            ? 'border-amber/40 bg-amber/10 text-amber'
            : 'border-border bg-overlay text-text-mute',
      )}
    >
      <span className="inline-flex items-center gap-2">
        {status === 'loading' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
        {message}
      </span>
    </div>
  );
}

function AlertBanner({ alert }: { alert: AdvisorAlert }) {
  const { t } = useTranslation();
  const lethal = alert.type === 'lethal';
  return (
    <div
      data-testid="advisor-alert"
      className={clsx(
        'advisor-alert rounded border px-2 py-2 flex items-start gap-2 leading-relaxed',
        lethal
          ? 'advisor-alert-lethal border-red/50 bg-red/12 text-red'
          : 'border-amber/50 bg-amber/10 text-amber',
      )}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase">
          {t(lethal ? 'advisor.alert.lethal' : 'advisor.alert.danger')}
        </div>
        <div className="text-text">{alert.detail}</div>
      </div>
    </div>
  );
}

function AdvisorActionRow({ action, index }: { action: SuggestedAction; index: number }) {
  const { t } = useTranslation();
  return (
    <li
      data-testid="advisor-action"
      className="rounded border border-border bg-overlay-surface px-2 py-2"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-bg">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold uppercase text-text-dim">
              {t(actionKindKey(action.kind))}
            </span>
            {action.cardId ? <CardToken cardId={action.cardId} testPrefix="advisor-action-card" /> : null}
            {action.targetCardId ? (
              <>
                <span className="text-text-mute">→</span>
                <CardToken cardId={action.targetCardId} testPrefix="advisor-target-card" />
              </>
            ) : null}
          </div>
          <p className="leading-relaxed text-text">{action.note}</p>
        </div>
      </div>
    </li>
  );
}

function CardToken({ cardId, testPrefix }: { cardId: string; testPrefix: string }) {
  const def = useCardDef(cardId);
  const ref = useRef<HTMLButtonElement | null>(null);
  const { onRowEnter, onRowLeave } = useCardPreview();
  const label = def?.name ?? cardId;

  return (
    <button
      ref={ref}
      type="button"
      data-testid={`${testPrefix}-${cardId}`}
      className="max-w-full truncate rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-text hover:border-accent"
      onMouseEnter={() => {
        if (ref.current) onRowEnter(cardId, ref.current);
      }}
      onMouseLeave={onRowLeave}
      style={NO_DRAG}
    >
      {label}
    </button>
  );
}

function actionKindKey(kind: SuggestedActionKind): string {
  return `advisor.action.${kind}`;
}
