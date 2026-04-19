import { AppWindow, BarChart2, BookOpen, Crown, Settings, Swords, Trophy, Users } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { id: 'tracker', icon: AppWindow, label: 'Deck Tracker' },
  { id: 'stats', icon: BarChart2, label: 'Stats' },
  { id: 'collection', icon: BookOpen, label: 'Collection' },
];

export function Sidebar({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (id: string) => void }) {
  return (
    <aside className="w-64 bg-[#14141A] border-r border-[#2A2A35] flex flex-col h-full text-slate-300">
      <div className="p-6 flex items-center space-x-3 text-orange-500">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
          <Crown size={20} className="text-orange-500" />
        </div>
        <span className="text-xl font-bold tracking-wide">FIRESTONE</span>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-all duration-200 ${
              activeTab === item.id
                ? 'bg-[#2A2A35] text-white shadow-[inset_4px_0_0_0_#F97316]'
                : 'hover:bg-[#1C1C24] hover:text-white'
            }`}
          >
            <item.icon size={18} className={activeTab === item.id ? 'text-orange-500' : 'text-slate-500'} />
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-[#2A2A35]">
        <button 
          onClick={() => setActiveTab('settings')}
          className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${
            activeTab === 'settings' 
              ? 'bg-[#2A2A35] text-white shadow-[inset_4px_0_0_0_#F97316]' 
              : 'text-slate-400 hover:text-white hover:bg-[#1C1C24]'
          }`}
        >
          <Settings size={18} className={activeTab === 'settings' ? 'text-orange-500' : ''} />
          <span className="font-medium text-sm">Settings</span>
        </button>
      </div>
    </aside>
  );
}
