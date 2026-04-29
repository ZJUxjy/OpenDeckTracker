// Console Decks Finder — popular decks with class / card / archetype filters.

const POPULAR_DECKS = [
  { id: "d1", name: "Ember Aggro Burn",       cls: "ember",   archetype: "Aggro",   winrate: 58, games: 12_400, dust: 4_800, author: "veylin",      updated: "2d", cards: ["Brittle Rune","Mossback Pup","Cinder Lash","Pyre Spark","Ash Vow","Stoneheart Vow","Iron Vanguard"], cost_curve: [4,8,8,6,2,1,1,0] },
  { id: "d2", name: "Tide Control",           cls: "tide",    archetype: "Control", winrate: 54, games:  8_240, dust: 11_200,author: "okuda",       updated: "5d", cards: ["Tidewatcher","Hollow Lantern","Tideborn Oracle","The Long Quiet","Veilbreaker","Cataract Wyrm"],          cost_curve: [0,2,4,4,5,5,4,6] },
  { id: "d3", name: "Bramble Midrange",       cls: "bramble", archetype: "Midrange",winrate: 56, games:  9_080, dust: 6_400, author: "luma",        updated: "1d", cards: ["Mossback Pup","Bramble Sentinel","Glade Warden","Stoneheart Vow","Iron Vanguard","Hollow Conductor"], cost_curve: [2,5,7,6,4,3,2,1] },
  { id: "d4", name: "Hollow Reanimator",      cls: "hollow",  archetype: "Combo",   winrate: 52, games:  6_120, dust: 13_400,author: "ren",         updated: "3d", cards: ["Hollow Lantern","Veiled Courier","Marrow Reliquary","Hollow Conductor","Veilbreaker","The Long Quiet"], cost_curve: [0,2,3,4,5,4,5,7] },
  { id: "d5", name: "Iron Tempo",             cls: "iron",    archetype: "Tempo",   winrate: 57, games: 14_500, dust: 5_200, author: "marlo",       updated: "12h",cards: ["Iron Acolyte","Iron Vanguard","Stoneheart Vow","Bramble Sentinel","Glade Warden"],                     cost_curve: [3,7,8,5,3,2,2,0] },
  { id: "d6", name: "Cinder Pyre OTK",        cls: "cinder",  archetype: "Combo",   winrate: 49, games:  4_320, dust: 14_800,author: "anzu",        updated: "6d", cards: ["Pyre Spark","Cinder Lash","Hex Reaver","Ash Vow","Stoneheart Vow","Soulbinder","Black Summons"],     cost_curve: [4,6,6,4,3,2,3,2] },
  { id: "d7", name: "Glade Ramp",             cls: "glade",   archetype: "Ramp",    winrate: 55, games:  7_700, dust: 8_900, author: "lior",        updated: "8h", cards: ["Mossback Pup","Bramble Sentinel","Glade Warden","Tideborn Oracle","Cataract Wyrm","The Long Quiet"], cost_curve: [1,3,5,7,5,4,3,2] },
  { id: "d8", name: "Veil Mill",              cls: "veil",    archetype: "Control", winrate: 53, games:  3_900, dust: 12_100,author: "korr",        updated: "2d", cards: ["Veiled Courier","Veilbreaker","Hollow Conductor","Marrow Reliquary","Hollow Lantern"],                cost_curve: [0,1,3,3,5,5,6,7] },
  { id: "d9", name: "Marrow Aggro",           cls: "marrow",  archetype: "Aggro",   winrate: 56, games:  5_640, dust: 4_200, author: "fae",         updated: "4d", cards: ["Brittle Rune","Mossback Pup","Marrow Reliquary","Hex Reaver","Soulbinder","Iron Acolyte"],            cost_curve: [5,8,8,4,3,1,1,0] },
];

const ARCHETYPES = ["All", "Aggro", "Midrange", "Control", "Combo", "Tempo", "Ramp"];
const SORTS = ["Popular", "Winrate", "Updated", "Cheapest"];

