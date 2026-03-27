import * as THREE from 'three';
import type { Species } from '../hooks/useSpeciesData';
import { getSpriteTexture, loadSpriteTexture, getSpriteDimensions } from './SpriteLoader';

// ---------------------------------------------------------------------------
// SpritePointLayer — renders species as living creatures on the globe.
//
// Only 1 sprite per species (primary viewing spot) = 214 sprites total.
// This keeps GPU load low while covering every species on the globe.
// ---------------------------------------------------------------------------

const ALTITUDE = 0.025;
const PX_TO_WORLD = 60;

const SCALE_MAP: Record<string, number> = {
  tiny: 0.6, small: 0.8, medium: 1.0, large: 1.2, massive: 1.5,
};
const TIER_MULT: Record<string, number> = {
  star: 1.2, ecosystem: 1.0, surprise: 0.9,
};

const SESSILE = new Set(['none', 'static']);

const _camDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _normal = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _bitangent = new THREE.Vector3();

export interface SpriteEntry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  species: Species;
  baseX: number; baseY: number; baseZ: number;
  tangentX: number; tangentY: number; tangentZ: number;
  bitangentX: number; bitangentY: number; bitangentZ: number;
  phase: number;
  screenW: number; // approximate screen-space width for hit detection
  isStatic: boolean;
}

function hashNum(a: number, b: number): number {
  return (((a * 16807 + b * 48271) | 0) >>> 0) / 4294967295;
}

function computeTangents(pos: { x: number; y: number; z: number }) {
  _normal.set(pos.x, pos.y, pos.z).normalize();
  _tangent.crossVectors(_up, _normal);
  if (_tangent.lengthSq() < 0.001) _tangent.crossVectors(new THREE.Vector3(1, 0, 0), _normal);
  _tangent.normalize();
  _bitangent.crossVectors(_normal, _tangent).normalize();
}

