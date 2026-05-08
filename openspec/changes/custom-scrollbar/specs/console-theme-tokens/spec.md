## MODIFIED Requirements

### Requirement: Console token table is the renderer's single source of color truth

The renderer SHALL declare the Console preset's color, font, and surface tokens as CSS custom properties in `apps/desktop/src/renderer/src/styles/theme.css` `:root`. The exact token values MUST be:

```
--bg:                    #0b0f14
--bg-2:                  #11161d
--bg-3:                  #161c25
--border:                #1f2731
--border-hi:             #2a3543
--text:                  #e6edf3
--text-dim:              #8b96a3
--text-mute:             #5b6573
--accent:                #22d3ee
--accent-dim:            rgba(34,211,238,0.15)
--green:                 #34d399
--red:                   #f87171
--amber:                 #fbbf24
--scrollbar-size:        8px
--scrollbar-track:       var(--bg-2)
--scrollbar-thumb:       var(--border-hi)
--scrollbar-thumb-hover: var(--text-mute)
--scrollbar-thumb-active:var(--accent)
--font-sans:             'Inter', system-ui, -apple-system, sans-serif
--font-mono:             'JetBrains Mono', ui-monospace, SFMono-Regular, monospace
```

Existing shadcn-style light-theme variables (`--background`, `--foreground`, `--primary`, etc.) MAY remain co-resident but MUST NOT be added to or relied on by new code.

The five `--scrollbar-*` tokens are part of the Console token contract and SHALL be referenced from `styles/scrollbar.css` rather than from component-level styles.

#### Scenario: Token block exports the Console accent

- **WHEN** a smoke test reads `theme.css` as raw text
- **THEN** the file contains the substring `--accent: #22d3ee;`

#### Scenario: All required Console tokens are declared

- **WHEN** the smoke test inspects the `:root` block
- **THEN** it finds declarations for every token in the table above, including the five `--scrollbar-*` tokens.

#### Scenario: Scrollbar thumb token reuses border-hi

- **WHEN** the smoke test resolves `--scrollbar-thumb`
- **THEN** it resolves to the same value as `--border-hi` (i.e. `#2a3543`), keeping the scrollbar thumb in the same surface tier as elevated borders.
