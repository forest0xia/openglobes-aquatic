import * as THREE from 'three';
import { latLngToVec3, GLOBE_RADIUS } from './coordUtils';
import {
  speciesVertexShader,
  speciesFragmentShader,
  ANIM_CODE,
} from './SpeciesShader';
import { BLOOM_LAYER } from './constants';
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
  large: 0.7,
  massive: 0.8,
};

const TIER_MULT: Record<string, number> = {
  star: 1.2,
  ecosystem: 1.0,
  surprise: 0.9,
};

/** Per-species scale overrides (multiplier on final size). */
const SPECIES_SCALE: Record<string, number> = {
  '南极磷虾': 0.33,
  // Large marine animals — keep small to avoid blurry sprites
  '蓝鲸': 0.5,
  '座头鲸': 0.5,
  '灰鲸': 0.5,
  '虎鲸': 0.55,
  '抹香鲸': 0.5,
  '鲸鲨': 0.55,
  '大白鲨': 0.6,
  '姥鲨': 0.55,
  '双髻鲨': 0.6,
  '虎鲨': 0.6,
  '蝠鲼': 0.55,
  '翻车鲀': 0.6,
};

/** Sprite pixel size to world-unit conversion factor. */
const PX_TO_WORLD = 60;

/** Altitude offset so sprites float above the globe surface. */
const SPRITE_ALT = 0.015;

// ---------------------------------------------------------------------------
// Coral glow — bright emissive billboard rendered BEHIND coral sprites.
// Selective UnrealBloomPass in GlobeRenderer picks this up and produces
// a soft, physically-plausible halo.  The shader itself just outputs a
// bright radial gradient — the bloom pass handles all the soft falloff.
// ---------------------------------------------------------------------------
const GLOW_SCALE = 1.3; // glow quad = sprite × 1.4

const CORAL_GLOW_VS = `
  attribute vec3 instancePos;
  attribute vec2 instanceSize;
  attribute vec3 instanceColor;
  attribute float instancePhase;

  uniform vec3 uCamPos;
  uniform float uTime;

  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vPos;

  void main() {
    // ── Same scatter offset as main species shader ──────────
    vec3 pos = instancePos;
    vec3 normal = normalize(pos);
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    if (length(tangent) < 0.001) tangent = normalize(cross(vec3(1.0, 0.0, 0.0), normal));
    vec3 bitangent = cross(normal, tangent);
    float bodySize = max(instanceSize.x, instanceSize.y);
    float scatter = 0.5 + bodySize * 0.7;
    pos += tangent * sin(instancePhase * 1.7) * scatter
         + bitangent * cos(instancePhase * 2.3) * scatter;

    vec3 camDir = normalize(uCamPos);
    vec3 spriteDir = normalize(pos);
    float facing = dot(camDir, spriteDir);
    vAlpha = smoothstep(0.1, 0.25, facing);
    if (facing < 0.1) { gl_Position = vec4(0,-2,0,1); return; }

    vColor = instanceColor;
    vPos = position.xy;

    // Fade glow when zoomed out so cumulative bloom stays consistent
    float camDist = length(uCamPos);
    vAlpha *= smoothstep(400.0, 180.0, camDist);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec2 sz = instanceSize * ${GLOW_SCALE.toFixed(1)};
    mv.xy += position.xy * sz;
    gl_Position = projectionMatrix * mv;
  }
`;
const CORAL_GLOW_FS = `
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vPos;

  void main() {
    float d = length(vPos);
    // Smooth radial falloff — bloom handles the soft halo
    float glow = 1.0 - smoothstep(0.0, 0.5, d);
    if (glow < 0.01) discard;

    // Gentle pulse
    float pulse = 0.3 + 0.3 * sin(uTime * 2.0 + vColor.r * 15.0);

    vec3 color = vColor * 0.2 * pulse;

    gl_FragColor = vec4(color, glow * vAlpha);
  }
`;

export class SpeciesLayer {
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private glowMesh: THREE.InstancedMesh | null = null;
  private glowMat: THREE.ShaderMaterial | null = null;
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

