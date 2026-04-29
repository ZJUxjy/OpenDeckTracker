// Shared data + utilities for OpenDeckTracker UI redesign.
// All card names, classes, and art are ORIGINAL — no Blizzard IP.

const CLASSES = {
  ember:    { name: "Ember",    short: "EMB", glyph: "✦", hue: 22  }, // warm orange
  tide:     { name: "Tide",     short: "TID", glyph: "≋", hue: 215 }, // blue
  bramble:  { name: "Bramble",  short: "BRM", glyph: "❦", hue: 145 }, // green
  cinder:   { name: "Cinder",   short: "CDR", glyph: "▲", hue: 0   }, // red
  hollow:   { name: "Hollow",   short: "HLW", glyph: "✶", hue: 280 }, // purple
  iron:     { name: "Iron",     short: "IRN", glyph: "◆", hue: 210 }, // steel
  veil:     { name: "Veil",     short: "VEL", glyph: "◐", hue: 255 }, // indigo
  glade:    { name: "Glade",    short: "GLD", glyph: "❉", hue: 95  }, // lime
  marrow:   { name: "Marrow",   short: "MRW", glyph: "✕", hue: 320 }, // pink
};

const RARITY = {
  common:    { color: "#cbd5e1", label: "Common"    },
  rare:      { color: "#3b82f6", label: "Rare"      },
  epic:      { color: "#a855f7", label: "Epic"      },
  legendary: { color: "#f59e0b", label: "Legendary" },
};

// One canonical 30-card deck for the active player. Cost, name, count, rarity, type.
const ACTIVE_DECK = [
  { cost: 1, name: "Brittle Rune",        count: 2, rarity: "common",    type: "spell"   },
  { cost: 1, name: "Mossback Pup",        count: 2, rarity: "common",    type: "minion"  },
  { cost: 2, name: "Tidewatcher",         count: 2, rarity: "rare",      type: "minion"  },
  { cost: 2, name: "Ash Vow",             count: 2, rarity: "common",    type: "spell"   },
  { cost: 2, name: "Iron Acolyte",        count: 1, rarity: "epic",      type: "minion"  },
  { cost: 3, name: "Hollow Lantern",      count: 2, rarity: "rare",      type: "spell"   },
  { cost: 3, name: "Bramble Sentinel",    count: 2, rarity: "common",    type: "minion"  },
  { cost: 3, name: "Veiled Courier",      count: 1, rarity: "rare",      type: "minion"  },
  { cost: 4, name: "Glade Warden",        count: 2, rarity: "rare",      type: "minion"  },
  { cost: 4, name: "Cinder Lash",         count: 2, rarity: "common",    type: "spell"   },
  { cost: 4, name: "Marrow Reliquary",    count: 1, rarity: "epic",      type: "spell"   },
  { cost: 5, name: "Stoneheart Vow",      count: 2, rarity: "rare",      type: "spell"   },
  { cost: 5, name: "Iron Vanguard",       count: 1, rarity: "epic",      type: "minion"  },
  { cost: 6, name: "Hollow Conductor",    count: 1, rarity: "legendary", type: "minion"  },
  { cost: 6, name: "Tideborn Oracle",     count: 2, rarity: "rare",      type: "minion"  },
  { cost: 7, name: "Ember Apostle",       count: 1, rarity: "legendary", type: "minion"  },
  { cost: 8, name: "Cataract Wyrm",       count: 1, rarity: "epic",      type: "minion"  },
  { cost: 9, name: "Veilbreaker",         count: 1, rarity: "legendary", type: "minion"  },
  { cost: 10,name: "The Long Quiet",      count: 2, rarity: "epic",      type: "spell"   },
];

// Cards that have been drawn/played from ACTIVE_DECK (by name → drawn count).
const DRAWN_STATE = {
  "Brittle Rune": 1,
  "Mossback Pup": 2,
  "Tidewatcher": 1,
  "Hollow Lantern": 1,
  "Glade Warden": 1,
  "Cinder Lash": 2,
  "Stoneheart Vow": 1,
  "Tideborn Oracle": 1,
};

