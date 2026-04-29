// Per-direction artboard with tab switcher (Tracker / Stats / Collection / Overlay).

function DirectionArtboard({ direction, density, opacity, drawn, brand, accent, surfaceBg, borderColor }) {
  const [tab, setTab] = React.useState("tracker");
  const C = direction.components;
  const tabs = [
    { id: "tracker",    label: "Tracker"    },
    { id: "stats",      label: "Stats"      },
    { id: "collection", label: "Collection" },
    { id: "overlay",    label: "Overlay"    },
  ];

  const sidebarItems = [
    { id: "tracker",    label: "Tracker",    glyph: "▤" },
    { id: "stats",      label: "Stats",      glyph: "◫" },
    { id: "collection", label: "Collection", glyph: "▦" },
    { id: "overlay",    label: "Overlay",    glyph: "◰" },
    { id: "decks",      label: "Decks",      glyph: "▥" },
    { id: "settings",   label: "Settings",   glyph: "⚙" },
  ];

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: surfaceBg, color: "#e6edf3", fontFamily: "Inter, sans-serif" }}>
      {/* Brand bar */}
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${borderColor}`,
        display: "flex", alignItems: "center", gap: 12,
        background: surfaceBg,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 5,
          background: `linear-gradient(135deg, ${accent}, ${direction.accent2 || accent})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#0a0a12", fontWeight: 800, fontSize: 14, letterSpacing: "-0.04em",
        }}>◊</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>{brand}</div>
          <div style={{ fontSize: 9, color: "#5a5a75", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.16em", marginTop: 1 }}>
            {direction.tag.toUpperCase()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(tt => (
            <button key={tt.id} onClick={() => setTab(tt.id)} style={{
              padding: "5px 12px", borderRadius: 4,
              background: tab === tt.id ? accent : "transparent",
              color: tab === tt.id ? "#0a0a12" : "#9090ad",
              border: tab === tt.id ? `1px solid ${accent}` : `1px solid ${borderColor}`,
              fontSize: 11, fontWeight: 600, fontFamily: "Inter, sans-serif",
              cursor: "pointer", letterSpacing: "0.02em",
            }}>{tt.label}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{
          width: 60, borderRight: `1px solid ${borderColor}`,
          background: surfaceBg, padding: "12px 0",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        }}>
          {sidebarItems.map(s => {
            const active = s.id === tab || (tab === "tracker" && s.id === "tracker");
            return (
              <button key={s.id} onClick={() => { if (s.id !== "decks" && s.id !== "settings") setTab(s.id); }} style={{
                width: 44, height: 44, borderRadius: 6,
                background: active ? `${accent}22` : "transparent",
                color: active ? accent : "#5a5a75",
                border: active ? `1px solid ${accent}66` : `1px solid transparent`,
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 2, fontFamily: "Inter, sans-serif",
              }}
              title={s.label}>
                <span style={{ fontSize: 16 }}>{s.glyph}</span>
                <span style={{ fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>{s.label.slice(0,4)}</span>
              </button>
            );
          })}
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {tab === "tracker"    && <C.Tracker    density={density} drawn={drawn} />}
          {tab === "stats"      && <C.Stats      />}
          {tab === "collection" && <C.Collection />}
          {tab === "overlay"    && (
            <div style={{
              width: "100%", height: "100%", position: "relative", overflow: "hidden",
              background: `
                radial-gradient(ellipse at 30% 40%, oklch(0.25 0.10 30 / 0.5), transparent 60%),
                radial-gradient(ellipse at 70% 70%, oklch(0.2 0.08 240 / 0.4), transparent 60%),
                #0a0a0a
              `,
            }}>
              {/* Faux game-board backdrop */}
              <div style={{
                position: "absolute", inset: 0,
                backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 2px, transparent 2px 8px)",
              }} />
              <div style={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                width: "60%", height: "60%", borderRadius: "50%",
                background: "radial-gradient(circle, oklch(0.3 0.08 60 / 0.4), transparent 70%)",
                filter: "blur(20px)",
              }} />
              <div style={{ position: "absolute", top: 14, left: 14, fontSize: 10, color: "#5a5a75", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.16em" }}>
                ⛶ IN-GAME OVERLAY · WINDOW PREVIEW
              </div>
              <div style={{ position: "absolute", top: 16, right: 16 }}>
                <C.Overlay opacity={opacity} drawn={drawn} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DirectionArtboard });
