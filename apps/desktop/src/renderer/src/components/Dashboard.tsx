import { MOCK_DECK, MOCK_STATS } from '../data/mockDecks';
import { ArrowUpRight, BarChart3, Clock, Copy, PieChart, Shield, Target, Trophy } from 'lucide-react';

export function Dashboard() {
  const cards = MOCK_DECK;
  const totalMatches = MOCK_STATS.wins + MOCK_STATS.losses;

  // Simple Mana Curve calculations
  const manaCurve = [0, 0, 0, 0, 0, 0, 0, 0]; // 0, 1, 2, 3, 4, 5, 6, 7+
  cards.forEach(card => {
    const cost = Math.min(card.cost, 7);
    manaCurve[cost] += card.count;
  });
  const maxMana = Math.max(...manaCurve);

  return (
    <div className="flex-1 bg-[#0E0E14] flex flex-col overflow-y-auto">
      {/* Header section */}
      <div className="bg-[#1C1C24] px-8 py-8 border-b border-[#2A2A35]">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-6">
            {/* Hero Class Avatar Mock */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-900 to-red-600 border-4 border-[#2A2A35] shadow-lg flex items-center justify-center">
              <Shield size={40} className="text-white drop-shadow-md" />
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center space-x-3 mb-1">
                <span className="bg-orange-500/10 text-orange-500 text-xs font-bold px-2 py-1 rounded border border-orange-500/20 uppercase tracking-widest">
                  Standard
                </span>
                <span className="text-slate-400 text-sm">{MOCK_STATS.heroClass}</span>
              </div>
              <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                {MOCK_STATS.deckName}
              </h1>
              <div className="flex items-center text-slate-400 text-sm space-x-4">
                <span className="flex items-center"><Trophy size={14} className="mr-1 text-yellow-500" /> Rank: {MOCK_STATS.currentRank}</span>
                <span className="flex items-center"><Target size={14} className="mr-1 text-green-500" /> Winrate: {MOCK_STATS.winrate}%</span>
                <span className="flex items-center"><Clock size={14} className="mr-1 text-blue-500" /> {totalMatches} Matches Played</span>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-3">
            <button className="flex items-center bg-[#2A2A35] hover:bg-[#343441] text-white px-4 py-2 rounded-md transition-colors text-sm font-medium">
              <Copy size={16} className="mr-2 text-slate-400" />
              Copy Code
            </button>
            <button className="flex items-center bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium shadow-[0_0_15px_rgba(234,88,12,0.3)]">
              <ArrowUpRight size={16} className="mr-2" />
              Play Now
            </button>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Stats */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#1C1C24] p-5 rounded-xl border border-[#2A2A35] flex flex-col justify-center items-center">
              <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Total Wins</span>
              <span className="text-3xl font-black text-green-500">{MOCK_STATS.wins}</span>
            </div>
            <div className="bg-[#1C1C24] p-5 rounded-xl border border-[#2A2A35] flex flex-col justify-center items-center">
              <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Total Losses</span>
              <span className="text-3xl font-black text-red-500">{MOCK_STATS.losses}</span>
            </div>
            <div className="bg-[#1C1C24] p-5 rounded-xl border border-[#2A2A35] flex flex-col justify-center items-center relative overflow-hidden">
              <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Winrate</span>
              <span className="text-3xl font-black text-white">{MOCK_STATS.winrate}%</span>
              <div className="absolute bottom-0 left-0 h-1 bg-green-500" style={{ width: `${MOCK_STATS.winrate}%` }} />
            </div>
          </div>

          <div className="bg-[#1C1C24] rounded-xl border border-[#2A2A35] p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center">
                <BarChart3 size={20} className="mr-2 text-orange-500" /> Match History
              </h3>
              <select className="bg-[#12121A] text-sm text-slate-300 border border-[#2A2A35] rounded-md px-3 py-1.5 focus:outline-none">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>All Time</option>
              </select>
            </div>
            <div className="h-[250px] flex items-end justify-between space-x-2 pt-10 border-b border-slate-700 pb-2 relative">
              {/* Mock Bar Chart */}
              {[45, 60, 30, 80, 50, 90, 65, 40, 75, 55, 85, 45, 70, 60].map((val, i) => (
                <div key={i} className="w-full bg-[#2A2A35] hover:bg-orange-500/80 transition-colors rounded-t-sm relative group" style={{ height: `${val}%` }}>
                  {/* Tooltip on hover */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-xs text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                    {val}% Winrate
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-3 px-1">
              <span>Nov 10</span>
              <span>Today</span>
            </div>
          </div>
        </div>

        {/* Right Column - Mana Curve & Composition */}
        <div className="space-y-6">
          <div className="bg-[#1C1C24] rounded-xl border border-[#2A2A35] p-6">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center">
              <PieChart size={20} className="mr-2 text-blue-500" /> Mana Curve
            </h3>
            <div className="flex items-end justify-between h-40 mb-2">
              {manaCurve.map((count, i) => (
                <div key={i} className="flex flex-col items-center w-8">
                  <div className="text-xs text-slate-400 mb-1 font-medium">{count}</div>
                  <div 
                    className="w-full bg-[#3B82F6] rounded-t-sm transition-all duration-500 hover:bg-[#60A5FA]"
                    style={{ height: `${maxMana > 0 ? (count / maxMana) * 100 : 0}%`, minHeight: count > 0 ? '4px' : '0' }}
                  />
                  <div className="mt-2 text-xs font-bold text-slate-500 w-6 h-6 bg-[#12121A] rounded flex items-center justify-center border border-[#2A2A35]">
                    {i === 7 ? '7+' : i}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1C1C24] rounded-xl border border-[#2A2A35] p-6">
            <h3 className="text-lg font-bold text-white mb-4">Deck Type</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Minions</span>
                  <span className="text-white font-medium">12</span>
                </div>
                <div className="w-full bg-[#12121A] rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '40%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Spells</span>
                  <span className="text-white font-medium">16</span>
                </div>
                <div className="w-full bg-[#12121A] rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: '55%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Weapons</span>
                  <span className="text-white font-medium">2</span>
                </div>
                <div className="w-full bg-[#12121A] rounded-full h-2">
                  <div className="bg-slate-400 h-2 rounded-full" style={{ width: '5%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
