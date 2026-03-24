import * as THREE from 'three';
import type { GeoLabel } from '../data/geoLabels';

// ---------------------------------------------------------------------------
// GeoLabelsManager — geographic text labels rendered as Three.js Sprites.
//
// This is a plain TypeScript manager class (NOT a React component).
// It creates a pool of Sprite objects using CanvasTexture for each label,
// positions them at lat/lng coords slightly above the globe surface, and
// supports toggling visibility and disposing resources.
//
// Labels are designed to be VERY subtle — background context, not foreground UI.
// ---------------------------------------------------------------------------

/**
 * Per-type style config for the labels.
 */
interface LabelStyle {
  opacity: number;
  uppercase: boolean;
  baseFontSize: number; // px (before size multiplier)
}

const TYPE_STYLES: Record<GeoLabel['type'], LabelStyle> = {
  ocean:     { opacity: 0.25, uppercase: true,  baseFontSize: 10 },
  sea:       { opacity: 0.20, uppercase: false, baseFontSize: 7 },
  continent: { opacity: 0.18, uppercase: true,  baseFontSize: 7 },
  island:    { opacity: 0.18, uppercase: false, baseFontSize: 5 },
};

/**
 * Create a text sprite using a Canvas2D texture.
 * Returns a THREE.Sprite positioned at world origin — caller sets position.
 */
function createTextSprite(text: string, fontSize: number, opacity: number, uppercase: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const scale = 2; // retina
  canvas.width = 512 * scale;
  canvas.height = 64 * scale;
  const ctx = canvas.getContext('2d')!;

  const displayText = uppercase ? text.toUpperCase() : text;
  ctx.font = `${fontSize * scale}px "DM Sans", sans-serif`;
  ctx.fillStyle = `rgba(180, 200, 230, ${opacity})`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // letterSpacing is not universally supported — simulate with manual spacing
  // when uppercase by adding a space between characters isn't great, so we
  // leave it to font rendering. It still reads nicely with opacity.
  ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  // Scale: ensure minimum visible size even for small labels
  const w = Math.max(8, fontSize * 2.5);
  const h = Math.max(1.5, fontSize * 0.35);
  sprite.scale.set(w, h, 1);
  return sprite;
}

export class GeoLabelsManager {
  private sprites: THREE.Sprite[] = [];
  private scene: THREE.Scene;
  private visible = true;
  private typeVisibility: Record<string, boolean> = { ocean: true, sea: true, continent: true, island: true };

  constructor(
    scene: THREE.Scene,
    getCoords: (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number },
    labels: GeoLabel[],
  ) {
    this.scene = scene;

    for (const label of labels) {
      const style = TYPE_STYLES[label.type];
      const fontSize = style.baseFontSize * label.size;
      const sprite = createTextSprite(label.name, fontSize, style.opacity, style.uppercase);

      // Store the label type for per-type visibility filtering
      sprite.userData = { type: label.type };

      // Position slightly above the globe surface (alt = 0.02)
      const pos = getCoords(label.lat, label.lng, 0.02);
      sprite.position.set(pos.x, pos.y, pos.z);

      scene.add(sprite);
      this.sprites.push(sprite);
    }
  }

  /** Toggle all label sprites on or off. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const sprite of this.sprites) {
      sprite.visible = visible;
    }
  }

  /** Set visibility for all labels of a given type. */
  setTypeVisible(type: string, visible: boolean): void {
    this.typeVisibility[type] = visible;
  }

  // Reusable vectors — allocated once, reused every update()
  private _camDir = new THREE.Vector3();
  private _spriteDir = new THREE.Vector3();

  /** Hide labels on the far side of the globe. Respects per-type visibility. */
  update(camera: THREE.Camera): void {
    if (!this.visible) return;
    camera.getWorldPosition(this._camDir);
    this._camDir.normalize();

    for (const sprite of this.sprites) {
      const type = sprite.userData.type as string;
      const typeOn = this.typeVisibility[type] !== false;
      if (!typeOn) {
        sprite.visible = false;
        continue;
      }
      this._spriteDir.copy(sprite.position).normalize();
      const dot = this._camDir.dot(this._spriteDir);
      sprite.visible = dot > 0.3;
    }
  }

  /** Remove all sprites from the scene and free GPU resources. */
  dispose(): void {
    for (const sprite of this.sprites) {
      this.scene.remove(sprite);
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.sprites = [];
  }
}
