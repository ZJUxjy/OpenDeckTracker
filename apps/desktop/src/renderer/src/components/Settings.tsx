import { useEffect, useState, type ReactNode } from 'react';
import { Database, Info, Monitor, Palette } from 'lucide-react';
import { useTranslation, type LanguagePreference } from '../i18n';
import { useI18nStore } from '../i18n/i18n-store';
import { useAppearanceStore, ACCENT_PALETTE, type Accent, type Density, type Theme, type UiStyle } from '../stores/appearance-store';

const ALL_ACCENTS: Accent[] = ['blue', 'red', 'orange', 'yellow', 'green', 'mint', 'purple', 'pink'];
const UI_STYLE_OPTIONS: UiStyle[] = ['reference', 'macos'];
const ACCENT_LABELS: Record<Accent, string> = {
  blue: 'Blue', red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', mint: 'Mint', purple: 'Purple', pink: 'Pink',
};

const categories = [
  { id: 'appearance', labelKey: 'settings.appearance.categoryLabel', icon: Palette },
  { id: 'overlay', labelKey: 'settings.overlay', icon: Monitor },
  { id: 'data', labelKey: 'settings.data', icon: Database },
  { id: 'about', labelKey: 'settings.about.categoryLabel', icon: Info },
];

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'update-available'; version: string }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

function SettingsSegment<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="reference-segment shrink-0" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={value === option.value ? 'is-active' : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SettingsRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="settings-row reference-panel flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {control}
    </div>
  );
}

function ReferenceToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`reference-toggle shrink-0 ${checked ? 'is-on' : ''}`}
    >
      <span aria-hidden="true" />
    </button>
  );
}

