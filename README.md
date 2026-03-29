# 深海探索 AquaticGlobe

全球海洋生物3D互动地球 — 228种海洋生物在深海中游动，不是地图上的图标，而是活的生命。

**Live:** [aquatic.openglobes.com](https://aquatic.openglobes.com)

Part of [OpenGlobes](https://openglobes.com) — open-source 3D data globe visualizations.

## Development

```bash
# Symlink data from ETL output
ln -s ../openglobes-etl/output/aquatic data

# Install and run (plain Vite + React, no Astro)
pnpm install
pnpm dev
```

## Architecture

### Rendering (plain Three.js, no three-globe)

Custom rendering stack in `src/globe/`:

| File | Purpose |
|------|---------|
| `GlobeRenderer.ts` | Scene, camera (custom spherical + exponential damping), single RAF loop, ACES tone mapping |
| `EarthMesh.ts` | Textured sphere with bump/specular maps |
| `AtmosphereShader.ts` | Dual-layer fresnel glow (BackSide rim + FrontSide haze) |
| `SpeciesLayer.ts` | Single `InstancedMesh` for all ~1900 species sprites (1 draw call) |
| `SpeciesShader.ts` | GLSL: billboard, 5 swim animations, body wave, bioluminescent glow |
| `TrailLayer.ts` | Line2 animated migration trails |
| `coordUtils.ts` | lat/lng → Three.js Vector3 (matches SphereGeometry UV) |

### Data model

Two JSON files loaded once (~300KB total):

- **`final.json`** — 228 species (50 star / 80 ecosystem / 70 surprise + 14 corals / 14 anemones+sponges), 1000+ viewing spots, bilingual names (中文/English), display config
- **`hotspots.json`** — 25 marine hotspots
- **`migration_routes.json`** — 81 migration corridors with Chinese names + descriptions

### Species rendering

All species in ONE `InstancedMesh` (~1900 instances, 1 draw call):

| Feature | Implementation |
|---------|---------------|
| Position | True geographic lat/lng, never offset |
| Animation | 5 types in vertex shader: `slow_cruise`, `schooling`, `hovering`, `drifting`, `darting` |
| Body wave | Sinusoidal S-curve along spine (amplitude: head=0, tail=0.35) |
| Bioluminescence | Per-instance glow color, radiant halo (1.8x quad), coral fluorescence |
| Corals | `static` animation, fluorescent colors (电绿/热粉/亮橙/紫蓝), `tiny` scale |
| Spritesheet | Single atlas (~3MB WebP), UV per-instance |
| Highlight | Smooth ease-out cubic scale animation on hover/click |

### UI (Chinese-first)

- All labels, tooltips, species names in Chinese
- Hover tooltip: DOM-managed (zero React re-renders)
- Detail panel: species info + clickable viewing spots
- Controls: 图层叠加, 地理标签, 地球贴图, 夜间模式

### Performance

- **1 draw call** for all species (InstancedMesh)
- **Custom camera** with split exponential damping (rotation instant, zoom smooth)
- **Zero React re-renders** on hover (DOM-managed tooltips)
- **Tab visibility pause** — stops RAF when tab hidden
- **Drag skip** — no hit-testing during globe rotation
- **No three-globe** — removed heavy dependency (~220KB + d3 + internal RAF loop)
- **No Astro** — plain Vite + React (~1s dev cold start)

## Data

Symlinked from `../openglobes-etl/output/aquatic/` — never committed to this repo.

| File | Contents |
|------|----------|
| `final.json` | 228 species, 1000+ viewing spots, Chinese names |
| `hotspots.json` | 25 marine hotspots |
| `sprites/spritesheet-0.webp` | 450 species sprites in one atlas (~3MB) |
| `sprites/spritesheet.json` | Atlas manifest (UV coordinates) |
| `search.json` | Search index (Chinese + English) |
| `migration_routes.json` | 81 migration corridors |

## Tech stack

- **Vite** + **React 19** + **TypeScript**
- **Three.js 0.183** (direct, no wrappers)
- **Custom GLSL shaders** (species billboard + glow)
- **Tailwind 4** for UI styling

## Data sources

- [OBIS](https://obis.org) (CC-BY 4.0)
- [FishBase](https://www.fishbase.se) (CC-BY-NC 4.0)
- [GBIF](https://www.gbif.org) (CC0 / CC-BY 4.0)

## License

Code: AGPL-3.0. Data: inherits source licenses.