export class SpritePointLayer {
  private scene: THREE.Scene;
  private getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };
  private entries: SpriteEntry[] = [];
  private time = 0;
  private built = false;

  constructor(
    scene: THREE.Scene,
    getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number },
  ) {
    this.scene = scene;
    this.getCoords = getCoords;
  }

  /** Build 1 sprite per species at its best viewing spot. */
  build(speciesList: Species[]): void {
    if (this.built) this.dispose();
    this.built = true;

    const reliabilityOrder: Record<string, number> = { high: 0, medium: 1, seasonal: 2 };

    for (const sp of speciesList) {
      if (sp.viewingSpots.length === 0) continue;

      // Pick best spot
      const spot = [...sp.viewingSpots].sort(
        (a, b) => (reliabilityOrder[a.reliability] ?? 2) - (reliabilityOrder[b.reliability] ?? 2),
      )[0];

      const scaleMult = (SCALE_MAP[sp.display.scale] ?? 1) * (TIER_MULT[sp.tier] ?? 1);
      const isStatic = SESSILE.has(sp.display.animation);
      const url = `/data/sprites/${sp.sprite}`;
      const spriteName = sp.sprite.replace('.png', '');

      const pos = this.getCoords(spot.lat, spot.lng, ALTITUDE);

      const material = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.frustumCulled = false;
      sprite.renderOrder = 1;
      sprite.position.set(pos.x, pos.y, pos.z);

      // Scale from manifest
      const dims = getSpriteDimensions(spriteName);
      let worldW = 80 / PX_TO_WORLD * scaleMult;
      if (dims) {
        worldW = dims.w / PX_TO_WORLD * scaleMult;
        sprite.scale.set(worldW, dims.h / PX_TO_WORLD * scaleMult, 1);
      } else {
        sprite.scale.set(worldW, worldW, 1);
      }

      sprite.userData = { species: sp };
      this.scene.add(sprite);

      // Tangent vectors for animation
      let tx = 0, ty = 0, tz = 0, bx = 0, by = 0, bz = 0;
      if (!isStatic) {
        computeTangents(pos);
        tx = _tangent.x; ty = _tangent.y; tz = _tangent.z;
        bx = _bitangent.x; by = _bitangent.y; bz = _bitangent.z;
      }

      this.entries.push({
        sprite, material, species: sp,
        baseX: pos.x, baseY: pos.y, baseZ: pos.z,
        tangentX: tx, tangentY: ty, tangentZ: tz,
        bitangentX: bx, bitangentY: by, bitangentZ: bz,
        phase: hashNum(sp.aphiaId, 0) * 100,
        screenW: worldW, // used for hit detection scaling
        isStatic,
      });

      // Texture
      const tex = getSpriteTexture(url);
      material.map = tex;
      material.needsUpdate = true;

      loadSpriteTexture(url).then((realTex) => {
        if (material.map !== realTex) {
          material.map = realTex;
          material.needsUpdate = true;
        }
      }).catch(() => {});
    }
  }

  update(camera: THREE.Camera, dt: number): void {
    if (this.entries.length === 0) return;
    this.time += dt;

    camera.getWorldPosition(_camDir);
    const cx = _camDir.x, cy = _camDir.y, cz = _camDir.z;
    const camLen = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
    const ncx = cx / camLen, ncy = cy / camLen, ncz = cz / camLen;

    for (let i = 0, len = this.entries.length; i < len; i++) {
      const e = this.entries[i];
      const bx = e.baseX, by = e.baseY, bz = e.baseZ;
      const invLen = 1 / (Math.sqrt(bx * bx + by * by + bz * bz) || 1);
      const dot = (ncx * bx + ncy * by + ncz * bz) * invLen;

      if (dot < 0.1) {
        if (e.sprite.visible) e.sprite.visible = false;
        continue;
      }
      if (!e.sprite.visible) e.sprite.visible = true;
      if (e.isStatic) continue;

      const t = this.time + e.phase;
      const anim = e.species.display.animation;
      let dx = 0, dy = 0, dz = 0;

      if (anim === 'hovering') {
        const bob = Math.sin(t * 0.8) * 0.04;
        const sway = Math.sin(t * 0.6) * 0.015;
        dx = e.tangentX * sway; dy = bob * 0.5 + e.tangentY * sway; dz = e.tangentZ * sway;
      } else if (anim === 'slow_cruise' || anim === 'schooling') {
        const sweep = Math.sin(t * 0.4) * 0.2;
        const fwd = Math.sin(t * 0.15) * 0.12 + Math.sin(t * 0.05) * 0.06;
        dx = e.tangentX * sweep + e.bitangentX * fwd;
        dy = e.tangentY * sweep + e.bitangentY * fwd;
        dz = e.tangentZ * sweep + e.bitangentZ * fwd;
      } else if (anim === 'drifting') {
        const drift = Math.sin(t * 0.15) * 0.06;
        const sway = Math.cos(t * 0.1) * 0.04;
        dx = e.tangentX * sway + e.bitangentX * drift;
        dy = e.tangentY * sway + e.bitangentY * drift;
        dz = e.tangentZ * sway + e.bitangentZ * drift;
      } else if (anim === 'darting') {
        const cycle = (t * 0.5) % 8;
        if (cycle < 0.8) {
          const burst = Math.sin(cycle / 0.8 * Math.PI) * 0.25;
          dx = e.bitangentX * burst; dy = e.bitangentY * burst; dz = e.bitangentZ * burst;
        } else {
          const sway = Math.sin(t * 0.3) * 0.03;
          dx = e.tangentX * sway; dy = e.tangentY * sway; dz = e.tangentZ * sway;
        }
      }

      e.sprite.position.x = bx + dx;
      e.sprite.position.y = by + dy;
      e.sprite.position.z = bz + dz;
    }
  }

  getEntries(): SpriteEntry[] {
    return this.entries;
  }

  dispose(): void {
    for (const e of this.entries) {
      this.scene.remove(e.sprite);
      e.material.dispose();
    }
    this.entries = [];
    this.built = false;
  }
}
