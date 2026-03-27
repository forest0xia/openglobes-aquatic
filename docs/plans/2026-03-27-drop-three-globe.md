# Drop three-globe: Plain Three.js Globe + InstancedMesh Sprites

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the heavy three-globe dependency with plain Three.js — textured sphere, atmosphere shader, InstancedMesh for all species sprites, and Line2 for migration trails. Target: 5 draw calls, zero per-frame JS animation cost (GPU shaders handle everything).

**Architecture:** One `GlobeRenderer` class owns the Three.js scene: sphere + atmosphere + InstancedMesh (species) + Line2 (trails) + labels. All species sprites share one InstancedMesh with the spritesheet atlas texture; per-instance attributes carry UV offset, position, animation type, and phase. A vertex shader applies swimming displacement on the GPU. The React layer (`useGlobe` hook) wraps the renderer and exposes it to components.

**Tech Stack:** Three.js 0.183 (direct), OrbitControls, custom GLSL vertex/fragment shaders. No three-globe, no d3.

---

## File Structure

### New files (create)

| File | Responsibility |
|------|---------------|
| `src/globe/GlobeRenderer.ts` | Three.js scene setup: renderer, camera, controls, lighting, resize, RAF loop |
| `src/globe/EarthMesh.ts` | Textured sphere geometry + material (bump, specular) |
| `src/globe/AtmosphereShader.ts` | Atmosphere glow as a slightly larger sphere with fresnel shader |
| `src/globe/SpeciesLayer.ts` | InstancedMesh for all species. Builds instance buffer from species data. Custom shader for UV atlas + swim animation |
| `src/globe/SpeciesShader.ts` | GLSL vertex/fragment: billboard orientation, spritesheet UV, swim displacement, back-face fade |
| `src/globe/TrailLayer.ts` | Migration trails using Line2 + LineMaterial with animated dash |
| `src/globe/coordUtils.ts` | `latLngToVec3(lat, lng, radius, alt)` — replaces three-globe's `getCoords` |
| `src/hooks/useGlobe.ts` | React hook wrapping GlobeRenderer. Replaces useGlobeControls. |

### Modify

| File | Change |
|------|--------|
| `src/components/FishGlobe.tsx` | Replace `<Globe>` from core with `useGlobe()`. Remove core imports. |
| `src/components/App.tsx` | Remove `@openglobes/core` import |
| `src/components/GeoLabels.ts` | Change `getCoords` calls to `coordUtils.latLngToVec3` |
| `src/sprites/SpriteLoader.ts` | Keep spritesheet loading. Add export for raw sheet image (used by InstancedMesh texture) |
| `src/themes/fish.ts` | Remove `GlobeTheme`/`PointItem` imports from core. Simplify to plain object. |
| `src/themes/bioluminescence.ts` | Same |
| `src/themes/index.tsx` | Remove core dependency |
| `package.json` | Remove `@openglobes/core` dependency |

### Delete

| File | Reason |
|------|--------|
| `src/sprites/SpritePointLayer.ts` | Replaced by `SpeciesLayer.ts` (InstancedMesh) |
| `src/sprites/MigrationSpriteLayer.ts` | Replaced by `TrailLayer.ts` |
| `src/hooks/useGlobeControls.ts` | Replaced by `useGlobe.ts` |

---

## Tasks

### Task 1: coordUtils — lat/lng to 3D position

**Files:**
- Create: `src/globe/coordUtils.ts`

- [ ] **Step 1: Create coordUtils.ts**

```typescript
// src/globe/coordUtils.ts
import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;

/**
 * Convert lat/lng/altitude to Three.js world position.
 * three-globe convention: Y-up, radius 100.
 */
export function latLngToVec3(
  lat: number, lng: number, radius: number, alt = 0, target?: THREE.Vector3,
): THREE.Vector3 {
  const v = target ?? new THREE.Vector3();
  const r = radius * (1 + alt);
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  v.setFromSphericalCoords(r, phi, theta);
  return v;
}

export const GLOBE_RADIUS = 100;
```

- [ ] **Step 2: Verify it matches three-globe's getCoords**

Add a temporary console.log in useGlobeControls comparing `getCoords(36.8, -121.9, 0.025)` with `latLngToVec3(36.8, -121.9, 100, 0.025)`. Values should be within 0.01. Adjust theta offset if needed.

- [ ] **Step 3: Commit**

```bash
git add src/globe/coordUtils.ts
git commit -m "feat: add coordUtils — lat/lng to vec3 without three-globe"
```

---

### Task 2: EarthMesh — textured sphere

**Files:**
- Create: `src/globe/EarthMesh.ts`

- [ ] **Step 1: Create EarthMesh.ts**

