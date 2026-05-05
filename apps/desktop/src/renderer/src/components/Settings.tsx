import { useState } from 'react';
import { Monitor, Palette } from 'lucide-react';
import { useTranslation, type LanguagePreference } from '../i18n';
import { useI18nStore } from '../i18n/i18n-store';
import { useAppearanceStore, ACCENT_PALETTE, type Accent, type Density } from '../stores/appearance-store';

// Only categories whose panels are wired to real preferences are exposed.
// "general" / "tracker" / "notifications" / "data" / "audio" panels were
// non-functional placeholders (toggles only mutated local React state with
// no IPC / store wiring) and are hidden until they ship behind real
// preferences.
const categories = [
  { id: 'appearance', labelKey: 'settings.appearance.categoryLabel', icon: Palette },
  { id: 'overlay', labelKey: 'settings.overlay', icon: Monitor },
];

export function Settings() {
  const { t } = useTranslation();
  const languagePreference = useI18nStore((state) => state.languagePreference);
  const setLanguagePreference = useI18nStore((state) => state.setLanguagePreference);
  const density = useAppearanceStore((state) => state.density);
  const accent = useAppearanceStore((state) => state.accent);
  const gameOverlay = useAppearanceStore((state) => state.gameOverlay);
  const gameOverlayOpponent = useAppearanceStore((state) => state.gameOverlayOpponent);
  const setDensity = useAppearanceStore((state) => state.setDensity);
  const setAccent = useAppearanceStore((state) => state.setAccent);
  const setGameOverlay = useAppearanceStore((state) => state.setGameOverlay);
  const setGameOverlayOpponent = useAppearanceStore((state) => state.setGameOverlayOpponent);
  const [activeCategory, setActiveCategory] = useState('appearance');

  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'en-US', label: t('settings.languageEnglish') },
    { value: 'zh-CN', label: t('settings.languageChinese') },
  ];

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden text-text">
      
      {/* Header */}
      <div className="bg-bg border-b border-border p-6 shrink-0 z-10 sticky top-0">
        <h1 className="text-2xl font-bold text-text mb-1">{t('settings.title')}</h1>
        <p className="text-text-dim text-sm">{t('settings.subtitle')}</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Settings Sidebar */}
        <div className="w-64 bg-bg border-r border-border flex flex-col overflow-y-auto">
          <div className="p-4 space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                  activeCategory === cat.id 
                    ? 'bg-accent/10 text-accent border border-accent/20' 
                    : 'text-text-dim hover:text-text hover:bg-bg-2 border border-transparent'
                }`}
              >
                <cat.icon size={18} className={activeCategory === cat.id ? 'text-accent' : 'text-text-mute'} />
                <span>{t(cat.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Settings Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-bg">
          <div className="max-w-3xl space-y-8">
            
            {activeCategory === 'appearance' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="text-xl font-bold text-text">{t('settings.appearance.categoryLabel')}</h2>
                </div>

                <div className="space-y-4">
                  {/* Language */}
                  <div className="settings-row flex items-center justify-between p-4 bg-bg-2 rounded-xl border border-border gap-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.language')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.languageDescription')}</p>
                    </div>
                    <div className="flex rounded-md border border-border bg-bg-2 p-1">
                      {languageOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setLanguagePreference(option.value)}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            languagePreference === option.value
                              ? 'bg-accent text-bg'
                              : 'text-text-dim hover:text-text'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Density */}
                  <div className="settings-row flex items-center justify-between p-4 bg-bg-2 rounded-xl border border-border gap-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.appearance.density.title')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.appearance.density.description')}</p>
                    </div>
                    <div className="flex rounded-md border border-border bg-bg-2 p-1">
                      {(['comfortable', 'compact'] as Density[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setDensity(opt)}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            density === opt
                              ? 'bg-accent text-bg'
                              : 'text-text-dim hover:text-text'
                          }`}
                        >
                          {t(`settings.appearance.density.${opt}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Accent */}
                  <div className="settings-row flex items-center justify-between p-4 bg-bg-2 rounded-xl border border-border gap-4">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.appearance.accent.title')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.appearance.accent.description')}</p>
                    </div>
                    <div className="flex gap-2">
                      {(['cyan', 'teal', 'violet'] as Accent[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAccent(opt)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            accent === opt
                              ? 'border-text ring-2 ring-text/30'
                              : 'border-border hover:border-border-hi'
                          }`}
                          style={{ backgroundColor: ACCENT_PALETTE[opt].accent }}
                          aria-label={t(`settings.appearance.accent.${opt}`)}
                        >
                          {accent === opt && (
                            <span className="flex items-center justify-center w-full h-full text-bg text-xs font-bold">&#10003;</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'overlay' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="border-b border-border pb-4 mb-6">
                  <h2 className="text-xl font-bold text-text">{t('settings.overlay')}</h2>
                </div>

                <div className="space-y-4">
                  <div className="settings-row flex items-center justify-between p-4 bg-bg-2 rounded-xl border border-border">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.overlayPanel.enableTitle')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.overlayPanel.enableDescription')}</p>
                    </div>
                    <button
                      onClick={() => setGameOverlay(!gameOverlay)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${gameOverlay ? 'bg-accent' : 'bg-bg-3'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${gameOverlay ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="settings-row flex items-center justify-between p-4 bg-bg-2 rounded-xl border border-border">
                    <div>
                      <h3 className="text-text font-medium">{t('settings.overlayPanel.enableOpponentTitle')}</h3>
                      <p className="text-text-mute text-sm mt-0.5">{t('settings.overlayPanel.enableOpponentDescription')}</p>
                    </div>
                    <button
                      onClick={() => setGameOverlayOpponent(!gameOverlayOpponent)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${gameOverlayOpponent ? 'bg-accent' : 'bg-bg-3'}`}
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
