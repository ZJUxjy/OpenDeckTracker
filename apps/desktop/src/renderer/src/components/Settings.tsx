import { useEffect, useState } from 'react';
import { Info, Monitor, Palette } from 'lucide-react';
import { useTranslation, type LanguagePreference } from '../i18n';
import { useI18nStore } from '../i18n/i18n-store';
import { useAppearanceStore, ACCENT_PALETTE, type Accent, type Density, type Theme } from '../stores/appearance-store';

const ALL_ACCENTS: Accent[] = ['blue', 'red', 'orange', 'yellow', 'green', 'mint', 'purple', 'pink'];
const ACCENT_LABELS: Record<Accent, string> = {
  blue: 'Blue', red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', mint: 'Mint', purple: 'Purple', pink: 'Pink',
};

// Only categories whose panels are wired to real preferences are exposed.
// "general" / "tracker" / "notifications" / "data" / "audio" panels were
// non-functional placeholders (toggles only mutated local React state with
// no IPC / store wiring) and are hidden until they ship behind real
// preferences.
const categories = [
  { id: 'appearance', labelKey: 'settings.appearance.categoryLabel', icon: Palette },
  { id: 'overlay', labelKey: 'settings.overlay', icon: Monitor },
  { id: 'about', labelKey: 'settings.about.categoryLabel', icon: Info },
];

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'update-available'; version: string }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export function Settings() {
  const { t } = useTranslation();
  const languagePreference = useI18nStore((state) => state.languagePreference);
  const setLanguagePreference = useI18nStore((state) => state.setLanguagePreference);
  const density = useAppearanceStore((state) => state.density);
  const accent = useAppearanceStore((state) => state.accent);
  const theme = useAppearanceStore((state) => state.theme);
  const gameOverlay = useAppearanceStore((state) => state.gameOverlay);
  const gameOverlayOpponent = useAppearanceStore((state) => state.gameOverlayOpponent);
  const setDensity = useAppearanceStore((state) => state.setDensity);
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden text-text">

      {/* Header */}
      <div className="px-8 pt-7 pb-4 shrink-0 z-10 sticky top-0">
        <h1 className="text-2xl font-bold text-text mb-1">{t('settings.title')}</h1>
        <p className="text-text-secondary text-sm">{t('settings.subtitle')}</p>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* Settings Sidebar — Apple-style nested category list */}
        <div className="w-60 flex flex-col overflow-y-auto">
          <div className="px-3 py-2 space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium ${
                  activeCategory === cat.id
                    ? 'tahoe-active-pill text-text font-semibold'
                    : 'text-text-secondary hover:text-text hover:bg-overlay-hover'
                }`}
              >
                <cat.icon size={18} className={activeCategory === cat.id ? 'text-text' : 'text-text-tertiary'} />
                <span>{t(cat.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Settings Content Area */}
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="max-w-3xl space-y-8">
            
            {activeCategory === 'appearance' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="text-xl font-bold text-text">{t('settings.appearance.categoryLabel')}</h2>
                </div>

                <div className="space-y-4">
                  {/* Language */}
                  <div className="settings-row tahoe-card flex items-center justify-between p-4 gap-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.language')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.languageDescription')}</p>
                    </div>
                    <div className="flex rounded-md border border-border bg-overlay-surface p-1">
                      {languageOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setLanguagePreference(option.value)}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            languagePreference === option.value
                              ? 'bg-accent text-on-accent'
                              : 'text-text-dim hover:text-text'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Density */}
                  <div className="settings-row tahoe-card flex items-center justify-between p-4 gap-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.appearance.density.title')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.appearance.density.description')}</p>
                    </div>
                    <div className="flex rounded-md border border-border bg-overlay-surface p-1">
                      {(['comfortable', 'compact'] as Density[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setDensity(opt)}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            density === opt
                              ? 'bg-accent text-on-accent'
                              : 'text-text-dim hover:text-text'
                          }`}
                        >
                          {t(`settings.appearance.density.${opt}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Theme — System / Light / Dark */}
                  <div className="settings-row tahoe-card flex items-center justify-between p-4 gap-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.appearance.theme.title')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.appearance.theme.description')}</p>
                    </div>
                    <div className="flex rounded-md border border-border bg-overlay-surface p-1">
                      {(['system', 'light', 'dark'] as Theme[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setTheme(opt)}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            theme === opt
                              ? 'bg-accent text-text-on-accent'
                              : 'text-text-dim hover:text-text'
                          }`}
                        >
                          {t(`settings.appearance.theme.${opt}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Accent — 8 macOS System colors */}
                  <div className="settings-row tahoe-card flex items-center justify-between p-4 gap-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.appearance.accent.title')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.appearance.accent.description')}</p>
                    </div>
                    <div className="flex gap-2">
                      {ALL_ACCENTS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAccent(opt)}
                          className={`w-7 h-7 rounded-full transition-all ${
                            accent === opt
                              ? 'ring-2 ring-offset-2 ring-offset-bg-2 ring-accent'
                              : 'ring-1 ring-border hover:ring-border-hi'
                          }`}
                          style={{ backgroundColor: ACCENT_PALETTE[opt].accentLight }}
                          aria-label={ACCENT_LABELS[opt]}
                          title={ACCENT_LABELS[opt]}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'about' && <AboutPanel />}

            {activeCategory === 'overlay' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="text-xl font-bold text-text">{t('settings.overlay')}</h2>
                </div>

                <div className="space-y-4">
                  <div className="settings-row tahoe-card flex items-center justify-between p-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.overlayPanel.enableTitle')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.overlayPanel.enableDescription')}</p>
                    </div>
                    <button
                      onClick={() => setGameOverlay(!gameOverlay)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${gameOverlay ? 'bg-accent' : 'bg-overlay-elevated'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${gameOverlay ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="settings-row tahoe-card flex items-center justify-between p-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.overlayPanel.enableOpponentTitle')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.overlayPanel.enableOpponentDescription')}</p>
                    </div>
                    <button
                      onClick={() => setGameOverlayOpponent(!gameOverlayOpponent)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${gameOverlayOpponent ? 'bg-accent' : 'bg-overlay-elevated'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${gameOverlayOpponent ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <p className="text-text-mute text-xs px-4">{t('settings.overlayPanel.runningHint')}</p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
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
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-border pb-4 mb-6">
        <h2 className="text-xl font-bold text-text">{t('settings.about.title')}</h2>
        <p className="text-text-dim text-sm mt-1 font-mono tabular-nums">
          {t('settings.about.version', { version: version || '—' })}
        </p>
      </div>

      <div className="space-y-4">
        <div className="settings-row tahoe-card flex items-center justify-between p-4 gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-text font-medium">{t('settings.about.checkForUpdates')}</h3>
            <p className="text-text-mute text-sm mt-0.5">
              {renderUpdateMessage(t, updateState)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCheckForUpdates}
            disabled={updateState.kind === 'checking'}
            className="px-4 py-2 rounded bg-accent text-on-accent font-medium text-sm hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {updateState.kind === 'checking'
              ? t('settings.about.checking')
              : t('settings.about.checkForUpdates')}
          </button>
        </div>

        <div className="settings-row tahoe-card flex items-center justify-between p-4 gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-text font-medium">{t('settings.about.viewLicense')}</h3>
            <p className="text-text-mute text-sm mt-0.5">{t('settings.about.copyright')}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenLicense}
              className="px-3 py-2 rounded border border-border text-text-dim hover:text-text hover:border-border-hi text-sm"
            >
              {t('settings.about.viewLicense')}
            </button>
            <button
              type="button"
              onClick={handleOpenNotices}
              className="px-3 py-2 rounded border border-border text-text-dim hover:text-text hover:border-border-hi text-sm"
            >
              {t('settings.about.viewThirdPartyNotices')}
            </button>
          </div>
        </div>

        {openError && (
          <p className="text-red text-xs px-4">{t('settings.about.openFailed')}</p>
        )}

        <div className="tahoe-card p-4">
          <p className="text-text-mute text-xs leading-relaxed">
            {t('settings.about.disclaimer')}
          </p>
        </div>
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