```typescript
// src/globe/EarthMesh.ts
import * as THREE from 'three';

export interface EarthMeshOptions {
  textureUrl: string;
  bumpUrl?: string;
  bumpScale?: number;
  specularUrl?: string;
  specularColor?: string;
  shininess?: number;
}

const loader = new THREE.TextureLoader();

export function createEarthMesh(options: EarthMeshOptions): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(100, 64, 64);
  const material = new THREE.MeshPhongMaterial({
    shininess: options.shininess ?? 15,
  });

  // Base texture
  loader.load(options.textureUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    material.map = tex;
    material.needsUpdate = true;
  });

  // Bump map
  if (options.bumpUrl) {
    loader.load(options.bumpUrl, (tex) => {
      material.bumpMap = tex;
      material.bumpScale = options.bumpScale ?? 10;
      material.needsUpdate = true;
    });
  }

  // Specular map
  if (options.specularUrl) {
    loader.load(options.specularUrl, (tex) => {
      material.specularMap = tex;
      material.specular = new THREE.Color(options.specularColor ?? 'grey');
      material.needsUpdate = true;
    });
  }

  return new THREE.Mesh(geometry, material);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/globe/EarthMesh.ts
git commit -m "feat: add EarthMesh — textured sphere replacing three-globe"
```

---

### Task 3: AtmosphereShader — fresnel glow

**Files:**
- Create: `src/globe/AtmosphereShader.ts`

- [ ] **Step 1: Create AtmosphereShader.ts**

Atmosphere is a slightly larger sphere with a custom shader that glows brighter at the edges (fresnel effect).

```typescript
// src/globe/AtmosphereShader.ts
import * as THREE from 'three';

export function createAtmosphere(color: string, radius = 100): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius * 1.15, 48, 48);

  const material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(-vPosition);
        float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
        float intensity = pow(rim, 3.0) * 0.6;
        gl_FragColor = vec4(uColor, intensity);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}
```

- [ ] **Step 2: Commit**

---

### Task 4: SpeciesShader — GLSL for instanced sprites

**Files:**
- Create: `src/globe/SpeciesShader.ts`

- [ ] **Step 1: Create vertex + fragment shaders**

The vertex shader:
- Reads per-instance attributes: position on globe, UV rect in spritesheet, animation type, phase, scale
- Billboards the quad to face camera
- Applies swim displacement based on animation type + time uniform
- Fades out sprites on the back face

```typescript
// src/globe/SpeciesShader.ts

export const speciesVertexShader = `
  attribute vec3 instancePos;      // world position on globe surface
  attribute vec4 instanceUV;       // x, y, w, h in spritesheet [0-1]
  attribute float instancePhase;   // random phase for animation desync
  attribute float instanceAnim;    // 0=static, 1=cruise, 2=hover, 3=drift, 4=dart
  attribute float instanceScale;   // size multiplier

  uniform float uTime;
  uniform vec3 uCamPos;           // camera world position (normalized)

  varying vec2 vUV;
  varying float vAlpha;

  void main() {
    // Billboard: orient quad to face camera
    vec3 pos = instancePos;

    // Back-face check: dot(camDir, spriteDir)
    vec3 camDir = normalize(uCamPos);
    vec3 spriteDir = normalize(pos);
    float facing = dot(camDir, spriteDir);
    vAlpha = smoothstep(0.0, 0.15, facing); // fade near horizon

    // Skip if fully behind
    if (facing < -0.05) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0); // clip
      return;
    }

    // Swimming displacement
    float t = uTime + instancePhase;
    vec3 normal = normalize(pos);
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    vec3 bitangent = cross(normal, tangent);

    vec3 offset = vec3(0.0);
    float anim = instanceAnim;
    if (anim > 0.5 && anim < 1.5) {
      // slow_cruise
      offset = tangent * sin(t * 0.4) * 0.2 + bitangent * sin(t * 0.15) * 0.12;
    } else if (anim > 1.5 && anim < 2.5) {
      // hovering
      offset = tangent * sin(t * 0.6) * 0.015 + normal * sin(t * 0.8) * 0.02;
    } else if (anim > 2.5 && anim < 3.5) {
      // drifting
      offset = tangent * cos(t * 0.1) * 0.04 + bitangent * sin(t * 0.15) * 0.06;
    } else if (anim > 3.5) {
      // darting
      float cycle = mod(t * 0.5, 8.0);
      float burst = cycle < 0.8 ? sin(cycle / 0.8 * 3.14159) * 0.25 : sin(t * 0.3) * 0.03;
      offset = bitangent * burst;
    }

    pos += offset;

    // Billboard quad
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec2 quadOffset = position.xy * instanceScale;
    mvPos.xy += quadOffset;

    gl_Position = projectionMatrix * mvPos;

    // UV: map quad corners [0,1] to spritesheet region
    vUV = instanceUV.xy + position.xy * instanceUV.zw + instanceUV.zw * 0.5;
  }