// Opponent revealed cards (originals).
const OPP_REVEALED = [
  { cost: 1, name: "Pyre Spark",          count: 1, played: true  },
  { cost: 2, name: "Hex Reaver",          count: 1, played: true  },
  { cost: 3, name: "Voidcaller",          count: 1, played: false },
  { cost: 4, name: "Soulbinder",          count: 1, played: true  },
  { cost: 6, name: "Black Summons",       count: 1, played: false },
];

// Match log entries for stats.
const MATCH_LOG = [
  { result: "W", you: "ember",   them: "hollow",  turns: 11, rank: "Diamond 2", time: "14m", deck: "Aggro Ember" },
  { result: "W", you: "ember",   them: "iron",    turns:  8, rank: "Diamond 2", time: "9m",  deck: "Aggro Ember" },
  { result: "L", you: "ember",   them: "bramble", turns: 14, rank: "Diamond 2", time: "18m", deck: "Aggro Ember" },
  { result: "W", you: "tide",    them: "marrow",  turns: 12, rank: "Diamond 3", time: "16m", deck: "Control Tide" },
  { result: "W", you: "ember",   them: "cinder",  turns:  7, rank: "Diamond 3", time: "8m",  deck: "Aggro Ember" },
  { result: "L", you: "tide",    them: "veil",    turns: 16, rank: "Diamond 3", time: "21m", deck: "Control Tide" },
  { result: "W", you: "ember",   them: "glade",   turns: 10, rank: "Diamond 3", time: "13m", deck: "Aggro Ember" },
  { result: "W", you: "ember",   them: "iron",    turns:  9, rank: "Diamond 3", time: "11m", deck: "Aggro Ember" },
];

// Winrate sparkline values (last 30 sessions, percentages).
const WINRATE_TREND = [52,55,53,58,60,57,62,64,61,65,68,66,70,67,72,69,73,71,68,72,75,73,77,74,78,76,80,77,82,79];

// Mana curve helper: count cards at each cost (0..7+) from a deck list.
function manaCurve(deck) {
  const buckets = [0,0,0,0,0,0,0,0]; // 0..7+
  deck.forEach(c => {
    const i = Math.min(c.cost, 7);
    buckets[i] += c.count;
  });
  return buckets;
}

// Collection: a synthetic grid of cards (mix of classes, costs, rarities).
const COLLECTION = (() => {
  const out = [];
  const names = [
    "Brittle Rune","Mossback Pup","Tidewatcher","Ash Vow","Iron Acolyte","Hollow Lantern",
    "Bramble Sentinel","Veiled Courier","Glade Warden","Cinder Lash","Marrow Reliquary",
    "Stoneheart Vow","Iron Vanguard","Hollow Conductor","Tideborn Oracle","Ember Apostle",
    "Cataract Wyrm","Veilbreaker","The Long Quiet","Pyre Spark","Hex Reaver","Voidcaller",
    "Soulbinder","Black Summons","Quiet Pyre","Bramble Hymn","Marrow Knight","Tidecaller",
    "Embermarch","Hollow Choir","Iron Edict","Veil of Salt","Glade Auspice","Cinder Ward",
    "Stoneheart Echo","Marrow Vow"
  ];
  const classes = Object.keys(CLASSES);
  const rarities = ["common","common","common","rare","rare","epic","legendary"];
  names.forEach((n, i) => {
    out.push({
      name: n,
      cost: (i % 9) + 1,
      cls: classes[i % classes.length],
      rarity: rarities[i % rarities.length],
      owned: (i % 7 === 0) ? 0 : (i % 5 === 0 ? 1 : 2),
      type: i % 3 === 0 ? "spell" : "minion",
    });
  });
  return out;
})();

// Format helpers
const pct = (n) => `${Math.round(n)}%`;
const pad2 = (n) => String(n).padStart(2, "0");

Object.assign(window, {
  CLASSES, RARITY, ACTIVE_DECK, DRAWN_STATE, OPP_REVEALED, MATCH_LOG,
  WINRATE_TREND, COLLECTION, manaCurve, pct, pad2,
});
