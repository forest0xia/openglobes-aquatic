import * as THREE from 'three';

// ---------------------------------------------------------------------------
// SpriteLoader — fetch SVG files, tint by body group, cache as Three.js textures.
//
// SVGs are white-stroke outlines (no fill). We render them to canvas at a
// fixed size, apply body-group tint color, and create a CanvasTexture.
// ---------------------------------------------------------------------------

/** Body-group → neon glow color */
export const BODY_GROUP_COLORS: Record<string, string> = {
  fish:        '#00E5FF',
  mammal:      '#FFF5E6',
  cephalopod:  '#B388FF',
  reptile:     '#69F0AE',
  cnidarian:   '#FF80AB',
  crustacean:  '#FFAB40',
  echinoderm:  '#FFD740',
  mollusk:     '#64FFDA',
  other:       '#00E5FF',
};

const SPRITE_SIZE = 64; // px — canvas render size
const GLOW_BLUR = 6;    // px — neon glow radius

/** Cache: key = `${svgUrl}:${color}` → texture */
const textureCache = new Map<string, THREE.CanvasTexture>();

/** Cache: svgUrl → raw SVG text */
const svgTextCache = new Map<string, Promise<string>>();

/** Fetch SVG text with dedup */
function fetchSvgText(url: string): Promise<string> {
  let pending = svgTextCache.get(url);
  if (!pending) {
    pending = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`SVG fetch failed: ${url}`);
      return r.text();
    });
    svgTextCache.set(url, pending);
  }
  return pending;
}

/**
 * Load an SVG sprite and return a tinted CanvasTexture.
 * Results are cached — calling twice with the same url+color returns the same texture.
 */
export async function loadSpriteTexture(
  svgUrl: string,
  bodyGroup: string,
): Promise<THREE.CanvasTexture> {
  const color = BODY_GROUP_COLORS[bodyGroup] ?? BODY_GROUP_COLORS.other;
  const cacheKey = `${svgUrl}:${color}`;

  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const svgText = await fetchSvgText(svgUrl);

  const texture = renderSvgToTexture(svgText, color);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Synchronous version — returns cached texture or a 1x1 transparent placeholder.
 * Kicks off async load in background; caller should re-check later.
 */
export function getSpriteTexture(
  svgUrl: string,
  bodyGroup: string,
): THREE.CanvasTexture {
  const color = BODY_GROUP_COLORS[bodyGroup] ?? BODY_GROUP_COLORS.other;
  const cacheKey = `${svgUrl}:${color}`;

  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  // Return placeholder and start async load
  if (!placeholderTexture) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    placeholderTexture = new THREE.CanvasTexture(c);
  }

  // Fire and forget — next frame will pick up the real texture
  loadSpriteTexture(svgUrl, bodyGroup).catch(() => {});

  return placeholderTexture;
}

let placeholderTexture: THREE.CanvasTexture | null = null;

/** Render SVG string to a canvas texture with neon glow tint */
function renderSvgToTexture(svgText: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const pad = GLOW_BLUR * 2;
  canvas.width = SPRITE_SIZE + pad * 2;
  canvas.height = SPRITE_SIZE + pad * 2;
  const ctx = canvas.getContext('2d')!;

  // Create an Image from the SVG (tinted white → we composite with color)
  const img = new Image();
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  // We render synchronously by drawing to a temp canvas first
  // But Image loading is async — so we use a two-pass approach:
  // First pass: return a texture, then update it when the image loads
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  img.onload = () => {
    // Glow layer
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = GLOW_BLUR;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    // Draw twice for stronger glow
    ctx.drawImage(img, pad, pad, SPRITE_SIZE, SPRITE_SIZE);
    ctx.drawImage(img, pad, pad, SPRITE_SIZE, SPRITE_SIZE);
    ctx.restore();

    // Tint: use globalCompositeOperation to colorize the white strokes
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    texture.needsUpdate = true;
    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
  };

  img.src = url;
  return texture;
}

/** Get the hex color for a body group */
export function getBodyGroupColor(bodyGroup: string): string {
  return BODY_GROUP_COLORS[bodyGroup] ?? BODY_GROUP_COLORS.other;
}

/** Preload a batch of sprite URLs (fire-and-forget) */
export function preloadSprites(items: { sprite: string; bodyGroup?: string }[]): void {
  for (const item of items) {
    if (item.sprite) {
      loadSpriteTexture(
        `/data/sprites/${item.sprite}`,
        item.bodyGroup ?? 'fish',
      ).catch(() => {});
    }
  }
}
