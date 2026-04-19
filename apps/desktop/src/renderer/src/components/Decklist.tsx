import { useEffect, useState } from 'react';
import { Card } from '../data/mockDecks';
import { Star } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as HoverCard from '@radix-ui/react-hover-card';

type Rarity = Card['rarity'];

function rarityFromHearthDb(value: string | undefined): Rarity {
  switch (value) {
    case 'FREE':
      return 'free';
    case 'COMMON':
      return 'common';
    case 'RARE':
      return 'rare';
    case 'EPIC':
      return 'epic';
    case 'LEGENDARY':
      return 'legendary';
    default:
      return 'common';
  }
}

/**
 * Enrich a deck (mock or otherwise) with real CardDef data via window.hdt.cards.
 * Cards without dbfId or with failed lookup keep their mock fields untouched.
 */
function useEnrichedCards(input: readonly Card[]): Card[] {
  const [enriched, setEnriched] = useState<Card[]>([...input]);

  useEffect(() => {
    let cancelled = false;
    const dbfIds = input.map((c) => c.dbfId).filter((v): v is number => typeof v === 'number');
    if (dbfIds.length === 0) {
      setEnriched([...input]);
      return;
    }
    Promise.all(dbfIds.map((id) => window.hdt.cards.findByDbfId(id)))
      .then((defs) => {
        if (cancelled) return;
        const byDbfId = new Map<number, (typeof defs)[number]>();
        defs.forEach((def, i) => byDbfId.set(dbfIds[i]!, def));
        setEnriched(
          input.map((c) => {
            if (c.dbfId == null) return c;
            const def = byDbfId.get(c.dbfId);
            if (!def) return c;
            return {
              ...c,
              name: def.name,
              cost: def.cost ?? c.cost,
              rarity: rarityFromHearthDb(def.rarity),
            };
          }),
        );
      })
      .catch(() => {
        // mock fallback already set; nothing to do
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  return enriched;
}

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Simulated full size card for the tooltip
function CardPreview({ card }: { card: Card }) {
  const rarityColors = {
    free: 'border-slate-400',
    common: 'border-white',
    rare: 'border-blue-500',
    epic: 'border-purple-500',
    legendary: 'border-orange-500'
  };

  return (
    <div className={cn(
      "w-[220px] h-[300px] rounded-xl flex flex-col relative overflow-hidden bg-slate-900 border-2 shadow-[0_0_30px_rgba(0,0,0,0.8)]",
      rarityColors[card.rarity]
    )}>
      {/* Fake Card Artwork */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ 
          backgroundImage: 'url(https://images.unsplash.com/photo-1763957047087-c293df07b6b4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYW50YXN5JTIwY2hhcmFjdGVyJTIwcG9ydHJhaXQlMjBwYWludGluZ3xlbnwxfHx8fDE3NzYzNDU3MjZ8MA&ixlib=rb-4.1.0&q=80&w=1080)',
          filter: 'brightness(0.9) contrast(1.1)'
        }}
      />
      
      {/* Card Header & Mana Cost */}
      <div className="absolute top-2 left-2 z-10 w-10 h-10 bg-[#225B8D] rounded-full border-2 border-slate-300 flex items-center justify-center shadow-lg">
        <span className="text-white font-black text-2xl drop-shadow-md">{card.cost}</span>
      </div>

      {/* Card Name Ribbon */}
      <div className="absolute top-[45%] left-1/2 -translate-x-1/2 w-[110%] bg-gradient-to-r from-transparent via-[#1C1C24] to-transparent py-2 z-10 text-center shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
        <h2 className="text-white font-bold tracking-wider text-sm drop-shadow-[0_2px_2px_rgba(0,0,0,1)] uppercase">
          {card.name}
        </h2>
      </div>

      {/* Card Description Area */}
      <div className="absolute bottom-4 left-4 right-4 h-24 bg-[#E4D1B8]/95 rounded-md border border-[#CBB391] p-2 flex items-center justify-center text-center shadow-inner z-10">
        <p className="text-[#3A2E22] text-xs font-serif leading-tight">
          <b>Battlecry:</b> If this is a simulated card tooltip, give it +1/+1 and Taunt.
        </p>
      </div>

      {/* Rarity Gem */}
      <div className="absolute top-[45%] left-1/2 -translate-x-1/2 translate-y-3 z-20 w-4 h-4 rounded-full bg-slate-800 shadow-sm flex items-center justify-center border border-black">
        <div className={cn(
          "w-2.5 h-2.5 rounded-full",
          card.rarity === 'legendary' ? 'bg-orange-500 shadow-[0_0_5px_#F97316]' :
          card.rarity === 'epic' ? 'bg-purple-500 shadow-[0_0_5px_#A855F7]' :
          card.rarity === 'rare' ? 'bg-blue-500 shadow-[0_0_5px_#3B82F6]' :
          'bg-white'
        )} />
      </div>
    </div>
  );
}

export function DeckCard({ card, disableTooltip = false, side = 'left' }: { card: Card, disableTooltip?: boolean, side?: 'left' | 'right' }) {
  const isDrawnOut = card.drawn >= card.count;
  const remaining = card.count - card.drawn;

  const cardContent = (
    <div
      className={cn(
        "relative flex items-center h-[34px] bg-[#1a1a24] mb-1 overflow-hidden transition-all duration-300 select-none group border border-[#2A2A35]",
        isDrawnOut ? "opacity-40 grayscale" : "hover:brightness-125 cursor-pointer"
      )}
    >
      <div 
        className="absolute inset-0 bg-gradient-to-r from-[#1E1E28] via-[#2A2A3A] to-[#12121A] z-0"
        style={{ width: isDrawnOut ? '100%' : '100%' }}
      />
      
      <div className={cn(
        "absolute right-0 top-0 bottom-0 w-1 z-10",
        card.rarity === 'legendary' ? 'bg-orange-500' :
        card.rarity === 'epic' ? 'bg-purple-500' :
        card.rarity === 'rare' ? 'bg-blue-500' :
        'bg-slate-400'
      )} />

      <div className="relative z-10 flex items-center justify-center w-[34px] h-[34px] bg-[#225B8D] border-r border-[#153A5A]">
        <span className="text-white font-bold text-lg drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {card.cost}
        </span>
      </div>

      <div className="relative z-10 flex-1 px-3 truncate text-sm font-medium text-[#E4E4E6] drop-shadow-[0_1px_1px_rgba(0,0,0,1)] uppercase tracking-wide">
        {card.name}
      </div>

      <div className="relative z-10 flex items-center justify-center w-[30px] h-full bg-[#12121A] border-l border-[#2A2A35] mr-1">
        {card.rarity === 'legendary' ? (
          <Star size={12} className="text-[#FFD700] fill-[#FFD700]" />
        ) : (
          <span className="text-[#E4E4E6] font-bold text-sm">
            {remaining}
          </span>
        )}
      </div>
    </div>
  );

  if (disableTooltip) return cardContent;

  return (
    <HoverCard.Root openDelay={100} closeDelay={0}>
      <HoverCard.Trigger asChild>
        {cardContent}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content 
          side={side} 
          align="start"
          sideOffset={8}
          className="z-[9999] animate-in fade-in zoom-in-95 duration-200"
        >
          <CardPreview card={card} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

export function DeckTracker({ cards }: { cards: Card[] }) {
  const enriched = useEnrichedCards(cards);
  const sortedCards = [...enriched].sort((a, b) => {
    if (a.cost === b.cost) return a.name.localeCompare(b.name);
    return a.cost - b.cost;
  });

  const cardsInDeck = sortedCards.reduce((acc, c) => acc + c.count, 0);
  const cardsRemaining = sortedCards.reduce((acc, c) => acc + (c.count - c.drawn), 0);

  return (
    <div className="w-[280px] bg-[#12121A] border border-[#2A2A35] flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden relative">
      <div className="bg-[#1C1C24] p-3 flex flex-col justify-center border-b border-[#2A2A35]">
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
          Active Deck
        </div>
        <div className="text-white font-bold flex justify-between items-center">
          <span>Control Warrior</span>
          <span className="text-orange-400 text-sm">{cardsRemaining} / {cardsInDeck}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[#2A2A35] scrollbar-track-transparent">
        {sortedCards.map(card => (
          <DeckCard key={card.id} card={card} side="left" />
        ))}
      </div>
      
      <div className="bg-[#1C1C24] p-3 border-t border-[#2A2A35] flex justify-between items-center text-xs text-slate-400">
        <div className="flex space-x-3">
          <button className="hover:text-white transition-colors">Options</button>
          <button className="hover:text-white transition-colors">Export</button>
        </div>
        <div className="text-orange-500/80 font-medium">Syncing...</div>
      </div>
    </div>
  );
}
