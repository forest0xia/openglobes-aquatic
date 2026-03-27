import * as THREE from 'three';
import type { PointItem } from '../types';

// ---------------------------------------------------------------------------
// SwimmingFish — animated fish sprites on the 3D globe.
//
// This is a plain TypeScript manager class (NOT a React component).
// It creates a pool of Three.js Sprite objects, assigns them to visible
// points (prioritizing rare/legendary species), and animates them with a
// gentle wobble. Rare/legendary fish get a glow ring behind them.
// ---------------------------------------------------------------------------

const POOL_SIZE = 20;

const RARITY_COLORS: Record<number, string> = {
  0: '#48bfe6', // Common
  1: '#56d6a0', // Uncommon
  2: '#f9c74f', // Rare
  3: '#ef476f', // Legendary
  4: '#b185db', // Mythic (if ever used)
};

interface FishSpriteData {
  sprite: THREE.Sprite;
  lat: number;
  lng: number;
  phase: number;     // random phase offset for wobble
  speed: number;     // wobble speed (radians/sec)
  amplitude: number; // wobble distance (degrees)
}

/**
 * Create a procedural fish sprite texture on a canvas.
 * Draws an elongated ellipse "body" with a triangular tail,
 * and optionally a radial glow ring behind it (for rare fish).
 */
function createFishSprite(color: string, glow: boolean): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Glow ring for rare fish
  if (glow) {
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, size / 6,
      size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, color + '80');
    gradient.addColorStop(0.5, color + '30');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  // Fish-shaped dot (slightly elongated ellipse)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, size / 5, size / 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Small tail
  ctx.beginPath();
  ctx.moveTo(size / 2 + size / 5, size / 2);
  ctx.lineTo(size / 2 + size / 3, size / 2 - size / 8);
  ctx.lineTo(size / 2 + size / 3, size / 2 + size / 8);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class SwimmingFishManager {
  private pool: FishSpriteData[] = [];
  private scene: THREE.Scene;
  private getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };
  private textures: Map<string, THREE.Texture> = new Map();
  private time = 0;
  private frameCount = 0;

  constructor(
    scene: THREE.Scene,
    getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number },
  ) {
    this.scene = scene;
    this.getCoords = getCoords;

    // Create sprite pool — all initially invisible
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // screen-like blending on dark backgrounds
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.scale.set(3, 2, 1);
      scene.add(sprite);

      this.pool.push({
        sprite,
        lat: 0,
        lng: 0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.4,
        amplitude: 0.5 + Math.random() * 0.5,
      });
    }
  }

  /**
   * Call when visible points change.
   * Assigns sprites to the most interesting (highest-rarity) points.
   */
  updatePoints(points: PointItem[]): void {
    // Sort by rarity descending — prioritize rare/legendary fish
    const sorted = [...points].sort(
      (a, b) => ((b.rarity ?? 0) as number) - ((a.rarity ?? 0) as number),
    );
    const toShow = sorted.slice(0, POOL_SIZE);

    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];

      if (i < toShow.length) {
        const p = toShow[i];
        const rarity = (p.rarity ?? 0) as number;
        const color = RARITY_COLORS[rarity] ?? '#48bfe6';
        const glow = rarity >= 2;

        // Get or create cached texture
        const texKey = `${color}-${glow}`;
        if (!this.textures.has(texKey)) {
          this.textures.set(texKey, createFishSprite(color, glow));
        }

        const mat = entry.sprite.material as THREE.SpriteMaterial;
        mat.map = this.textures.get(texKey)!;
        mat.opacity = 0.85;
        mat.needsUpdate = true;
        entry.sprite.visible = true;
        entry.lat = p.lat;
        entry.lng = p.lng;

        // Scale: rare fish are bigger (with glow ring they need more room)
        const baseScale = glow ? 5 : 3;
        entry.sprite.scale.set(baseScale, baseScale * 0.65, 1);
      } else {
        entry.sprite.visible = false;
      }
    }
  }

  /**
   * Call every animation frame.
   * @param dt — delta time in seconds since last frame.
   */
  update(dt: number): void {
    this.time += dt;
    this.frameCount++;

    // Only update sprite positions every 2nd frame for performance
    if (this.frameCount % 2 !== 0) return;

    for (const entry of this.pool) {
      if (!entry.sprite.visible) continue;

      // Wobble: oscillate lat/lng slightly using sine waves
      const wobbleLat =
        Math.sin(this.time * entry.speed + entry.phase) * entry.amplitude;
      const wobbleLng =
        Math.cos(this.time * entry.speed * 0.7 + entry.phase) * entry.amplitude;

      const pos = this.getCoords(
        entry.lat + wobbleLat,
        entry.lng + wobbleLng,
        0.015,
      );
      entry.sprite.position.set(pos.x, pos.y, pos.z);

      // Rotate sprite to approximate heading direction
      const headingLng = entry.lng + wobbleLng + 0.1;
      const nextPos = this.getCoords(entry.lat + wobbleLat, headingLng, 0.015);
      const angle = Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x);
      (entry.sprite.material as THREE.SpriteMaterial).rotation = angle;
    }
  }

  /** Clean up all sprites and textures when the component unmounts. */
  dispose(): void {
    for (const entry of this.pool) {
      this.scene.remove(entry.sprite);
      (entry.sprite.material as THREE.SpriteMaterial).map?.dispose();
      (entry.sprite.material as THREE.SpriteMaterial).dispose();
    }
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    this.textures.clear();
    this.pool = [];
  }
}
