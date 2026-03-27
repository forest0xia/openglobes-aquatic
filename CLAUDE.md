# CLAUDE.md — Instructions for AI agents working on this repo

## What is this?
aquatic.openglobes.com — an interactive 3D globe showing 170,000+ aquatic species worldwide.
This is a standalone Astro 5 static site that imports @openglobes/core as a local dependency.

## Setup (local dev)
```bash
# 1. Clone sibling repos if not present
#    ../openglobes-core — the shared globe engine
#    ../openglobes-etl  — data pipeline (has pre-generated output)
# 2. Symlink data from ETL output
ln -s ../openglobes-etl/output/aquatic data
# 3. Install deps (file: link resolves to sibling core)
pnpm install
# 4. Build core first if not already built
cd ../openglobes-core && pnpm build && cd ../openglobes-aquatic
# 5. Run dev server
pnpm dev
```
Data is ALREADY GENERATED. Do not call any external APIs.

## What @openglobes/core provides
This repo imports the shared engine. Key exports you'll use:
- **Components:** `Globe`, `GlobeRoot`, `FilterPanel`, `DetailDrawer`, `SearchBar`, `MobileSheet`, `ZoomControls`, `LoadingOrb`
- **Hooks:** `useSpatialIndex` (fetches JSON tiles by viewport), `useResponsive` (breakpoints), `useGlobeTheme` (theme context)
- **Layers:** `applyArcLayer` (animated arcs), `applyTrailLayer` (multi-waypoint flow)
- **CSS:** `@openglobes/core/tokens.css` — all `og-*` utility classes (og-glass, og-chip, og-mono-value, etc.)
- **Types:** `GlobeTheme`, `FilterConfig`, `DetailFieldConfig`, `PointItem`, `ClusterItem`
- **Globe callbacks:** `onSceneReady(refs)` for Three.js scene access, `onFrame(dt)` for animation loop
- Do NOT modify core from this repo. If you need core changes, note them in .agent-state/aquatic-globe.md.

## Data
data/ is a SYMLINK to ../openglobes-etl/output/aquatic — do NOT copy data into this repo.
If the symlink is missing: `ln -s ../openglobes-etl/output/aquatic data`

Files:
- data/final.json — 200 curated species with viewing spots, display config, bilingual names (~270KB)
- data/hotspots.json — 25 marine hotspots (~6KB)
- data/sprites/sp-{name}.png — 179 photorealistic species PNG sprites
- data/sprites/manifest.json — sprite registry (body type, body group, scientific name)
- data/search.json — compact species list for search
- data/migration_routes.json — 30 migration route corridors

## Tech stack
- Astro 5 with React integration (@astrojs/react)
- @openglobes/core for Globe, FilterPanel, DetailDrawer, hooks
- Tailwind 4 for styling
- Static site output — deployed to GitHub Pages at aquatic.openglobes.com

## CI/CD
- .github/workflows/deploy.yml builds and deploys on push to main
- Workflow clones openglobes-etl, copies output/aquatic to ./data
- Workflow clones openglobes-core, builds it so file: link resolves
- Deploys static output to GitHub Pages
- data/ is in .gitignore (symlinked locally, copied in CI)

## Design direction
- Dark deep-ocean aesthetic
- Globe texture: dark ocean bathymetry (deep blue/black)
- Atmosphere glow: #0066aa (ocean blue)
- Background: #0a0e17
- Points color-coded by rarity: Common=#00b4d8, Uncommon=#48cae4, Rare=#ffd60a, Legendary=#ef233c
- Typography: display=Outfit (Google Fonts), body=DM Sans
- Glassmorphism panels overlaying the globe
- Smooth fade-in animation on globe load

## Source structure
```
src/
  pages/index.astro          — single page, renders <App client:only="react" />
  components/
    App.tsx                  — ThemeProvider wrapper → FishGlobe
    FishGlobe.tsx            — layout-only (~675 lines), delegates state to hooks
    FishDetail.tsx           — species detail panel (images, metadata, size comparison)
    RouteDetail.tsx          — migration route detail panel (type badge, description, waypoints)
    SearchBar.tsx            — search over /data/search.json (lazy-loaded on focus)
    ListPanel.tsx            — generic scrollable list (used for cluster species)
    ZoomControls.tsx         — +/- zoom buttons
    DiscoverButton.tsx       — "Discover" random rare fish
    FishNearMe.tsx           — geolocation nearby fish
    GeoLabels.ts             — 3D text labels on globe (oceans, seas, etc.)
    SizeComparison.tsx       — fish vs human/diver size overlay
  hooks/
    useGlobeControls.ts      — scene refs, camera, labels, globe skin, theme (135 lines)
    useFilters.ts            — spatial index, filter values, display points (90 lines)
    useMigrationRoutes.ts    — routes, trails, selection, hover tooltip (201 lines)
  data/
    migrations.ts            — MigrationRoute type, loads /data/migration_routes.json, converts to TrailDatum[]
    currents.ts              — ocean current trail data
    geoLabels.ts             — geographic label positions
    schooling.ts             — schooling species set
  themes/
    index.tsx                — ThemeProvider + ThemeContext
    fish.ts                  — default light theme
    bioluminescence.ts       — night mode theme
  sprites/
    SpriteLoader.ts          — PNG texture loader with concurrency-limited queue (max 8)
    SpritePointLayer.ts      — unified sprite renderer for points + clusters, camera-aware pool
  utils/
    flyTo.ts                 — camera fly-to animation
    loadProgress.ts          — global loading progress tracker (scene, tiles, sprites)
  styles/
    global.css               — Tailwind + custom CSS vars (og-glass, og-chip, etc.)
```

## State ownership
- `useGlobeControls` — scene refs, camera throttle, label types, globe skin, theme
- `useFilters` — filter values, spatial index, display points, active month
- `useMigrationRoutes` — routes, trails, selection, tooltip, show/hide toggles
- `FishGlobe.tsx` — selectedPoint, detailDismissed, listPanel, filtersOpen (UI-only state)

## Page structure
Single page app:
- Full-screen globe as hero
- Left sidebar (desktop) / bottom sheet (mobile): filters for water type, depth, rarity
- Right sidebar (desktop) / bottom sheet (mobile): species detail card on click
- Top: search bar with fuzzy search
- Bottom-right: zoom controls
- Bottom: attribution bar (FishBase CC-BY-NC, GBIF)

## Mobile behavior
- Globe fills entire viewport
- Filter panel = draggable bottom sheet, collapsed by default
- Tap a point → species detail slides up as full bottom sheet
- Pinch to zoom, drag to rotate
- Search bar at top, overlaying globe

## Performance
- Astro static HTML renders first (zero JS blocking)
- Globe chunk lazy-loads after page is interactive
- Data tiles fetched on demand by viewport — never all at once
- Species thumbnails: lazy-loaded WebP 200x200 (future — skip for v1)
- Target: Lighthouse mobile > 80

## Session continuity
- Update .agent-state/aquatic-globe.md after every session
- Read .agent-state/ on startup to continue from last checkpoint