    // Species that get extra clones packed tightly together.
    // Schooling/small species get more copies for visual density.
    const SWARM_MULT: Record<string, number> = { '南极磷虾': 5 };
    const SCHOOLING_SWARM = 3; // default swarm count for schooling-animation species
    // Species that have too many spots — halve them
    const HALVE_SPOTS = new Set(['大西洋鲟', '美洲西鲱', '北梭鱼', '斑纹银汉鱼']);
    // Large/massive species: only 1 spot per species (avoid clutter)
    const LARGE_SCALES = new Set(['large', 'massive']);

    // 1. Species viewing spots
    for (const sp of species) {
      const spriteName = sp.sprite.replace('.png', '');
      const rect = manifest.sprites[spriteName];
      if (!rect) continue;

      const isLarge = LARGE_SCALES.has(sp.display.scale);
      const isSchooling = sp.display.animation === 'schooling';
      // Large species: explicit override or 1. Schooling small fish: swarm.
      const copies = SWARM_MULT[sp.nameZh]
        ?? (isSchooling && !isLarge ? SCHOOLING_SWARM : 1);
      const halve = HALVE_SPOTS.has(sp.nameZh);
      let spotIdx = 0;

      // Large/massive species: only use the first (best) viewing spot
      const spots = isLarge ? sp.viewingSpots.slice(0, 1) : sp.viewingSpots;

      for (const spot of spots) {
        if (halve && spotIdx++ % 2 === 1) continue;
        resolved.push({ sp, spot, rect });
        // Extra clones with tiny lat/lng jitter (tight cluster, same area)
        for (let c = 1; c < copies; c++) {
          const angle = (c / copies) * Math.PI * 2 + spot.lat * 0.1;
          const jitter = isSchooling ? 0.15 : 0.3; // schooling fish cluster tighter
          resolved.push({
            sp, rect,
            spot: { ...spot, lat: spot.lat + Math.sin(angle) * jitter, lng: spot.lng + Math.cos(angle) * jitter },
          });
        }
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

    // --- Compute world positions from lat/lng ---
    // NO collision resolution, NO offsets. Every instance is at its true
    // geographic coordinate. Overlap is acceptable — better than wrong location.
    const _v = new THREE.Vector3();

    const geometry = new THREE.PlaneGeometry(1, 1);

    const posArr = new Float32Array(count * 3);
    const uvArr = new Float32Array(count * 4);
    const phaseArr = new Float32Array(count);
    const animArr = new Float32Array(count);
    const sizeArr = new Float32Array(count * 2);
    const colorArr = new Float32Array(count * 3);

    this.speciesRefs = [];
    this.spotRefs = [];
    this.positions = [];
    this.scales = [];

    const _normal = new THREE.Vector3();
    const _tangent = new THREE.Vector3();
    const _bitangent = new THREE.Vector3();
    const _up = new THREE.Vector3(0, 1, 0);
    const _right = new THREE.Vector3(1, 0, 0);

    for (let i = 0; i < count; i++) {
      const { sp, spot, rect } = resolved[i];
      latLngToVec3(spot.lat, spot.lng, GLOBE_RADIUS, SPRITE_ALT, _v);

      posArr[i * 3] = _v.x;
      posArr[i * 3 + 1] = _v.y;
      posArr[i * 3 + 2] = _v.z;

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
      const speciesScale = SPECIES_SCALE[sp.nameZh] ?? 1.0;
      const mult = scaleMult * tierMult * extra * speciesScale;
      const worldW = (rect.w / PX_TO_WORLD) * mult;
      const worldH = (rect.h / PX_TO_WORLD) * mult;
      sizeArr[i * 2] = worldW;
      sizeArr[i * 2 + 1] = worldH;
      this.scales.push(Math.max(worldW, worldH));

      // Replicate the shader scatter offset so hitTest positions match visuals.
      // Must match SpeciesShader.ts vertex shader scatter logic exactly.
      _normal.copy(_v).normalize();
      _tangent.crossVectors(_up, _normal).normalize();
      if (_tangent.length() < 0.001) _tangent.crossVectors(_right, _normal).normalize();
      _bitangent.crossVectors(_normal, _tangent);
      const bodySize = Math.max(worldW, worldH);
      const scatter = 0.5 + bodySize * 0.7;
      const scattered = _v.clone();
      scattered.addScaledVector(_tangent, Math.sin(phaseArr[i] * 1.7) * scatter);
      scattered.addScaledVector(_bitangent, Math.cos(phaseArr[i] * 2.3) * scatter);
      this.positions.push(scattered);

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
    // No instancePosFar — positions are always at true geographic coordinates

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

    // --- Glow for corals + select reef species --------------------------------
    const GLOW_SPECIES = new Set([
      '迷宫脑珊瑚', '叶片脑珊瑚', '团块滨珊瑚', '火珊瑚', '棘冠海星', '大砗磲',
    ]);
    const coralIdx: number[] = [];
    for (let i = 0; i < count; i++) {
      if (animArr[i] < 0.5 || GLOW_SPECIES.has(resolved[i].sp.nameZh)) {
        coralIdx.push(i);
      }
    }

    if (coralIdx.length > 0) {
      const n = coralIdx.length;
      const gGeo = new THREE.PlaneGeometry(1, 1);
      const gPos = new Float32Array(n * 3);
      const gSz  = new Float32Array(n * 2);
      const gCol = new Float32Array(n * 3);
      const gPh  = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        const i = coralIdx[j];
        gPos[j*3] = posArr[i*3]; gPos[j*3+1] = posArr[i*3+1]; gPos[j*3+2] = posArr[i*3+2];
        gSz[j*2] = sizeArr[i*2]; gSz[j*2+1] = sizeArr[i*2+1];
        gCol[j*3] = colorArr[i*3]; gCol[j*3+1] = colorArr[i*3+1]; gCol[j*3+2] = colorArr[i*3+2];
        gPh[j] = phaseArr[i];
      }
      gGeo.setAttribute('instancePos',   new THREE.InstancedBufferAttribute(gPos, 3));
      gGeo.setAttribute('instanceSize',  new THREE.InstancedBufferAttribute(gSz, 2));
      gGeo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(gCol, 3));
      gGeo.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(gPh, 1));

      this.glowMat = new THREE.ShaderMaterial({
        vertexShader: CORAL_GLOW_VS, fragmentShader: CORAL_GLOW_FS,
        uniforms: { uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() } },
        transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      this.glowMesh = new THREE.InstancedMesh(gGeo, this.glowMat, n);
      this.glowMesh.frustumCulled = false;
      this.glowMesh.renderOrder = 9; // before sprites (10)
      this.glowMesh.layers.enable(BLOOM_LAYER); // selective bloom picks this up
      const id = new THREE.Matrix4();
      for (let j = 0; j < n; j++) this.glowMesh.setMatrixAt(j, id);
      this.glowMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(this.glowMesh);
      console.log(`[SpeciesLayer] coral glow: ${n} instances`);
    }

    console.log(`[SpeciesLayer] built ${count} instances from ${species.length} species` +
      (migrationRoutes ? ` + ${migrationRoutes.length} routes` : ''));
  }

  // -------------------------------------------------------------------------
  // highlight — set which instance is hovered/selected (1.3x scale in shader)
  // -------------------------------------------------------------------------

  /** Show or hide the entire species layer. */
  setVisible(visible: boolean): void {
    if (this.mesh) this.mesh.visible = visible;
  }

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
    if (this.glowMat) {
      this.glowMat.uniforms.uTime.value = time;
      this.glowMat.uniforms.uCamPos.value.copy(camera.position);
    }

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
    if (this.glowMesh) {
      this.scene.remove(this.glowMesh);
      this.glowMesh.geometry.dispose();
      this.glowMesh = null;
    }
    if (this.glowMat) { this.glowMat.dispose(); this.glowMat = null; }
    this.speciesRefs = [];
    this.spotRefs = [];
    this.positions = [];
    this.scales = [];
  }
}
