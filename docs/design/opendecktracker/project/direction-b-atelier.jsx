// Direction B: ATELIER — warmer dark, graphite + amber, medium-density.

const B_TOKENS = {
  bg:        "#181513",
  bg2:       "#211d1a",
  bg3:       "#2a2522",
  border:    "#332d28",
  borderHi:  "#4a4038",
  text:      "#f4ecdf",
  textDim:   "#a89a87",
  textMute:  "#6f6357",
  accent:    "#f4a738",   // amber
  accentSoft:"rgba(244,167,56,0.12)",
  green:     "#86b06b",
  red:       "#d97766",
  blue:      "#88a8c8",
  mono:      "'JetBrains Mono', ui-monospace, monospace",
  serif:     "'Newsreader', 'Source Serif 4', Georgia, serif",
  sans:      "'Inter', system-ui, sans-serif",
};

function AtelierTracker({ density = "medium", drawn = window.DRAWN_STATE }) {
  const t = B_TOKENS;
  const deck = window.deckRemaining(window.ACTIVE_DECK, drawn).sort(window.sortByCost);
  const remaining = deck.reduce((s, c) => s + c.remaining, 0);
  const total = window.ACTIVE_DECK.reduce((s, c) => s + c.count, 0);
  const rowH = density === "tight" ? 28 : density === "loose" ? 56 : 42;
  const artSize = density === "tight" ? "xs" : density === "loose" ? "md" : "sm";

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 14 }}>
        <window.ClassCrest cls="ember" size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.serif, fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
            Aggro Ember
          </div>
          <div style={{ fontSize: 11, color: t.textDim, fontFamily: t.mono, marginTop: 4, letterSpacing: "0.04em" }}>
            EMBER · 30 cards · Standard · v3.1
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: t.mono, fontSize: 28, color: t.accent, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.04em" }}>
            {remaining}<span style={{ color: t.textMute, fontSize: 16 }}>/{total}</span>
          </div>
          <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", marginTop: 4 }}>REMAINING</div>
        </div>
      </div>

      {/* Mana curve + status */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", borderBottom: `1px solid ${t.border}`, background: t.bg2 }}>
        <div style={{ padding: "10px 16px", borderRight: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", marginBottom: 4 }}>CURVE</div>
          <window.ManaCurveChart buckets={window.manaCurve(deck.map(c => ({ cost: c.cost, count: c.remaining })))} w={160} h={36} accent={t.accent} />
        </div>
        {[
          ["TURN", "07", t.text],
          ["HAND", "04", t.text],
          ["TOPDECK", "1.92×", t.accent],
        ].map(([k, v, c], i) => (
          <div key={i} style={{ padding: "10px 16px", borderRight: i < 2 ? `1px solid ${t.border}` : "none", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>{k}</div>
            <div style={{ fontFamily: t.mono, fontSize: 18, color: c, fontWeight: 500, marginTop: 2, letterSpacing: "-0.02em" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", padding: "10px 20px", gap: 16, borderBottom: `1px solid ${t.border}`, fontSize: 12 }}>
        {["Deck", "Drawn", "Opponent"].map((tab, i) => (
          <div key={tab} style={{
            color: i === 0 ? t.accent : t.textDim,
            borderBottom: i === 0 ? `1.5px solid ${t.accent}` : "1.5px solid transparent",
            paddingBottom: 6, cursor: "pointer", fontWeight: 500,
            fontFamily: t.serif, fontSize: 14,
          }}>
            {tab} <span style={{ color: t.textMute, fontFamily: t.mono, fontSize: 10, marginLeft: 4 }}>
              {i === 0 ? remaining : i === 1 ? (total - remaining) : 5}
            </span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
        {deck.map((c, i) => {
          const dimmed = c.remaining === 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "0 20px", height: rowH,
              opacity: dimmed ? 0.4 : 1, transition: "background 120ms",
              borderLeft: `2px solid transparent`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = t.bg2; e.currentTarget.style.borderLeftColor = window.RARITY[c.rarity].color; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderLeftColor = "transparent"; }}
            >
              <window.ManaGem cost={c.cost} size={26} depleted={dimmed} />
              <window.CardArt cls={["ember","tide","bramble","cinder","hollow","iron"][c.cost % 6]} size={artSize} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: t.serif, fontSize: density === "tight" ? 13 : 15, fontWeight: 500, letterSpacing: "-0.01em",
                  color: dimmed ? t.textMute : t.text,
                  textDecoration: dimmed ? "line-through" : "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{c.name}</div>
                {density !== "tight" && (
                  <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.04em", marginTop: 2, textTransform: "uppercase" }}>
                    {window.RARITY[c.rarity].label} · {c.type}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {Array.from({ length: c.count }).map((_, j) => (
                  <div key={j} style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: j < c.remaining ? t.accent : "transparent",
                    border: `1px solid ${j < c.remaining ? t.accent : t.borderHi}`,
                  }} />
                ))}
              </div>
              <div style={{ fontFamily: t.mono, fontSize: 13, color: dimmed ? t.textMute : t.accent, fontWeight: 500, minWidth: 24, textAlign: "right" }}>
                {c.remaining}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: `1px solid ${t.border}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 8, fontFamily: t.mono, fontSize: 10, color: t.textMute, letterSpacing: "0.06em" }}>
        <span style={{ color: t.green }}>●</span> CONNECTED
        <span style={{ marginLeft: "auto" }}>session 02:14:38</span>
      </div>
    </div>
  );
}

function AtelierStats() {
  const t = B_TOKENS;
  const wins = window.MATCH_LOG.filter(m => m.result === "W").length;
  const losses = window.MATCH_LOG.filter(m => m.result === "L").length;
  const winrate = (wins / (wins + losses)) * 100;
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontFamily: t.serif, fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>Performance</div>
        <div style={{ fontSize: 11, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.1em" }}>· LAST 30 DAYS</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, fontSize: 11, fontFamily: t.mono }}>
          {["7D", "30D", "90D", "ALL"].map((p, i) => (
            <div key={p} style={{
              padding: "4px 10px", borderRadius: 12,
              background: i === 1 ? t.accentSoft : "transparent",
              border: i === 1 ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
              color: i === 1 ? t.accent : t.textDim, cursor: "pointer",
            }}>{p}</div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: `1px solid ${t.border}` }}>
        {[
          { k: "Winrate", v: window.pct(winrate), trend: window.WINRATE_TREND, accent: t.accent, sub: "+8% vs prior" },
          { k: "Games",   v: "112", trend: [40,42,44,48,52,56,60,64,68,72,75,78,80,82,85,88,92,96,100,104,108,112], accent: t.text },
          { k: "Avg turn", v: "11.4", trend: [12,11,12,11,11,10,11,11,12,11,11,11,12,11,10,11,11,11,12,11,10,11], accent: t.text },
          { k: "Climb", v: "Diamond 2", sub: "▲ 8 stars this week", accent: t.green },
        ].map((s, i) => (
          <div key={i} style={{ padding: "20px 24px", borderRight: i < 3 ? `1px solid ${t.border}` : "none" }}>
            <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", textTransform: "uppercase" }}>{s.k}</div>
            <div style={{ fontFamily: t.serif, fontSize: 32, color: s.accent, fontWeight: 500, marginTop: 6, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.v}</div>
            {s.trend && <div style={{ marginTop: 10 }}><window.Sparkline values={s.trend} w={180} h={32} stroke={s.accent} strokeWidth={1.5} /></div>}
            {s.sub && <div style={{ fontSize: 11, color: s.k === "Climb" ? t.green : t.textDim, marginTop: 6, fontFamily: t.mono }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.3fr", overflow: "hidden" }}>
        <div style={{ borderRight: `1px solid ${t.border}`, padding: 24, overflow: "auto" }}>
          <div style={{ fontFamily: t.serif, fontSize: 16, fontWeight: 500, marginBottom: 12 }}>By matchup</div>
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(window.CLASSES).map(([key, c], i) => {
              const wr = 40 + ((i * 13) % 50);
              const games = 6 + ((i * 7) % 18);
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "110px 1fr 50px 40px", alignItems: "center", gap: 12, padding: "8px 10px", background: t.bg2, borderRadius: 6, border: `1px solid ${t.border}` }}>
                  <window.ClassCrest cls={key} size={22} showName />
                  <div style={{ height: 8, background: t.bg3, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${wr}%`,
                      background: wr >= 60 ? t.green : wr >= 50 ? t.accent : wr >= 40 ? "#c89055" : t.red,
                    }} />
                  </div>
                  <div style={{ fontFamily: t.mono, fontSize: 13, color: t.text, textAlign: "right", fontWeight: 500 }}>{wr}%</div>
                  <div style={{ fontFamily: t.mono, fontSize: 10, color: t.textMute, textAlign: "right" }}>{games}g</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ overflow: "auto", padding: "0 0 16px 0" }}>
          <div style={{ fontFamily: t.serif, fontSize: 16, fontWeight: 500, padding: "24px 24px 12px" }}>Recent matches</div>
          {window.MATCH_LOG.map((m, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "32px 1.2fr 1fr 60px 70px",
              alignItems: "center", gap: 12, padding: "12px 24px",
              borderTop: `1px solid ${t.border}`,
              borderLeft: `2px solid ${m.result === "W" ? t.green : t.red}`,
              marginLeft: 0,
            }}>
              <div style={{ fontFamily: t.serif, fontSize: 18, fontWeight: 600, color: m.result === "W" ? t.green : t.red }}>{m.result}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <window.ClassCrest cls={m.you} size={20} />
                <div>
                  <div style={{ fontFamily: t.serif, fontSize: 14 }}>{m.deck}</div>
                  <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono }}>vs {window.CLASSES[m.them].name}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.textDim }}>
                <window.ClassCrest cls={m.them} size={18} />
                <span style={{ fontSize: 12 }}>{window.CLASSES[m.them].name}</span>
              </div>
              <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 12, color: t.textDim }}>{m.turns}t · {m.time}</div>
              <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 10, color: t.textMute }}>{m.rank}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AtelierCollection() {
  const t = B_TOKENS;
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontFamily: t.serif, fontSize: 24, fontWeight: 500 }}>Collection</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: t.mono, fontSize: 12, color: t.textDim }}>
          <span style={{ color: t.accent, fontWeight: 600 }}>847</span><span style={{ color: t.textMute }}> / 2,184 owned · 38.7%</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, padding: "12px 24px", borderBottom: `1px solid ${t.border}`, fontSize: 12, alignItems: "center" }}>
        {["All", "Ember", "Tide", "Bramble", "Iron", "Hollow"].map((f, i) => (
          <div key={f} style={{
            padding: "6px 14px", borderRadius: 16,
            background: i === 0 ? t.accent : "transparent",
            color: i === 0 ? "#1a1410" : t.textDim,
            border: i === 0 ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
            cursor: "pointer", fontWeight: i === 0 ? 600 : 400,
            fontFamily: t.serif, fontSize: 13,
          }}>{f}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: `1px solid ${t.border}`, borderRadius: 16, fontSize: 11, color: t.textDim, fontFamily: t.mono }}>
          ⌕ search cards...
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
          {window.COLLECTION.map((c, i) => (
            <div key={i} style={{
              background: c.owned === 0 ? t.bg2 : `linear-gradient(180deg, ${t.bg2} 0%, ${t.bg} 100%)`,
              border: `1px solid ${c.owned === 0 ? t.border : t.borderHi}`,
              borderRadius: 8, padding: 10, opacity: c.owned === 0 ? 0.5 : 1,
              transition: "all 180ms", cursor: "pointer", position: "relative",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 24px rgba(244,167,56,0.15)`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = c.owned === 0 ? t.border : t.borderHi; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <window.ManaGem cost={c.cost} size={24} />
                <window.CardArt cls={c.cls} size="md" style={{ width: "100%", height: 70 }} />
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: t.serif, fontSize: 13, fontWeight: 500, lineHeight: 1.3,
                  color: c.owned === 0 ? t.textMute : t.text,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{c.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 4, background: window.RARITY[c.rarity].color }}></span>
                  <span style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.04em", textTransform: "uppercase", flex: 1 }}>
                    {c.cls}
                  </span>
                  <span style={{ fontFamily: t.mono, fontSize: 11, color: c.owned === 0 ? t.red : t.textDim, fontWeight: 500 }}>
                    {c.owned}/2
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AtelierOverlay({ opacity = 0.92, drawn = window.DRAWN_STATE }) {
  const t = B_TOKENS;
  const deck = window.deckRemaining(window.ACTIVE_DECK, drawn).sort(window.sortByCost);
  const remaining = deck.reduce((s, c) => s + c.remaining, 0);
  return (
    <div style={{
      width: 280, background: `rgba(24, 21, 19, ${opacity})`,
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      border: `1px solid rgba(244,167,56,0.3)`,
      borderRadius: 8, color: t.text, fontFamily: t.sans,
      boxShadow: "0 12px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(244,167,56,0.1)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10, background: `linear-gradient(180deg, rgba(244,167,56,0.08), transparent)` }}>
        <window.ClassCrest cls="ember" size={24} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.serif, fontSize: 14, fontWeight: 500 }}>Aggro Ember</div>
          <div style={{ fontFamily: t.mono, fontSize: 9, color: t.textMute, letterSpacing: "0.1em", marginTop: 1 }}>TURN 07 · HAND 04</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: t.mono, fontSize: 18, color: t.accent, fontWeight: 600, lineHeight: 1 }}>{remaining}</div>
          <div style={{ fontSize: 8, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.1em" }}>LEFT</div>
        </div>
      </div>
      <div style={{ maxHeight: 340, overflow: "auto" }}>
        {deck.map((c, i) => {
          const dimmed = c.remaining === 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "3px 10px", height: 28,
              opacity: dimmed ? 0.35 : 1,
              borderBottom: i < deck.length - 1 ? `1px solid rgba(51,45,40,0.5)` : "none",
            }}>
              <window.ManaGem cost={c.cost} size={18} depleted={dimmed} />
              <window.CardArt cls={["ember","tide","bramble","cinder","hollow","iron"][c.cost % 6]} size="xs" style={{ width: 18, height: 22 }} />
              <div style={{
                flex: 1, minWidth: 0, fontFamily: t.serif, fontSize: 12,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                textDecoration: dimmed ? "line-through" : "none",
                color: dimmed ? t.textMute : t.text,
              }}>{c.name}</div>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: c.count }).map((_, j) => (
                  <div key={j} style={{
                    width: 5, height: 5, borderRadius: 3,
                    background: j < c.remaining ? t.accent : "transparent",
                    border: `1px solid ${j < c.remaining ? t.accent : t.borderHi}`,
                  }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${t.border}`, padding: "8px 12px" }}>
        <div style={{ fontSize: 8, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", marginBottom: 5 }}>
          OPPONENT REVEALED
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {window.OPP_REVEALED.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <window.ManaGem cost={c.cost} size={14} depleted={c.played} />
              <div style={{ flex: 1, fontFamily: t.serif, color: c.played ? t.textMute : t.text, textDecoration: c.played ? "line-through" : "none" }}>{c.name}</div>
              <div style={{ fontSize: 8, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.1em" }}>{c.played ? "PLAYED" : "HAND"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AtelierTracker, AtelierStats, AtelierCollection, AtelierOverlay, B_TOKENS });
