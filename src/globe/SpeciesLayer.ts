import * as THREE from 'three';
import { latLngToVec3, GLOBE_RADIUS } from './coordUtils';
import {
  speciesVertexShader,
  speciesFragmentShader,
  ANIM_CODE,
} from './SpeciesShader';
import type { Species, ViewingSpot } from '../hooks/useSpeciesData';
import type { MigrationRoute } from '../data/migrations';

// ---------------------------------------------------------------------------
// SpeciesLayer — one InstancedMesh for all ~214 species sprites.
//
// Each species is placed at its highest-reliability viewing spot.
// The GPU spritesheet atlas is sampled per-instance via instanceUV.
// Animation, billboarding, and back-face culling happen in the shader.
// ---------------------------------------------------------------------------

const SCALE_MAP: Record<string, number> = {
  tiny: 0.6,
  small: 0.8,
  medium: 1.0,
  large: 1.2,
  massive: 1.5,
};

const TIER_MULT: Record<string, number> = {
  star: 1.2,
  ecosystem: 1.0,
  surprise: 0.9,
};

/** Sprite pixel size to world-unit conversion factor. */
const PX_TO_WORLD = 60;

/** Altitude offset so sprites float above the globe surface (avoids z-fighting). */
const SPRITE_ALT = 0.02;

export class SpeciesLayer {
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  /** Index i corresponds to instance i — used by hitTest to return the Species. */
  private speciesRefs: Species[] = [];
  /** Lat/lng of each instance for flyTo. */
  private spotRefs: { lat: number; lng: number }[] = [];
  /** Cached world positions for hit testing (one per instance). */
  private positions: THREE.Vector3[] = [];
  /** Cached instance scales for hit-test radius calculation. */
  private scales: number[] = [];

  constructor(private scene: THREE.Scene) {}

  // -------------------------------------------------------------------------
  // build
  // -------------------------------------------------------------------------

  /**
   * Build instance buffers from species data.
   *
   * @param species      Full species array from useSpeciesData
   * @param atlasTexture The loaded spritesheet atlas as a THREE.Texture
   * @param manifest     The spritesheet manifest (needs `sprites` map)
   * @param sheetWidth   Atlas texture width in pixels
   * @param sheetHeight  Atlas texture height in pixels
   */
  /** Number of fish placed per route segment (between two waypoints). */
  static FISH_PER_SEGMENT = 4;

  // Reusable vectors for hitTest (avoid per-call allocation → GC pressure)
  private static _htProj = new THREE.Vector3();
  private static _htCamDir = new THREE.Vector3();
  private static _htSpriteDir = new THREE.Vector3();

  build(
    species: Species[],
    atlasTexture: THREE.Texture,
    manifest: {
      sprites: Record<string, { x: number; y: number; w: number; h: number }>;
    },
    sheetWidth: number,
    sheetHeight: number,
    migrationRoutes?: MigrationRoute[],
  ): void {
    this.dispose();

    // --- Resolved entry: one per visible instance ---
    type Resolved = {
      sp: Species;
      spot: ViewingSpot;
      rect: { x: number; y: number; w: number; h: number };
      scaleFactor?: number; // optional override (migration fish are smaller)
    };

    const resolved: Resolved[] = [];

    // 1. Species viewing spots
    for (const sp of species) {
      const spriteName = sp.sprite.replace('.png', '');
      const rect = manifest.sprites[spriteName];
      if (!rect) continue;
      for (const spot of sp.viewingSpots) {
        resolved.push({ sp, spot, rect });
      }
    }

    // 2. Migration route fish — place sprites along each route path
    if (migrationRoutes) {
      // Build name lookup from species list for Chinese names
      const nameMap = new Map<string, { nameZh: string; taglineZh: string }>();
      for (const sp of species) {
        nameMap.set(sp.scientificName.toLowerCase(), {
          nameZh: sp.nameZh,
          taglineZh: sp.tagline.zh,
        });
        nameMap.set(sp.name.toLowerCase(), {
          nameZh: sp.nameZh,
          taglineZh: sp.tagline.zh,
        });
      }

      for (const route of migrationRoutes) {
        const sci = route.species.toLowerCase().replace(/ /g, '_');
        const spriteKey = `sp-${sci}`;
        const rect = manifest.sprites[spriteKey];
        if (!rect) continue;

        // Look up Chinese name: species data first, then route's own nameZh field
        const match = nameMap.get(route.species.toLowerCase());
        const routeNameZh = match?.nameZh || route.nameZh || '';

        // Skip routes without Chinese name — don't show English-only fish
        if (!routeNameZh) continue;

        const routeSpecies: Species = {
          aphiaId: 0,
          tier: 'ecosystem',
          name: route.species,
          nameZh: routeNameZh,
          tagline: {
            en: route.description || route.name,
            zh: match?.taglineZh || route.descriptionZh || route.name,
          },
          scientificName: route.species,
          sprite: `${spriteKey}.png`,
          display: { color: '#4cc9f0', animation: 'slow_cruise', scale: 'small' },
          viewingSpots: [],
        };

        const wps = route.waypoints;
        for (let seg = 0; seg < wps.length - 1; seg++) {
          const from = wps[seg];
          const to = wps[seg + 1];
          for (let fi = 0; fi < SpeciesLayer.FISH_PER_SEGMENT; fi++) {
            const t = (fi + 0.5) / SpeciesLayer.FISH_PER_SEGMENT;
            const lat = from.lat + (to.lat - from.lat) * t;
            const lng = from.lng + (to.lng - from.lng) * t;
            resolved.push({
              sp: routeSpecies,
              spot: { name: route.name, country: '', lat, lng, season: '', reliability: 'medium', activity: 'whale_watching' },
              rect,
              scaleFactor: 0.6, // migration fish are smaller
            });
          }
        }
      }
    }

    const count = resolved.length;
    if (count === 0) return;

    // --- Classification: separate corals (static) from mobile species ---
    const isStatic: boolean[] = [];
    for (let i = 0; i < count; i++) {
      const anim = resolved[i].sp.display.animation as string;
      isStatic.push(anim === 'static' || anim === 'none');
    }

    // --- Compute raw world positions from lat/lng ---
    const rawPositions: THREE.Vector3[] = [];
    const _v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      latLngToVec3(resolved[i].spot.lat, resolved[i].spot.lng, GLOBE_RADIUS, SPRITE_ALT, _v);
      rawPositions.push(_v.clone());
    }

