# Underwater & Asset Improvements — Design Spec

**Date:** 2026-03-31
**Scope:** 5 independent sub-projects improving the aquatic globe experience.

---

## A. Whale HD Sprites

### Problem
All 179 species sprites are uniformly compressed to 64px height in the ETL pipeline. Whales are the largest animals on earth and deserve higher visual fidelity — especially when viewed in the underwater scene.

### Design
- **Separate whale atlas:** ETL generates a second spritesheet (`spritesheet-whales.png/webp`) containing only whale species at **256px height** (preserving aspect ratio). The 11 whale sprites pack into a single ~2048×256 sheet.
- **Main atlas unchanged:** The 64px spritesheet continues to include ALL species (whales at 64px too) for the globe view where they're small.
- **Underwater scene uses whale atlas:** When building UnderwaterScene, if a fish is a whale (`bodyGroup === 'mammal' && bodyType === 'cetacean'`), sample from the whale atlas instead of the main atlas.
- **ETL changes:** In `crop_and_pack_sprites.py`, add a second pass that packs whale-group sprites at 256px height into a separate sheet. Output both `spritesheet-0.{png,webp}` (unchanged) and `spritesheet-whales.{png,webp}`.

### Species (11 total)
蓝鲸, 座头鲸, 抹香鲸, 虎鲸, 鲸鲨, 白鲸, 独角鲸, 灰鲸, 长须鲸, 弓头鲸, 小须鲸

### Files to change
- `openglobes-etl/scripts/crop_and_pack_sprites.py` — second packing pass
- `src/hooks/useGlobe.ts` — load whale atlas alongside main atlas
- `src/globe/UnderwaterScene.ts` — use whale atlas for whale species

---

## B. Real Fish Sounds

### Problem
All 12 sound categories are Web Audio API synthesized. While acoustically grounded, they sound artificial. Real recordings exist for all these species and are more immersive.

### Design
- **Replace all 12 synth sounds with real audio recordings.**
- **Audio files:** Short clips (2–5 seconds each), stored as MP3 in `public/audio/`.
- **Sources (all public domain / CC0):**
  - NOAA Ocean Sounds (humpback, blue whale, sperm whale, dolphins) — US Gov, public domain
  - Freesound.org CC0 filter (shrimp snap, seal bark, fish sounds)
  - DOSITS audio gallery (supplementary)
- **File naming:** `{sound_category}.mp3` — e.g., `whale-song.mp3`, `dolphin-whistle.mp3`
- **Multiple variants:** 2–3 clips per category where available, randomly selected on play. E.g., `whale-song-1.mp3`, `whale-song-2.mp3`.
- **Total estimated size:** < 500KB (short clips, compressed MP3 at 128kbps)
- **FishAudio.ts rewrite:** Replace synthesizer functions with `Audio` element playback. Keep the same external API (`playHoverSound`, `playClickSound`, `setVolume`). Keep the species→category mapping and cooldown logic. Remove all oscillator/noise/filter code.
- **Lazy loading:** Audio files loaded on first interaction (not at page load).
- **Fallback:** If an audio file fails to load, silently skip (no error to user).

### Sound categories (12)
| Category | Source priority |
|---|---|
| whale_song | NOAA humpback recordings |
| whale_click | NOAA sperm whale clicks |
| dolphin_whistle | NOAA/Freesound bottlenose |
| dolphin_click | NOAA/Freesound |
| shrimp_snap | Freesound CC0 |
| clownfish_pop | Freesound/DOSITS |
| grouper_boom | Freesound/DOSITS |
| parrotfish_crunch | DOSITS/Freesound |
| seahorse_click | Freesound/DOSITS |
| turtle_grunt | Freesound CC0 |
| seal_bark | Freesound CC0 |
| fish_bubble | Freesound CC0 |

### Files to change
- `src/audio/FishAudio.ts` — full rewrite (synth → audio playback)
- `public/audio/*.mp3` — new audio assets (24–36 files)

---

## C. Underwater Entry Restriction (Ocean Only)

### Problem
Double-clicking anywhere on the globe enters underwater mode, including on land masses. This is disorienting and nonsensical.

### Design

#### Ocean/Land Detection
- **Land mask texture:** Load a NASA equirectangular land/ocean mask image (~1024×512 px, < 100KB) at startup.
- **Detection method:** Draw mask to an offscreen `<canvas>`, then on double-click, convert lat/lng to pixel coords and sample via `getImageData()`.
  - `x = (lng + 180) / 360 * width`
  - `y = (90 - lat) / 180 * height`
  - Dark pixel (R < 128) = ocean → allow dive
  - Bright pixel (R >= 128) = land → block dive
- **New utility:** `src/utils/oceanMask.ts` — `loadOceanMask()`, `isOcean(lat, lng): boolean`

#### Visual Hints — Adaptive by Device

**Desktop (mouse):**
- When hovering over ocean: cursor changes to a custom dive icon (CSS `cursor: url(...)`) and a small tooltip appears near cursor: "双击潜入水下"
- When hovering over land: normal pointer cursor, no tooltip
- Detection: throttled to ~10 checks/second using the same ocean mask

**Mobile (touch):**
- Fixed semi-transparent button in bottom-right corner: "潜入水下" with a dive icon
- Button only visible when zoomed in enough (camera distance < 250)
- Tap → enters underwater at the center of the current viewport (if ocean). If the center is land, scan nearby for closest ocean point.
- Uses `useResponsive` hook from core to detect mobile

