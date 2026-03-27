import * as THREE from 'three';
import type { MigrationRoute } from '../data/migrations';
import { getSpriteTexture, loadSpriteTexture, getSpriteDimensions } from './SpriteLoader';

// ---------------------------------------------------------------------------
// MigrationSpriteLayer — draws migration routes using fish sprites.
//
// Instead of abstract trail lines, places sprites of the migrating species
// along each route's path at intervals. Fish are oriented in the direction
// of travel and drift slowly forward along the route.
// ---------------------------------------------------------------------------

const ALTITUDE = 0.03;
const PX_TO_WORLD = 60;
const FISH_PER_SEGMENT = 3; // sprites between each pair of waypoints

const _camDir = new THREE.Vector3();
const _spriteDir = new THREE.Vector3();

interface RouteSprite {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  baseX: number; baseY: number; baseZ: number;
  // Direction of travel (tangent along route)
  dirX: number; dirY: number; dirZ: number;
  phase: number;
  routeId: string;
}

/** Map species scientific name → sprite filename. Built once from final.json. */
let speciesSpriteMap: Map<string, string> | null = null;

export function setSpeciesSpriteMap(species: { name: string; sprite: string }[]): void {
  speciesSpriteMap = new Map();
  for (const s of species) {
    speciesSpriteMap.set(s.name.toLowerCase(), s.sprite);
  }
}

/** Interpolate between two lat/lng points. t in [0, 1]. */
function lerpLatLng(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  t: number,
): { lat: number; lng: number } {
  return {
    lat: lat1 + (lat2 - lat1) * t,
    lng: lng1 + (lng2 - lng1) * t,
  };
}

export class MigrationSpriteLayer {
  private scene: THREE.Scene;
  private getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };
  private sprites: RouteSprite[] = [];
  private time = 0;
  private built = false;

  constructor(
    scene: THREE.Scene,
    getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number },
  ) {
    this.scene = scene;
    this.getCoords = getCoords;
  }

  build(routes: MigrationRoute[]): void {
    if (this.built) this.dispose();
    this.built = true;

    for (const route of routes) {
      // Find sprite for this species
      const spriteFile = speciesSpriteMap?.get(route.species.toLowerCase());
      if (!spriteFile) continue; // skip routes without matching sprites

      const url = `/data/sprites/${spriteFile}`;
      const wps = route.waypoints;
      if (wps.length < 2) continue;

      // Place sprites along each segment
      for (let seg = 0; seg < wps.length - 1; seg++) {
        const from = wps[seg];
        const to = wps[seg + 1];

        for (let fi = 0; fi < FISH_PER_SEGMENT; fi++) {
          const t = (fi + 0.5) / FISH_PER_SEGMENT;
          const pos = lerpLatLng(from.lat, from.lng, to.lat, to.lng, t);
          const worldPos = this.getCoords(pos.lat, pos.lng, ALTITUDE);

          // Direction: from current pos toward next waypoint
          const nextT = Math.min(1, t + 0.1);
          const nextPos = lerpLatLng(from.lat, from.lng, to.lat, to.lng, nextT);
          const nextWorld = this.getCoords(nextPos.lat, nextPos.lng, ALTITUDE);
          const dirX = nextWorld.x - worldPos.x;
          const dirY = nextWorld.y - worldPos.y;
          const dirZ = nextWorld.z - worldPos.z;
          const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;

          const material = new THREE.SpriteMaterial({
            transparent: true,
            depthWrite: false,
            depthTest: false,
            sizeAttenuation: true,
            opacity: 0.75,
          });
          const sprite = new THREE.Sprite(material);
          sprite.frustumCulled = false;
          sprite.renderOrder = 1;
          sprite.position.set(worldPos.x, worldPos.y, worldPos.z);

          // Scale from manifest dimensions (immediate)
          const spriteName = spriteFile.replace('.png', '');
          const dims = getSpriteDimensions(spriteName);
          const edgeFactor = 0.7 + 0.3 * Math.sin(t * Math.PI);
          const migScale = 0.6; // migration sprites slightly smaller than residents
          if (dims) {
            sprite.scale.set(dims.w / PX_TO_WORLD * edgeFactor * migScale, dims.h / PX_TO_WORLD * edgeFactor * migScale, 1);
          } else {
            const baseS = 80 / PX_TO_WORLD * edgeFactor * migScale;
            sprite.scale.set(baseS, baseS, 1);
          }

          sprite.userData = { route, segment: seg };
          this.scene.add(sprite);

          const phase = (seg * FISH_PER_SEGMENT + fi) * 1.7 + route.id.length;

          this.sprites.push({
            sprite, material,
            baseX: worldPos.x, baseY: worldPos.y, baseZ: worldPos.z,
            dirX: dirX / dirLen, dirY: dirY / dirLen, dirZ: dirZ / dirLen,
            phase, routeId: route.id,
          });

          // Load texture
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
    }

    console.log(`[MigrationSpriteLayer] built ${this.sprites.length} route sprites from ${routes.length} routes`);
  }

  update(camera: THREE.Camera, dt: number): void {
    if (this.sprites.length === 0) return;
    this.time += dt;

    camera.getWorldPosition(_camDir);
    _camDir.normalize();
    const cx = _camDir.x, cy = _camDir.y, cz = _camDir.z;

    for (let i = 0, len = this.sprites.length; i < len; i++) {
      const rs = this.sprites[i];

      // Inline back-face cull (avoid object allocation)
      const bx = rs.baseX, by = rs.baseY, bz = rs.baseZ;
      const invLen = 1 / (Math.sqrt(bx * bx + by * by + bz * bz) || 1);
      if ((cx * bx + cy * by + cz * bz) * invLen < 0.1) {
        if (rs.sprite.visible) rs.sprite.visible = false;
        continue;
      }
      if (!rs.sprite.visible) rs.sprite.visible = true;

      // Precomputed cross product for sway direction
      const swayX = rs.dirY * bz - rs.dirZ * by;
      const swayY = rs.dirZ * bx - rs.dirX * bz;
      const swayZ = rs.dirX * by - rs.dirY * bx;
      const swayLen = Math.sqrt(swayX * swayX + swayY * swayY + swayZ * swayZ) || 1;

      const t = this.time * 0.3 + rs.phase;
      const forward = Math.sin(t * 0.4) * 0.12;
      const sway = Math.sin(t * 1.2) * 0.03;

      rs.sprite.position.x = bx + rs.dirX * forward + (swayX / swayLen) * sway;
      rs.sprite.position.y = by + rs.dirY * forward + (swayY / swayLen) * sway;
      rs.sprite.position.z = bz + rs.dirZ * forward + (swayZ / swayLen) * sway;
    }
  }

  setVisible(visible: boolean): void {
    for (const rs of this.sprites) {
      rs.sprite.visible = visible;
    }
  }

  dispose(): void {
    for (const rs of this.sprites) {
      this.scene.remove(rs.sprite);
      rs.material.map?.dispose();
      rs.material.dispose();
    }
    this.sprites = [];
    this.built = false;
  }
}
