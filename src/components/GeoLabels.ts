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
  ocean:     { opacity: 0.15, uppercase: true,  baseFontSize: 14 },
  sea:       { opacity: 0.12, uppercase: false, baseFontSize: 11 },
  continent: { opacity: 0.08, uppercase: true,  baseFontSize: 13 },
  island:    { opacity: 0.10, uppercase: false, baseFontSize: 10 },
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
  // Scale the sprite so longer labels aren't too narrow
  sprite.scale.set(fontSize * 3, fontSize * 0.4, 1);
  return sprite;
}

export class GeoLabelsManager {
  private sprites: THREE.Sprite[] = [];
  private scene: THREE.Scene;
  private visible = true;

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

  /** Hide labels on the far side of the globe. Call each frame. */
  update(camera: THREE.Camera): void {
    if (!this.visible) return;
    const camDir = new THREE.Vector3();
    camera.getWorldPosition(camDir);
    camDir.normalize();

    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const spriteDir = sprite.position.clone().normalize();
      // Dot product: >0 means same hemisphere as camera (visible)
      const dot = camDir.dot(spriteDir);
      sprite.visible = dot > 0.1; // slight threshold to hide labels near the edge
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
