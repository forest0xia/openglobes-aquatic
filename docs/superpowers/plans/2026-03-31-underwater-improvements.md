# Underwater Improvements Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement.

**Goal:** Fix underwater scene: proper fish sizing, camera distance, swimming fish, terrain with hills/vegetation, ocean-only entry.

**Architecture:** Direct modifications to UnderwaterScene.ts, UnderwaterShader.ts, GlobeRenderer.ts, FishGlobe.tsx.

**Tech Stack:** Three.js, GLSL shaders, TypeScript

---

### Task 1: Fix Fish Sizing & Remove Halo (UnderwaterScene.ts + UnderwaterShader.ts)

**Files:**
- Modify: `src/globe/UnderwaterScene.ts` (buildFish, lines 240-310)
- Modify: `src/globe/UnderwaterShader.ts` (uwFishVertexShader, uwFishFragmentShader)

- [ ] In `buildFish()`, replace random scale `1.5 + Math.random() * 1.5` with sprite-proportional sizing:
  ```typescript
  const PX_TO_WORLD_UW = 150; // larger divisor = smaller fish
  const worldH = fd.uvRect.h / PX_TO_WORLD_UW;
  const worldW = (fd.uvRect.w / PX_TO_WORLD_UW);
  const maxSize = 1.2; // hard cap
  const finalH = Math.min(worldH, maxSize);
  const finalW = Math.min(worldW, maxSize * (fd.uvRect.w / fd.uvRect.h));
  sizeArr[idx * 2] = finalW;
  sizeArr[idx * 2 + 1] = finalH;
  ```
- [ ] In uwFishVertexShader: remove the `expandedSize = size * 1.8` expansion — use `size` directly
- [ ] In uwFishFragmentShader: remove the halo/glow code outside the body. Just render the sprite texture with `if (texel.a < 0.01) discard;`

### Task 2: Fish Swimming Behavior (UnderwaterScene.ts + UnderwaterShader.ts)

**Files:**
- Modify: `src/globe/UnderwaterScene.ts` (buildFish positioning)
- Modify: `src/globe/UnderwaterShader.ts` (uwFishVertexShader)

- [ ] Spread fish wider: increase radius range from `8-33` to `15-60`. Constrain Y to roughly -20..15 (near seabed to mid-water).
- [ ] In vertex shader, replace small circular swimming with larger swimming paths:
  ```glsl
  // Wider swimming loops
  float swimSpeed = vel.x * 0.15;
  float swimRadius = 5.0 + length(vel) * 8.0;
  pos.x += sin(t * swimSpeed) * swimRadius;
  pos.z += cos(t * swimSpeed * 0.7) * swimRadius * 0.8;
  pos.y += sin(t * vel.y * 0.2) * 1.5; // gentle vertical bob
  ```

### Task 3: Camera Constraints (GlobeRenderer.ts)

**Files:**
- Modify: `src/globe/GlobeRenderer.ts` (animateUnderwater, lines 483-533)

- [ ] Remove auto-forward drift (`0.5 * dt`)
- [ ] Reduce movement speed from `8 * dt` to `4 * dt`
- [ ] Tighten vertical bounds: Y from `(-22, 28)` to `(-18, 15)`
- [ ] Start camera further back: `uwCamPos.set(0, 2, 15)` instead of `(0,0,0)`
- [ ] Add minimum distance check: push camera away from any fish closer than 8 units

### Task 4: Terrain — Perlin Noise Hills (UnderwaterShader.ts + UnderwaterScene.ts)

**Files:**
- Modify: `src/globe/UnderwaterScene.ts` (seabed geometry)
- Modify: `src/globe/UnderwaterShader.ts` (seabedVertexShader)

- [ ] Increase seabed subdivision: `PlaneGeometry(200, 200, 64, 64)`
- [ ] Add vertex displacement in seabedVertexShader using the existing `noise()` function:
  ```glsl
  float hill = noise(worldPos.xz * 0.02) * 4.0 + noise(worldPos.xz * 0.06) * 1.5;
  transformed.y += hill;
  ```
- [ ] Export the noise function so decoration placement can sample the same heights

### Task 5: Terrain — Vegetation & Decorations (UnderwaterScene.ts + UnderwaterShader.ts)

**Files:**
- Modify: `src/globe/UnderwaterScene.ts` (new buildDecorations method)
- Modify: `src/globe/UnderwaterShader.ts` (new decoration shaders)

- [ ] Create procedural decoration billboards (no external textures needed):
  - Seagrass: tall green-tinted strips with vertex sway animation
  - Coral: short, wide, colorful static billboards
  - Rocks: dark gray/brown small static billboards
- [ ] ~150-200 instances scattered on seabed, Y sampled from same Perlin noise
- [ ] Dense near origin (0-30 units), sparse further out
- [ ] All rendered as a single InstancedMesh with a procedural fragment shader (color-based, no texture)

### Task 6: Ocean-Only Entry (FishGlobe.tsx + new oceanMask utility)

**Files:**
- Create: `src/utils/oceanMask.ts`
- Modify: `src/components/FishGlobe.tsx` (handleDoubleClick)

- [ ] Create ocean mask utility that loads NASA equirectangular land/ocean mask
- [ ] In handleDoubleClick: check `isOcean(hitLat, hitLng)` before entering underwater
- [ ] If on land: show brief toast "只能在海洋区域潜入水下"
- [ ] Desktop: change cursor on ocean hover
- [ ] Mobile: add fixed "潜入水下" button (visible when zoomed in, checks ocean at viewport center)
