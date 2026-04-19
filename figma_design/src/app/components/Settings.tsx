import { useState } from 'react';
import { Monitor, Bell, HardDrive, Gamepad2, Volume2, Shield } from 'lucide-react';

const categories = [
  { id: 'general', label: 'General', icon: Shield },
  { id: 'tracker', label: 'Deck Tracker', icon: Gamepad2 },
  { id: 'overlay', label: 'In-Game Overlay', icon: Monitor },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'data', label: 'Data & Sync', icon: HardDrive },
  { id: 'audio', label: 'Audio', icon: Volume2 },
];

export function Settings() {
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

  return (
    <div className="flex-1 flex flex-col bg-[#0E0E14] overflow-hidden text-slate-300">
      
      {/* Header */}
      <div className="bg-[#14141A] border-b border-[#2A2A35] p-6 shrink-0 z-10 sticky top-0">
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-slate-400 text-sm">Configure your experience and tracker behavior.</p>
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
                <span>{cat.label}</span>
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
                  <h2 className="text-xl font-bold text-white">App Behavior</h2>
                  <p className="text-slate-400 text-sm mt-1">Manage how the application launches and runs.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35]">
                    <div>
                      <h3 className="text-white font-medium">Auto-start on Boot</h3>
                      <p className="text-slate-500 text-sm mt-0.5">Launch the app when your computer starts</p>
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
                      <h3 className="text-white font-medium">Minimize to System Tray</h3>
                      <p className="text-slate-500 text-sm mt-0.5">Keep running in background when closed</p>
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
                      <h3 className="text-white font-medium">Hardware Acceleration</h3>
                      <p className="text-slate-500 text-sm mt-0.5">Use GPU to render UI. Disable if you experience stuttering.</p>
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
                  <h2 className="text-xl font-bold text-white">Deck Tracker</h2>
                  <p className="text-slate-400 text-sm mt-1">Configure what information is shown during matches.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-[#1C1C24] rounded-xl border border-[#2A2A35]">
                    <div>
                      <h3 className="text-white font-medium">Show Player Tracker</h3>
                      <p className="text-slate-500 text-sm mt-0.5">Display remaining cards in your deck</p>
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
                      <h3 className="text-white font-medium">Show Opponent Tracker</h3>
                      <p className="text-slate-500 text-sm mt-0.5">Track cards played by your opponent</p>
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
                      <h3 className="text-white font-medium">Secrets Helper</h3>
                      <p className="text-slate-500 text-sm mt-0.5">Display possible secrets when opponent plays one</p>
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
                <h2 className="text-xl font-bold text-white mb-2">Section Under Construction</h2>
                <p className="text-slate-500 max-w-sm">
                  These settings will be available in the next update. Please check back later.
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
