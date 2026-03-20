# Themeable FishGlobe — Design Spec

## Goal

Refactor the FishGlobe site to match the desktop mockup, use reusable CSS classes with semantic IDs, and support build-time + runtime theme switching.

## Reference

- Mockup: `/Users/mingyouxia/Downloads/openglobes_fish_desktop_mockup.html`
- Design system: `../openglobes-core/docs/DESIGN_SYSTEM.md`

---

## Theme Architecture

### Three layers

1. **CSS tokens** (`src/styles/tokens.css`) — all visual values as custom properties. A theme override = a `[data-theme="X"]` block that reassigns token values.
2. **GlobeTheme object** (`src/themes/*.ts`) — data-driven config passed to `@openglobes/core` components: point colors, sizes, filters, detail fields, attribution.
3. **Theme registry** (`src/themes/index.ts`) — array of `{ id, label, tokens, globeTheme }`. Runtime toggle reads this. Adding a theme = new file + register.

### Theme switching

- **Build-time**: add a new theme file (e.g. `src/themes/volcano.ts`), add CSS overrides in tokens.css under `[data-theme="volcano"]`, register in index.ts.
- **Runtime**: `ThemeToggle` component sets `document.documentElement.dataset.theme` and swaps the `GlobeTheme` object via React context. Persists choice to `localStorage`.

### Adding a new theme (developer steps)

1. Create `src/themes/{name}.ts` exporting a `GlobeTheme` object
2. Add `[data-theme="{name}"]` block in `tokens.css` with color overrides
3. Add entry to `THEMES` array in `src/themes/index.ts`
4. Theme appears in the UI toggle automatically

---

## CSS Class System

All components use `og-*` prefixed classes. Zero hardcoded colors in components — everything references CSS custom properties.

### Base classes (in tokens.css)

| Class | Purpose |
|---|---|
| `.og-glass` | Glass panel: bg, blur, border, shadow, radius, hover transition |
| `.og-glass-heavy` | Glass with heavier blur (40px) — for search bar |
| `.og-glass-inset` | Inner surface: subtle bg, border, radius — for metadata cards, chips |
| `.og-chip` | Filter chip button: inset bg, border, text |
| `.og-chip--active` | Active chip: accent bg/border/text |
| `.og-section-label` | Uppercase, xs, tracking-wide, tertiary — filter section headers |
| `.og-mono-value` | JetBrains Mono, base size, primary text — data values |
| `.og-mono-sm` | JetBrains Mono, small, secondary — scientific names, counts |
| `.og-rarity-badge` | Pill with rarity color bg/border/text |
| `.og-link-button` | Glass-inset external link with arrow icon |
| `.og-zoom-btn` | 40×40 glass button for zoom controls |

### Component IDs

| Component | `id` | Purpose |
|---|---|---|
| Search bar | `og-search` | Top-center search input |
| Filter panel | `og-filters` | Left sidebar filters |
| Detail drawer | `og-detail` | Right sidebar species detail |
| Zoom controls | `og-zoom` | Bottom-right +/− buttons |
| Attribution | `og-attribution` | Bottom-center data credits |
| Theme toggle | `og-theme-toggle` | Top-right theme switcher |

---

## Component Specifications (matching mockup)

### SearchBar (`src/components/SearchBar.tsx`)
- Position: top center, 300px desktop, full-width-32px mobile
- `.og-glass-heavy` background
- Left: magnifying glass SVG icon (tertiary color)
- Input: transparent bg, primary text, tertiary placeholder
- Placeholder: "Search {totalSpecies} species..."
- Focus: accent border glow
- Functionality: placeholder for now (search.json not yet available)

### FilterPanel (updated `src/components/FishGlobe.tsx` sidebar)
- Position: top-left, offset 60px from top, 16px from left, 240px wide
- Header row: "FILTERS" label (section-label) + count (mono-sm, accent)
- Water Type section: `.og-chip` / `.og-chip--active` buttons, flex-wrap
- Depth Range: custom styled slider (accent track + thumb with glow)
- Rarity: vertical list with colored dots + labels (NOT chips — matches mockup)

### FishDetail (`src/components/FishDetail.tsx`)
- Position: top-right, offset 60px from top, 16px from right, 280px wide
- Header: species name (Outfit 22px medium) + rarity badge pill (top-right)
- Subheader: scientific name (mono 12px, secondary), Chinese name + family below
- Image area: 100% width, 120px height, dark gradient bg, centered fish emoji placeholder
- Metadata: 2×2 grid of `.og-glass-inset` cards, each with:
  - Label: 10px uppercase tracking-wide tertiary
  - Value: JetBrains Mono 14px primary
- Links: flex row of `.og-link-button` with arrow SVG icon
- Entry animation: slideInRight 400ms

### ZoomControls (`src/components/ZoomControls.tsx`)
- Position: bottom-right, 16px from edges
- Two `.og-zoom-btn` stacked vertically, 2px gap
- Top button: + icon (rounded top corners)
- Bottom button: − icon (rounded bottom corners)
- SVG icons: 18px, 1.5px stroke, secondary color

### Attribution (inline in FishGlobe)
- Position: bottom-center
- Minimal: clock SVG + "Data: FishBase (CC-BY-NC) + GBIF"
- Text: 10px tertiary at 0.35 opacity

### ThemeToggle (`src/components/ThemeToggle.tsx`)
- Position: top-right, 16px from edges
- Small `.og-glass` button with palette/paint icon
- Click: cycles through registered themes (or dropdown if >2)
- Sets `data-theme` on `<html>` + swaps GlobeTheme via context
- Persists to localStorage

---

## File Structure

```
src/
  styles/
    tokens.css          ← design system tokens + og-* classes + theme overrides
    global.css          ← @import tailwind + tokens.css, html/body reset
  themes/
    fish.ts             ← GlobeTheme for fish dataset
    index.ts            ← theme registry + ThemeContext
  components/
    FishGlobe.tsx       ← main layout: globe + all panels
    FishDetail.tsx      ← species detail drawer
    SearchBar.tsx       ← search input (placeholder)
    ZoomControls.tsx    ← +/− zoom buttons
    ThemeToggle.tsx     ← runtime theme switcher
  pages/
    index.astro         ← entry point
```

---

## Non-goals (for this iteration)

- Actual search functionality (no search.json yet)
- Mobile bottom sheet drag behavior
- Point click raycasting (core stub)
- Additional globe themes beyond fish (architecture supports it, but only fish is implemented)
