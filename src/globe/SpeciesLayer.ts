import * as THREE from 'three';
import { latLngToVec3, GLOBE_RADIUS } from './coordUtils';
import {
  speciesVertexShader,
  speciesFragmentShader,
  ANIM_CODE,
} from './SpeciesShader';
import type { Species, ViewingSpot } from '../hooks/useSpeciesData';

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

/** Reliability ranking — lower is better. */
const RELIABILITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  seasonal: 2,
};

/** Altitude offset so sprites float just above the globe surface. */
const SPRITE_ALT = 0.005;

/**
 * Pick the best viewing spot for a species.
 * Sorts by reliability (high > medium > seasonal) and returns the first.
 */
function bestSpot(spots: ViewingSpot[]): ViewingSpot | null {
  if (spots.length === 0) return null;
  if (spots.length === 1) return spots[0];
  return [...spots].sort(
    (a, b) =>
      (RELIABILITY_RANK[a.reliability] ?? 2) -
      (RELIABILITY_RANK[b.reliability] ?? 2),
  )[0];
}

export class SpeciesLayer {
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  /** Index i corresponds to instance i — used by hitTest to return the Species. */
  private speciesRefs: Species[] = [];
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
  build(
    species: Species[],
    atlasTexture: THREE.Texture,
    manifest: {
      sprites: Record<string, { x: number; y: number; w: number; h: number }>;
    },
    sheetWidth: number,
    sheetHeight: number,
  ): void {
    // Dispose previous mesh if rebuilding
    this.dispose();

    // --- Filter to species that have a usable spot + manifest entry ----------
    type Resolved = {
      sp: Species;
      spot: ViewingSpot;
      rect: { x: number; y: number; w: number; h: number };
    };

    const resolved: Resolved[] = [];
    for (const sp of species) {
      const spot = bestSpot(sp.viewingSpots);
      if (!spot) continue;

      // Sprite name: strip ".png" from the sprite field (e.g. "sp-blue_whale.png" → "sp-blue_whale")
      const spriteName = sp.sprite.replace('.png', '');
      const rect = manifest.sprites[spriteName];
      if (!rect) continue;

      resolved.push({ sp, spot, rect });
    }

    const count = resolved.length;
    if (count === 0) return;

    // --- Geometry (unit quad) ------------------------------------------------
    const geometry = new THREE.PlaneGeometry(1, 1);

    // --- Instance attributes -------------------------------------------------
    const posArr = new Float32Array(count * 3);
    const uvArr = new Float32Array(count * 4);
    const phaseArr = new Float32Array(count);
    const animArr = new Float32Array(count);
    const scaleArr = new Float32Array(count);

    this.speciesRefs = [];
    this.positions = [];
    this.scales = [];

    const _v = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const { sp, spot, rect } = resolved[i];

      // World position
      latLngToVec3(spot.lat, spot.lng, GLOBE_RADIUS, SPRITE_ALT, _v);
      posArr[i * 3] = _v.x;
      posArr[i * 3 + 1] = _v.y;
      posArr[i * 3 + 2] = _v.z;
      this.positions.push(_v.clone());

      // UV rect (normalized to sheet)
      uvArr[i * 4] = rect.x / sheetWidth;
      uvArr[i * 4 + 1] = rect.y / sheetHeight;
      uvArr[i * 4 + 2] = rect.w / sheetWidth;
      uvArr[i * 4 + 3] = rect.h / sheetHeight;

      // Random phase so animations aren't synchronized
      phaseArr[i] = Math.random() * Math.PI * 2 * 20; // wide range for variety

      // Animation code
      animArr[i] = ANIM_CODE[sp.display.animation] ?? 0;

      // Scale
      const scaleMult = SCALE_MAP[sp.display.scale] ?? 1.0;
      const tierMult = TIER_MULT[sp.tier] ?? 1.0;
      const worldScale = (rect.w / PX_TO_WORLD) * scaleMult * tierMult;
      scaleArr[i] = worldScale;
      this.scales.push(worldScale);

      this.speciesRefs.push(sp);
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
      'instanceScale',
      new THREE.InstancedBufferAttribute(scaleArr, 1),
    );

    // --- Material ------------------------------------------------------------
    this.material = new THREE.ShaderMaterial({
      vertexShader: speciesVertexShader,
      fragmentShader: speciesFragmentShader,
      uniforms: {
        uAtlas: { value: atlasTexture },
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // --- InstancedMesh -------------------------------------------------------
    // We use a dummy identity matrix for each instance because the vertex
    // shader positions sprites via instancePos + billboard offset.
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.mesh.frustumCulled = false; // shader handles back-face culling

    // Set all instance matrices to identity (positioning is in shader)
    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, identity);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.scene.add(this.mesh);
  }

  // -------------------------------------------------------------------------
  // update — called every frame
  // -------------------------------------------------------------------------

  /**
   * Update per-frame uniforms. The GPU handles all animation.
   */
  update(time: number, camera: THREE.Camera): void {
    if (!this.material) return;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCamPos.value.copy(camera.position);
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
   * @returns The Species under the cursor, or null
   */
  hitTest(
    camera: THREE.Camera,
    mouseX: number,
    mouseY: number,
    viewW: number,
    viewH: number,
  ): Species | null {
    if (this.positions.length === 0) return null;

    const _proj = new THREE.Vector3();
    let bestDist = Infinity;
    let bestIdx = -1;
    const halfW = viewW / 2;
    const halfH = viewH / 2;

    for (let i = 0; i < this.positions.length; i++) {
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

      // Compute approximate projected size for hit radius.
      // Project a point offset by instanceScale to estimate screen-space size.
      const scale = this.scales[i] ?? 1;
      // Rough projected size: scale / distance-to-camera * focal factor
      const camDist = camera.position.distanceTo(this.positions[i]);
      const fov =
        'fov' in camera ? (camera as THREE.PerspectiveCamera).fov : 50;
      const projectedSize =
        camDist > 0
          ? (scale / camDist) *
            (viewH / (2 * Math.tan(((fov / 2) * Math.PI) / 180)))
          : 25;

      const hitRadius = Math.max(25, projectedSize * 0.6);

      if (dist < hitRadius && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    return bestIdx >= 0 ? this.speciesRefs[bestIdx] : null;
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
    this.positions = [];
    this.scales = [];
  }
}
