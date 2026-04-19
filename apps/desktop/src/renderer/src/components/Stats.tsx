import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Swords, Trophy, Clock, Target } from 'lucide-react';

const mockMatchHistory = [
  { id: 1, deck: 'Control Warrior', opponent: 'Frost Mage', result: 'Win', duration: '12:45', date: '2 hours ago', coins: true },
  { id: 2, deck: 'Control Warrior', opponent: 'Aggro DH', result: 'Loss', duration: '05:30', date: '3 hours ago', coins: false },
  { id: 3, deck: 'Control Warrior', opponent: 'Thief Rogue', result: 'Win', duration: '15:20', date: '5 hours ago', coins: true },
  { id: 4, deck: 'Control Warrior', opponent: 'Ramp Druid', result: 'Loss', duration: '11:10', date: '1 day ago', coins: false },
  { id: 5, deck: 'Control Warrior', opponent: 'Shadow Priest', result: 'Win', duration: '08:45', date: '1 day ago', coins: false },
];

const classWinrates = [
  { name: 'Mage', wins: 45, losses: 30 },
  { name: 'Hunter', wins: 38, losses: 35 },
  { name: 'Priest', wins: 25, losses: 15 },
  { name: 'Rogue', wins: 40, losses: 42 },
  { name: 'Warlock', wins: 55, losses: 20 },
  { name: 'Paladin', wins: 30, losses: 30 },
];

export function Stats() {
  const [timeFilter, setTimeFilter] = useState('season');

  return (
    <div className="flex-1 flex flex-col bg-[#0E0E14] overflow-y-auto">
      {/* Header */}
      <div className="bg-[#14141A] border-b border-[#2A2A35] p-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Constructed Stats</h1>
          <p className="text-slate-400 text-sm">Detailed breakdown of your ranked performance.</p>
        </div>
        
        <div className="flex space-x-2">
          {['today', 'week', 'season', 'all-time'].map((filter) => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                timeFilter === filter 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-[#1C1C24] text-slate-400 hover:text-white hover:bg-[#2A2A35]'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        
        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#1C1C24] border border-[#2A2A35] rounded-xl p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-orange-500 group-hover:opacity-10 transition-opacity">
              <Trophy size={100} />
            </div>
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Overall Winrate</span>
            <div className="text-3xl font-black text-white">58.4%</div>
            <div className="text-sm mt-2 text-green-500 flex items-center">
              +2.1% <span className="text-slate-500 ml-1">vs last week</span>
            </div>
          </div>
          
          <div className="bg-[#1C1C24] border border-[#2A2A35] rounded-xl p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-blue-500 group-hover:opacity-10 transition-opacity">
              <Swords size={100} />
            </div>
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Matches Played</span>
            <div className="text-3xl font-black text-white">1,245</div>
            <div className="text-sm mt-2 text-slate-400">727 Wins - 518 Losses</div>
          </div>
          
          <div className="bg-[#1C1C24] border border-[#2A2A35] rounded-xl p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-purple-500 group-hover:opacity-10 transition-opacity">
              <Clock size={100} />
            </div>
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Time Played</span>
            <div className="text-3xl font-black text-white">152h</div>
            <div className="text-sm mt-2 text-slate-400">~7.3m average per match</div>
          </div>

          <div className="bg-[#1C1C24] border border-[#2A2A35] rounded-xl p-5 flex flex-col relative overflow-hidden group">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-red-500 group-hover:opacity-10 transition-opacity">
              <Target size={100} />
            </div>
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Best Deck</span>
            <div className="text-xl font-bold text-orange-400 truncate mt-1">Control Warrior</div>
            <div className="text-sm mt-2 text-slate-400">64.2% Winrate (120 games)</div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Class Winrate Chart */}
          <div className="xl:col-span-2 bg-[#1C1C24] border border-[#2A2A35] rounded-xl p-5">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center">
              Winrate vs Classes
            </h2>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classWinrates} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A35" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748B" axisLine={false} tickLine={false} />
                  <YAxis stroke="#64748B" axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: '#2A2A35' }}
                    contentStyle={{ backgroundColor: '#14141A', borderColor: '#2A2A35', color: '#fff' }}
                  />
                  <Bar dataKey="wins" name="Wins" stackId="a" fill="#10B981" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="losses" name="Losses" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Matches */}
          <div className="bg-[#1C1C24] border border-[#2A2A35] rounded-xl p-5 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">Recent Matches</h2>
              <button className="text-orange-500 text-sm font-medium hover:text-orange-400">View All</button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-[#2A2A35]">
              {mockMatchHistory.map((match) => (
                <div key={match.id} className="bg-[#14141A] rounded-lg p-3 border border-[#2A2A35] hover:border-slate-600 transition-colors flex flex-col cursor-pointer">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400">{match.date}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      match.result === 'Win' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {match.result}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-white font-medium text-sm">{match.deck}</span>
                      <span className="text-slate-500 text-xs mt-0.5">vs {match.opponent}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-300 text-sm font-medium">{match.duration}</span>
                      <div className="text-xs text-slate-500 mt-0.5">{match.coins ? 'Coin' : 'First'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
