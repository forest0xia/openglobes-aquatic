import * as THREE from 'three';
import type { PointItem } from '@openglobes/core';
import { getSpriteTexture, loadSpriteTexture, getBodyGroupColor } from './SpriteLoader';

// ---------------------------------------------------------------------------
// ClusterSwarmLayer — renders clusters as scattered mini-sprite outlines
// instead of a single dot with a count label.
//
// Uses groupDistribution to vary shapes. Scatter positions are seeded
// by tile coords for deterministic layout.
// ---------------------------------------------------------------------------

const MAX_SWARM_SPRITES = 12;  // max sprites per cluster
const SWARM_POOL_SIZE = 400;   // total pool (roughly 30 clusters × 12 sprites)
const SPRITE_SCALE = 0.4;      // smaller than individual points
const ALTITUDE = 0.008;
const SCATTER_RADIUS = 0.015;  // world-unit scatter radius around cluster center

interface SwarmEntry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  active: boolean;
}

// Simple seeded random for deterministic scatter
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class ClusterSwarmLayer {
  private scene: THREE.Scene;
  private getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };
  private pool: SwarmEntry[] = [];
  private camDir = new THREE.Vector3();
  private spriteDir = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number },
  ) {
    this.scene = scene;
    this.getCoords = getCoords;

    for (let i = 0; i < SWARM_POOL_SIZE; i++) {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE * 0.6, 1);
      sprite.visible = false;
      scene.add(sprite);
      this.pool.push({ sprite, material, active: false });
    }
  }

  /** Sync swarm sprites with cluster data. */
  syncClusters(points: PointItem[]): void {
    const isCluster = (p: PointItem) => !!(p as Record<string, unknown>)._isCluster;
    const clusters = points.filter(isCluster);

    let poolIdx = 0;

    for (const cluster of clusters) {
      const cAny = cluster as Record<string, unknown>;
      const count = (cAny._count as number) ?? 1;
      const topItems = (cAny._topItems as { id: string; name: string; sprite?: string; group?: string }[]) ?? [];
      const groupDist = (cAny.groupDistribution as { group: string; count: number }[]) ?? [];

      // How many sprites to show for this cluster
      const numSprites = Math.min(MAX_SWARM_SPRITES, Math.max(2, Math.ceil(count / 50)));

      // Seed based on lat/lng for deterministic layout
      const seed = Math.abs(Math.round(cluster.lat * 1000 + cluster.lng * 7919));
      const rng = seededRandom(seed);

      // Pick which sprites to show — use topItems and groupDistribution
      const spriteChoices: { sprite: string; group: string }[] = [];
      for (const item of topItems) {
        if (item.sprite) {
          spriteChoices.push({ sprite: item.sprite, group: item.group ?? 'fish' });
        }
      }
      // Fill remaining from groupDistribution (use generic group sprites)
      for (const gd of groupDist) {
        if (spriteChoices.length >= numSprites) break;
        spriteChoices.push({ sprite: `grp-${gd.group}.svg`, group: gd.group });
      }
      // Pad with fish fallback if needed
      while (spriteChoices.length < numSprites) {
        spriteChoices.push({ sprite: 'grp-fish.svg', group: 'fish' });
      }

      // Center position
      const center = this.getCoords(cluster.lat, cluster.lng, ALTITUDE);

      for (let i = 0; i < numSprites && poolIdx < this.pool.length; i++) {
        const entry = this.pool[poolIdx++];
        const choice = spriteChoices[i % spriteChoices.length];

        // Scatter offset (deterministic)
        const angle = rng() * Math.PI * 2;
        const dist = rng() * SCATTER_RADIUS;
        const ox = Math.cos(angle) * dist;
        const oy = Math.sin(angle) * dist;
        const oz = (rng() - 0.5) * SCATTER_RADIUS * 0.5;

        entry.sprite.position.set(center.x + ox, center.y + oy, center.z + oz);
        entry.sprite.visible = true;
        entry.active = true;

        // Random rotation for variety
        entry.material.rotation = rng() * 0.4 - 0.2;

        // Scale variation
        const s = SPRITE_SCALE * (0.7 + rng() * 0.6);
        entry.sprite.scale.set(s, s * 0.6, 1);

        // Opacity based on density
        entry.material.opacity = 0.3 + Math.min(0.5, count / 500);

        // Texture + color
        const url = `/data/sprites/${choice.sprite}`;
        const tex = getSpriteTexture(url, choice.group);
        if (entry.material.map !== tex) {
          entry.material.map = tex;
          entry.material.needsUpdate = true;
        }
        entry.material.color.set(getBodyGroupColor(choice.group));

        // Async load real texture
        loadSpriteTexture(url, choice.group).then((realTex) => {
          if (entry.material.map !== realTex) {
            entry.material.map = realTex;
            entry.material.needsUpdate = true;
          }
        }).catch(() => {});
      }
    }

    // Hide unused pool entries
    for (let i = poolIdx; i < this.pool.length; i++) {
      this.pool[i].sprite.visible = false;
      this.pool[i].active = false;
    }
  }

  /** Per-frame: cull sprites on the far side. */
  update(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camDir);
    this.camDir.normalize();

    for (const entry of this.pool) {
      if (!entry.active) continue;
      this.spriteDir.copy(entry.sprite.position).normalize();
      const dot = this.camDir.dot(this.spriteDir);
      entry.sprite.visible = dot > 0.1;
    }
  }

  dispose(): void {
    for (const entry of this.pool) {
      this.scene.remove(entry.sprite);
      entry.material.map?.dispose();
      entry.material.dispose();
    }
    this.pool = [];
  }
}
