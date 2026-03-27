# AquaticGlobe

Interactive 3D globe with 200 curated aquatic species swimming across
the world's oceans — not icons pinned to a map, but living creatures
drifting through the deep.

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

## Architecture

### Data model

All data lives in two small JSON files loaded once on startup (~270KB total):

- **`data/final.json`** — 200 curated species, each with tier (star/ecosystem/surprise),
  bilingual names, display config (animation style, scale, color), and 2–8 viewing spots
  with lat/lng, season, reliability, and activity type.
- **`data/hotspots.json`** — 25 famous marine locations (Great Barrier Reef, Galapagos, etc.)

No spatial tiles, no zoom-level switching, no cluster logic. The entire dataset is in memory.

### Sprite rendering

Each species is rendered as a transparent PNG billboard (`data/sprites/sp-{name}.png`).
Sprites are placed at each viewing spot (~700 total) and animated based on `display.animation`:

| Animation | Behavior |
|-----------|----------|
| `slow_cruise` | Gentle forward drift + lateral sway |
| `schooling` | Tight group motion |
| `hovering` | Subtle vertical bob (seahorses, reef fish) |
| `drifting` | Lazy drift (jellyfish, plankton) |
| `darting` | Quick bursts with pauses |

Sprites use `sizeAttenuation: false` — they render at their actual PNG pixel dimensions
regardless of zoom level. The PNGs are pre-sized proportional to real-world animal size.

### Loading

A pure-HTML loading screen renders before any JS executes:
- Progress bar tracking scene init + species data + first sprite textures
- Fades out when ready

### Performance

- **No tiles, no spatial index** — 270KB of JSON loaded once, held in memory
- **No sprite pool** — all ~700 sprites created once, never reshuffled
- **Concurrency-limited texture loading** — max 8 PNG fetches in-flight
- **Back-face culling** — sprites behind the globe horizon are hidden per-frame
- **Precomputed tangent vectors** — swim animation is pure arithmetic, zero `getCoords` per frame
- **Code splitting** — FishDetail loaded lazily on click
- **Lazy search index** — `search.json` deferred until user focuses search bar

## Theming

Runtime theme switching via Night Mode toggle. Styling flows through CSS custom properties.

To add a theme:
1. Create `src/themes/{name}.ts` — export a `GlobeTheme` object
2. Add `[data-theme="{name}"]` overrides in `src/styles/tokens.css`
3. Register in `src/themes/index.ts`

## Data

Symlinked from `../openglobes-etl/output/aquatic/` — never committed to this repo.

| File | Size | Contents |
|------|------|----------|
| `final.json` | ~270KB | 200 species with viewing spots, display config, bilingual names |
| `hotspots.json` | ~6KB | 25 marine hotspots with coordinates |
| `sprites/sp-{name}.png` | ~48MB total | 179 photorealistic transparent PNGs |
| `sprites/manifest.json` | ~50KB | Sprite registry (body type, group, scientific name) |
| `search.json` | ~500KB | Species list for fuzzy search |
| `migration_routes.json` | ~30KB | 30 migration corridors |

## Data sources

- [OBIS](https://obis.org) (CC-BY 4.0) — occurrence data
- [FishBase](https://www.fishbase.se) (CC-BY-NC 4.0) — species metadata, images, Chinese names
- [GBIF](https://www.gbif.org) (CC0 / CC-BY 4.0)

## License

Code: AGPL-3.0. Data: inherits source licenses — see attribution in species files.
