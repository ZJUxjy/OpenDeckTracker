## MODIFIED Requirements

### Requirement: Console token table is the renderer's single source of color truth

The renderer SHALL declare the Console preset's color, font, and surface tokens as CSS custom properties in `apps/desktop/src/renderer/src/styles/theme.css` `:root`. The exact token values MUST be:

```
--bg:                 #0b0f14
--bg-2:               #11161d
--bg-3:               #161c25
--border:             #1f2731
--border-hi:          #2a3543
--text:               #e6edf3
--text-dim:           #8b96a3
--text-mute:          #5b6573
--accent:             #22d3ee
--accent-dim:         rgba(34,211,238,0.15)
--green:              #34d399
--red:                #f87171
--amber:              #fbbf24
--rarity-free:        #5b6573
--rarity-common:      #cdd5e0
--rarity-rare:        #3b82f6
--rarity-epic:        #a855f7
--rarity-legendary:   #f59e0b
--font-sans:          'Inter', system-ui, -apple-system, sans-serif
--font-mono:          'JetBrains Mono', ui-monospace, SFMono-Regular, monospace
```

Existing shadcn-style light-theme variables (`--background`, `--foreground`, `--primary`, etc.) MAY remain co-resident but MUST NOT be added to or relied on by new code.

#### Scenario: Token block exports the Console accent

- **WHEN** a smoke test reads `theme.css` as raw text
- **THEN** the file contains the substring `--accent: #22d3ee;`

#### Scenario: All required Console tokens are declared

- **WHEN** the smoke test inspects the `:root` block
- **THEN** it finds declarations for every token in the table above

#### Scenario: Rarity tokens are declared

- **WHEN** the smoke test reads `theme.css` as raw text
- **THEN** the file contains declarations for `--rarity-free`, `--rarity-common`, `--rarity-rare`, `--rarity-epic`, and `--rarity-legendary` with the values listed above

### Requirement: Tokens are exposed as Tailwind utility classes

The renderer SHALL expose the Console tokens as Tailwind v4 utility classes via the `@theme` directive in `apps/desktop/src/renderer/src/styles/tailwind.css`. The mapping MUST include at minimum:

| Token | Utility class |
|---|---|
| `--bg` | `bg-bg`, `border-bg` |
| `--bg-2` | `bg-bg-2` |
| `--bg-3` | `bg-bg-3` |
| `--border` | `border-border` |
| `--border-hi` | `border-border-hi` |
| `--text` | `text-text` |
| `--text-dim` | `text-text-dim` |
| `--text-mute` | `text-text-mute` |
| `--accent` | `text-accent`, `bg-accent`, `border-accent` |
| `--accent-dim` | `bg-accent-dim` |
| `--green` | `text-green`, `bg-green` |
| `--red` | `text-red`, `bg-red` |
| `--amber` | `text-amber`, `bg-amber` |
| `--rarity-free` | `text-rarity-free`, `bg-rarity-free`, `border-rarity-free` |
| `--rarity-common` | `text-rarity-common`, `bg-rarity-common`, `border-rarity-common` |
| `--rarity-rare` | `text-rarity-rare`, `bg-rarity-rare`, `border-rarity-rare` |
| `--rarity-epic` | `text-rarity-epic`, `bg-rarity-epic`, `border-rarity-epic` |
| `--rarity-legendary` | `text-rarity-legendary`, `bg-rarity-legendary`, `border-rarity-legendary` |
| `--font-sans` | `font-sans` |
| `--font-mono` | `font-mono` |

#### Scenario: Components compile with token utilities

- **WHEN** a component uses `<div className="bg-bg-2 text-accent border-border">…</div>`
- **THEN** the Vite build resolves the utilities to CSS that references the corresponding `var(--bg-2)`, `var(--accent)`, `var(--border)`

#### Scenario: Rarity utilities resolve to rarity tokens

- **WHEN** a component uses `<div className="bg-rarity-legendary text-rarity-rare">…</div>`
- **THEN** the Vite build resolves the utilities to CSS that references `var(--rarity-legendary)` and `var(--rarity-rare)`
