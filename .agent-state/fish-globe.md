# Agent: fish-globe
## Last Session: not started
## Status: NOT STARTED
## Current Task: Build fish.openglobes.com

## Completed:
(none yet)

## Next Steps:
- [ ] Init Astro 5 project: pnpm create astro@latest . --template minimal
- [ ] Add React integration: pnpm astro add react
- [ ] Add Tailwind: pnpm astro add tailwind
- [ ] Link @openglobes/core from sibling dir (file: dependency or pnpm link)
- [ ] Copy data from ../openglobes-etl/output/fish/ → ./data/
- [ ] Create src/pages/index.astro — full-screen globe page
- [ ] Create src/components/FishGlobe.tsx — imports Globe from core, passes fish theme
- [ ] Create src/components/FishDetail.tsx — species detail card
- [ ] Create src/theme.ts — ocean-dark theme config for fish
- [ ] Wire FilterPanel to data/index.json filter definitions
- [ ] Wire SearchBar to data/search.json via Fuse.js
- [ ] Wire DetailDrawer to data/species/{id}.json on point click
- [ ] Test mobile (375px) + desktop (1440px)
- [ ] Configure static output for Cloudflare Pages deployment

## Blocked On:
- Need @openglobes/core linked (sibling dir ../openglobes-core)
- Need data copied from ../openglobes-etl/output/fish/

## Notes:
- Core is built as ESM library via tsup, outputs to dist/
- ETL generated ~4,677 species with coordinates and ~3,519 tile files
- Data is static JSON — no API calls at runtime
