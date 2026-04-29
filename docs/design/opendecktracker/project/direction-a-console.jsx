// Direction A: CONSOLE — Linear-meets-tracker. Tight, slate, single cyan accent.

const A_TOKENS = {
  bg:        "#0b0f14",
  bg2:       "#11161d",
  bg3:       "#161c25",
  border:    "#1f2731",
  borderHi:  "#2a3543",
  text:      "#e6edf3",
  textDim:   "#8b96a3",
  textMute:  "#5b6573",
  accent:    "#22d3ee", // cyan
  accentDim: "rgba(34,211,238,0.15)",
  green:     "#34d399",
  red:       "#f87171",
  amber:     "#fbbf24",
  mono:      "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  sans:      "'Inter', system-ui, -apple-system, sans-serif",
};

// ===== Tracker (active deck list, live game) =====
function ConsoleTracker({ density = "medium", drawn = window.DRAWN_STATE }) {
  const t = A_TOKENS;
  const deck = window.deckRemaining(window.ACTIVE_DECK, drawn).sort(window.sortByCost);
  const remaining = deck.reduce((s, c) => s + c.remaining, 0);
  const total = window.ACTIVE_DECK.reduce((s, c) => s + c.count, 0);
  const rowH = density === "tight" ? 24 : density === "loose" ? 40 : 30;
  const fontSize = density === "tight" ? 11.5 : 13;
  const showArt = density !== "tight";
  const artSize = density === "loose" ? "sm" : "xs";

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${t.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <window.ClassCrest cls="ember" size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Aggro Ember</div>
          <div style={{ fontSize: 11, color: t.textDim, fontFamily: t.mono, letterSpacing: "0.02em" }}>
            EMBER · 30 cards · Standard
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: t.mono, fontSize: 12 }}>
          <span style={{ color: t.textMute }}>DECK</span>
          <span style={{ color: t.accent, fontWeight: 600 }}>{remaining}</span>
          <span style={{ color: t.textMute }}>/{total}</span>
        </div>
      </div>

      {/* Live game status strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: `1px solid ${t.border}` }}>
        {[
          ["TURN",     "07",    t.text],
          ["IN HAND",  "04",    t.text],
          ["FATIGUE",  "—",     t.textMute],
          ["TOP-DECK", "1.92×", t.accent],
        ].map(([k, v, c]) => (
          <div key={k} style={{ padding: "8px 12px", borderRight: `1px solid ${t.border}`, fontFamily: t.mono }}>
            <div style={{ fontSize: 9, color: t.textMute, letterSpacing: "0.12em" }}>{k}</div>
            <div style={{ fontSize: 14, color: c, fontWeight: 600, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${t.border}`, padding: "0 8px", fontSize: 11, fontFamily: t.mono, letterSpacing: "0.06em" }}>
        {["DECK", "DRAWN", "OPPONENT"].map((tab, i) => (
          <div key={tab} style={{
            padding: "8px 10px", color: i === 0 ? t.accent : t.textDim,
            borderBottom: i === 0 ? `1.5px solid ${t.accent}` : "1.5px solid transparent",
            cursor: "pointer", fontWeight: 600,
          }}>
            {tab} <span style={{ color: t.textMute, marginLeft: 4 }}>
              {i === 0 ? remaining : i === 1 ? (total - remaining) : 5}
            </span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: "8px 10px", color: t.textMute, fontSize: 10 }}>↑↓ navigate · / search</div>
      </div>

      {/* Card list */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {deck.map((c, i) => {
          const dimmed = c.remaining === 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: density === "tight" ? "0 12px" : "0 12px",
              height: rowH,
              borderBottom: `1px solid ${t.border}`,
              opacity: dimmed ? 0.35 : 1,
              fontSize,
              cursor: "default",
              transition: "background 120ms",
            }}
            onMouseEnter={e => e.currentTarget.style.background = t.bg2}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <window.ManaGem cost={c.cost} size={density === "tight" ? 18 : 22} depleted={dimmed} />
              {showArt && <window.CardArt cls={["ember","tide","bramble","cinder","hollow","iron"][c.cost % 6]} size={artSize} />}
              <div style={{
                flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: dimmed ? t.textMute : t.text,
                textDecoration: dimmed ? "line-through" : "none",
                fontWeight: c.rarity === "legendary" ? 600 : 400,
              }}>
                <span style={{
                  display: "inline-block", width: 6, height: 6, borderRadius: 3,
                  background: window.RARITY[c.rarity].color, marginRight: 8, verticalAlign: "middle",
                  opacity: 0.9,
                }} />
                {c.name}
              </div>
              <div style={{ fontFamily: t.mono, fontSize: fontSize - 1, color: t.textDim, minWidth: 40, textAlign: "right" }}>
                {c.drawn > 0 && <span style={{ color: t.textMute }}>−{c.drawn} </span>}
                <span style={{ color: dimmed ? t.textMute : t.accent, fontWeight: 600 }}>×{c.remaining}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${t.border}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, fontFamily: t.mono, fontSize: 10, color: t.textMute }}>
        <span style={{ color: t.green }}>●</span> CONNECTED
        <span style={{ marginLeft: "auto" }}>v0.4.2 · spec b3a1</span>
      </div>
    </div>
  );
}

