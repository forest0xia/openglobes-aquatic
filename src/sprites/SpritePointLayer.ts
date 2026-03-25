import * as THREE from 'three';
import type { PointItem } from '@openglobes/core';
import { getSpriteTexture, loadSpriteTexture, markNeeded } from './SpriteLoader';

// ---------------------------------------------------------------------------
// SpritePointLayer — unified PNG sprite billboards for ALL points.
//
// - Sprites render at their actual PNG pixel size (sizeAttenuation: false)
// - Pool is reassigned only when DATA changes, not on camera rotation
// - Camera rotation only toggles back-face visibility (stable display)
// - Sessile organisms (corals, sponges) don't animate
// - Clusters show the largest species as representative
// ---------------------------------------------------------------------------

const POOL_SIZE = 400;
const ALTITUDE = 0.012;

// Screen-space sizing: 1 unit = full viewport height.
const PX_DIVISOR = 1200;

const BADGE_SCALE = 0.02;

// Screen-space density culling: min pixel gap between sprite centers.
const MIN_SCREEN_SPACING = 56;

// Swimming animation (mobile species only)
const SWIM_AMP = 0.08;
const SWIM_SPEED = 1.8;
const SWIM_DRIFT = 0.00015;

const VISIBLE_DOT_THRESHOLD = 0.05;

const SESSILE_GROUPS = new Set([
  'coral', 'sponge', 'anemone', 'tunicate', 'barnacle',
  'bryozoan', 'hydroid', 'sea_fan', 'sea_pen',
]);

interface PoolEntry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  badge: THREE.Sprite;
  badgeMaterial: THREE.SpriteMaterial;
  pointId: string | null;
  spriteUrl: string | null;
  isCluster: boolean;
  isSessile: boolean;
  heading: number;
  swimPhase: number;
  baseX: number; baseY: number; baseZ: number;
  tangentX: number; tangentY: number; tangentZ: number;
  bitangentX: number; bitangentY: number; bitangentZ: number;
}

const _camDir = new THREE.Vector3();
const _spriteDir = new THREE.Vector3();
const _tmpPos = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _tangent = new THREE.Vector3();
const _bitangent = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _proj = new THREE.Vector3();

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 4294967295;
}

const badgeCache = new Map<string, THREE.CanvasTexture>();

