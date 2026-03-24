import * as THREE from 'three';
import type { PointItem } from '@openglobes/core';
import { getSpriteTexture, loadSpriteTexture, getBodyGroupColor } from './SpriteLoader';

// ---------------------------------------------------------------------------
// SpritePointLayer — SVG sprite quads that lie on the globe surface
// and animate with a gentle swimming motion.
//
// Uses THREE.Mesh + PlaneGeometry instead of Sprites so they orient
// tangent to the globe, giving parallax depth when the globe rotates.
// Each fish gets a random heading and swim phase for organic motion.
// ---------------------------------------------------------------------------

const POOL_SIZE = 600;
const SPRITE_SCALE = 0.8;
const ALTITUDE = 0.012;
const GLOBE_RADIUS = 100;  // three-globe default

// Swimming animation params
const SWIM_WOBBLE_AMP = 0.15;    // lateral sway (degrees)
const SWIM_WOBBLE_SPEED = 1.8;   // cycles per second
const SWIM_DRIFT_SPEED = 0.0003; // slow forward drift (world units/sec)
const SWIM_BODY_ROCK = 0.06;     // body roll amplitude (radians)

// Shared geometry — one plane reused by all meshes
let sharedGeometry: THREE.PlaneGeometry | null = null;
function getSharedGeometry(): THREE.PlaneGeometry {
  if (!sharedGeometry) {
    sharedGeometry = new THREE.PlaneGeometry(1, 0.6); // wider than tall
  }
  return sharedGeometry;
}

interface PoolEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  pointId: string | null;
  // Per-fish animation state
  heading: number;      // random heading in radians (direction fish faces)
  swimPhase: number;    // random phase offset for desync
  baseLat: number;
  baseLng: number;
}

// Reusable vectors
const _normal = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _bitangent = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _spriteDir = new THREE.Vector3();

// Simple seeded random for deterministic per-fish values
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 4294967295;
}

