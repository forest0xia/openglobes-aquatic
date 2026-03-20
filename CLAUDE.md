# CLAUDE.md — Instructions for AI agents working on this repo

## What is this?
fish.openglobes.com — an interactive 3D globe showing 35,000+ fish species worldwide.
This is a standalone Astro 5 static site that imports @openglobes/core as a local dependency.

## Setup
The core engine library lives at a sibling directory: ../openglobes-core
Link it locally (do NOT try to install from npm — it's not published yet):
```bash
cd ../openglobes-core && pnpm link --global
cd ../openglobes-fish && pnpm link --global @openglobes/core
```
Or use package.json dependency:
```json
"dependencies": {
  "@openglobes/core": "file:../openglobes-core"
}
```

## Data
data/ is a SYMLINK to ../openglobes-etl/output/fish — do NOT copy data into this repo.
If the symlink is missing, create it: `ln -s ../openglobes-etl/output/fish data`
The data is ALREADY GENERATED. Do not call any external APIs.

Files:
- data/tiles/z{0-7}/{x}_{y}.json — spatial tiles (clusters at z0-3, points at z4-7)
- data/species/{id}.json — per-species detail files (~4,677 files)
- data/index.json — master index with filter definitions
- data/search.json — compact species list for Fuse.js search

## Tech stack
- Astro 5 with React integration (@astrojs/react)
- @openglobes/core for Globe, FilterPanel, DetailDrawer, hooks
- Tailwind 4 for styling
- Static site output — deployed to Cloudflare Pages

## Design direction
- Dark deep-ocean aesthetic
- Globe texture: dark ocean bathymetry (deep blue/black)
- Atmosphere glow: #0066aa (ocean blue)
- Background: #0a0e17
- Points color-coded by rarity: Common=#00b4d8, Uncommon=#48cae4, Rare=#ffd60a, Legendary=#ef233c
- Typography: display=Outfit (Google Fonts), body=DM Sans
- Glassmorphism panels overlaying the globe
- Smooth fade-in animation on globe load

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
- Update .agent-state/fish-globe.md after every session
- Read .agent-state/ on startup to continue from last checkpoint
