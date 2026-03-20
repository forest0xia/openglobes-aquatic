# Themeable FishGlobe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor FishGlobe to match the desktop mockup, use semantic og-* CSS classes, support build-time + runtime theme switching.

**Architecture:** All visual styling flows through CSS custom properties in `tokens.css`. Components use `og-*` classes and never hardcode colors. Theme switching sets `data-theme` on `<html>` and swaps the `GlobeTheme` object via React context. A theme registry makes adding new themes a 3-file change.

**Tech Stack:** Astro 5, React 19, @openglobes/core, Tailwind 4, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-19-themeable-globe-design.md`
**Mockup:** `/Users/mingyouxia/Downloads/openglobes_fish_desktop_mockup.html`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Rewrite | `src/styles/tokens.css` | All design tokens + og-* utility classes + data-theme overrides |
| Rewrite | `src/styles/global.css` | Slim: import tailwind + tokens, html/body reset only |
| Create | `src/themes/fish.ts` | GlobeTheme object for fish (moved from src/theme.ts) |
| Create | `src/themes/index.ts` | Theme registry + ThemeProvider context |
| Delete | `src/theme.ts` | Replaced by src/themes/fish.ts |
| Create | `src/components/SearchBar.tsx` | Top-center search input (placeholder UI) |
| Create | `src/components/ZoomControls.tsx` | Bottom-right +/− buttons |
| Create | `src/components/ThemeToggle.tsx` | Runtime theme switcher |
| Rewrite | `src/components/FishGlobe.tsx` | Main layout matching mockup, uses theme context |
| Rewrite | `src/components/FishDetail.tsx` | Detail drawer matching mockup layout |
| Modify | `src/pages/index.astro` | Wrap in ThemeProvider |
| Modify | `README.md` | Add theming section |
| Update | `.agent-state/fish-globe.md` | Session state |

---

### Task 1: CSS Tokens & Utility Classes

**Files:**
- Rewrite: `src/styles/tokens.css`
- Rewrite: `src/styles/global.css`

- [ ] **Step 1: Write `tokens.css`** with all design system tokens as CSS custom properties under `:root`, plus every `og-*` class used by components. Include `[data-theme="fish"]` as a no-op (default), and a sample `[data-theme="midnight"]` override block to prove the architecture works. Classes to define:
  - `.og-glass` — panel background with blur, border, shadow, radius
  - `.og-glass-heavy` — heavier blur (40px) for search bar
  - `.og-glass-inset` — inner surface bg, border, radius, padding
  - `.og-chip` — filter chip: glass-inset bg, border, text, 32px height
  - `.og-chip--active` — active chip: accent bg/border/text
  - `.og-section-label` — uppercase 11px tracking-wide tertiary, mb-8px
  - `.og-mono-value` — JetBrains Mono 14px primary
  - `.og-mono-sm` — JetBrains Mono 12px secondary
  - `.og-rarity-badge` — pill shape, font settings
  - `.og-link-button` — glass-inset, centered text, accent color, flex with gap
  - `.og-zoom-btn` — 40×40 glass, centered content
  - `.og-drag-handle` — centered pill, 40×4px, tertiary bg
  - Animations: slideInLeft, slideInRight, slideInUp, globeFadeIn, pointPulse

- [ ] **Step 2: Slim down `global.css`** to just: `@import "tailwindcss"; @import "./tokens.css";` plus the html/body reset. Remove all current class definitions (moved to tokens.css).

- [ ] **Step 3: Verify** — run `pnpm dev`, open browser, confirm page still renders (globe + panels visible, no CSS errors in console).

- [ ] **Step 4: Commit**
```bash
git add src/styles/tokens.css src/styles/global.css
git commit -m "refactor: extract design tokens and og-* classes into tokens.css"
```

---

### Task 2: Theme Registry & Context

**Files:**
- Create: `src/themes/fish.ts`
- Create: `src/themes/index.ts`
- Delete: `src/theme.ts`

- [ ] **Step 1: Create `src/themes/fish.ts`** — move the `fishTheme` GlobeTheme object from `src/theme.ts` with no changes to its values. Export as `fishTheme`.

- [ ] **Step 2: Create `src/themes/index.ts`** with:
  - `ThemeEntry` type: `{ id: string; label: string; globeTheme: GlobeTheme }`
  - `THEMES` array with fish entry
  - `ThemeContext` (React context) providing `{ theme: ThemeEntry; setThemeId: (id: string) => void }`
  - `ThemeProvider` component that:
    - Reads initial theme from `localStorage.getItem('og-theme')` or defaults to `'fish'`
    - Sets `document.documentElement.dataset.theme = id` on change
    - Persists to localStorage
    - Provides context value

- [ ] **Step 3: Delete `src/theme.ts`**

- [ ] **Step 4: Update imports** — in `FishGlobe.tsx`, change `import { fishTheme } from '../theme'` to `import { useContext } from 'react'` + `import { ThemeContext } from '../themes'`. Use `const { theme } = useContext(ThemeContext)` and replace `fishTheme` with `theme.globeTheme`. Similarly in `FishDetail.tsx`, remove the `fishTheme` import (it no longer needs it — uses CSS classes only).

- [ ] **Step 5: Update `index.astro`** — wrap `<FishGlobe />` in `<ThemeProvider>`.

- [ ] **Step 6: Verify** — run `pnpm dev`, confirm globe renders with fish theme, no import errors.

- [ ] **Step 7: Commit**
```bash
git add src/themes/ src/pages/index.astro src/components/FishGlobe.tsx src/components/FishDetail.tsx
git rm src/theme.ts
git commit -m "feat: add theme registry with context provider and fish theme"
```

---

### Task 3: SearchBar Component

**Files:**
- Create: `src/components/SearchBar.tsx`

- [ ] **Step 1: Create `SearchBar.tsx`** matching mockup exactly:
  - `id="og-search"`, positioned top-center
  - `.og-glass-heavy` background
  - Left magnifying glass SVG (16px, tertiary stroke)
  - Input: transparent bg, `og-text` color, tertiary placeholder "Search 4,677 species..."
  - `totalSpecies` prop for placeholder count
  - Desktop: 300px, mobile: calc(100% - 32px)
  - Focus state: accent border glow via CSS
  - Non-functional input for now (just UI)

- [ ] **Step 2: Commit**
```bash
git add src/components/SearchBar.tsx
git commit -m "feat: add SearchBar placeholder component"
```

---

### Task 4: ZoomControls Component

**Files:**
- Create: `src/components/ZoomControls.tsx`

- [ ] **Step 1: Create `ZoomControls.tsx`** matching mockup:
  - `id="og-zoom"`, positioned bottom-right 16px
  - Two `.og-zoom-btn` stacked vertically with 2px gap
  - Top button: + SVG (rounded top corners: 10px 10px 4px 4px)
  - Bottom button: − SVG (rounded bottom corners: 4px 4px 10px 10px)
  - SVG icons: 18px, 1.5px stroke, secondary color
  - `onZoomIn` / `onZoomOut` callback props (wired later)

- [ ] **Step 2: Commit**
```bash
git add src/components/ZoomControls.tsx
git commit -m "feat: add ZoomControls component"
```

---

### Task 5: ThemeToggle Component

**Files:**
- Create: `src/components/ThemeToggle.tsx`

- [ ] **Step 1: Create `ThemeToggle.tsx`**:
  - `id="og-theme-toggle"`, positioned top-right 16px
  - Small `.og-glass` button with palette SVG icon
  - Uses `ThemeContext` to cycle through `THEMES` on click
  - Shows current theme label as tooltip or small text
  - If only 1 theme registered, component renders nothing

- [ ] **Step 2: Commit**
```bash
git add src/components/ThemeToggle.tsx
git commit -m "feat: add ThemeToggle runtime switcher"
```

---

### Task 6: Rewrite FishDetail (match mockup)

**Files:**
- Rewrite: `src/components/FishDetail.tsx`

- [ ] **Step 1: Rewrite `FishDetail.tsx`** to match mockup layout precisely:
  - `id="og-detail"`, `.og-glass`, desktop: top-right 60px from top, 16px from right, 280px wide
  - Header row: species name (Outfit 22px) on left + `.og-rarity-badge` on right (NOT below)
  - Scientific name: `.og-mono-sm`, secondary, margin-top 2px
  - Chinese name + family: body 12px, secondary, margin-bottom 12px
  - Image placeholder: 100% width, 120px height, dark gradient bg, centered fish emoji at 15% opacity
  - 2×2 metadata grid: each cell is its own `.og-glass-inset` card with label (`.og-section-label` at 10px) over value (`.og-mono-value`)
  - Links row: `.og-link-button` with arrow SVG icon
  - No close × button visible — panel slides away when another point is selected or globe clicked
  - Animation: slideInRight on mount
  - Mobile: bottom sheet with `.og-drag-handle`
  - All colors via CSS custom properties, zero hardcoded values
  - Rarity badge colors via CSS vars `--color-rarity-*`

- [ ] **Step 2: Verify** — check that detail drawer renders correctly with existing data

- [ ] **Step 3: Commit**
```bash
git add src/components/FishDetail.tsx
git commit -m "refactor: rewrite FishDetail to match mockup with og-* classes"
```

---

### Task 7: Rewrite FishGlobe (match mockup layout)

**Files:**
- Rewrite: `src/components/FishGlobe.tsx`

- [ ] **Step 1: Rewrite `FishGlobe.tsx`** to match mockup layout:
  - Root: `id="og-app"`, full viewport, background via CSS var
  - Globe: unchanged rendering logic, keep camera throttle fix
  - Use `ThemeContext` for theme — `const { theme } = useContext(ThemeContext)`
  - Compose new components: `<SearchBar>`, `<ZoomControls>`, `<ThemeToggle>`
  - Filter panel (`id="og-filters"`):
    - Desktop: 240px wide, 60px from top, 16px from left (matching mockup)
    - Header row: "FILTERS" `.og-section-label` + species count `.og-mono-sm` in accent color, on same line
    - Use `<FilterPanel>` from core for water type and depth sections
    - Rarity section: vertical list with colored dots (8px circles with CSS var colors) + labels, NOT chip buttons
    - Mobile: bottom sheet with `.og-drag-handle`
  - Attribution (`id="og-attribution"`): bottom-center, minimal — clock SVG + "Data: FishBase (CC-BY-NC) + GBIF", 10px tertiary
  - Loading indicator: small glass pill, top-right, mono text
  - Remove inline style objects — use CSS classes everywhere

- [ ] **Step 2: Verify** — run `pnpm dev`, visually compare with mockup

- [ ] **Step 3: Commit**
```bash
git add src/components/FishGlobe.tsx
git commit -m "refactor: rewrite FishGlobe layout to match mockup"
```

---

### Task 8: Update README with Theming Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add "Theming" section** to README after "Production" section:

```markdown
## Theming

The site supports build-time + runtime theme switching. All visual styling flows
through CSS custom properties — components never hardcode colors.

### Switching themes at runtime

A theme toggle appears in the top-right corner. Selection persists to localStorage.

### Adding a new theme

1. Create `src/themes/{name}.ts` — export a `GlobeTheme` object
2. Add `[data-theme="{name}"]` overrides in `src/styles/tokens.css`
3. Register in `src/themes/index.ts` THEMES array

The theme automatically appears in the UI toggle.

### CSS class system

All components use `og-*` prefixed CSS classes defined in `src/styles/tokens.css`.
See `../openglobes-core/docs/DESIGN_SYSTEM.md` for the full specification.
```

- [ ] **Step 2: Commit**
```bash
git add README.md
git commit -m "docs: add theming section to README"
```

---

### Task 9: Update Agent State

**Files:**
- Modify: `.agent-state/fish-globe.md`

- [ ] **Step 1: Update** with completed items and new next steps.

- [ ] **Step 2: Commit**
```bash
git add .agent-state/fish-globe.md
git commit -m "chore: update agent state"
```
