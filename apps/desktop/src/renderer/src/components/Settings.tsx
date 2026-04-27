import { useState } from 'react';
import { Monitor, Bell, HardDrive, Gamepad2, Volume2, Shield } from 'lucide-react';
import { useTranslation, type LanguagePreference } from '../i18n';
import { useI18nStore } from '../i18n/i18n-store';

const categories = [
  { id: 'general', labelKey: 'settings.general', icon: Shield },
  { id: 'tracker', labelKey: 'settings.tracker', icon: Gamepad2 },
  { id: 'overlay', labelKey: 'settings.overlay', icon: Monitor },
  { id: 'notifications', labelKey: 'settings.notifications', icon: Bell },
  { id: 'data', labelKey: 'settings.data', icon: HardDrive },
  { id: 'audio', labelKey: 'settings.audio', icon: Volume2 },
];

export function Settings() {
  const { t } = useTranslation();
  const languagePreference = useI18nStore((state) => state.languagePreference);
  const setLanguagePreference = useI18nStore((state) => state.setLanguagePreference);
  const [activeCategory, setActiveCategory] = useState('general');
  const [settings, setSettings] = useState({
    autoStart: true,
    minimizeToTray: true,
    darkMode: true,
    hardwareAcceleration: true,
    showOpponentTracker: true,
    showPlayerTracker: true,
    showSecretsHelper: true,
    overlayOpacity: 85,
    overlayScale: 100,
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'en-US', label: t('settings.languageEnglish') },
    { value: 'zh-CN', label: t('settings.languageChinese') },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#0E0E14] overflow-hidden text-slate-300">
      
      {/* Header */}
      <div className="bg-[#14141A] border-b border-[#2A2A35] p-6 shrink-0 z-10 sticky top-0">
        <h1 className="text-2xl font-bold text-white mb-1">{t('settings.title')}</h1>
        <p className="text-slate-400 text-sm">{t('settings.subtitle')}</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Settings Sidebar */}
        <div className="w-64 bg-[#14141A] border-r border-[#2A2A35] flex flex-col overflow-y-auto">
          <div className="p-4 space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                  activeCategory === cat.id 
                    ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' 
                    : 'text-slate-400 hover:text-white hover:bg-[#1C1C24] border border-transparent'
                }`}
              >
                <cat.icon size={18} className={activeCategory === cat.id ? 'text-orange-500' : 'text-slate-500'} />
                <span>{t(cat.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Settings Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-[#0E0E14]">
          <div className="max-w-3xl space-y-8">
            
            {activeCategory === 'general' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="border-b border-[#2A2A35] pb-4 mb-6">
                  <h2 className="text-xl font-bold text-white">{t('settings.appBehavior')}</h2>
                  <p className="text-slate-400 text-sm mt-1">{t('settings.appBehaviorDescription')}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35] gap-4">
                    <div>
                      <h3 className="text-white font-medium">{t('settings.language')}</h3>
                      <p className="text-slate-500 text-sm mt-0.5">{t('settings.languageDescription')}</p>
                    </div>
                    <div className="flex rounded-md border border-[#2A2A35] bg-[#12121A] p-1">
                      {languageOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setLanguagePreference(option.value)}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            languagePreference === option.value
                              ? 'bg-orange-500 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35]">
                    <div>
                      <h3 className="text-white font-medium">{t('settings.autoStart')}</h3>
                      <p className="text-slate-500 text-sm mt-0.5">{t('settings.autoStartDescription')}</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('autoStart')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.autoStart ? 'bg-orange-500' : 'bg-slate-600'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${settings.autoStart ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35]">
                    <div>
                      <h3 className="text-white font-medium">{t('settings.minimizeToTray')}</h3>
                      <p className="text-slate-500 text-sm mt-0.5">{t('settings.minimizeToTrayDescription')}</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('minimizeToTray')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.minimizeToTray ? 'bg-orange-500' : 'bg-slate-600'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${settings.minimizeToTray ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35]">
                    <div>
                      <h3 className="text-white font-medium">{t('settings.hardwareAcceleration')}</h3>
                      <p className="text-slate-500 text-sm mt-0.5">{t('settings.hardwareAccelerationDescription')}</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('hardwareAcceleration')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.hardwareAcceleration ? 'bg-orange-500' : 'bg-slate-600'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${settings.hardwareAcceleration ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'tracker' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="border-b border-[#2A2A35] pb-4 mb-6">
                  <h2 className="text-xl font-bold text-white">{t('settings.deckTrackerTitle')}</h2>
                  <p className="text-slate-400 text-sm mt-1">{t('settings.deckTrackerDescription')}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35]">
                    <div>
                      <h3 className="text-white font-medium">{t('settings.showPlayerTracker')}</h3>
                      <p className="text-slate-500 text-sm mt-0.5">{t('settings.showPlayerTrackerDescription')}</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showPlayerTracker')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.showPlayerTracker ? 'bg-orange-500' : 'bg-slate-600'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${settings.showPlayerTracker ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35]">
                    <div>
                      <h3 className="text-white font-medium">{t('settings.showOpponentTracker')}</h3>
                      <p className="text-slate-500 text-sm mt-0.5">{t('settings.showOpponentTrackerDescription')}</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showOpponentTracker')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.showOpponentTracker ? 'bg-orange-500' : 'bg-slate-600'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${settings.showOpponentTracker ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35]">
                    <div>
                      <h3 className="text-white font-medium">{t('settings.secretsHelper')}</h3>
                      <p className="text-slate-500 text-sm mt-0.5">{t('settings.secretsHelperDescription')}</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showSecretsHelper')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.showSecretsHelper ? 'bg-orange-500' : 'bg-slate-600'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${settings.showSecretsHelper ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Placeholder for other categories */}
            {['overlay', 'notifications', 'data', 'audio'].includes(activeCategory) && (
              <div className="flex flex-col items-center justify-center h-64 text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 bg-[#1C1C24] rounded-full flex items-center justify-center mb-4 border border-[#2A2A35]">
                  <HardDrive size={32} className="text-slate-600" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{t('settings.underConstruction')}</h2>
                <p className="text-slate-500 max-w-sm">
                  {t('settings.underConstructionDescription')}
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