function getBadgeTexture(count: number): THREE.CanvasTexture {
  const label = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  const cached = badgeCache.get(label);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSize = 22;
  ctx.font = `600 ${fontSize}px 'DM Sans', sans-serif`;
  const textW = Math.ceil(ctx.measureText(label).width);
  const pad = 8;
  canvas.width = textW + pad * 2;
  canvas.height = fontSize + pad;

  ctx.fillStyle = 'rgba(8, 16, 32, 0.8)';
  const r = canvas.height / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(76, 201, 240, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, canvas.width - 1, canvas.height - 1, r);
  ctx.stroke();
  ctx.fillStyle = 'rgba(76, 201, 240, 0.9)';
  ctx.font = `600 ${fontSize}px 'DM Sans', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  badgeCache.set(label, tex);
  return tex;
}

function getSpriteInfo(p: PointItem): { file: string; group: string } | null {
  const pAny = p as Record<string, unknown>;
  if (pAny.sprite) return { file: pAny.sprite as string, group: (pAny.group as string) ?? '' };

  if (pAny._isCluster) {
    const topItems = pAny._topItems as { sprite?: string; size?: number; group?: string }[] | undefined;
    if (topItems) {
      let best: typeof topItems[0] | null = null;
      let bestSize = -1;
      for (const item of topItems) {
        if (!item.sprite) continue;
        const size = item.size ?? 0;
        if (size > bestSize || best === null) { bestSize = size; best = item; }
      }
      if (best) return { file: best.sprite!, group: best.group ?? '' };
    }
  }
  return null;
}

function computeTangents(pos: { x: number; y: number; z: number }): void {
  _normal.set(pos.x, pos.y, pos.z).normalize();
  _tangent.crossVectors(_up, _normal);
  if (_tangent.lengthSq() < 0.001) _tangent.crossVectors(new THREE.Vector3(1, 0, 0), _normal);
  _tangent.normalize();
  _bitangent.crossVectors(_normal, _tangent).normalize();
}

export class SpritePointLayer {
  private scene: THREE.Scene;
  private getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };
  private pool: PoolEntry[] = [];
  private time = 0;
  private lastPointsRef: PointItem[] | null = null;

  constructor(
    scene: THREE.Scene,
    getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number },
  ) {
    this.scene = scene;
    this.getCoords = getCoords;

    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
        sizeAttenuation: false, // render at fixed screen-pixel size
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.frustumCulled = false;
      scene.add(sprite);

      const badgeMaterial = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
        sizeAttenuation: false,
      });
      const badge = new THREE.Sprite(badgeMaterial);
      badge.visible = false;
      badge.frustumCulled = false;
      scene.add(badge);

      this.pool.push({
        sprite, material, badge, badgeMaterial,
        pointId: null, spriteUrl: null,
        isCluster: false, isSessile: false,
        heading: 0, swimPhase: 0,
        baseX: 0, baseY: 0, baseZ: 0,
        tangentX: 0, tangentY: 0, tangentZ: 0,
        bitangentX: 0, bitangentY: 0, bitangentZ: 0,
      });
    }
  }

  /**
   * Reassign pool slots. Called ONLY when displayPoints data changes
   * (new tiles loaded, filters changed). NOT called on camera rotation.
   */
  syncPoints(points: PointItem[], camera: THREE.Camera): void {
    // Only re-sync when data reference changes
    if (points === this.lastPointsRef) return;
    this.lastPointsRef = points;

    camera.getWorldPosition(_camDir);
    _camDir.normalize();

    // 1. Hemisphere filter
    type Scored = {
      p: PointItem; dot: number;
      pos: { x: number; y: number; z: number };
      info: { file: string; group: string };
    };
    const scored: Scored[] = [];
    for (const p of points) {
      const info = getSpriteInfo(p);
      if (!info) continue;
      const pos = this.getCoords(p.lat, p.lng, ALTITUDE);
      _tmpPos.set(pos.x, pos.y, pos.z).normalize();
      const dot = _camDir.dot(_tmpPos);
      if (dot > VISIBLE_DOT_THRESHOLD) scored.push({ p, dot, pos, info });
    }
    scored.sort((a, b) => b.dot - a.dot);

    // 2. Screen-space density culling
    const viewW = window.innerWidth || 1920;
    const viewH = window.innerHeight || 1080;
    const cell = MIN_SCREEN_SPACING;
    const cols = Math.ceil(viewW / cell) + 1;
    const occupied = new Set<number>();
    const visible: typeof scored = [];

    for (const item of scored) {
      if (visible.length >= POOL_SIZE) break;
      _proj.set(item.pos.x, item.pos.y, item.pos.z).project(camera);
      const sx = ((_proj.x + 1) / 2) * viewW;
      const sy = ((1 - _proj.y) / 2) * viewH;
      const col = Math.floor(sx / cell);
      const row = Math.floor(sy / cell);
      const key = row * cols + col;

      let tooClose = false;
      for (let dr = -1; dr <= 1 && !tooClose; dr++) {
        for (let dc = -1; dc <= 1 && !tooClose; dc++) {
          if (occupied.has((row + dr) * cols + (col + dc))) tooClose = true;
        }
      }
      if (tooClose) continue;
      occupied.add(key);
      visible.push(item);
    }

    // 3. Collect needed URLs
    const urls: string[] = [];
    for (const { info } of visible) urls.push(`/data/sprites/${info.file}`);
    markNeeded(urls);

    // 4. Stable pool assignment
    const currentMap = new Map<string, number>();
    for (let i = 0; i < this.pool.length; i++) {
      const id = this.pool[i].pointId;
      if (id) currentMap.set(id, i);
    }
    const targetIds = new Set<string>();
    for (const { p } of visible) targetIds.add(p.id);

    const freeSlots: number[] = [];
    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (entry.pointId && !targetIds.has(entry.pointId)) {
        entry.sprite.visible = false;
        entry.badge.visible = false;
        entry.pointId = null;
        entry.spriteUrl = null;
        freeSlots.push(i);
      } else if (!entry.pointId) {
        freeSlots.push(i);
      }
    }

    let freeIdx = 0;
    for (const { p, pos, info } of visible) {
      let idx = currentMap.get(p.id);
      if (idx === undefined) {
        if (freeIdx >= freeSlots.length) continue;
        idx = freeSlots[freeIdx++];
      }

      const entry = this.pool[idx];
      const pAny = p as Record<string, unknown>;
      const cluster = !!(pAny._isCluster);
      const url = `/data/sprites/${info.file}`;

      entry.baseX = pos.x; entry.baseY = pos.y; entry.baseZ = pos.z;
      entry.sprite.position.set(pos.x, pos.y, pos.z);
      entry.sprite.visible = true;
      entry.isCluster = cluster;
      entry.isSessile = SESSILE_GROUPS.has(info.group);

      if (entry.pointId === p.id) continue; // already assigned, skip init
      entry.pointId = p.id;

      if (!cluster && !entry.isSessile) {
        computeTangents(pos);
        entry.tangentX = _tangent.x; entry.tangentY = _tangent.y; entry.tangentZ = _tangent.z;
        entry.bitangentX = _bitangent.x; entry.bitangentY = _bitangent.y; entry.bitangentZ = _bitangent.z;
      }

      const h = hashId(p.id);
      entry.heading = h * Math.PI * 2;
      entry.swimPhase = h * 100;

      // Default scale (updated when real texture loads with actual pixel dimensions)
      const defaultS = 100 / PX_DIVISOR; // placeholder 100px
      entry.sprite.scale.set(defaultS, defaultS, 1);

      if (entry.spriteUrl !== url) {
        entry.spriteUrl = url;
        const tex = getSpriteTexture(url);
        if (entry.material.map !== tex) {
          entry.material.map = tex;
          entry.material.needsUpdate = true;
        }

        loadSpriteTexture(url).then((realTex) => {
          if (entry.pointId === p.id) {
            if (entry.material.map !== realTex) {
              entry.material.map = realTex;
              entry.material.needsUpdate = true;
            }
            // Set scale from actual image pixel dimensions
            const img = realTex.image as { width: number; height: number } | undefined;
            if (img && img.width && img.height) {
              entry.sprite.scale.set(img.width / PX_DIVISOR, img.height / PX_DIVISOR, 1);
            }
          }
        }).catch(() => {});
      }

      if (cluster) {
        const count = (pAny._count as number) ?? 0;
        if (count > 1) {
          const badgeTex = getBadgeTexture(count);
          entry.badgeMaterial.map = badgeTex;
          entry.badgeMaterial.needsUpdate = true;
          const aspect = badgeTex.image.width / badgeTex.image.height;
          entry.badge.scale.set(BADGE_SCALE * aspect, BADGE_SCALE, 1);
          entry.badge.position.copy(entry.sprite.position);
          entry.badge.visible = true;
        } else {
          entry.badge.visible = false;
        }
      } else {
        entry.badge.visible = false;
      }
    }
  }

  /** Per-frame: back-face cull + swim animation. Does NOT reassign pool. */
  update(camera: THREE.Camera, dt: number): void {
    this.time += dt;
    camera.getWorldPosition(_camDir);
    _camDir.normalize();

    for (const entry of this.pool) {
      if (!entry.pointId) continue;

      // Hide only when well past the horizon (dot < -0.15) to prevent
      // flicker for sprites near the edge during small rotations.
      _spriteDir.set(entry.baseX, entry.baseY, entry.baseZ).normalize();
      const dot = _camDir.dot(_spriteDir);
      if (dot < -0.15) {
        entry.sprite.visible = false;
        entry.badge.visible = false;
        continue;
      }
      entry.sprite.visible = true;

      if (!entry.isCluster && !entry.isSessile) {
        const t = this.time * SWIM_SPEED + entry.swimPhase;
        const lateral = Math.sin(t) * SWIM_AMP;
        const forward = Math.cos(t * 0.7) * SWIM_AMP * 0.5
          + this.time * SWIM_DRIFT * (entry.heading > Math.PI ? 1 : -1);

        entry.sprite.position.set(
          entry.baseX + entry.tangentX * lateral + entry.bitangentX * forward,
          entry.baseY + entry.tangentY * lateral + entry.bitangentY * forward,
          entry.baseZ + entry.tangentZ * lateral + entry.bitangentZ * forward,
        );
      }

      if (entry.badge.visible) {
        entry.badge.position.copy(entry.sprite.position);
      }
    }
  }

  dispose(): void {
    for (const entry of this.pool) {
      this.scene.remove(entry.sprite);
      this.scene.remove(entry.badge);
      entry.material.map?.dispose();
      entry.material.dispose();
      entry.badgeMaterial.map?.dispose();
      entry.badgeMaterial.dispose();
    }
    this.pool = [];
  }
}