// ===== Stats =====
function ConsoleStats() {
  const t = A_TOKENS;
  const wins = window.MATCH_LOG.filter(m => m.result === "W").length;
  const losses = window.MATCH_LOG.filter(m => m.result === "L").length;
  const winrate = (wins / (wins + losses)) * 100;
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}` }}>
        <div style={{ fontSize: 11, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.1em" }}>STATS / LAST 30 DAYS</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>Performance</div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: `1px solid ${t.border}` }}>
        {[
          { k: "WINRATE", v: window.pct(winrate), trend: window.WINRATE_TREND.slice(-12), accent: t.accent },
          { k: "GAMES",   v: String(window.MATCH_LOG.length * 14), trend: [40,42,44,48,52,56,60,64,68,72,75,78], accent: t.text },
          { k: "AVG TURN", v: "11.4", trend: [12,11,12,11,11,10,11,11,12,11,11,11], accent: t.text },
          { k: "RANK",    v: "Diamond 2", sub: "▲ +3 stars", accent: t.green },
        ].map(s => (
          <div key={s.k} style={{ padding: "16px 20px", borderRight: `1px solid ${t.border}`, fontFamily: t.mono }}>
            <div style={{ fontSize: 9, color: t.textMute, letterSpacing: "0.12em" }}>{s.k}</div>
            <div style={{ fontSize: 24, color: s.accent, fontWeight: 600, marginTop: 4, letterSpacing: "-0.02em" }}>{s.v}</div>
            {s.trend && <div style={{ marginTop: 6 }}><window.Sparkline values={s.trend} w={140} h={28} stroke={s.accent} /></div>}
            {s.sub && <div style={{ fontSize: 11, color: t.green, marginTop: 6 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Body: matchup matrix + match log */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.2fr", overflow: "hidden" }}>
        <div style={{ borderRight: `1px solid ${t.border}`, padding: 20, overflow: "auto" }}>
          <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em", marginBottom: 12 }}>
            MATCHUP MATRIX — AGGRO EMBER VS
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {Object.entries(window.CLASSES).map(([key, c], i) => {
              const wr = 40 + ((i * 13) % 50); // synthetic
              const games = 6 + ((i * 7) % 18);
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "100px 1fr 60px 40px", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <window.ClassCrest cls={key} size={20} showName />
                  <div style={{ height: 6, background: t.bg3, borderRadius: 3, overflow: "hidden", position: "relative" }}>
                    <div style={{
                      position: "absolute", inset: 0, width: `${wr}%`,
                      background: wr >= 60 ? t.green : wr >= 50 ? t.accent : wr >= 40 ? t.amber : t.red,
                      opacity: 0.85,
                    }} />
                  </div>
                  <div style={{ fontFamily: t.mono, fontSize: 11, color: t.text, textAlign: "right" }}>{wr}%</div>
                  <div style={{ fontFamily: t.mono, fontSize: 10, color: t.textMute, textAlign: "right" }}>{games}g</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 1fr 60px 60px 70px", padding: "10px 16px", fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.1em", borderBottom: `1px solid ${t.border}`, position: "sticky", top: 0, background: t.bg }}>
            <div></div><div>YOU</div><div>OPPONENT</div><div style={{textAlign:"right"}}>TURNS</div><div style={{textAlign:"right"}}>TIME</div><div style={{textAlign:"right"}}>RANK</div>
          </div>
          {window.MATCH_LOG.map((m, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "30px 1fr 1fr 60px 60px 70px",
              padding: "8px 16px", fontSize: 12, alignItems: "center",
              borderBottom: `1px solid ${t.border}`, fontFamily: t.mono,
            }}>
              <div style={{ color: m.result === "W" ? t.green : t.red, fontWeight: 700 }}>{m.result}</div>
              <div style={{ color: t.text, display: "flex", alignItems: "center", gap: 6 }}>
                <window.ClassCrest cls={m.you} size={16} /> <span style={{ fontFamily: t.sans }}>{m.deck}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: t.textDim }}>
                <window.ClassCrest cls={m.them} size={16} /> <span style={{ fontFamily: t.sans }}>{window.CLASSES[m.them].name}</span>
              </div>
              <div style={{ textAlign: "right", color: t.textDim }}>{m.turns}</div>
              <div style={{ textAlign: "right", color: t.textDim }}>{m.time}</div>
              <div style={{ textAlign: "right", color: t.textMute, fontSize: 10 }}>{m.rank}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== Collection =====
function ConsoleCollection() {
  const t = A_TOKENS;
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 11, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em" }}>COLLECTION</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: t.mono, fontSize: 11, color: t.textDim }}>
          OWNED <span style={{ color: t.text, fontWeight: 600 }}>847</span> / 2,184
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${t.border}`, padding: "8px 16px", gap: 6, fontFamily: t.mono, fontSize: 11 }}>
        {["ALL", "EMBER", "TIDE", "BRAMBLE", "IRON", "HOLLOW"].map((f, i) => (
          <div key={f} style={{
            padding: "4px 10px", borderRadius: 3,
            background: i === 0 ? t.accentDim : "transparent",
            color: i === 0 ? t.accent : t.textDim,
            border: i === 0 ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
            cursor: "pointer", letterSpacing: "0.06em",
          }}>{f}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {[0,1,2,3,4,5,6,7,8,9,"+"].map((c, i) => (
            <div key={i} style={{
              width: 22, height: 22, borderRadius: 3,
              background: t.bg2, border: `1px solid ${t.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: t.textDim, cursor: "pointer",
            }}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {window.COLLECTION.map((c, i) => (
            <div key={i} style={{
              background: t.bg2, border: `1px solid ${c.owned === 0 ? t.border : t.borderHi}`,
              borderRadius: 4, padding: 8, opacity: c.owned === 0 ? 0.45 : 1,
              transition: "all 150ms", cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = c.owned === 0 ? t.border : t.borderHi; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <window.ManaGem cost={c.cost} size={20} />
                <div style={{ flex: 1 }} />
                <div style={{ fontFamily: t.mono, fontSize: 10, color: c.owned === 0 ? t.red : t.textDim }}>
                  {c.owned}/2
                </div>
              </div>
              <window.CardArt cls={c.cls} size="md" style={{ width: "100%" }} />
              <div style={{ fontSize: 11, fontWeight: 500, marginTop: 6, lineHeight: 1.3,
                color: c.owned === 0 ? t.textMute : t.text,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{c.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: 3, background: window.RARITY[c.rarity].color }}></span>
                <span style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {c.cls} · {c.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== Overlay (in-game floating tracker) =====
function ConsoleOverlay({ opacity = 0.92, drawn = window.DRAWN_STATE }) {
  const t = A_TOKENS;
  const deck = window.deckRemaining(window.ACTIVE_DECK, drawn).sort(window.sortByCost);
  const drawnList = deck.filter(c => c.drawn > 0);
  const remaining = deck.reduce((s, c) => s + c.remaining, 0);
  return (
    <div style={{
      width: 260, background: `rgba(11, 15, 20, ${opacity})`,
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: `1px solid rgba(34,211,238,0.25)`,
      borderRadius: 6, color: t.text, fontFamily: t.sans,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <window.ClassCrest cls="ember" size={20} />
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Aggro Ember</div>
        <div style={{ fontFamily: t.mono, fontSize: 11, color: t.accent }}>{remaining}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${t.border}` }}>
        {[["T", "07"], ["HAND", "04"], ["TOP", "1.92×"]].map(([k,v], i) => (
          <div key={i} style={{ padding: "5px 8px", borderRight: i < 2 ? `1px solid ${t.border}` : "none", fontFamily: t.mono }}>
            <div style={{ fontSize: 8, color: t.textMute, letterSpacing: "0.1em" }}>{k}</div>
            <div style={{ fontSize: 11, color: i === 2 ? t.accent : t.text, fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ maxHeight: 320, overflow: "auto" }}>
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
              <div style={{ fontFamily: t.mono, fontSize: 10, color: dimmed ? t.textMute : t.accent, fontWeight: 600 }}>×{c.remaining}</div>
            </div>
          );
        })}
      </div>
      {/* Opponent strip */}
      <div style={{ borderTop: `1px solid ${t.border}`, padding: "6px 10px" }}>
        <div style={{ fontSize: 8, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em", marginBottom: 4 }}>
          OPPONENT REVEALED · {window.OPP_REVEALED.length}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {window.OPP_REVEALED.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 3, padding: "2px 5px",
              background: c.played ? "rgba(248,113,113,0.1)" : "rgba(34,211,238,0.1)",
              border: `1px solid ${c.played ? "rgba(248,113,113,0.3)" : "rgba(34,211,238,0.3)"}`,
              borderRadius: 3, fontSize: 10, fontFamily: t.mono,
            }}>
              <span style={{ color: c.played ? "#fca5a5" : t.accent }}>{c.cost}</span>
              <span style={{ color: t.textDim }}>{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ConsoleTracker, ConsoleStats, ConsoleCollection, ConsoleOverlay, A_TOKENS });
