// V2 components for OpenDeckTracker — Console direction.
// - PipCount: dot pips for ≤3 copies, "×N" for >3
// - ConsoleOverlayV2: player overlay using PipCount
// - ConsoleOpponentOverlay: separate companion overlay tracking opponent
// - ConsoleSetsCollection: expansion-set progress (replaces card grid)
// - ConsoleDeckFinder: search popular decks with filters

const A = window.A_TOKENS;

function PipCount({ count, remaining, accent = A.accent, dimmed = false }) {
  // count = total copies in deck; remaining = how many left
  if (count > 3) {
    return (
      <span style={{
        fontFamily: A.mono, fontSize: 11, fontWeight: 600,
        color: dimmed ? A.textMute : accent, minWidth: 28, textAlign: "right", display: "inline-block",
      }}>×{remaining}</span>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {Array.from({ length: count }).map((_, j) => (
        <span key={j} style={{
          width: 6, height: 6, borderRadius: 4,
          background: j < remaining ? accent : "transparent",
          border: `1px solid ${j < remaining ? accent : A.borderHi}`,
          opacity: dimmed ? 0.5 : 1,
        }} />
      ))}
    </span>
  );
}

// ===== Updated Player Overlay (Console + B's pips) =====
function ConsoleOverlayV2({ opacity = 0.92, drawn = window.DRAWN_STATE }) {
  const t = A;
  const deck = window.deckRemaining(window.ACTIVE_DECK, drawn).sort(window.sortByCost);
  const remaining = deck.reduce((s, c) => s + c.remaining, 0);
  return (
    <div style={{
      width: 270, background: `rgba(11, 15, 20, ${opacity})`,
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: `1px solid rgba(34,211,238,0.28)`,
      borderRadius: 6, color: t.text, fontFamily: t.sans,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)", overflow: "hidden",
    }}>
      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <window.ClassCrest cls="ember" size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1 }}>Aggro Ember</div>
          <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em", marginTop: 1 }}>YOU · TURN 07</div>
        </div>
        <div style={{ fontFamily: t.mono, fontSize: 13, color: t.accent, fontWeight: 600 }}>{remaining}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${t.border}` }}>
        {[["HAND","04",t.text],["TOP","1.92×",t.accent],["FAT","—",t.textMute]].map(([k,v,c],i) => (
          <div key={i} style={{ padding: "5px 8px", borderRight: i < 2 ? `1px solid ${t.border}` : "none", fontFamily: t.mono }}>
            <div style={{ fontSize: 8, color: t.textMute, letterSpacing: "0.12em" }}>{k}</div>
            <div style={{ fontSize: 11, color: c, fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ maxHeight: 340, overflow: "auto" }}>
        {deck.map((c, i) => {
          const dimmed = c.remaining === 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "0 8px", height: 22,
              fontSize: 11, opacity: dimmed ? 0.35 : 1,
              borderBottom: i < deck.length - 1 ? `1px solid rgba(31,39,49,0.5)` : "none",
            }}>
              <window.ManaGem cost={c.cost} size={16} depleted={dimmed} />
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                textDecoration: dimmed ? "line-through" : "none",
              }}>
                <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: 2, background: window.RARITY[c.rarity].color, marginRight: 5, verticalAlign: "middle" }} />
                {c.name}
              </div>
              <PipCount count={c.count} remaining={c.remaining} dimmed={dimmed} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Opponent Overlay (separate companion) =====
const OPP_DECK_GUESS = [
  { cost: 1, name: "Pyre Spark",    count: 2, played: 1, certain: true  },
  { cost: 2, name: "Hex Reaver",    count: 2, played: 1, certain: true  },
  { cost: 3, name: "Voidcaller",    count: 1, played: 0, certain: true  },
  { cost: 4, name: "Soulbinder",    count: 1, played: 1, certain: true  },
  { cost: 5, name: "Quiet Pyre",    count: 2, played: 0, certain: false },
  { cost: 6, name: "Black Summons", count: 1, played: 0, certain: true  },
  { cost: 7, name: "Marrow Knight", count: 1, played: 0, certain: false },
];

function ConsoleOpponentOverlay({ opacity = 0.92 }) {
  const t = A;
  const known = OPP_DECK_GUESS.filter(c => c.certain);
  const playedCount = OPP_DECK_GUESS.reduce((s, c) => s + c.played, 0);
  return (
    <div style={{
      width: 270, background: `rgba(20, 11, 14, ${opacity})`,
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: `1px solid rgba(248,113,113,0.28)`,
      borderRadius: 6, color: t.text, fontFamily: t.sans,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)", overflow: "hidden",
    }}>
      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <window.ClassCrest cls="hollow" size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1 }}>Opponent · Hollow</div>
          <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em", marginTop: 1 }}>
            CONTROL · 84% MATCH
          </div>
        </div>
        <div style={{ fontFamily: t.mono, fontSize: 13, color: "#f87171", fontWeight: 600 }}>{playedCount}<span style={{ color: t.textMute, fontSize: 10 }}>/30</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${t.border}` }}>
        {[["HAND","05",t.text],["DECK","23",t.text],["LIKELY","Quiet Pyre","#f87171"]].map(([k,v,c],i) => (
          <div key={i} style={{ padding: "5px 8px", borderRight: i < 2 ? `1px solid ${t.border}` : "none", fontFamily: t.mono, minWidth: 0 }}>
            <div style={{ fontSize: 8, color: t.textMute, letterSpacing: "0.12em" }}>{k}</div>
            <div style={{ fontSize: 11, color: c, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "6px 10px", fontSize: 8, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", borderBottom: `1px solid ${t.border}` }}>
        REVEALED <span style={{ color: t.text, marginLeft: 4 }}>{known.length}</span> · PREDICTED <span style={{ color: "#fbbf24" }}>{OPP_DECK_GUESS.length - known.length}</span>
      </div>
      <div style={{ maxHeight: 280, overflow: "auto" }}>
        {OPP_DECK_GUESS.map((c, i) => {
          const allPlayed = c.played >= c.count;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "0 8px", height: 22,
              fontSize: 11, opacity: allPlayed ? 0.4 : 1,
              borderBottom: i < OPP_DECK_GUESS.length - 1 ? `1px solid rgba(31,39,49,0.5)` : "none",
              fontStyle: c.certain ? "normal" : "italic",
            }}>
              <window.ManaGem cost={c.cost} size={16} depleted={allPlayed} />
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: c.certain ? t.text : t.textDim,
                textDecoration: allPlayed ? "line-through" : "none",
              }}>
                {!c.certain && <span style={{ color: "#fbbf24", marginRight: 4, fontFamily: t.mono }}>?</span>}
                {c.name}
              </div>
              <PipCount count={c.count} remaining={c.count - c.played} accent="#f87171" dimmed={allPlayed} />
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${t.border}`, padding: "6px 10px", fontFamily: t.mono, fontSize: 9, color: t.textMute, letterSpacing: "0.06em", display: "flex", gap: 8 }}>
        <span style={{ color: "#f87171" }}>●</span>
        <span>predictions from 2,184 ranked games</span>
      </div>
    </div>
  );
}

// ===== Sets Collection (expansion progress) =====
const EXPANSIONS = [
  { id: "core",      name: "Core Set",                 short: "CORE", year: "Evergreen", total: 235, owned: 235, gold: 84,  released: "Standard" },
  { id: "tempest",   name: "Tempest Coast",            short: "TPC",  year: "2026 · Y2", total: 145, owned: 132, gold: 41,  released: "Standard" },
  { id: "hollows",   name: "Whisper of the Hollows",   short: "WTH",  year: "2026 · Y2", total: 145, owned: 98,  gold: 12,  released: "Standard" },
  { id: "iron",      name: "Forge of Iron Songs",      short: "FIS",  year: "2025 · Y1", total: 145, owned: 142, gold: 65,  released: "Standard" },
  { id: "embers",    name: "Year of the Embers",       short: "YOE",  year: "2025 · Y1", total: 145, owned: 88,  gold: 18,  released: "Standard" },
  { id: "tide",      name: "Tideborn Saga",            short: "TBS",  year: "2024 · Y0", total: 135, owned: 64,  gold: 4,   released: "Wild" },
  { id: "marrow",    name: "Marrow Halls",             short: "MWH",  year: "2024 · Y0", total: 135, owned: 51,  gold: 0,   released: "Wild" },
  { id: "veil",      name: "Veil of Salt",             short: "VOS",  year: "2023",      total: 135, owned: 27,  gold: 0,   released: "Wild" },
];

function ConsoleSetsCollection() {
  const t = A;
  const [filter, setFilter] = React.useState("all");
  const sets = filter === "all" ? EXPANSIONS : EXPANSIONS.filter(s => s.released.toLowerCase() === filter);
  const totalOwned = EXPANSIONS.reduce((s, e) => s + e.owned, 0);
  const totalCards = EXPANSIONS.reduce((s, e) => s + e.total, 0);
  const totalGold = EXPANSIONS.reduce((s, e) => s + e.gold, 0);
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "baseline", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>COLLECTION / BY SET</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em" }}>Expansion progress</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 24, fontFamily: t.mono }}>
          <div>
            <div style={{ fontSize: 9, color: t.textMute, letterSpacing: "0.14em" }}>OWNED</div>
            <div style={{ fontSize: 18, color: t.accent, fontWeight: 600 }}>{totalOwned.toLocaleString()}<span style={{ color: t.textMute, fontSize: 12 }}>/{totalCards.toLocaleString()}</span></div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: t.textMute, letterSpacing: "0.14em" }}>COMPLETION</div>
            <div style={{ fontSize: 18, color: t.text, fontWeight: 600 }}>{Math.round((totalOwned/totalCards)*100)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: t.textMute, letterSpacing: "0.14em" }}>GOLDEN</div>
            <div style={{ fontSize: 18, color: "#fbbf24", fontWeight: 600 }}>{totalGold}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", padding: "8px 20px", borderBottom: `1px solid ${t.border}`, gap: 6, fontFamily: t.mono, fontSize: 11 }}>
        {[["all","ALL"],["standard","STANDARD"],["wild","WILD"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: "4px 12px", borderRadius: 3, cursor: "pointer",
            background: filter === k ? t.accentDim : "transparent",
            color: filter === k ? t.accent : t.textDim,
            border: filter === k ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
            letterSpacing: "0.08em", fontWeight: 600,
          }}>{l}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
        <div style={{ display: "grid", gap: 10 }}>
          {sets.map((s, i) => {
            const pct = (s.owned / s.total) * 100;
            const goldPct = (s.gold / s.total) * 100;
            const complete = s.owned === s.total;
            return (
              <div key={s.id} style={{
                background: t.bg2, border: `1px solid ${t.border}`,
                borderRadius: 4, padding: "14px 18px",
                display: "grid", gridTemplateColumns: "44px 1.6fr 2fr 1fr 80px",
                gap: 16, alignItems: "center",
                transition: "border-color 140ms",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
              >
                {/* Set badge */}
                <div style={{
                  width: 44, height: 44, borderRadius: 4,
                  background: `linear-gradient(135deg, oklch(0.32 0.10 ${(i*40)%360}), oklch(0.18 0.06 ${(i*40+60)%360}))`,
                  border: `1px solid oklch(0.4 0.10 ${(i*40)%360} / 0.6)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: t.mono, fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.04em",
                }}>{s.short}</div>

                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.08em", marginTop: 2 }}>
                    {s.year} · {s.released.toUpperCase()}
                  </div>
                </div>

                <div>
                  <div style={{ position: "relative", height: 8, background: t.bg3, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${pct}%`,
                      background: complete ? "#34d399" : t.accent, opacity: 0.85,
                    }} />
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${goldPct}%`,
                      background: "linear-gradient(90deg, rgba(251,191,36,0.6), rgba(251,191,36,0))",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: t.mono, fontSize: 10, color: t.textMute, marginTop: 4, letterSpacing: "0.06em" }}>
                    <span>{s.owned} / {s.total} cards</span>
                    <span style={{ color: "#fbbf24" }}>◆ {s.gold} golden</span>
                  </div>
                </div>

                <div style={{ fontFamily: t.mono, textAlign: "right" }}>
                  <div style={{ fontSize: 18, color: complete ? "#34d399" : t.text, fontWeight: 600, letterSpacing: "-0.02em" }}>
                    {Math.round(pct)}<span style={{ fontSize: 12, color: t.textMute }}>%</span>
                  </div>
                  <div style={{ fontSize: 10, color: t.textMute, letterSpacing: "0.06em" }}>{s.total - s.owned} missing</div>
                </div>

                <button style={{
                  background: complete ? "transparent" : t.accentDim,
                  border: `1px solid ${complete ? t.border : t.accent}`,
                  color: complete ? t.textMute : t.accent,
                  padding: "6px 12px", borderRadius: 3, fontFamily: t.mono, fontSize: 10,
                  letterSpacing: "0.1em", cursor: complete ? "default" : "pointer", fontWeight: 600,
                }}>
                  {complete ? "COMPLETE" : "BROWSE →"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PipCount, ConsoleOverlayV2, ConsoleOpponentOverlay, ConsoleSetsCollection, EXPANSIONS });