### Files to change
- `src/utils/oceanMask.ts` — new file, ocean mask loader + sampler
- `src/components/FishGlobe.tsx` — conditional double-click handler, desktop tooltip, mobile dive button
- `public/textures/ocean-mask.png` — new asset (~100KB)

---

## D. Underwater Camera & Fish Sizing

### Problem
1. Camera can get too close to fish, making them appear enormous
2. Fish scale is random 1.5x–3.0x base, then 1.8x in shader = up to 5.4x original sprite → unrealistically large

### Design

#### Fish Sizing — True to Sprite
- **Remove random scale multiplier.** Each fish uses its actual sprite pixel dimensions converted to world units.
- **Scale formula:** `worldSize = spriteHeight / PX_TO_WORLD_UW` where `PX_TO_WORLD_UW = 120` (tunable). A 64px fish ≈ 0.53 world units.
- **Scale cap:** `min(worldSize, 1.0)` — can only be smaller, never larger than 1.0 world units.
- **Whale exception:** Whales use their HD sprite height (256px) / `PX_TO_WORLD_UW` = ~2.1 units, capped at 3.0 to stay visible but not overwhelming.
- **Remove 1.8x shader expansion** for the underwater fish shader (keep it for globe view).

#### Camera Constraints
- **Minimum approach distance:** Camera cannot move closer than 5 units to any fish instance. Implemented as a soft repulsion: if camera-to-nearest-fish distance < 5, nudge camera backward along its forward vector.
- **Remove auto-forward drift** (the `0.5 * dt` that forces swimming forward). Let the user control all movement.
- **Movement speed reduced:** From `8 * dt` to `4 * dt` for a calmer, more observational pace.
- **Vertical bounds tightened:** Y range from `(-22, 28)` to `(-15, 20)` to keep camera at reasonable depth.

### Files to change
- `src/globe/UnderwaterScene.ts` — fish sizing logic (lines 269-274), shader expansion
- `src/globe/GlobeRenderer.ts` — camera constraints, remove auto-drift, speed adjustment

---

## E. Underwater Terrain Enrichment

### Problem
The seabed is a flat 200×200 plane with only a caustic shader. No vegetation, corals, or shells. Feels empty and lifeless.

### Design

#### Terrain Geometry — Procedural Perlin Noise
- **Subdivide seabed:** Change from `PlaneGeometry(200, 200, 1, 1)` to `PlaneGeometry(200, 200, 64, 64)`.
- **Vertex displacement:** Apply 2-octave Perlin noise in the vertex shader to create gentle rolling hills.
  - Octave 1: amplitude 3.0, frequency 0.02 (broad hills)
  - Octave 2: amplitude 1.0, frequency 0.06 (smaller bumps)
  - Max total displacement: ~4 units up from base
- **Keep existing caustic fragment shader** — works on top of displaced geometry.

#### Decorations — Sprite Billboards
- **Decoration types** (5 categories):
  1. **Seagrass** — tall, swaying strips (animated in vertex shader). Green-tinted.
  2. **Kelp** — taller than seagrass, brown/olive. Sways slower.
  3. **Coral formations** — colorful, static. Multiple color variants (pink, orange, purple).
  4. **Shells/starfish** — small, scattered on the ground. Static, no animation.
  5. **Sea anemones** — medium height, gently pulsing. Bright colors.

- **Implementation:** Single InstancedMesh with a decoration sprite atlas.
  - **Atlas:** Prepare a small sprite sheet (~512×256) with 10–15 decoration sprites. Can be AI-generated or hand-drawn — stylized to match the project's aesthetic.
  - **Count:** ~200 decoration instances total, distributed across the seabed.
  - **Placement:** Random positions on the seabed, Y position sampled from the same Perlin noise function to sit on the terrain surface.
  - **Seagrass/kelp animation:** Vertex shader applies a `sin(time + worldPos.x)` sway, amplitude ~0.3 for grass, ~0.5 for kelp.

- **Density zones:**
  - Near camera origin (0–20 units): high density (corals, anemones, seagrass)
  - Mid range (20–50 units): medium density (seagrass, kelp, scattered shells)
  - Far range (50–100 units): sparse (kelp only, fades into fog)

#### Asset Pipeline
- **New sprite atlas:** `public/textures/underwater-decor.png` — hand-curated or AI-generated decoration sprites. Transparent PNG, ~512×256.
- **Manifest:** Hardcoded UV rects in `UnderwaterScene.ts` (only ~10 entries, no need for external JSON).

### Files to change
- `src/globe/UnderwaterScene.ts` — terrain subdivision, decoration instancing, Perlin noise
- `src/globe/UnderwaterShader.ts` — vertex displacement, seagrass/kelp sway animation
- `public/textures/underwater-decor.png` — new decoration atlas

---

## Implementation Order

1. **D — Camera & Fish Sizing** (lowest risk, immediate improvement, no new assets needed)
2. **A — Whale HD Sprites** (ETL change + loader, enables better whale display)
3. **C — Underwater Entry Restriction** (new utility + UI, needs ocean mask asset)
4. **E — Underwater Terrain** (largest scope, needs decoration atlas)
5. **B — Real Fish Sounds** (independent, needs manual audio sourcing from NOAA/Freesound before coding — audio download is a manual prerequisite, coding can then be done in parallel with E)

---

## Out of Scope
- 3D model fish (staying with sprite billboards)
- Underwater multiplayer / other players
- Day/night cycle in underwater scene
- Underwater UI panels / species identification