export class SpritePointLayer {
  private scene: THREE.Scene;
  private getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };
  private pool: PoolEntry[] = [];
  private time = 0;

  constructor(
    scene: THREE.Scene,
    getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number },
  ) {
    this.scene = scene;
    this.getCoords = getCoords;

    const geo = getSharedGeometry();

    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.visible = false;
      mesh.frustumCulled = false; // we cull manually
      scene.add(mesh);
      this.pool.push({
        mesh,
        material,
        pointId: null,
        heading: 0,
        swimPhase: 0,
        baseLat: 0,
        baseLng: 0,
      });
    }
  }

  /** Orient a mesh to lie tangent to the globe surface at the given position. */
  private orientToSurface(mesh: THREE.Mesh, pos: { x: number; y: number; z: number }, heading: number): void {
    // Normal = outward from globe center (normalized position)
    _normal.set(pos.x, pos.y, pos.z).normalize();

    // Tangent = cross(up, normal) for east direction
    _tangent.crossVectors(_up, _normal);
    if (_tangent.lengthSq() < 0.001) {
      // At poles, use a different up
      _tangent.crossVectors(new THREE.Vector3(1, 0, 0), _normal);
    }
    _tangent.normalize();

    // Bitangent = cross(normal, tangent) for north direction
    _bitangent.crossVectors(_normal, _tangent).normalize();

    // Build rotation matrix: fish faces along heading on the surface
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);
    // Forward direction on surface
    const fx = _tangent.x * cosH + _bitangent.x * sinH;
    const fy = _tangent.y * cosH + _bitangent.y * sinH;
    const fz = _tangent.z * cosH + _bitangent.z * sinH;

    // Right direction
    const rx = _tangent.x * -sinH + _bitangent.x * cosH;
    const ry = _tangent.y * -sinH + _bitangent.y * cosH;
    const rz = _tangent.z * -sinH + _bitangent.z * cosH;

    // Set rotation via matrix
    const m = mesh.matrix;
    const scale = mesh.scale;
    m.set(
      rx * scale.x, _normal.x * scale.y, fx * scale.z, pos.x,
      ry * scale.x, _normal.y * scale.y, fy * scale.z, pos.y,
      rz * scale.x, _normal.z * scale.y, fz * scale.z, pos.z,
      0, 0, 0, 1,
    );
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldNeedsUpdate = true;
  }

  syncPoints(points: PointItem[]): void {
    const isCluster = (p: PointItem) => !!(p as Record<string, unknown>)._isCluster;
    const spritePoints = points.filter(
      (p) => !isCluster(p) && (p as Record<string, unknown>).sprite,
    );

    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (i < spritePoints.length) {
        const p = spritePoints[i];
        const pAny = p as Record<string, unknown>;
        const spriteFile = pAny.sprite as string;
        const bodyGroup = (pAny.bodyGroup as string) ?? (pAny.group as string) ?? 'fish';

        // Position on globe
        const pos = this.getCoords(p.lat, p.lng, ALTITUDE);
        entry.mesh.position.set(pos.x, pos.y, pos.z);
        entry.mesh.visible = true;
        entry.pointId = p.id;
        entry.baseLat = p.lat;
        entry.baseLng = p.lng;

        // Deterministic heading and phase per fish
        const h = hashId(p.id);
        entry.heading = h * Math.PI * 2;
        entry.swimPhase = h * 100;

        // Scale by rarity
        const rarity = (p.rarity ?? 0) as number;
        const scale = SPRITE_SCALE * (1 + rarity * 0.15);
        entry.mesh.scale.set(scale, scale, scale * 0.6);

        // Orient tangent to surface
        this.orientToSurface(entry.mesh, pos, entry.heading);

        // Texture
        const url = `/data/sprites/${spriteFile}`;
        const tex = getSpriteTexture(url, bodyGroup);
        if (entry.material.map !== tex) {
          entry.material.map = tex;
          entry.material.needsUpdate = true;
        }

        const color = getBodyGroupColor(bodyGroup);
        entry.material.color.set(color);

        // Async load real texture
        loadSpriteTexture(url, bodyGroup).then((realTex) => {
          if (entry.pointId === p.id && entry.material.map !== realTex) {
            entry.material.map = realTex;
            entry.material.needsUpdate = true;
          }
        }).catch(() => {});
      } else {
        entry.mesh.visible = false;
        entry.pointId = null;
      }
    }
  }

  /** Per-frame: animate swimming + cull back-facing. */
  update(camera: THREE.Camera, dt: number): void {
    this.time += dt;

    camera.getWorldPosition(_camDir);
    _camDir.normalize();

    for (const entry of this.pool) {
      if (!entry.pointId) continue;

      // Cull back-facing
      _spriteDir.set(
        entry.mesh.position.x,
        entry.mesh.position.y,
        entry.mesh.position.z,
      ).normalize();
      const dot = _camDir.dot(_spriteDir);
      if (dot < 0.1) {
        entry.mesh.visible = false;
        continue;
      }
      entry.mesh.visible = true;

      // Swimming animation — offset lat/lng slightly
      const t = this.time * SWIM_WOBBLE_SPEED + entry.swimPhase;
      const wobbleLat = Math.sin(t) * SWIM_WOBBLE_AMP;
      const wobbleLng = Math.cos(t * 0.7) * SWIM_WOBBLE_AMP * 0.5;
      const driftLng = this.time * SWIM_DRIFT_SPEED * (entry.heading > Math.PI ? 1 : -1);

      const animLat = entry.baseLat + wobbleLat;
      const animLng = entry.baseLng + wobbleLng + driftLng;

      const pos = this.getCoords(animLat, animLng, ALTITUDE);
      entry.mesh.position.set(pos.x, pos.y, pos.z);

      // Re-orient with slight body rock
      const rockAngle = entry.heading + Math.sin(t * 1.3) * SWIM_BODY_ROCK;
      this.orientToSurface(entry.mesh, pos, rockAngle);
    }
  }

  dispose(): void {
    for (const entry of this.pool) {
      this.scene.remove(entry.mesh);
      entry.material.map?.dispose();
      entry.material.dispose();
    }
    this.pool = [];
  }
}
