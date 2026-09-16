import { useEffect, useState, type ReactNode } from 'react';
import { CardDataPanel } from './CardDataPanel';
import { AppUpdatePanel } from './AppUpdatePanel';
import { ConnectionDiagnostics } from './ConnectionDiagnostics';
import { Database, Info, Monitor, Palette, Sparkles } from 'lucide-react';
import type { AdvisorConfig, AdvisorProvider } from '@hdt/advisor';
import { useTranslation, type LanguagePreference } from '../i18n';
import { useI18nStore } from '../i18n/i18n-store';
import { useAppearanceStore, ACCENT_PALETTE, type Accent, type Density, type Theme, type UiStyle } from '../stores/appearance-store';
import { Button } from './beui/button';
import { Switch } from './beui/switch';
import { SelectionIndicator, SelectionScope } from './beui/selection';

const ALL_ACCENTS: Accent[] = ['blue', 'red', 'orange', 'yellow', 'green', 'mint', 'purple', 'pink'];
const UI_STYLE_OPTIONS: UiStyle[] = ['reference', 'macos'];
const ADVISOR_PROVIDER_OPTIONS: AdvisorProvider[] = [
  'openai',
  'anthropic',
  'google',
  'openai-compatible',
];
const ACCENT_LABELS: Record<Accent, string> = {
  blue: 'Blue', red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', mint: 'Mint', purple: 'Purple', pink: 'Pink',
};
const DEFAULT_ADVISOR_CONFIG: AdvisorConfig = {
  enabled: false,
  autoSuggest: true,
  provider: 'openai',
  model: 'gpt-4o-mini',
  language: 'zh',
  maxToolRounds: 4,
};

const categories = [
  { id: 'appearance', labelKey: 'settings.appearance.categoryLabel', icon: Palette },
  { id: 'overlay', labelKey: 'settings.overlay', icon: Monitor },
  { id: 'data', labelKey: 'settings.data', icon: Database },
  { id: 'advisor', labelKey: 'settings.advisor.categoryLabel', icon: Sparkles },
  { id: 'about', labelKey: 'settings.about.categoryLabel', icon: Info },
];

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
      <SelectionScope>
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className="beui-selection"
          >
            <SelectionIndicator active={value === option.value} />
            {option.label}
          </Button>
        ))}
      </SelectionScope>
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

function ReferenceToggle({
  checked,
  onChange,
  testId,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  testId?: string;
  label: string;
}) {
  return (
    <Switch
      data-testid={testId}
      aria-label={label}
      checked={checked}
      onCheckedChange={onChange}
    />
  );
}