    // --- Single collision resolution pass ---
    // Corals can be close together (MIN_DIST=1.5), mobile species need more space (MIN_DIST=3.0).
    // Mobile species are also pushed AWAY from nearby corals so they orbit around reef clusters.
    const positions = rawPositions.map(p => p.clone());
    const _push = new THREE.Vector3();
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = positions[j].x - positions[i].x;
          const dy = positions[j].y - positions[i].y;
          const dz = positions[j].z - positions[i].z;
          const distSq = dx * dx + dy * dy + dz * dz;

          // Min distance depends on types
          const bothStatic = isStatic[i] && isStatic[j];
          const eitherMobile = !isStatic[i] || !isStatic[j];
          const minDist = bothStatic ? 1.5 : eitherMobile ? 3.0 : 2.0;

          if (distSq < minDist * minDist && distSq > 0.001) {
            const dist = Math.sqrt(distSq);
            const overlap = (minDist - dist) * 0.5;
            _push.set(dx / dist * overlap, dy / dist * overlap, dz / dist * overlap);

            // If one is coral and other is mobile, only push the mobile one
            if (isStatic[i] && !isStatic[j]) {
              positions[j].add(_push).add(_push); // double push on mobile
            } else if (!isStatic[i] && isStatic[j]) {
              positions[i].sub(_push).sub(_push);
            } else {
              positions[i].sub(_push);
              positions[j].add(_push);
            }
            positions[i].normalize().multiplyScalar(GLOBE_RADIUS * (1 + SPRITE_ALT));
            positions[j].normalize().multiplyScalar(GLOBE_RADIUS * (1 + SPRITE_ALT));
          }
        }
      }
    }

    // --- Compute spread offset vectors (fixed direction per instance) ---
    // offset = resolved_position - raw_position, then extended for far zoom.
    // This ensures: close zoom → small offset, far zoom → proportionally larger
    // offset in the SAME direction. No position swaps ever.
    const offsets: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      offsets.push(positions[i].clone().sub(rawPositions[i]));
    }

    // --- Geometry (unit quad) ------------------------------------------------
    const geometry = new THREE.PlaneGeometry(1, 1);

    // --- Instance attributes -------------------------------------------------
    // instancePos = raw position (true geographic location)
    // instancePosFar = offset vector (direction to spread)
    // Shader: finalPos = instancePos + instancePosFar * spreadFactor
    const posArr = new Float32Array(count * 3);
    const offsetArr = new Float32Array(count * 3);
    const uvArr = new Float32Array(count * 4);
    const phaseArr = new Float32Array(count);
    const animArr = new Float32Array(count);
    const sizeArr = new Float32Array(count * 2);
    const colorArr = new Float32Array(count * 3);

    this.speciesRefs = [];
    this.spotRefs = [];
    this.positions = [];
    this.scales = [];

    for (let i = 0; i < count; i++) {
      const { sp, spot, rect } = resolved[i];
      const rawPos = rawPositions[i];
      const offset = offsets[i];

      posArr[i * 3] = rawPos.x;
      posArr[i * 3 + 1] = rawPos.y;
      posArr[i * 3 + 2] = rawPos.z;
      // Store offset × 3 so shader can scale up to 3x the collision offset
      offsetArr[i * 3] = offset.x * 3.0;
      offsetArr[i * 3 + 1] = offset.y * 3.0;
      offsetArr[i * 3 + 2] = offset.z * 3.0;
      this.positions.push(rawPos);

      // UV rect (normalized to sheet)
      uvArr[i * 4] = rect.x / sheetWidth;
      uvArr[i * 4 + 1] = rect.y / sheetHeight;
      uvArr[i * 4 + 2] = rect.w / sheetWidth;
      uvArr[i * 4 + 3] = rect.h / sheetHeight;

      // Random phase so animations aren't synchronized
      phaseArr[i] = Math.random() * Math.PI * 2 * 20; // wide range for variety

      // Animation code
      animArr[i] = ANIM_CODE[sp.display.animation] ?? 0;

      // Size (width/height in world units, preserving aspect ratio)
      const scaleMult = SCALE_MAP[sp.display.scale] ?? 1.0;
      const tierMult = TIER_MULT[sp.tier] ?? 1.0;
      const extra = resolved[i].scaleFactor ?? 1.0;
      const mult = scaleMult * tierMult * extra;
      const worldW = (rect.w / PX_TO_WORLD) * mult;
      const worldH = (rect.h / PX_TO_WORLD) * mult;
      sizeArr[i * 2] = worldW;
      sizeArr[i * 2 + 1] = worldH;
      this.scales.push(Math.max(worldW, worldH));

      // Glow color from species display.color
      const hexColor = sp.display.color || '#4cc9f0';
      const r = parseInt(hexColor.slice(1, 3), 16) / 255;
      const g = parseInt(hexColor.slice(3, 5), 16) / 255;
      const b = parseInt(hexColor.slice(5, 7), 16) / 255;
      colorArr[i * 3] = r;
      colorArr[i * 3 + 1] = g;
      colorArr[i * 3 + 2] = b;

      this.speciesRefs.push(sp);
      this.spotRefs.push({ lat: spot.lat, lng: spot.lng });
    }

    // Attach instanced attributes to geometry
    geometry.setAttribute(
      'instancePos',
      new THREE.InstancedBufferAttribute(posArr, 3),
    );
    geometry.setAttribute(
      'instanceUV',
      new THREE.InstancedBufferAttribute(uvArr, 4),
    );
    geometry.setAttribute(
      'instancePhase',
      new THREE.InstancedBufferAttribute(phaseArr, 1),
    );
    geometry.setAttribute(
      'instanceAnim',
      new THREE.InstancedBufferAttribute(animArr, 1),
    );
    geometry.setAttribute(
      'instanceSize',
      new THREE.InstancedBufferAttribute(sizeArr, 2),
    );
    geometry.setAttribute(
      'instanceColor',
      new THREE.InstancedBufferAttribute(colorArr, 3),
    );
    geometry.setAttribute(
      'instancePosFar',
      new THREE.InstancedBufferAttribute(offsetArr, 3),
    );

    // --- Material ------------------------------------------------------------
    this.material = new THREE.ShaderMaterial({
      vertexShader: speciesVertexShader,
      fragmentShader: speciesFragmentShader,
      uniforms: {
        uAtlas: { value: atlasTexture },
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uHighlightIdx: { value: -1 },
        uHighlightScale: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false, // always render on top of globe surface
      side: THREE.DoubleSide,
    });

    // --- InstancedMesh -------------------------------------------------------
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.mesh.frustumCulled = false; // shader handles back-face culling
    this.mesh.renderOrder = 10; // render after globe + atmosphere

    // Set all instance matrices to identity (positioning is in shader)
    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, identity);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.mesh);
    console.log(`[SpeciesLayer] built ${count} instances from ${species.length} species` +
      (migrationRoutes ? ` + ${migrationRoutes.length} routes` : ''));
  }

  // -------------------------------------------------------------------------
  // highlight — set which instance is hovered/selected (1.3x scale in shader)
  // -------------------------------------------------------------------------

  /** Set the highlighted instance index. -1 = none. */
  setHighlight(idx: number): void {
    if (this.material) {
      this.material.uniforms.uHighlightIdx.value = idx;
    }
  }

  /** Find the instance index for a species at a given lat/lng. */
  findInstanceIndex(species: Species, lat: number, lng: number): number {
    for (let i = 0; i < this.speciesRefs.length; i++) {
      if (this.speciesRefs[i] === species) {
        const spot = this.spotRefs[i];
        if (Math.abs(spot.lat - lat) < 0.01 && Math.abs(spot.lng - lng) < 0.01) {
          return i;
        }
      }
    }
    // Fallback: find any instance of this species
    return this.speciesRefs.indexOf(species);
  }

  // -------------------------------------------------------------------------
  // update — called every frame
  // -------------------------------------------------------------------------

  private highlightT = 0; // 0→1 animation progress
  private highlightDir = 0; // 1=growing, -1=shrinking, 0=idle

  update(time: number, camera: THREE.Camera): void {
    if (!this.material) return;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCamPos.value.copy(camera.position);

    // Smooth highlight animation with ease-out cubic curve
    const wantHighlight = this.material.uniforms.uHighlightIdx.value >= 0;
    if (wantHighlight && this.highlightT < 1) {
      this.highlightT = Math.min(1, this.highlightT + 0.04); // ~25 frames = ~400ms
    } else if (!wantHighlight && this.highlightT > 0) {
      this.highlightT = Math.max(0, this.highlightT - 0.06); // shrink slightly faster
    }
    // Ease-out cubic: fast start, gentle end
    const eased = 1 - Math.pow(1 - this.highlightT, 3);
    this.material.uniforms.uHighlightScale.value = 1.0 + eased * 0.3; // 1.0 → 1.3
  }

  // -------------------------------------------------------------------------
  // hitTest — screen-space picking
  // -------------------------------------------------------------------------

  /**
   * Project all instance positions to screen space and find the closest
   * to the given cursor position.
   *
   * @param camera  The active camera
   * @param mouseX  Cursor x in pixels (0 = left edge)
   * @param mouseY  Cursor y in pixels (0 = top edge)
   * @param viewW   Viewport width in pixels
   * @param viewH   Viewport height in pixels
   * @returns The Species + location under the cursor, or null
   */
  hitTest(
    camera: THREE.Camera,
    mouseX: number,
    mouseY: number,
    viewW: number,
    viewH: number,
  ): { species: Species; lat: number; lng: number } | null {
    if (this.positions.length === 0) return null;

    const _proj = SpeciesLayer._htProj;
    const _camDir = SpeciesLayer._htCamDir;
    const _spriteDir = SpeciesLayer._htSpriteDir;
    let bestDist = Infinity;
    let bestIdx = -1;
    const halfW = viewW / 2;
    const halfH = viewH / 2;

    // Camera direction for back-face check (same logic as the shader)
    camera.getWorldPosition(_camDir);
    _camDir.normalize();

    for (let i = 0; i < this.positions.length; i++) {
      // Back-face check: skip fish on the far side of the globe
      _spriteDir.copy(this.positions[i]).normalize();
      const facing = _camDir.dot(_spriteDir);
      if (facing < 0.1) continue; // matches shader cull threshold

      _proj.copy(this.positions[i]);
      _proj.project(camera);

      // Behind camera check
      if (_proj.z > 1) continue;

      // Convert NDC to screen pixels
      const sx = (1 + _proj.x) * halfW;
      const sy = (1 - _proj.y) * halfH;

      const dx = sx - mouseX;
      const dy = sy - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Hit radius from projected size — tighter max to avoid phantom hits
      const scale = this.scales[i] ?? 1;
      const camDist = camera.position.distanceTo(this.positions[i]);
      const fov =
        'fov' in camera ? (camera as THREE.PerspectiveCamera).fov : 50;
      const projectedSize =
        camDist > 0
          ? (scale / camDist) *
            (viewH / (2 * Math.tan(((fov / 2) * Math.PI) / 180)))
          : 15;

      // Tighter hit radius: max 20px minimum (was 25), 50% of projected size (was 60%)
      const hitRadius = Math.max(15, Math.min(projectedSize * 0.5, 60));

      if (dist < hitRadius && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) return null;
    const spot = this.spotRefs[bestIdx];
    return { species: this.speciesRefs[bestIdx], lat: spot.lat, lng: spot.lng };
  }

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  dispose(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    this.speciesRefs = [];
    this.spotRefs = [];
    this.positions = [];
    this.scales = [];
  }
}
