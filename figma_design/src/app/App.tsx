import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DeckTracker } from './components/Decklist';
import { Dashboard } from './components/Dashboard';
import { Stats } from './components/Stats';
import { Collection } from './components/Collection';
import { Settings } from './components/Settings';
import { MOCK_DECK } from './data/mockDecks';
import { Bell, ChevronDown, Monitor, User, LayoutTemplate, Ghost } from 'lucide-react';
import { OverlayView } from './components/OverlayView';

export default function App() {
  const [activeTab, setActiveTab] = useState('tracker');
  const [viewMode, setViewMode] = useState<'desktop' | 'overlay'>('desktop');

  return (
    <div className="flex h-screen bg-[#0E0E14] text-slate-300 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      {viewMode === 'desktop' && (
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navigation Bar */}
        <header className="h-14 bg-[#14141A] border-b border-[#2A2A35] flex items-center justify-between px-6 shrink-0 z-50 shadow-md relative">
          <div className="flex items-center space-x-4">
            <span className="text-slate-400 text-sm font-medium uppercase tracking-wider flex items-center">
              <Monitor size={16} className="mr-2 text-green-500" /> Game Running
            </span>
            <div className="h-6 w-px bg-[#2A2A35] mx-2" />
            
            {/* View Mode Switcher */}
            <div className="flex bg-[#0E0E14] rounded-md p-1 border border-[#2A2A35]">
              <button
                onClick={() => setViewMode('desktop')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'desktop' ? 'bg-[#2A2A35] text-white shadow' : 'text-slate-500 hover:text-white'
                }`}
              >
                <LayoutTemplate size={14} />
                <span>Desktop App</span>
              </button>
              <button
                onClick={() => setViewMode('overlay')}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'overlay' ? 'bg-[#2A2A35] text-orange-400 shadow' : 'text-slate-500 hover:text-white'
                }`}
              >
                <Ghost size={14} />
                <span>In-Game Overlay</span>
              </button>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button className="relative text-slate-400 hover:text-white transition-colors">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-[#14141A]" />
            </button>
            <div className="h-6 w-px bg-[#2A2A35] mx-2" />
            <button className="flex items-center space-x-2 hover:bg-[#1C1C24] px-3 py-1.5 rounded-md transition-colors">
              <div className="w-7 h-7 bg-indigo-500 rounded flex items-center justify-center text-white font-bold text-sm">
                <User size={16} />
              </div>
              <span className="text-sm font-medium text-white">PlayerOne</span>
              <ChevronDown size={14} className="text-slate-500" />
            </button>
          </div>
        </header>

        {/* Dynamic Content View */}
        <main className="flex-1 flex overflow-hidden relative">
          {viewMode === 'overlay' ? (
            <OverlayView />
          ) : (
            <>
              {activeTab === 'tracker' && (
                <>
                  <Dashboard />
                  <div className="hidden lg:block h-full bg-[#0E0E14] p-6 border-l border-[#2A2A35]">
                    <DeckTracker cards={MOCK_DECK} />
                  </div>
                </>
              )}
              {activeTab === 'stats' && <Stats />}
              {activeTab === 'collection' && <Collection />}
              {activeTab === 'settings' && <Settings />}
              {!['tracker', 'stats', 'collection', 'settings'].includes(activeTab) && (
                <div className="flex-1 flex items-center justify-center text-slate-500 bg-[#0E0E14]">
                  <div className="text-center">
                    <div className="mb-4 inline-block p-4 rounded-full bg-[#1A1A24] border border-[#2A2A35]">
                      <Monitor size={32} className="text-orange-500/50" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">View not available</h2>
                    <p>This section is under construction.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