function ConsoleDeckFinder() {
  const t = window.A_TOKENS;
  const [classFilter, setClassFilter] = React.useState("all");
  const [archetypeFilter, setArchetypeFilter] = React.useState("All");
  const [includesCard, setIncludesCard] = React.useState("");
  const [excludesCard, setExcludesCard] = React.useState("");
  const [maxDust, setMaxDust] = React.useState(20000);
  const [formatFilter, setFormatFilter] = React.useState("standard");
  const [sort, setSort] = React.useState("Popular");
  const [selected, setSelected] = React.useState(POPULAR_DECKS[0].id);

  const filtered = POPULAR_DECKS.filter(d => {
    if (classFilter !== "all" && d.cls !== classFilter) return false;
    if (archetypeFilter !== "All" && d.archetype !== archetypeFilter) return false;
    if (includesCard && !d.cards.some(c => c.toLowerCase().includes(includesCard.toLowerCase()))) return false;
    if (excludesCard && d.cards.some(c => c.toLowerCase().includes(excludesCard.toLowerCase()))) return false;
    if (d.dust > maxDust) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "Winrate") return b.winrate - a.winrate;
    if (sort === "Updated") return a.updated.localeCompare(b.updated);
    if (sort === "Cheapest") return a.dust - b.dust;
    return b.games - a.games;
  });

  const sel = sorted.find(d => d.id === selected) || sorted[0];

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>DECKS / FIND</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em" }}>Deck Finder</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: t.mono, fontSize: 11, color: t.textDim }}>
          <span style={{ color: t.text, fontWeight: 600 }}>{sorted.length}</span> of <span style={{ color: t.textMute }}>{POPULAR_DECKS.length}</span> decks · indexed <span style={{ color: t.text }}>2,148</span>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${t.border}`, display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <input
            value={includesCard}
            onChange={e => setIncludesCard(e.target.value)}
            placeholder="Includes card…"
            style={{
              width: "100%", padding: "7px 10px 7px 26px", background: t.bg2,
              border: `1px solid ${t.border}`, borderRadius: 3, color: t.text,
              fontFamily: t.sans, fontSize: 12, outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = t.accent}
            onBlur={e => e.target.style.borderColor = t.border}
          />
          <span style={{ position: "absolute", left: 9, top: 8, color: "#34d399", fontFamily: t.mono, fontSize: 12, fontWeight: 700 }}>+</span>
        </div>
        <div style={{ position: "relative" }}>
          <input
            value={excludesCard}
            onChange={e => setExcludesCard(e.target.value)}
            placeholder="Excludes card…"
            style={{
              width: "100%", padding: "7px 10px 7px 26px", background: t.bg2,
              border: `1px solid ${t.border}`, borderRadius: 3, color: t.text,
              fontFamily: t.sans, fontSize: 12, outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = t.accent}
            onBlur={e => e.target.style.borderColor = t.border}
          />
          <span style={{ position: "absolute", left: 9, top: 8, color: "#f87171", fontFamily: t.mono, fontSize: 12, fontWeight: 700 }}>−</span>
        </div>
        <div style={{ display: "flex", gap: 6, fontFamily: t.mono, fontSize: 10 }}>
          {[["standard","STD"],["wild","WLD"],["twist","TWS"]].map(([k,l]) => (
            <button key={k} onClick={() => setFormatFilter(k)} style={{
              padding: "6px 12px", borderRadius: 3, cursor: "pointer",
              background: formatFilter === k ? t.accentDim : "transparent",
              color: formatFilter === k ? t.accent : t.textDim,
              border: formatFilter === k ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
              letterSpacing: "0.14em", fontWeight: 700,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Class chips */}
      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setClassFilter("all")} style={{
          padding: "5px 12px", borderRadius: 14, cursor: "pointer",
          background: classFilter === "all" ? t.accentDim : "transparent",
          color: classFilter === "all" ? t.accent : t.textDim,
          border: classFilter === "all" ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
          fontSize: 11, fontFamily: t.mono, letterSpacing: "0.08em", fontWeight: 600,
        }}>ALL CLASSES</button>
        {Object.entries(window.CLASSES).map(([key, c]) => {
          const active = classFilter === key;
          return (
            <button key={key} onClick={() => setClassFilter(key)} style={{
              padding: "3px 10px 3px 4px", borderRadius: 14, cursor: "pointer",
              background: active ? `oklch(0.22 0.10 ${c.hue} / 0.5)` : "transparent",
              color: active ? `oklch(0.9 0.10 ${c.hue})` : t.textDim,
              border: `1px solid ${active ? `oklch(0.5 0.14 ${c.hue})` : t.border}`,
              fontSize: 11, fontFamily: t.sans, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <window.ClassCrest cls={key} size={18} />
              <span>{c.name}</span>
            </button>
          );
        })}
        <div style={{ flex: 1, minWidth: 12 }} />
        <div style={{ display: "flex", gap: 6, fontFamily: t.mono, fontSize: 10, alignItems: "center" }}>
          <span style={{ color: t.textMute, letterSpacing: "0.1em" }}>ARCH</span>
          {ARCHETYPES.map(a => (
            <button key={a} onClick={() => setArchetypeFilter(a)} style={{
              padding: "4px 9px", borderRadius: 3, cursor: "pointer",
              background: archetypeFilter === a ? t.accentDim : "transparent",
              color: archetypeFilter === a ? t.accent : t.textDim,
              border: archetypeFilter === a ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
              letterSpacing: "0.1em", fontWeight: 600, textTransform: "uppercase",
            }}>{a}</button>
          ))}
        </div>
      </div>

      {/* Subfilter row */}
      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", gap: 18, alignItems: "center", fontFamily: t.mono, fontSize: 10, color: t.textDim, letterSpacing: "0.06em" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: t.textMute, letterSpacing: "0.12em" }}>MAX DUST</span>
          <input type="range" min={1000} max={20000} step={500} value={maxDust} onChange={e => setMaxDust(+e.target.value)}
            style={{ width: 120, accentColor: t.accent }} />
          <span style={{ color: t.text, fontWeight: 600, minWidth: 60 }}>◆ {maxDust.toLocaleString()}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: t.textMute, letterSpacing: "0.12em" }}>SORT</span>
          {SORTS.map(s => (
            <button key={s} onClick={() => setSort(s)} style={{
              padding: "3px 8px", borderRadius: 3, cursor: "pointer",
              background: sort === s ? t.accentDim : "transparent",
              color: sort === s ? t.accent : t.textDim,
              border: `1px solid ${sort === s ? t.accent : "transparent"}`,
              letterSpacing: "0.1em", fontWeight: 600, textTransform: "uppercase",
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Body: list + detail */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.4fr 1fr", overflow: "hidden" }}>
        {/* Results */}
        <div style={{ overflow: "auto", borderRight: `1px solid ${t.border}` }}>
          {sorted.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: t.textMute, fontFamily: t.mono, fontSize: 12 }}>
              No decks match. Loosen a filter.
            </div>
          )}
          {sorted.map(d => {
            const c = window.CLASSES[d.cls];
            const active = sel && d.id === sel.id;
            return (
              <button key={d.id} onClick={() => setSelected(d.id)} style={{
                width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                background: active ? `oklch(0.22 0.10 ${c.hue} / 0.18)` : "transparent",
                borderBottom: `1px solid ${t.border}`,
                borderLeft: active ? `2px solid oklch(0.6 0.14 ${c.hue})` : "2px solid transparent",
                padding: "12px 18px",
                display: "grid", gridTemplateColumns: "30px 1fr auto", gap: 12, alignItems: "center",
                color: t.text, fontFamily: t.sans, transition: "background 120ms",
              }}>
                <window.ClassCrest cls={d.cls} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{d.name}</div>
                  <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.08em", marginTop: 3, display: "flex", gap: 10 }}>
                    <span style={{ color: t.textDim, textTransform: "uppercase" }}>{d.archetype}</span>
                    <span>·</span>
                    <span>by {d.author}</span>
                    <span>·</span>
                    <span>upd {d.updated}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontFamily: t.mono }}>
                  <div style={{ fontSize: 16, color: d.winrate >= 55 ? "#34d399" : d.winrate >= 50 ? t.accent : "#fbbf24", fontWeight: 600 }}>{d.winrate}%</div>
                  <div style={{ fontSize: 9, color: t.textMute, letterSpacing: "0.08em" }}>{(d.games/1000).toFixed(1)}k games</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        {sel && (
          <div style={{ overflow: "auto", padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <window.ClassCrest cls={sel.cls} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{sel.name}</div>
                  <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.1em", marginTop: 3, textTransform: "uppercase" }}>
                    {window.CLASSES[sel.cls].name} · {sel.archetype} · by {sel.author}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: t.border, borderRadius: 3, overflow: "hidden", border: `1px solid ${t.border}` }}>
              {[["WINRATE", `${sel.winrate}%`, sel.winrate >= 55 ? "#34d399" : t.accent],
                ["GAMES", `${(sel.games/1000).toFixed(1)}k`, t.text],
                ["DUST", `◆ ${sel.dust.toLocaleString()}`, "#fbbf24"]].map(([k,v,c],i) => (
                <div key={i} style={{ background: t.bg2, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>{k}</div>
                  <div style={{ fontSize: 16, color: c, fontWeight: 600, fontFamily: t.mono, marginTop: 3, letterSpacing: "-0.02em" }}>{v}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", marginBottom: 6 }}>MANA CURVE</div>
              <window.ManaCurveChart buckets={sel.cost_curve} w={300} h={48} accent={t.accent} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>KEY CARDS</div>
                <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.06em" }}>{sel.cards.length} of 30 shown</div>
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                {sel.cards.map((cn, i) => (
                  <div key={cn} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                    background: t.bg2, borderRadius: 3, fontSize: 12,
                    border: `1px solid transparent`, transition: "border-color 120ms",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = t.borderHi}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}
                  >
                    <window.ManaGem cost={(i % 8) + 1} size={18} />
                    <window.CardArt cls={Object.keys(window.CLASSES)[i % 9]} size="xs" style={{ width: 18, height: 22 }} />
                    <span style={{ flex: 1 }}>{cn}</span>
                    <window.PipCount count={i % 2 === 0 ? 2 : 1} remaining={i % 2 === 0 ? 2 : 1} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
              <button style={{
                flex: 1, padding: "10px 14px", borderRadius: 3,
                background: t.accent, color: "#0a0f14", border: "none",
                fontFamily: t.mono, fontSize: 11, letterSpacing: "0.14em", fontWeight: 700, cursor: "pointer",
              }}>IMPORT TO MY DECKS →</button>
              <button style={{
                padding: "10px 14px", borderRadius: 3,
                background: "transparent", color: t.textDim, border: `1px solid ${t.border}`,
                fontFamily: t.mono, fontSize: 11, letterSpacing: "0.14em", fontWeight: 600, cursor: "pointer",
              }}>COPY CODE</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ConsoleDeckFinder });
