// Settings → Appearance — mock-first UX design for theme/preset switching.
// This is a DESIGN spec rendered as a working screen. No theme system plumbed yet.

const PRESETS = [
  {
    id: "console",
    name: "Console",
    tagline: "Terminal-tight · monospace metadata",
    family: "Pro",
    accent: "oklch(0.78 0.16 200)",
    bg: "#0b0f14",
    bg2: "#11161e",
    border: "#1f2731",
    text: "#e6edf3",
    font: "Inter + JetBrains Mono",
    rowAnatomy: "compact",
    countStyle: "pip",
    chrome: "sharp",
    isDefault: true,
  },
  {
    id: "slate",
    name: "Slate",
    tagline: "Calm · neutral · modern",
    family: "Pro",
    accent: "oklch(0.7 0.14 270)",
    bg: "#13151a",
    bg2: "#1c1f27",
    border: "#2a2f3a",
    text: "#e8e8ee",
    font: "Inter only",
    rowAnatomy: "comfortable",
    countStyle: "pip",
    chrome: "round",
  },
  {
    id: "hearth",
    name: "Hearth",
    tagline: "Warm · ornamental · card-forward",
    family: "Themed",
    accent: "oklch(0.78 0.18 50)",
    bg: "#1a120c",
    bg2: "#241813",
    border: "#3b2618",
    text: "#f4ead8",
    font: "Spectral + Inter",
    rowAnatomy: "card",
    countStyle: "numeric",
    chrome: "ornamental",
  },
  {
    id: "frost",
    name: "Frost",
    tagline: "Cool · airy · light theme",
    family: "Themed",
    accent: "oklch(0.6 0.16 230)",
    bg: "#f4f6fa",
    bg2: "#ffffff",
    border: "#dde3ec",
    text: "#0e1420",
    font: "Inter only",
    rowAnatomy: "comfortable",
    countStyle: "pip",
    chrome: "round",
    light: true,
  },
  {
    id: "minimal",
    name: "Minimal",
    tagline: "No chrome · highest contrast · OBS-safe",
    family: "Specialist",
    accent: "#ffffff",
    bg: "#000000",
    bg2: "#0a0a0a",
    border: "#222",
    text: "#ffffff",
    font: "Inter only",
    rowAnatomy: "compact",
    countStyle: "numeric",
    chrome: "none",
  },
  {
    id: "arcade",
    name: "Arcade",
    tagline: "Pixel · CRT scanlines · streamer-friendly",
    family: "Specialist",
    accent: "#ff5fa2",
    bg: "#0c0420",
    bg2: "#15082a",
    border: "#2a1547",
    text: "#f0e8ff",
    font: "VT323 + Inter",
    rowAnatomy: "compact",
    countStyle: "pip",
    chrome: "pixel",
  },
];

