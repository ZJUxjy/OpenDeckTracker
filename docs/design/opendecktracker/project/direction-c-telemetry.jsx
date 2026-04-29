// Direction C: TELEMETRY — esports broadcast, magenta accent, visual-first.

const C_TOKENS = {
  bg:        "#0a0a12",
  bg2:       "#10101c",
  bg3:       "#181825",
  border:    "#1f1f30",
  borderHi:  "#2d2d45",
  text:      "#ffffff",
  textDim:   "#9090ad",
  textMute:  "#5a5a75",
  accent:    "#ff2e88",   // magenta
  accent2:   "#7b2cff",   // violet
  accentSoft:"rgba(255,46,136,0.14)",
  green:     "#2ee5a7",
  red:       "#ff4d6d",
  amber:     "#ffb83d",
  cyan:      "#00d9ff",
  mono:      "'JetBrains Mono', ui-monospace, monospace",
  display:   "'Inter', system-ui, sans-serif",
};

function TelemetryTracker({ density = "medium", drawn = window.DRAWN_STATE }) {
  const t = C_TOKENS;
  const deck = window.deckRemaining(window.ACTIVE_DECK, drawn).sort(window.sortByCost);
  const remaining = deck.reduce((s, c) => s + c.remaining, 0);
  const total = window.ACTIVE_DECK.reduce((s, c) => s + c.count, 0);
  const rowH = density === "tight" ? 30 : density === "loose" ? 60 : 44;
  const showArt = true;
  const artSize = density === "tight" ? "xs" : density === "loose" ? "md" : "sm";

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.display, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "16px 20px", borderBottom: `1px solid ${t.border}`,
        background: `linear-gradient(135deg, rgba(255,46,136,0.08), rgba(123,44,255,0.04) 60%, transparent)`,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <window.ClassCrest cls="ember" size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: t.accent, fontFamily: t.mono, letterSpacing: "0.2em", fontWeight: 600 }}>
            ACTIVE DECK
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, marginTop: 2, letterSpacing: "-0.02em",
            background: `linear-gradient(90deg, ${t.text}, ${t.textDim})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>AGGRO EMBER</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: t.mono, fontSize: 36, color: t.accent, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.04em" }}>
            {remaining}
          </div>
          <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.18em", marginTop: 4 }}>
            OF {total} LEFT
          </div>
        </div>
      </div>

      {/* Stat strip with sparklines */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: `1px solid ${t.border}` }}>
        {[
          { k: "TURN",   v: "07",    sub: "your turn",    accent: t.text,  trend: [1,2,3,4,5,6,7] },
          { k: "HAND",   v: "04",    sub: "+1 next",      accent: t.cyan,  trend: [3,4,5,4,3,4,4] },
          { k: "TOPDECK", v: "1.92×", sub: "vs avg 1.0",  accent: t.accent,trend: [1.0,1.1,1.2,1.4,1.6,1.8,1.92] },
          { k: "WIN%",   v: "73",    sub: "predicted",    accent: t.green, trend: [55,58,62,65,68,71,73] },
        ].map((s, i) => (
          <div key={i} style={{ padding: "12px 16px", borderRight: i < 3 ? `1px solid ${t.border}` : "none", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.16em", fontWeight: 600 }}>{s.k}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <div style={{ fontFamily: t.mono, fontSize: 26, color: s.accent, fontWeight: 700, letterSpacing: "-0.04em" }}>{s.v}</div>
              {s.k === "WIN%" && <div style={{ fontSize: 14, color: s.accent, fontWeight: 600 }}>%</div>}
            </div>
            <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.06em", marginTop: 2 }}>{s.sub}</div>
            <div style={{ position: "absolute", right: 8, top: 8, opacity: 0.6 }}>
              <window.Sparkline values={s.trend} w={48} h={20} stroke={s.accent} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${t.border}` }}>
        {[["DECK", remaining], ["DRAWN", total - remaining], ["OPP", 5]].map(([tab, n], i) => (
          <div key={tab} style={{
            padding: "10px 18px", flex: i === 0 ? "0 0 auto" : "0 0 auto",
            color: i === 0 ? t.text : t.textDim,
            background: i === 0 ? t.accentSoft : "transparent",
            borderBottom: i === 0 ? `2px solid ${t.accent}` : "2px solid transparent",
            fontSize: 11, fontFamily: t.mono, letterSpacing: "0.14em", fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          }}>
            {tab}
            <span style={{
              padding: "1px 6px", borderRadius: 3,
              background: i === 0 ? t.accent : t.bg3,
              color: i === 0 ? t.bg : t.textDim,
              fontSize: 10, fontWeight: 700,
            }}>{n}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: "10px 14px", fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em" }}>
          ⏱ MATCH 12:47
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {deck.map((c, i) => {
          const dimmed = c.remaining === 0;
          const cls = ["ember","tide","bramble","cinder","hollow","iron"][c.cost % 6];
          const hue = window.CLASSES[cls].hue;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "0 16px", height: rowH,
              opacity: dimmed ? 0.35 : 1, position: "relative",
              borderBottom: `1px solid ${t.border}`,
              transition: "all 140ms",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(90deg, oklch(0.22 0.10 ${hue} / 0.4), transparent 70%)`; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              {/* Rarity rail */}
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
                background: window.RARITY[c.rarity].color,
                opacity: c.rarity === "legendary" ? 1 : 0.6,
              }} />
              <window.ManaGem cost={c.cost} size={28} depleted={dimmed} />
              <window.CardArt cls={cls} size={artSize} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: density === "tight" ? 12 : 14, fontWeight: 600, letterSpacing: "-0.01em",
                  color: dimmed ? t.textMute : t.text,
                  textDecoration: dimmed ? "line-through" : "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  textTransform: "uppercase",
                }}>{c.name}</div>
                {density !== "tight" && (
                  <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", marginTop: 2 }}>
                    {window.RARITY[c.rarity].label.toUpperCase()} · {c.type.toUpperCase()}
                  </div>
                )}
              </div>
              {/* Probability bar */}
              <div style={{ width: 60, textAlign: "right" }}>
                <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.1em" }}>P(DRAW)</div>
                <div style={{ fontFamily: t.mono, fontSize: 11, color: c.remaining > 0 ? t.cyan : t.textMute, fontWeight: 600 }}>
                  {c.remaining > 0 ? `${Math.round((c.remaining / remaining) * 100)}%` : "—"}
                </div>
              </div>
              <div style={{
                fontFamily: t.mono, fontSize: 18, fontWeight: 700,
                color: dimmed ? t.textMute : t.accent, minWidth: 32, textAlign: "right", letterSpacing: "-0.04em",
              }}>
                {c.remaining}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        borderTop: `1px solid ${t.border}`, padding: "8px 16px",
        display: "flex", alignItems: "center", gap: 10,
        fontFamily: t.mono, fontSize: 10, color: t.textMute, letterSpacing: "0.1em",
        background: t.bg2,
      }}>
        <span style={{ color: t.green }}>● LIVE</span>
        <span>·</span>
        <span>HM-BRIDGE 12.4ms</span>
        <span style={{ marginLeft: "auto", color: t.accent }}>OPENDECK v0.4.2</span>
      </div>
    </div>
  );
}

function TelemetryStats() {
  const t = C_TOKENS;
  const wins = window.MATCH_LOG.filter(m => m.result === "W").length;
  const losses = window.MATCH_LOG.filter(m => m.result === "L").length;
  const winrate = (wins / (wins + losses)) * 100;
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.display, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "20px 24px", borderBottom: `1px solid ${t.border}`,
        background: `linear-gradient(135deg, rgba(255,46,136,0.08), rgba(123,44,255,0.04) 60%, transparent)`,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 10, color: t.accent, fontFamily: t.mono, letterSpacing: "0.2em", fontWeight: 700 }}>TELEMETRY</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 2, letterSpacing: "-0.02em" }}>PERFORMANCE</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, fontSize: 11, fontFamily: t.mono, fontWeight: 600 }}>
          {["7D", "30D", "90D", "ALL"].map((p, i) => (
            <div key={p} style={{
              padding: "6px 12px", borderRadius: 4,
              background: i === 1 ? t.accent : t.bg3,
              color: i === 1 ? t.bg : t.textDim,
              cursor: "pointer", letterSpacing: "0.14em",
            }}>{p}</div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: `1px solid ${t.border}` }}>
        {[
          { k: "WINRATE", v: window.pct(winrate), trend: window.WINRATE_TREND, accent: t.accent, sub: "▲ +8%" },
          { k: "GAMES",   v: "112",  trend: [40,42,44,48,52,56,60,64,68,72,75,78,80,82,85,88,92,96,100,104,108,112], accent: t.cyan, sub: "this period" },
          { k: "AVG TURN",v: "11.4", trend: [12,11,12,11,11,10,11,11,12,11,11,11,12,11,10,11,11,11,12,11,10,11], accent: t.amber, sub: "−0.8 vs prior" },
          { k: "RANK",    v: "DIA 2",sub: "▲ 8 stars / week",     accent: t.green },
        ].map((s, i) => (
          <div key={i} style={{ padding: "20px 24px", borderRight: i < 3 ? `1px solid ${t.border}` : "none" }}>
            <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.18em", fontWeight: 700 }}>{s.k}</div>
            <div style={{ fontFamily: t.mono, fontSize: 40, color: s.accent, fontWeight: 800, marginTop: 8, letterSpacing: "-0.04em", lineHeight: 1 }}>{s.v}</div>
            {s.trend && <div style={{ marginTop: 10 }}><window.Sparkline values={s.trend} w={200} h={36} stroke={s.accent} strokeWidth={1.8} /></div>}
            <div style={{ fontSize: 11, color: s.k === "RANK" ? t.green : t.textDim, marginTop: 8, fontFamily: t.mono, letterSpacing: "0.06em" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.2fr", overflow: "hidden" }}>
        <div style={{ borderRight: `1px solid ${t.border}`, padding: 24, overflow: "auto" }}>
          <div style={{ fontSize: 10, color: t.accent, fontFamily: t.mono, letterSpacing: "0.18em", marginBottom: 12, fontWeight: 700 }}>MATCHUP MATRIX</div>
          <div style={{ display: "grid", gap: 6 }}>
            {Object.entries(window.CLASSES).map(([key, c], i) => {
              const wr = 40 + ((i * 13) % 50);
              const games = 6 + ((i * 7) % 18);
              return (
                <div key={key} style={{
                  display: "grid", gridTemplateColumns: "100px 1fr 60px 50px", alignItems: "center", gap: 10,
                  padding: "8px 10px", background: t.bg2, borderRadius: 4,
                  borderLeft: `3px solid ${wr >= 60 ? t.green : wr >= 50 ? t.accent : wr >= 40 ? t.amber : t.red}`,
                }}>
                  <window.ClassCrest cls={key} size={20} showName />
                  <div style={{ height: 4, background: t.bg3, borderRadius: 2, overflow: "hidden", position: "relative" }}>
                    <div style={{
                      position: "absolute", inset: 0, width: `${wr}%`,
                      background: `linear-gradient(90deg, ${wr >= 50 ? t.accent : t.red}, ${wr >= 50 ? t.accent2 : "#aa3344"})`,
                    }} />
                  </div>
                  <div style={{ fontFamily: t.mono, fontSize: 14, color: t.text, textAlign: "right", fontWeight: 700 }}>{wr}%</div>
                  <div style={{ fontFamily: t.mono, fontSize: 10, color: t.textMute, textAlign: "right" }}>{games}g</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ overflow: "auto" }}>
          <div style={{ fontSize: 10, color: t.accent, fontFamily: t.mono, letterSpacing: "0.18em", padding: "24px 24px 12px", fontWeight: 700 }}>RECENT MATCHES</div>
          {window.MATCH_LOG.map((m, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "44px 1.2fr 1fr 70px 70px",
              alignItems: "center", gap: 10, padding: "12px 24px",
              borderTop: `1px solid ${t.border}`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 4,
                background: m.result === "W" ? `linear-gradient(135deg, ${t.green}, #1a9c70)` : `linear-gradient(135deg, ${t.red}, #aa3344)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: t.mono, fontSize: 16, fontWeight: 800, color: t.bg,
              }}>{m.result}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <window.ClassCrest cls={m.you} size={20} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.deck}</div>
                  <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.1em" }}>VS {window.CLASSES[m.them].name.toUpperCase()}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.textDim }}>
                <window.ClassCrest cls={m.them} size={18} />
              </div>
              <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 12, color: t.textDim }}>
                <span style={{ color: t.text, fontWeight: 600 }}>{m.turns}</span> turns
              </div>
              <div style={{ textAlign: "right", fontFamily: t.mono, fontSize: 11, color: t.textMute, letterSpacing: "0.06em" }}>{m.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TelemetryCollection() {
  const t = C_TOKENS;
  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.display, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "20px 24px", borderBottom: `1px solid ${t.border}`,
        background: `linear-gradient(135deg, rgba(255,46,136,0.06), transparent 70%)`,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 10, color: t.accent, fontFamily: t.mono, letterSpacing: "0.2em", fontWeight: 700 }}>LIBRARY</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2, letterSpacing: "-0.02em" }}>COLLECTION</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: t.mono, fontSize: 22, color: t.accent, fontWeight: 700, letterSpacing: "-0.02em" }}>847<span style={{ color: t.textMute, fontSize: 14 }}>/2,184</span></div>
          <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.18em", marginTop: 2 }}>38.7% OWNED</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "12px 24px", borderBottom: `1px solid ${t.border}`, alignItems: "center" }}>
        {["ALL", "EMBER", "TIDE", "BRAMBLE", "IRON", "HOLLOW"].map((f, i) => (
          <div key={f} style={{
            padding: "6px 14px", borderRadius: 4,
            background: i === 0 ? t.accent : t.bg2,
            color: i === 0 ? t.bg : t.textDim,
            border: i === 0 ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
            cursor: "pointer", fontSize: 11, fontFamily: t.mono, letterSpacing: "0.14em", fontWeight: 700,
          }}>{f}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {["MISSING", "DUSTABLE", "GOLDEN"].map((f, i) => (
            <div key={f} style={{
              padding: "5px 10px", borderRadius: 4, fontSize: 9, fontFamily: t.mono,
              border: `1px solid ${t.border}`, color: t.textDim, letterSpacing: "0.14em", fontWeight: 700, cursor: "pointer",
            }}>{f}</div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {window.COLLECTION.map((c, i) => {
            const hue = window.CLASSES[c.cls].hue;
            return (
              <div key={i} style={{
                background: c.owned === 0 ? t.bg2 : `linear-gradient(180deg, oklch(0.18 0.06 ${hue} / 0.4) 0%, ${t.bg2} 100%)`,
                border: `1px solid ${c.owned === 0 ? t.border : t.borderHi}`,
                borderRadius: 4, padding: 0, opacity: c.owned === 0 ? 0.4 : 1,
                transition: "all 160ms", cursor: "pointer", overflow: "hidden",
                position: "relative",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = "translateY(-2px) scale(1.02)"; e.currentTarget.style.boxShadow = `0 12px 32px rgba(255,46,136,0.2)`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = c.owned === 0 ? t.border : t.borderHi; e.currentTarget.style.transform = "translateY(0) scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                {c.rarity === "legendary" && (
                  <div style={{ position: "absolute", top: 6, right: 6, padding: "2px 6px", background: window.RARITY.legendary.color, color: "#000", fontSize: 8, fontFamily: t.mono, letterSpacing: "0.16em", fontWeight: 800, borderRadius: 2, zIndex: 2 }}>
                    LEG
                  </div>
                )}
                <div style={{ position: "relative", height: 90 }}>
                  <window.CardArt cls={c.cls} size="lg" style={{ width: "100%", height: "100%", borderRadius: 0, border: "none" }} />
                  <div style={{ position: "absolute", top: 6, left: 6 }}>
                    <window.ManaGem cost={c.cost} size={22} />
                  </div>
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, letterSpacing: "0.02em", textTransform: "uppercase",
                    color: c.owned === 0 ? t.textMute : t.text,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{c.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: window.RARITY[c.rarity].color }}></span>
                    <span style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em", flex: 1, textTransform: "uppercase" }}>
                      {c.cls}
                    </span>
                    <span style={{ fontFamily: t.mono, fontSize: 10, color: c.owned === 0 ? t.red : t.accent, fontWeight: 700 }}>
                      {c.owned}/2
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TelemetryOverlay({ opacity = 0.92, drawn = window.DRAWN_STATE }) {
  const t = C_TOKENS;
  const deck = window.deckRemaining(window.ACTIVE_DECK, drawn).sort(window.sortByCost);
  const remaining = deck.reduce((s, c) => s + c.remaining, 0);
  return (
    <div style={{
      width: 290, background: `rgba(10, 10, 18, ${opacity})`,
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: `1px solid rgba(255,46,136,0.35)`,
      borderRadius: 4, color: t.text, fontFamily: t.display,
      boxShadow: `0 0 0 1px rgba(0,0,0,0.5), 0 16px 48px rgba(255,46,136,0.15), 0 0 64px rgba(123,44,255,0.1)`,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 12px",
        background: `linear-gradient(135deg, rgba(255,46,136,0.18), rgba(123,44,255,0.08))`,
        borderBottom: `1px solid ${t.border}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <window.ClassCrest cls="ember" size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 8, color: t.accent, fontFamily: t.mono, letterSpacing: "0.2em", fontWeight: 700 }}>LIVE TRACKER</div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" }}>Aggro Ember</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: t.mono, fontSize: 22, color: t.accent, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.04em" }}>{remaining}</div>
          <div style={{ fontSize: 7, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.2em" }}>LEFT</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: `1px solid ${t.border}` }}>
        {[
          ["T", "07", t.text],
          ["HND", "04", t.cyan],
          ["TOP", "1.92", t.accent],
          ["W%", "73", t.green],
        ].map(([k,v,c], i) => (
          <div key={i} style={{ padding: "5px 6px", borderRight: i < 3 ? `1px solid ${t.border}` : "none", fontFamily: t.mono, textAlign: "center" }}>
            <div style={{ fontSize: 7, color: t.textMute, letterSpacing: "0.16em", fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: 13, color: c, fontWeight: 700, marginTop: 1, letterSpacing: "-0.02em" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ maxHeight: 320, overflow: "auto" }}>
        {deck.map((c, i) => {
          const dimmed = c.remaining === 0;
          const cls = ["ember","tide","bramble","cinder","hollow","iron"][c.cost % 6];
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "0 8px", height: 24,
              opacity: dimmed ? 0.3 : 1, position: "relative",
              borderBottom: i < deck.length - 1 ? `1px solid rgba(31,31,48,0.4)` : "none",
            }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: window.RARITY[c.rarity].color, opacity: 0.7 }} />
              <window.ManaGem cost={c.cost} size={16} depleted={dimmed} />
              <window.CardArt cls={cls} size="xs" style={{ width: 14, height: 18 }} />
              <div style={{
                flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                textDecoration: dimmed ? "line-through" : "none",
                color: dimmed ? t.textMute : t.text, textTransform: "uppercase",
              }}>{c.name}</div>
              <div style={{ fontFamily: t.mono, fontSize: 11, color: dimmed ? t.textMute : t.accent, fontWeight: 700 }}>{c.remaining}</div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${t.border}`, padding: "6px 10px", background: t.bg2 }}>
        <div style={{ fontSize: 7, color: t.accent, fontFamily: t.mono, letterSpacing: "0.2em", marginBottom: 5, fontWeight: 700 }}>OPP REVEALED · {window.OPP_REVEALED.length}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {window.OPP_REVEALED.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 3, padding: "2px 5px",
              background: c.played ? "rgba(255,77,109,0.12)" : "rgba(0,217,255,0.12)",
              border: `1px solid ${c.played ? "rgba(255,77,109,0.3)" : "rgba(0,217,255,0.3)"}`,
              borderRadius: 2, fontSize: 9, fontFamily: t.mono, fontWeight: 600,
            }}>
              <span style={{ color: c.played ? t.red : t.cyan }}>{c.cost}</span>
              <span style={{ color: t.text, letterSpacing: "0.04em" }}>{c.name.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TelemetryTracker, TelemetryStats, TelemetryCollection, TelemetryOverlay, C_TOKENS });
