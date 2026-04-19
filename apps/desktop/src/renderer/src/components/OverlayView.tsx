import { useState } from 'react';
import { MOCK_DECK, Card } from '../data/mockDecks';
import { DeckCard } from './Decklist';
import { Settings, Lock, Unlock, EyeOff, LayoutGrid, Info, Shield } from 'lucide-react';

function OverlayTracker({ 
  title, 
  cards, 
  side, 
  isOpponent = false 
}: { 
  title: string, 
  cards: Card[], 
  side: 'left' | 'right',
  isOpponent?: boolean
}) {
  const [isLocked, setIsLocked] = useState(true);
  const [opacity, setOpacity] = useState(100);

  const sortedCards = [...cards].sort((a, b) => {
    if (a.cost === b.cost) return a.name.localeCompare(b.name);
    return a.cost - b.cost;
  });

  const cardsInDeck = sortedCards.reduce((acc, c) => acc + c.count, 0);
  const cardsRemaining = sortedCards.reduce((acc, c) => acc + (c.count - c.drawn), 0);

  return (
    <div 
      className={`absolute top-10 ${side === 'right' ? 'right-10' : 'left-10'} w-[240px] flex flex-col group transition-opacity duration-300`}
      style={{ opacity: opacity / 100 }}
    >
      {/* Overlay Toolbar (Visible on Hover) */}
      <div className={`absolute -top-10 left-0 right-0 h-10 flex items-center justify-end space-x-2 px-2 bg-black/60 backdrop-blur-md rounded-t-lg border-t border-l border-r border-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity`}>
        <button onClick={() => setOpacity(prev => prev === 100 ? 50 : 100)} className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded">
          <EyeOff size={14} />
        </button>
        <button onClick={() => setIsLocked(!isLocked)} className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded">
          {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
        <button className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded">
          <Settings size={14} />
        </button>
      </div>

      {/* Main Tracker Container */}
      <div className={`bg-[#0C0C10]/90 backdrop-blur-md border ${isLocked ? 'border-slate-800' : 'border-orange-500'} rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.8)] flex flex-col relative`}>
        
        {/* Header */}
        <div className="bg-gradient-to-b from-[#1C1C24] to-[#12121A] p-2.5 border-b border-slate-800 flex flex-col rounded-t-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="text-white text-sm font-bold truncate flex items-center">
              {isOpponent ? (
                <Shield size={14} className="mr-1.5 text-red-500" />
              ) : (
                <LayoutGrid size={14} className="mr-1.5 text-orange-500" />
              )}
              {title}
            </span>
            <span className="text-xs bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-medium border border-slate-700">
              {isOpponent ? 'OPP' : 'YOU'}
            </span>
          </div>
          
          <div className="flex justify-between items-end mt-1 text-xs">
            <div className="flex flex-col">
              <span className="text-slate-500 font-medium">Cards Left</span>
              <span className="text-orange-400 font-bold text-sm">{cardsRemaining}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-slate-500 font-medium">In Deck</span>
              <span className="text-white font-bold text-sm">{cardsInDeck}</span>
            </div>
          </div>
        </div>

        {/* Card List - Uses standard DeckCard but scaled down slightly */}
        <div className="flex-1 overflow-y-auto max-h-[500px] p-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent space-y-0.5 relative z-10">
          {sortedCards.map(card => (
            <div key={card.id} className="transform scale-[0.98] origin-left">
              <DeckCard card={card} side={side === 'left' ? 'right' : 'left'} />
            </div>
          ))}
        </div>
        
        {/* Footer Stats (Winrate/Probability) */}
        {!isOpponent && (
          <div className="bg-[#12121A] p-2 border-t border-slate-800 flex justify-between items-center text-xs rounded-b-lg">
            <span className="text-slate-400">Win Rate</span>
            <span className="text-green-500 font-bold">59.2%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function OverlayView() {
  // Opponent mock deck
  const opponentDeck: Card[] = [
    { id: 'o1', name: 'Coin', cost: 0, count: 1, drawn: 1, rarity: 'free' },
    { id: 'o2', name: 'Theotar, the Mad Duke', cost: 6, count: 1, drawn: 0, rarity: 'legendary' },
    { id: 'o3', name: 'Created by', cost: 2, count: 3, drawn: 3, rarity: 'common' }, // Mocking tracked cards
  ];

  return (
    <div className="flex-1 relative w-full h-full bg-black overflow-hidden select-none">
      {/* Background simulating the game window */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-60 pointer-events-none"
        style={{ 
          backgroundImage: 'url(https://images.unsplash.com/photo-1558985705-136689d51f4c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFydGhzdG9uZSUyMGdhbWV8ZW58MXx8fHwxNzc2MzA0NzkwfDA&ixlib=rb-4.1.0&q=80&w=1080)',
          filter: 'blur(4px) brightness(0.7)'
        }} 
      />
      
      {/* Game UI Mocks (Optional, just to sell the effect) */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
        <h1 className="text-5xl font-black text-white/20 tracking-widest uppercase mb-4 blur-[1px]">Gameplay Area</h1>
        <p className="text-white/30 text-sm bg-black/50 px-4 py-2 rounded-full backdrop-blur-md inline-block">
          Hover over trackers to reveal tools. Hover cards for tooltips.
        </p>
      </div>

      {/* Opponent Tracker Overlay (Left Side) */}
      <OverlayTracker 
        title="Mage (Secret)" 
        cards={opponentDeck} 
        side="left" 
        isOpponent={true} 
      />

      {/* Player Tracker Overlay (Right Side) */}
      <OverlayTracker 
        title="Control Warrior" 
        cards={MOCK_DECK} 
        side="right" 
      />

      {/* Mini Overlay Tool: Secrets / Board state (Top middle) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#0C0C10]/90 backdrop-blur-md border border-slate-800 rounded-full px-4 py-2 flex items-center space-x-6 shadow-2xl">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Turn</span>
          <span className="text-white font-black text-sm">7</span>
        </div>
        <div className="w-px h-6 bg-slate-700" />
        <div className="flex flex-col items-center text-orange-400">
          <span className="text-[10px] uppercase font-bold tracking-wider">Spell Dmg</span>
          <span className="font-black text-sm">+0</span>
        </div>
        <div className="w-px h-6 bg-slate-700" />
        <div className="flex flex-col items-center text-blue-400">
          <span className="text-[10px] uppercase font-bold tracking-wider">Secrets</span>
          <span className="font-black text-sm">1</span>
        </div>
      </div>
    </div>
  );
}