export function Settings({ category, onCategoryChange }: {
  category?: string;
  onCategoryChange?: (category: string) => void;
} = {}) {
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
  const [localCategory, setLocalCategory] = useState('appearance');
  const requestedCategory = category ?? localCategory;
  const activeCategory = categories.some(c => c.id === requestedCategory) ? requestedCategory : 'appearance';
  const setActiveCategory = (value: string) => {
    setLocalCategory(value);
    onCategoryChange?.(value);
  };

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
          <SelectionScope>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                type="button"
                data-testid={`settings-category-${cat.id}`}
                onClick={() => setActiveCategory(cat.id)}
                className="beui-selection"
                aria-current={activeCategory === cat.id ? 'page' : undefined}
              >
                <SelectionIndicator active={activeCategory === cat.id} />
                <cat.icon size={18} aria-hidden="true" />
                <span>{t(cat.labelKey)}</span>
              </Button>
            ))}
          </SelectionScope>
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

            {activeCategory === 'data' && <><ConnectionDiagnostics /><CardDataPanel /><DataPanel /></>}

            {activeCategory === 'advisor' && <AdvisorSettingsPanel />}

            {activeCategory === 'about' && <AboutPanel />}

            {activeCategory === 'overlay' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <SettingsRow
                  title={t('settings.overlayPanel.enableTitle')}
                  description={t('settings.overlayPanel.enableDescription')}
                  control={
                    <ReferenceToggle label={t('settings.overlayPanel.enableTitle')} checked={gameOverlay} onChange={() => setGameOverlay(!gameOverlay)} />
                  }
                />

                <SettingsRow
                  title={t('settings.overlayPanel.enableOpponentTitle')}
                  description={t('settings.overlayPanel.enableOpponentDescription')}
                  control={
                    <ReferenceToggle
                      label={t('settings.overlayPanel.enableOpponentTitle')}
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

function AdvisorSettingsPanel() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AdvisorConfig>(DEFAULT_ADVISOR_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setError(null);
    const api = window.hdt?.advisor;
    if (!api?.getConfig) {
      setError(t('settings.advisor.unavailable'));
      setLoaded(true);
      return () => {
        alive = false;
      };
    }
    void api
      .getConfig()
      .then((next) => {
        if (!alive) return;
        setConfig({ ...DEFAULT_ADVISOR_CONFIG, ...next });
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setError(t('settings.advisor.unavailable'));
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [t]);

  const saveConfig = async (next: AdvisorConfig): Promise<void> => {
    setConfig(next);
    setError(null);
    const api = window.hdt?.advisor;
    if (!api?.setConfig) {
      setError(t('settings.advisor.unavailable'));
      return;
    }
    try {
      const saved = await api.setConfig(next);
      setConfig({ ...DEFAULT_ADVISOR_CONFIG, ...saved });
    } catch {
      setError(t('settings.advisor.saveFailed'));
    }
  };

  const patchConfig = (patch: Partial<AdvisorConfig>): void => {
    let next: AdvisorConfig = { ...config, ...patch };
    if (next.provider !== 'openai-compatible') {
      const { baseURL, ...withoutBaseURL } = next;
      void baseURL;
      next = withoutBaseURL;
    }
    void saveConfig(next);
  };

  const handleTextCommit = (patch: Partial<AdvisorConfig>): void => {
    patchConfig(patch);
  };

  const handleApiKeySave = async (): Promise<void> => {
    const key = apiKey.trim();
    if (!key) return;
    const api = window.hdt?.advisor;
    if (!api?.setApiKey) {
      setError(t('settings.advisor.unavailable'));
      return;
    }
    setError(null);
    try {
      const apiKeyRef = await api.setApiKey(config.provider, key);
      setApiKey('');
      setApiKeySaved(true);
      await saveConfig({ ...config, apiKeyRef });
    } catch {
      setError(t('settings.advisor.keySaveFailed'));
    }
  };

  if (!loaded) {
    return (
      <div className="reference-panel px-5 py-4 text-text-mute">
        {t('settings.advisor.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <SettingsRow
        title={t('settings.advisor.enabledTitle')}
        description={t('settings.advisor.enabledDescription')}
        control={
          <ReferenceToggle
            label={t('settings.advisor.enabledTitle')}
            checked={config.enabled}
            onChange={() => patchConfig({ enabled: !config.enabled })}
            testId="settings-advisor-enabled"
          />
        }
      />

      <SettingsRow
        title={t('settings.advisor.autoSuggestTitle')}
        description={t('settings.advisor.autoSuggestDescription')}
        control={
          <ReferenceToggle
            label={t('settings.advisor.autoSuggestTitle')}
            checked={config.autoSuggest}
            onChange={() => patchConfig({ autoSuggest: !config.autoSuggest })}
            testId="settings-advisor-autosuggest"
          />
        }
      />

      <SettingsRow
        title={t('settings.advisor.providerTitle')}
        description={t('settings.advisor.providerDescription')}
        control={
          <SettingsSegment
            label={t('settings.advisor.providerTitle')}
            options={ADVISOR_PROVIDER_OPTIONS.map((provider) => ({
              value: provider,
              label: t(`settings.advisor.provider.${provider}`),
            }))}
            value={config.provider}
            onChange={(provider) => patchConfig({ provider })}
          />
        }
      />

      <SettingsRow
        title={t('settings.advisor.modelTitle')}
        description={t('settings.advisor.modelDescription')}
        control={
          <input
            data-testid="settings-advisor-model"
            value={config.model}
            onChange={(event) => setConfig({ ...config, model: event.currentTarget.value })}
            onBlur={(event) => handleTextCommit({ model: event.currentTarget.value.trim() })}
            placeholder={t('settings.advisor.modelPlaceholder')}
            className="min-w-[220px] rounded border border-border bg-overlay-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        }
      />

      {config.provider === 'openai-compatible' ? (
        <SettingsRow
          title={t('settings.advisor.baseURLTitle')}
          description={t('settings.advisor.baseURLDescription')}
          control={
            <input
              data-testid="settings-advisor-base-url"
              value={config.baseURL ?? ''}
              onChange={(event) => setConfig({ ...config, baseURL: event.currentTarget.value })}
              onBlur={(event) => handleTextCommit({ baseURL: event.currentTarget.value.trim() })}
              placeholder={t('settings.advisor.baseURLPlaceholder')}
              className="min-w-[260px] rounded border border-border bg-overlay-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          }
        />
      ) : null}

      <SettingsRow
        title={t('settings.advisor.apiKeyTitle')}
        description={t('settings.advisor.apiKeyDescription')}
        control={
          <div className="flex min-w-[280px] items-center gap-2">
            <input
              data-testid="settings-advisor-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.currentTarget.value);
                setApiKeySaved(false);
              }}
              placeholder={
                config.apiKeyRef ? t('settings.advisor.apiKeyConfigured') : t('settings.advisor.apiKeyPlaceholder')
              }
              className="min-w-0 flex-1 rounded border border-border bg-overlay-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <button
              type="button"
              data-testid="settings-advisor-api-key-save"
              onClick={() => {
                void handleApiKeySave();
              }}
              disabled={apiKey.trim().length === 0}
              className="reference-action-button shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {apiKeySaved ? t('settings.advisor.apiKeySaved') : t('settings.advisor.saveApiKey')}
            </button>
          </div>
        }
      />

      <div className="reference-panel reference-settings-disclaimer">
        <p>{t('settings.advisor.privacyNote')}</p>
      </div>

      {error ? <p className="reference-settings-error">{error}</p> : null}
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

      <AppUpdatePanel />

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
