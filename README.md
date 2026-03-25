# AquaticGlobe

Interactive 3D globe showing 170,000+ aquatic species worldwide.

**Live:** [aquatic.openglobes.com](https://aquatic.openglobes.com)

Part of [OpenGlobes](https://openglobes.com) — open-source 3D data globe visualizations.

## Development (local)

```bash
# Clone sibling repos if not present
# ../openglobes-core — shared globe engine
# ../openglobes-etl  — data pipeline (has pre-generated output)

# Symlink data from ETL output (do NOT copy — keeps in sync)
ln -s ../openglobes-etl/output/aquatic data

# Install deps (file: link resolves to sibling core)
pnpm install

# Build core first if not already built
cd ../openglobes-core && pnpm build && cd ../openglobes-aquatic

# Run dev server
pnpm dev
```

## Production

Deployed automatically via GitHub Actions — the workflow clones the ETL repo at
build time and deploys to GitHub Pages. See `.github/workflows/deploy.yml`.

## Species sprites

Species are rendered as photorealistic transparent PNG billboards on the globe
surface. 179 sprite images live in `data/sprites/sp-{name}.png`, mapped via
`data/sprites/manifest.json`.

- **Individual points** (z6+): each species shows its own sprite
- **Clusters** (z0–5): the largest species by body size is picked as the representative, with a count badge overlay
- Sprites are loaded through a **concurrency-limited queue** (max 8 in-flight) with viewport-aware cancellation — stale loads for off-screen sprites are dropped when the user pans
- The sprite pool (800 slots) is **camera-aware**: only points on the facing hemisphere are assigned, sorted by proximity to camera center

## Loading

A pure-HTML loading screen renders before any JS executes, showing:
- App title and current loading step (scene, tiles, sprites)
- A progress bar driven by `src/utils/loadProgress.ts`
- Fades out when the globe scene, first tile batch, and initial sprites are ready

## Performance

Key optimizations beyond the defaults:
- **Camera-aware sprite pool** — only visible-hemisphere points get pool slots
- **Concurrency-limited texture queue** — 8 max in-flight PNG fetches with cancellation
- **Precomputed tangent vectors** — swimming animation uses world-space offsets, zero `getCoords` calls per frame
- **Double-update fix** — camera change handler fires the spatial index once, not twice
- **Lazy search index** — `search.json` deferred until user focuses the search bar
- **Code splitting** — FishDetail, RouteDetail, ListPanel are `React.lazy`

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

## Data

Data is symlinked from `../openglobes-etl/output/aquatic` — never committed to this repo.

- `data/tiles/z{0-7}/{x}_{y}.json` — spatial tiles (clusters at z0–5, points at z6)
- `data/species/{id}.json` — per-species detail (172K files)
- `data/sprites/sp-{name}.png` — 179 photorealistic species sprites
- `data/sprites/manifest.json` — sprite registry with body type/group metadata
- `data/search.json` — compact species list for search
- `data/migration_routes.json` — 30 migration corridors
- `data/index.json` — master index with filter definitions

Species metadata includes Chinese names (63% coverage from FishBase) and max body
length in cm (87% coverage) where available.

## Data sources

- [OBIS](https://obis.org) (CC-BY 4.0) — 2.6M occurrence points
- [FishBase](https://www.fishbase.se) (CC-BY-NC 4.0) — species metadata, images, Chinese names
- [GBIF](https://www.gbif.org) (CC0 / CC-BY 4.0)

## License

Code: AGPL-3.0. Data: inherits source licenses (FishBase CC-BY-NC, OBIS CC-BY, GBIF CC0/CC-BY) — see attribution in each species file.
