import { useEffect, useState } from 'react';
import { Search, Filter, BookOpen, AlertCircle, Sparkles, Database } from 'lucide-react';

const expansions = [
  { id: 'standard', name: 'Standard Format', collected: 1450, total: 1800, sets: [
    { name: 'Festival of Legends', icon: '🎸', collected: 215, total: 245 },
    { name: 'TITANS', icon: '⚡', collected: 190, total: 245 },
    { name: 'Showdown in the Badlands', icon: '🤠', collected: 230, total: 245 },
    { name: 'Core', icon: '🐺', collected: 282, total: 282 },
  ]},
  { id: 'wild', name: 'Wild Format', collected: 3200, total: 4500, sets: [
    { name: 'Murder at Castle Nathria', icon: '🏰', collected: 210, total: 245 },
    { name: 'Voyage to the Sunken City', icon: '🌊', collected: 198, total: 245 },
    { name: 'Forged in the Barrens', icon: '🌵', collected: 200, total: 245 },
    { name: 'Madness at the Darkmoon Faire', icon: '🎡', collected: 245, total: 245 },
  ]}
];

export function Collection() {
  const [activeFormat, setActiveFormat] = useState('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [dbStats, setDbStats] = useState<{ total: number; sets: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined' || !window.hdt?.cards?.search) return;
    void window.hdt.cards
      .search({ limit: 10000 })
      .then((all) => {
        if (cancelled) return;
        const sets = new Set(all.map((c) => c.set));
        setDbStats({ total: all.length, sets: sets.size });
      })
      .catch(() => {
        // ignore — keep mock UI
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeData = expansions.find(e => e.id === activeFormat) ?? expansions[0]!;
  const percentage = Math.round((activeData.collected / activeData.total) * 100);

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      
      {/* Top Header */}
      <div className="bg-bg border-b border-border p-6 flex flex-col sm:flex-row items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex flex-col w-full sm:w-auto mb-4 sm:mb-0">
          <h1 className="text-2xl font-bold text-text mb-1 flex items-center">
            <BookOpen size={24} className="mr-3 text-accent" />
            My Collection
          </h1>
          <p className="text-text-dim text-sm">Track your progress and missing cards.</p>
        </div>
        
        <div className="flex space-x-4 w-full sm:w-auto">
          {dbStats && (
            <div className="bg-bg-2 p-3 rounded-lg border border-border flex items-center space-x-3 shadow-md">
              <div className="flex flex-col items-end">
                <span className="text-xs text-text-dim font-bold uppercase tracking-wider">DB Cards</span>
                <span className="text-green font-black text-lg">{dbStats.total.toLocaleString()}</span>
              </div>
              <Database size={24} className="text-green opacity-80" />
            </div>
          )}
          <div className="bg-bg-2 p-3 rounded-lg border border-border flex items-center space-x-3 shadow-md">
            <div className="flex flex-col items-end">
              <span className="text-xs text-text-dim font-bold uppercase tracking-wider">Dust</span>
              <span className="text-text-dim font-black text-lg">14,350</span>
            </div>
            <Sparkles size={24} className="text-text-dim opacity-80" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Main Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Format Switcher & Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 bg-bg-2 p-4 rounded-xl border border-border shadow-sm">
              <div className="flex bg-bg rounded-md p-1 border border-border">
                {expansions.map((format) => (
                  <button
                    key={format.id}
                    onClick={() => setActiveFormat(format.id)}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                      activeFormat === format.id 
                        ? 'bg-accent text-bg shadow' 
                        : 'text-text-mute hover:text-text'
                    }`}
                  >
                    {format.name}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mute" />
                  <input 
                    type="text" 
                    placeholder="Search cards or sets..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-64 bg-bg border border-border text-text text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-text-mute"
                  />
                </div>
                <button className="bg-bg border border-border p-2 rounded-lg text-text-dim hover:text-text hover:border-border-hi transition-colors">
                  <Filter size={18} />
                </button>
              </div>
            </div>

            {/* Overall Progress */}
            <div className="bg-bg-2 border border-border rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-text">Overall Progress</h2>
                <div className="text-right">
                  <span className="text-accent font-bold text-2xl">{activeData.collected}</span>
                  <span className="text-text-mute font-medium"> / {activeData.total}</span>
                </div>
              </div>
              
              <div className="w-full bg-bg rounded-full h-4 mb-2 border border-border overflow-hidden shadow-inner">
                <div 
                  className="bg-gradient-to-r from-accent to-accent h-4 rounded-full transition-all duration-1000 ease-out relative" 
                  style={{ width: `${percentage}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]" style={{
                    backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%)',
                    backgroundSize: '200% 100%'
                  }} />
                </div>
              </div>
              <p className="text-text-dim text-sm font-medium">{percentage}% Complete</p>
            </div>

            {/* Expansions Grid */}
            <div>
              <h2 className="text-xl font-bold text-text mb-4 flex items-center">
                Expansions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeData.sets.map((set) => {
                  const setPercentage = Math.round((set.collected / set.total) * 100);
                  const isComplete = setPercentage === 100;

                  return (
                    <div key={set.name} className="bg-bg-2 border border-border rounded-xl p-5 hover:border-border-hi transition-colors group cursor-pointer relative overflow-hidden">
                      {isComplete && (
                        <div className="absolute top-0 right-0 w-16 h-16">
                          <div className="absolute top-4 right-[-16px] w-[100px] transform rotate-45 bg-accent text-bg text-[10px] font-bold text-center py-1 uppercase shadow-md">
                            Complete
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-4 mb-4 relative z-10">
                        <div className="w-12 h-12 rounded-lg bg-bg border border-border flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform">
                          {set.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-text font-bold truncate pr-4">{set.name}</h3>
                          <p className="text-text-mute text-sm">
                            {set.collected} <span className="text-text-mute">/ {set.total} cards</span>
                          </p>
                        </div>
                      </div>

                      <div className="w-full bg-bg rounded-full h-2.5 border border-border overflow-hidden relative z-10">
                        <div 
                          className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${
                            isComplete ? 'bg-accent shadow-[0_0_10px_#f97316]' : 'bg-bg-3'
                          }`}
                          style={{ width: `${setPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Duplicate & Extra Section */}
            <div className="bg-bg-2 border border-border rounded-xl p-5 flex items-start space-x-4 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle size={20} className="text-text-dim" />
              </div>
              <div className="flex-1">
                <h3 className="text-text font-bold text-lg mb-1">Mass Disenchant Available</h3>
                <p className="text-text-dim text-sm mb-3">You have 124 duplicate cards that can be safely disenchanted.</p>
                <button className="bg-blue-600 hover:bg-blue-500 text-text font-bold py-2 px-4 rounded-lg shadow-md transition-colors text-sm flex items-center">
                  <Sparkles size={16} className="mr-2" />
                  Disenchant Extra Cards (+3,420 Dust)
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