export function Settings() {
  const { t } = useTranslation();
  const languagePreference = useI18nStore((state) => state.languagePreference);
  const setLanguagePreference = useI18nStore((state) => state.setLanguagePreference);
  const density = useAppearanceStore((state) => state.density);
  const uiStyle = useAppearanceStore((state) => state.uiStyle);
  const accent = useAppearanceStore((state) => state.accent);
  const theme = useAppearanceStore((state) => state.theme);
  const gameOverlay = useAppearanceStore((state) => state.gameOverlay);
  const gameOverlayOpponent = useAppearanceStore((state) => state.gameOverlayOpponent);
  const setDensity = useAppearanceStore((state) => state.setDensity);
  const setUiStyle = useAppearanceStore((state) => state.setUiStyle);
  const setAccent = useAppearanceStore((state) => state.setAccent);
  const setTheme = useAppearanceStore((state) => state.setTheme);
  const setGameOverlay = useAppearanceStore((state) => state.setGameOverlay);
  const setGameOverlayOpponent = useAppearanceStore((state) => state.setGameOverlayOpponent);
  const [activeCategory, setActiveCategory] = useState('appearance');

  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'en-US', label: t('settings.languageEnglish') },
    { value: 'zh-CN', label: t('settings.languageChinese') },
  ];

  const activeCategoryMeta = categories.find((cat) => cat.id === activeCategory) ?? categories[0]!;

  return (
    <div className="reference-page reference-settings flex-1 h-full min-h-0 flex flex-col overflow-hidden">

      <section className="reference-page-heading shrink-0">
        <h1>
          <span>{t('settings.title')} / </span>
          <strong>{t(activeCategoryMeta.labelKey)}</strong>
        </h1>
        <p>{t('settings.subtitle')}</p>
        <div className="reference-heading-rule" aria-hidden="true" />
      </section>

      <div
        className="reference-settings-layout flex-1 min-h-0 flex overflow-hidden"
        data-testid="settings-content-row"
      >

        <nav className="reference-settings-nav shrink-0" aria-label={t('settings.title')}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={activeCategory === cat.id ? 'is-active' : undefined}
            >
              <cat.icon size={18} aria-hidden="true" />
              <span>{t(cat.labelKey)}</span>
            </button>
          ))}
        </nav>

        <div className="reference-settings-content flex-1 min-h-0 overflow-y-auto">
          <div className="reference-settings-panel space-y-4">

            {activeCategory === 'appearance' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <SettingsRow
                  title={t('settings.language')}
                  description={t('settings.languageDescription')}
                  control={
                    <SettingsSegment
                      label={t('settings.language')}
                      options={languageOptions}
                      value={languagePreference}
                      onChange={setLanguagePreference}
                    />
                  }
                />

                <SettingsRow
                  title={t('settings.appearance.uiStyle.title')}
                  description={t('settings.appearance.uiStyle.description')}
                  control={
                    <SettingsSegment
                      label={t('settings.appearance.uiStyle.title')}
                      options={UI_STYLE_OPTIONS.map((opt) => ({
                        value: opt,
                        label: t(`settings.appearance.uiStyle.${opt}`),
                      }))}
                      value={uiStyle}
                      onChange={setUiStyle}
                    />
                  }
                />

                <SettingsRow
                  title={t('settings.appearance.density.title')}
                  description={t('settings.appearance.density.description')}
                  control={
                    <SettingsSegment
                      label={t('settings.appearance.density.title')}
                      options={(['comfortable', 'compact'] as Density[]).map((opt) => ({
                        value: opt,
                        label: t(`settings.appearance.density.${opt}`),
                      }))}
                      value={density}
                      onChange={setDensity}
                    />
                  }
                />

                {/* Theme + accent only apply to the macOS skin. The reference
                    (Arcane) skin is fixed dark + green, so these controls are
                    hidden for it to avoid exposing no-op options. */}
                {uiStyle === 'macos' && (
                  <>
                    <SettingsRow
                      title={t('settings.appearance.theme.title')}
                      description={t('settings.appearance.theme.description')}
                      control={
                        <SettingsSegment
                          label={t('settings.appearance.theme.title')}
                          options={(['system', 'light', 'dark'] as Theme[]).map((opt) => ({
                            value: opt,
                            label: t(`settings.appearance.theme.${opt}`),
                          }))}
                          value={theme}
                          onChange={setTheme}
                        />
                      }
                    />

                    <SettingsRow
                      title={t('settings.appearance.accent.title')}
                      description={t('settings.appearance.accent.description')}
                      control={
                        <div className="reference-accent-swatches shrink-0">
                          {ALL_ACCENTS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setAccent(opt)}
                              className={`reference-accent-swatch ${accent === opt ? 'is-active' : ''}`}
                              style={{ backgroundColor: ACCENT_PALETTE[opt].accentLight }}
                              aria-label={ACCENT_LABELS[opt]}
                              title={ACCENT_LABELS[opt]}
                            />
                          ))}
                        </div>
                      }
                    />
                  </>
                )}
              </div>
            )}

            {activeCategory === 'data' && <DataPanel />}

            {activeCategory === 'about' && <AboutPanel />}

            {activeCategory === 'overlay' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <SettingsRow
                  title={t('settings.overlayPanel.enableTitle')}
                  description={t('settings.overlayPanel.enableDescription')}
                  control={
                    <ReferenceToggle checked={gameOverlay} onChange={() => setGameOverlay(!gameOverlay)} />
                  }
                />

                <SettingsRow
                  title={t('settings.overlayPanel.enableOpponentTitle')}
                  description={t('settings.overlayPanel.enableOpponentDescription')}
                  control={
                    <ReferenceToggle
                      checked={gameOverlayOpponent}
                      onChange={() => setGameOverlayOpponent(!gameOverlayOpponent)}
                    />
                  }
                />

                <p className="reference-settings-hint">{t('settings.overlayPanel.runningHint')}</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

type BulkDownloadState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed-with-errors'
  | 'failed';

type BulkDownloadStatus = {
  state: BulkDownloadState;
  progress: {
    completed: number;
    total: number;
    failed: number;
    currentCardId: string | null;
  };
  stats: {
    downloadedRenders: number;
    downloadedTiles: number;
    skippedRenders: number;
    skippedTiles: number;
    failed: number;
  };
};

function DataPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BulkDownloadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const api = typeof window !== 'undefined' ? window.hdt?.cardImages?.bulkDownload : undefined;

  useEffect(() => {
    let alive = true;
    setError(null);

    const refresh = async () => {
      try {
        const s = await api?.getStatus();
        if (alive && s) setStatus(s);
      } catch {
        // ignore
      }
    };
    void refresh();

    const unsubscribe = api?.onProgress((s) => {
      if (alive) setStatus(s);
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [api]);

  const run = async (action: 'start' | 'resume') => {
    setError(null);
    if (!api) {
      setError(t('settings.cardImages.unavailable'));
      return;
    }
    try {
      const result = await (action === 'start' ? api.start(['render', 'tile']) : api.resume());
      if (!result.ok) {
        if ('error' in result && result.error === 'insufficient-disk-space') {
          setError(t('settings.cardImages.diskSpaceError'));
        } else {
          setError(t('settings.cardImages.failed'));
        }
      } else {
        setStatus(result.status);
      }
    } catch {
      setError(t('settings.cardImages.failed'));
    }
  };

  const handlePause = () => {
    try {
      api?.pause();
    } catch {
      // ignore
    }
  };

  const handleAbort = () => {
    try {
      api?.abort();
    } catch {
      // ignore
    }
  };

  const progressText = status ? `${status.progress.completed}/${status.progress.total}` : '0/0';
  const percent =
    status && status.progress.total > 0
      ? Math.round((status.progress.completed / status.progress.total) * 100)
      : 0;

  const primaryLabel =
    status?.state === 'paused'
      ? t('settings.cardImages.resume')
      : status?.state === 'running'
        ? t('settings.cardImages.downloading')
        : t('settings.cardImages.download');

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <SettingsRow
        title={t('settings.cardImages.title')}
        description={t('settings.cardImages.description')}
        control={
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => run(status?.state === 'paused' ? 'resume' : 'start')}
              disabled={status?.state === 'running'}
              className="reference-action-button disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {primaryLabel}
            </button>
            {status?.state === 'running' && (
              <>
                <button type="button" onClick={handlePause} className="reference-ghost-button">
                  {t('settings.cardImages.pause')}
                </button>
                <button type="button" onClick={handleAbort} className="reference-ghost-button">
                  {t('settings.cardImages.abort')}
                </button>
              </>
            )}
          </div>
        }
      />

      {status && status.progress.total > 0 && (
        <div className="reference-panel px-5 py-4 space-y-2">
          <div className="reference-progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="reference-progress-caption">
            {progressText} ({percent}%)
            {status.state === 'completed' && ` — ${t('settings.cardImages.completed')}`}
            {status.state === 'completed-with-errors' &&
              ` — ${t('settings.cardImages.completedWithErrors', { count: status.progress.failed })}`}
          </p>
        </div>
      )}

      {error && <p className="reference-settings-error">{error}</p>}
    </div>
  );
}

function AboutPanel() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string>('');
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: 'idle' });
  const [openError, setOpenError] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    void window.hdt?.app?.getVersion().then((v) => {
      if (alive) setVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (updateState.kind === 'checking') return;
    setUpdateState({ kind: 'checking' });
    setOpenError(false);
    const api = window.hdt?.about;
    if (!api) {
      setUpdateState({ kind: 'unsupported' });
      return;
    }
    const result = await api.checkForUpdates();
    switch (result.state) {
      case 'unsupported':
        setUpdateState({ kind: 'unsupported' });
        break;
      case 'up-to-date':
        setUpdateState({ kind: 'up-to-date' });
        break;
      case 'update-available':
        setUpdateState({ kind: 'update-available', version: result.version });
        break;
      case 'error':
        setUpdateState({ kind: 'error', message: result.message });
        break;
    }
  };

  const handleOpenLicense = async () => {
    setOpenError(false);
    const ok = (await window.hdt?.about?.openLicense()) ?? false;
    if (!ok) setOpenError(true);
  };

  const handleOpenNotices = async () => {
    setOpenError(false);
    const ok = (await window.hdt?.about?.openThirdPartyNotices()) ?? false;
    if (!ok) setOpenError(true);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <p className="reference-settings-version">
        {t('settings.about.version', { version: version || '—' })}
      </p>

      <SettingsRow
        title={t('settings.about.checkForUpdates')}
        description={renderUpdateMessage(t, updateState)}
        control={
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={updateState.kind === 'checking'}
            className="reference-action-button shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {updateState.kind === 'checking'
              ? t('settings.about.checking')
              : t('settings.about.checkForUpdates')}
          </button>
        }
      />

      <SettingsRow
        title={t('settings.about.viewLicense')}
        description={t('settings.about.copyright')}
        control={
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={handleOpenLicense} className="reference-ghost-button">
              {t('settings.about.viewLicense')}
            </button>
            <button type="button" onClick={handleOpenNotices} className="reference-ghost-button">
              {t('settings.about.viewThirdPartyNotices')}
            </button>
          </div>
        }
      />

      {openError && (
        <p className="reference-settings-error">{t('settings.about.openFailed')}</p>
      )}

      <div className="reference-panel reference-settings-disclaimer">
        <p>{t('settings.about.disclaimer')}</p>
      </div>
    </div>
  );
}

function renderUpdateMessage(
  t: (key: string, values?: Record<string, string | number | boolean>) => string,
  state: UpdateState,
): string {
  switch (state.kind) {
    case 'idle':
      return '';
    case 'checking':
      return t('settings.about.checking');
    case 'up-to-date':
      return t('settings.about.upToDate');
    case 'update-available':
      return t('settings.about.updateAvailable', { version: state.version });
    case 'unsupported':
      return t('settings.about.updateUnsupported');
    case 'error':
      return t('settings.about.updateError', { message: state.message });
  }
}