`;

export const speciesFragmentShader = `
  uniform sampler2D uAtlas;
  varying vec2 vUV;
  varying float vAlpha;

  void main() {
    vec4 texel = texture2D(uAtlas, vUV);
    if (texel.a < 0.05) discard;
    gl_FragColor = vec4(texel.rgb, texel.a * vAlpha);
  }
`;

// Animation type → float encoding
export const ANIM_CODE: Record<string, number> = {
  none: 0, static: 0,
  slow_cruise: 1, schooling: 1,
  hovering: 2,
  drifting: 3,
  darting: 4,
};
```

- [ ] **Step 2: Commit**

---

### Task 5: SpeciesLayer — InstancedMesh from species data

**Files:**
- Create: `src/globe/SpeciesLayer.ts`

- [ ] **Step 1: Create SpeciesLayer.ts**

Builds one `InstancedMesh` from all species data. Each instance is a quad positioned on the globe. Instance attributes carry UV, animation, scale.

Key methods:
- `build(species[], sheetTexture, manifest)` — populate instance buffers
- `update(time, camera)` — just update the `uTime` and `uCamPos` uniforms (GPU does the rest)
- `hitTest(camera, mouseX, mouseY, viewW, viewH)` — project instances to screen for hover/click
- `dispose()` — cleanup

The instance buffer layout per species:
- `instancePos`: vec3 (world position from latLngToVec3)
- `instanceUV`: vec4 (x, y, w, h in atlas — normalized 0-1)
- `instancePhase`: float (random)
- `instanceAnim`: float (ANIM_CODE)
- `instanceScale`: float (from display.scale × tier)

- [ ] **Step 2: Commit**

---

### Task 6: TrailLayer — animated migration lines

**Files:**
- Create: `src/globe/TrailLayer.ts`

- [ ] **Step 1: Create TrailLayer.ts**

Uses Three.js `Line2` + `LineMaterial` for thin flowing trails. Animated dash offset via uniform update.

- [ ] **Step 2: Commit**

---

### Task 7: GlobeRenderer — scene orchestrator

**Files:**
- Create: `src/globe/GlobeRenderer.ts`

- [ ] **Step 1: Create GlobeRenderer.ts**

Orchestrates: renderer, scene, camera, controls, earth mesh, atmosphere, species layer, trail layer, labels. Single RAF loop. Exposes `mount(container)`, `setTheme()`, `buildSpecies()`, `buildTrails()`, `hitTest()`, `dispose()`.

- [ ] **Step 2: Commit**

---

### Task 8: useGlobe hook — React integration

**Files:**
- Create: `src/hooks/useGlobe.ts`
- Modify: `src/components/FishGlobe.tsx`
- Delete: `src/hooks/useGlobeControls.ts`

- [ ] **Step 1: Create useGlobe.ts**

Wraps `GlobeRenderer` in a React hook with a container ref. Handles mount/unmount, theme changes, species data loading.

- [ ] **Step 2: Update FishGlobe.tsx**

Replace `<Globe>` from core with a `<div ref={containerRef}>` that `useGlobe` mounts into. Remove all `@openglobes/core` imports.

- [ ] **Step 3: Remove @openglobes/core from package.json**

- [ ] **Step 4: Commit**

---

### Task 9: Update themes and labels

**Files:**
- Modify: `src/themes/fish.ts`, `src/themes/bioluminescence.ts`, `src/themes/index.tsx`
- Modify: `src/components/GeoLabels.ts`

- [ ] **Step 1: Simplify theme type**

Remove `GlobeTheme` / `PointItem` imports from core. Define a simple local `AquaticTheme` interface with only the fields we use.

- [ ] **Step 2: Update GeoLabels to use coordUtils**

- [ ] **Step 3: Commit**

---

### Task 10: Cleanup and verify

- [ ] **Step 1: Delete old files**

```bash
rm src/sprites/SpritePointLayer.ts
rm src/sprites/MigrationSpriteLayer.ts
rm src/hooks/useGlobeControls.ts
```

- [ ] **Step 2: Run `npx tsc --noEmit`** — must pass with zero errors

- [ ] **Step 3: Test in browser** — globe renders, species visible, hover/click works, trails animate

- [ ] **Step 4: Final commit**

```bash
git commit -m "feat: drop three-globe, plain Three.js + InstancedMesh sprites"
```
