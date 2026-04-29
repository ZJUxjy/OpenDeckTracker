// V2 Artboard — Console direction locked. Adds Decks tab, opponent overlay.

function ConsoleArtboardV2({ density, opacity, drawn, brand }) {
  const [tab, setTab] = React.useState("tracker");
  const t = window.A_TOKENS;

  const tabs = [
    { id: "tracker",    label: "Tracker"    },
    { id: "decks",      label: "Decks"      },
    { id: "stats",      label: "Stats"      },
    { id: "collection", label: "Collection" },
    { id: "overlay",    label: "Overlay"    },
    { id: "settings",   label: "Settings"   },
  ];

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: t.bg, color: t.text, fontFamily: t.sans }}>
      {/* Brand bar */}
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${t.border}`,
        display: "flex", alignItems: "center", gap: 12, background: t.bg,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 5,
          background: `linear-gradient(135deg, ${t.accent}, #0ea5e9)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#0a0a12", fontWeight: 800, fontSize: 14,
        }}>◊</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>{brand}</div>
          <div style={{ fontSize: 9, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.16em", marginTop: 1 }}>
            DIRECTION A · CONSOLE
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(tt => (
            <button key={tt.id} onClick={() => setTab(tt.id)} style={{
              padding: "5px 12px", borderRadius: 4,
              background: tab === tt.id ? t.accent : "transparent",
              color: tab === tt.id ? "#0a0a12" : t.textDim,
              border: tab === tt.id ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
              fontSize: 11, fontWeight: 600, fontFamily: t.sans,
              cursor: "pointer", letterSpacing: "0.02em",
            }}>{tt.label}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{
          width: 60, borderRight: `1px solid ${t.border}`, background: t.bg, padding: "12px 0",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        }}>
          {[
            { id: "tracker",    label: "Track", glyph: "▤" },
            { id: "decks",      label: "Decks", glyph: "▥" },
            { id: "stats",      label: "Stats", glyph: "◫" },
            { id: "collection", label: "Coll",  glyph: "▦" },
            { id: "overlay",    label: "Over",  glyph: "◰" },
            { id: "settings",   label: "Set",   glyph: "⚙" },
          ].map(s => {
            const active = s.id === tab;
            return (
              <button key={s.id} onClick={() => setTab(s.id)} style={{
                width: 44, height: 44, borderRadius: 6,
                background: active ? `${t.accent}22` : "transparent",
                color: active ? t.accent : t.textMute,
                border: active ? `1px solid ${t.accent}66` : `1px solid transparent`,
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 2,
              }}>
                <span style={{ fontSize: 16 }}>{s.glyph}</span>
                <span style={{ fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {tab === "tracker"    && <window.ConsoleTracker        density={density} drawn={drawn} />}
          {tab === "decks"      && <window.ConsoleDeckFinder     />}
          {tab === "stats"      && <window.ConsoleStats          />}
          {tab === "collection" && <window.ConsoleSetsCollection />}
          {tab === "settings"   && <window.ConsoleSettingsAppearance />}
          {tab === "overlay"    && (
            <div style={{
              width: "100%", height: "100%", position: "relative", overflow: "hidden",
              background: `
                radial-gradient(ellipse at 30% 40%, oklch(0.25 0.10 30 / 0.5), transparent 60%),
                radial-gradient(ellipse at 70% 70%, oklch(0.2 0.08 240 / 0.4), transparent 60%),
                #0a0a0a`,
            }}>
              <div style={{ position: "absolute", inset: 0,
                backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 2px, transparent 2px 8px)" }} />
              <div style={{ position: "absolute", top: 14, left: 14, fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.16em" }}>
                ⛶ IN-GAME · BOTH OVERLAYS PINNED LEFT/RIGHT
              </div>
              <div style={{ position: "absolute", top: 60, left: 16 }}>
                <window.ConsoleOverlayV2 opacity={opacity} drawn={drawn} />
              </div>
              <div style={{ position: "absolute", top: 60, right: 16 }}>
                <window.ConsoleOpponentOverlay opacity={opacity} />
              </div>
              <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, textAlign: "center", fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em" }}>
                YOUR DECK · LEFT &nbsp;·&nbsp; OPPONENT · RIGHT &nbsp;·&nbsp; BOTH DRAGGABLE & RESIZABLE
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ConsoleArtboardV2 });