// ===== Mini preview tile shown inside each preset card =====
function PresetPreview({ preset }) {
  const p = preset;
  const stripe = `repeating-linear-gradient(45deg, transparent 0 4px, oklch(1 0 0 / 0.03) 4px 5px)`;
  const headerBg = p.light ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)";
  return (
    <div style={{
      width: "100%", height: 120, borderRadius: 6, overflow: "hidden",
      background: p.bg, border: `1px solid ${p.border}`,
      display: "flex", flexDirection: "column", position: "relative",
    }}>
      {p.id === "arcade" && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
          background: "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.25) 2px 3px)" }} />
      )}
      {/* Mini overlay */}
      <div style={{
        margin: "10px auto 0", width: 130, background: p.bg2,
        border: `1px solid ${p.border}`, borderRadius: p.chrome === "sharp" ? 2 : p.chrome === "ornamental" ? 4 : p.chrome === "pixel" ? 0 : 5,
        padding: "5px 6px", color: p.text, position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.accent }} />
          <div style={{ height: 4, flex: 1, background: p.text, opacity: 0.5, borderRadius: 1 }} />
          <div style={{ fontSize: 7, color: p.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>21</div>
        </div>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 3,
            height: p.rowAnatomy === "card" ? 11 : p.rowAnatomy === "comfortable" ? 9 : 7,
            opacity: i === 3 ? 0.4 : 1,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: `oklch(0.5 0.12 ${i * 60})` }} />
            <div style={{ flex: 1, height: 2, background: p.text, opacity: 0.4, borderRadius: 1 }} />
            {p.countStyle === "pip" ? (
              <div style={{ display: "flex", gap: 1.5 }}>
                <div style={{ width: 3, height: 3, borderRadius: 2, background: i === 3 ? "transparent" : p.accent, border: `1px solid ${p.accent}` }} />
                <div style={{ width: 3, height: 3, borderRadius: 2, background: i === 3 ? "transparent" : p.accent, border: `1px solid ${p.accent}` }} />
              </div>
            ) : (
              <div style={{ fontSize: 7, color: p.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>×{i === 3 ? 0 : 2}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsoleSettingsAppearance() {
  const t = window.A_TOKENS;
  const [active, setActive] = React.useState("console");
  const [appTheme, setAppTheme] = React.useState("console");
  const [overlayTheme, setOverlayTheme] = React.useState("console");
  const [linkScopes, setLinkScopes] = React.useState(true);
  const [accent, setAccent] = React.useState("preset");
  const [density, setDensity] = React.useState("medium");
  const [autoMatchClass, setAutoMatchClass] = React.useState(true);
  const [obsMode, setObsMode] = React.useState(false);

  const families = ["Pro", "Themed", "Specialist"];
  const sel = PRESETS.find(p => p.id === active);

  const apply = (id) => {
    if (linkScopes) {
      setAppTheme(id);
      setOverlayTheme(id);
    } else {
      setAppTheme(id);
    }
  };

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.sans, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "baseline", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>SETTINGS / APPEARANCE</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em" }}>UI Style</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: t.mono, fontSize: 11, color: t.textDim }}>
          Active app: <span style={{ color: t.accent, fontWeight: 600 }}>{PRESETS.find(p => p.id === appTheme).name}</span>
          <span style={{ margin: "0 8px", color: t.textMute }}>·</span>
          Active overlay: <span style={{ color: t.accent, fontWeight: 600 }}>{PRESETS.find(p => p.id === overlayTheme).name}</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", overflow: "hidden" }}>
        {/* Left — preset grid */}
        <div style={{ overflow: "auto", padding: "16px 20px 24px" }}>
          {families.map(fam => (
            <div key={fam} style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: t.textDim }}>{fam.toUpperCase()}</span>
                <div style={{ flex: 1, height: 1, background: t.border }} />
                <span>{PRESETS.filter(p => p.family === fam).length}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {PRESETS.filter(p => p.family === fam).map(p => {
                  const isApp = appTheme === p.id;
                  const isOv = overlayTheme === p.id;
                  const isHover = active === p.id;
                  return (
                    <button key={p.id} onClick={() => setActive(p.id)} onDoubleClick={() => apply(p.id)} style={{
                      textAlign: "left", border: `1px solid ${isHover ? t.accent : t.border}`,
                      background: t.bg2, borderRadius: 5, cursor: "pointer", padding: 0,
                      transition: "border-color 120ms, transform 120ms",
                      transform: isHover ? "translateY(-1px)" : "none",
                      color: t.text, fontFamily: t.sans, position: "relative",
                    }}>
                      <PresetPreview preset={p} />
                      <div style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}>{p.name}</div>
                          {p.isDefault && <div style={{ fontSize: 8, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.12em" }}>DEFAULT</div>}
                          <div style={{ flex: 1 }} />
                          {(isApp || isOv) && (
                            <div style={{ display: "flex", gap: 3, fontFamily: t.mono, fontSize: 8, letterSpacing: "0.1em" }}>
                              {isApp && <span style={{ color: t.accent, padding: "2px 5px", border: `1px solid ${t.accent}`, borderRadius: 2 }}>APP</span>}
                              {isOv && <span style={{ color: "#fbbf24", padding: "2px 5px", border: `1px solid #fbbf24`, borderRadius: 2 }}>OVL</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: t.textMute, marginTop: 3, lineHeight: 1.4 }}>{p.tagline}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Custom theme card */}
          <div style={{ padding: "14px 16px", border: `1px dashed ${t.border}`, borderRadius: 5, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 22, color: t.textMute }}>+</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Create custom theme</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2 }}>Fork the active preset and override tokens. Themes export as a single file you can share.</div>
            </div>
            <button style={{
              padding: "7px 14px", borderRadius: 3, background: t.accentDim,
              color: t.accent, border: `1px solid ${t.accent}`, fontFamily: t.mono, fontSize: 10,
              letterSpacing: "0.12em", fontWeight: 700, cursor: "pointer",
            }}>FORK ACTIVE</button>
          </div>
        </div>

        {/* Right — detail / scope / overrides */}
        <div style={{ borderLeft: `1px solid ${t.border}`, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {/* Big preview */}
          <div style={{ padding: "14px 16px 8px" }}>
            <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", marginBottom: 8 }}>PREVIEW</div>
            <div style={{
              borderRadius: 6, overflow: "hidden", border: `1px solid ${sel.border}`,
              background: sel.bg, height: 180, padding: 12, position: "relative",
            }}>
              {sel.id === "arcade" && (
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
                  background: "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.25) 2px 3px)" }} />
              )}
              <div style={{
                width: 200, background: sel.bg2, border: `1px solid ${sel.border}`,
                borderRadius: sel.chrome === "sharp" ? 3 : sel.chrome === "pixel" ? 0 : 5,
                padding: "8px 10px", color: sel.text,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6, borderBottom: `1px solid ${sel.border}`, marginBottom: 6 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: sel.accent }} />
                  <div style={{ flex: 1, fontSize: 10, fontWeight: 600 }}>Aggro Ember</div>
                  <div style={{ fontSize: 11, color: sel.accent, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>21</div>
                </div>
                {["Brittle Rune", "Cinder Lash", "Pyre Spark", "Hex Reaver"].map((n, i) => (
                  <div key={n} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    height: sel.rowAnatomy === "card" ? 18 : sel.rowAnatomy === "comfortable" ? 16 : 14,
                    fontSize: 9, opacity: i === 3 ? 0.4 : 1,
                  }}>
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: `oklch(0.45 0.16 ${i*70} / 0.9)`, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700 }}>{i+1}</div>
                    <div style={{ flex: 1, textDecoration: i === 3 ? "line-through" : "none" }}>{n}</div>
                    {sel.countStyle === "pip" ? (
                      <div style={{ display: "flex", gap: 2 }}>
                        <div style={{ width: 4, height: 4, borderRadius: 2, background: i === 3 ? "transparent" : sel.accent, border: `1px solid ${sel.accent}` }} />
                        <div style={{ width: 4, height: 4, borderRadius: 2, background: i === 3 ? "transparent" : sel.accent, border: `1px solid ${sel.accent}` }} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: sel.accent, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>×{i === 3 ? 0 : 2}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{sel.name}</div>
              <div style={{ fontSize: 11, color: t.textDim, marginTop: 2, lineHeight: 1.45 }}>{sel.tagline}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10, fontFamily: t.mono, fontSize: 10 }}>
              {[
                ["FONTS", sel.font],
                ["DENSITY", sel.rowAnatomy],
                ["COUNTS", sel.countStyle],
                ["CHROME", sel.chrome],
              ].map(([k, v]) => (
                <div key={k} style={{ background: t.bg2, border: `1px solid ${t.border}`, borderRadius: 3, padding: "6px 8px" }}>
                  <div style={{ fontSize: 8, color: t.textMute, letterSpacing: "0.14em" }}>{k}</div>
                  <div style={{ color: t.text, marginTop: 2, textTransform: "capitalize" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Apply scope */}
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>APPLY TO</div>
              <div style={{ flex: 1, height: 1, background: t.border }} />
              <button onClick={() => setLinkScopes(!linkScopes)} style={{
                fontSize: 9, color: linkScopes ? t.accent : t.textMute, fontFamily: t.mono, letterSpacing: "0.1em",
                background: "transparent", border: "none", cursor: "pointer", fontWeight: 600,
              }}>{linkScopes ? "🔗 LINKED" : "⚭ SEPARATE"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button onClick={() => { setAppTheme(sel.id); if (linkScopes) setOverlayTheme(sel.id); }} style={{
                padding: "10px 12px", borderRadius: 4, cursor: "pointer", textAlign: "left",
                background: appTheme === sel.id ? t.accentDim : t.bg2,
                border: `1px solid ${appTheme === sel.id ? t.accent : t.border}`,
                color: appTheme === sel.id ? t.accent : t.text, fontFamily: t.sans,
              }}>
                <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>DESKTOP APP</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>Use {sel.name} →</div>
              </button>
              <button onClick={() => { setOverlayTheme(sel.id); if (linkScopes) setAppTheme(sel.id); }} style={{
                padding: "10px 12px", borderRadius: 4, cursor: "pointer", textAlign: "left",
                background: overlayTheme === sel.id ? "rgba(251,191,36,0.12)" : t.bg2,
                border: `1px solid ${overlayTheme === sel.id ? "#fbbf24" : t.border}`,
                color: overlayTheme === sel.id ? "#fbbf24" : t.text, fontFamily: t.sans,
              }}>
                <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em" }}>IN-GAME OVERLAY</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>Use {sel.name} →</div>
              </button>
            </div>
            <div style={{ fontSize: 10, color: t.textMute, marginTop: 8, lineHeight: 1.45 }}>
              Tip: keep overlay on <span style={{ color: t.text }}>Minimal</span> for max in-game legibility while running a flashier theme on the desktop app.
            </div>
          </div>

          {/* Overrides */}
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 10, color: t.textMute, fontFamily: t.mono, letterSpacing: "0.14em", marginBottom: 8 }}>OVERRIDES</div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
                <span>Accent color</span>
                <span style={{ color: t.textMute, fontFamily: t.mono, fontSize: 9 }}>{accent === "preset" ? "from preset" : accent === "class" ? "match class" : "custom"}</span>
              </div>
              <div style={{ display: "flex", gap: 4, fontFamily: t.mono, fontSize: 9 }}>
                {[["preset","PRESET"],["class","MATCH CLASS"],["custom","CUSTOM"]].map(([k,l]) => (
                  <button key={k} onClick={() => setAccent(k)} style={{
                    flex: 1, padding: "5px 8px", borderRadius: 3, cursor: "pointer",
                    background: accent === k ? t.accentDim : t.bg2,
                    color: accent === k ? t.accent : t.textDim,
                    border: `1px solid ${accent === k ? t.accent : t.border}`,
                    letterSpacing: "0.1em", fontWeight: 700,
                  }}>{l}</button>
                ))}
              </div>
              {accent === "custom" && (
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {["#22d3ee","#fbbf24","#f87171","#a78bfa","#34d399","#f472b6"].map(c => (
                    <button key={c} style={{ flex: 1, height: 22, borderRadius: 3, background: c, border: `1px solid ${t.border}`, cursor: "pointer" }} />
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
                <span>Density</span>
                <span style={{ color: t.textMute, fontFamily: t.mono, fontSize: 9 }}>{density}</span>
              </div>
              <div style={{ display: "flex", gap: 4, fontFamily: t.mono, fontSize: 9 }}>
                {["tight","medium","loose"].map(d => (
                  <button key={d} onClick={() => setDensity(d)} style={{
                    flex: 1, padding: "5px 8px", borderRadius: 3, cursor: "pointer",
                    background: density === d ? t.accentDim : t.bg2,
                    color: density === d ? t.accent : t.textDim,
                    border: `1px solid ${density === d ? t.accent : t.border}`,
                    letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase",
                  }}>{d}</button>
                ))}
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
              <div style={{
                width: 28, height: 16, borderRadius: 8, background: autoMatchClass ? t.accent : t.bg3,
                position: "relative", transition: "background 120ms",
              }}
              onClick={() => setAutoMatchClass(!autoMatchClass)}
              >
                <div style={{
                  position: "absolute", top: 2, left: autoMatchClass ? 14 : 2,
                  width: 12, height: 12, borderRadius: 6, background: "#fff", transition: "left 120ms",
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11 }}>Tint opponent overlay by their class</div>
                <div style={{ fontSize: 9, color: t.textMute, marginTop: 1 }}>Hollow → violet, Ember → red, etc.</div>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
              <div style={{
                width: 28, height: 16, borderRadius: 8, background: obsMode ? t.accent : t.bg3,
                position: "relative", transition: "background 120ms",
              }}
              onClick={() => setObsMode(!obsMode)}
              >
                <div style={{
                  position: "absolute", top: 2, left: obsMode ? 14 : 2,
                  width: 12, height: 12, borderRadius: 6, background: "#fff", transition: "left 120ms",
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11 }}>OBS / streaming mode</div>
                <div style={{ fontSize: 9, color: t.textMute, marginTop: 1 }}>Solid backgrounds, no blur, chroma-key magenta available.</div>
              </div>
            </label>
          </div>

          {/* Footer */}
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${t.border}`, marginTop: "auto", display: "flex", gap: 8 }}>
            <button style={{
              flex: 1, padding: "8px 12px", borderRadius: 3, background: "transparent",
              color: t.textDim, border: `1px solid ${t.border}`, fontFamily: t.mono, fontSize: 10,
              letterSpacing: "0.12em", fontWeight: 600, cursor: "pointer",
            }}>RESET</button>
            <button style={{
              flex: 1, padding: "8px 12px", borderRadius: 3, background: "transparent",
              color: t.textDim, border: `1px solid ${t.border}`, fontFamily: t.mono, fontSize: 10,
              letterSpacing: "0.12em", fontWeight: 600, cursor: "pointer",
            }}>EXPORT</button>
            <button style={{
              flex: 2, padding: "8px 12px", borderRadius: 3, background: t.accent,
              color: "#0a0f14", border: "none", fontFamily: t.mono, fontSize: 10,
              letterSpacing: "0.14em", fontWeight: 700, cursor: "pointer",
            }}>APPLY {sel.name.toUpperCase()} →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ConsoleSettingsAppearance, PRESETS });
