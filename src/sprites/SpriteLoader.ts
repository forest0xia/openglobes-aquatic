import * as THREE from 'three';
import { addStep, completeStep } from '../utils/loadProgress';

// ---------------------------------------------------------------------------
// SpriteLoader — loads a single spritesheet (WebP with PNG fallback) and
// extracts individual sprite textures by cropping from the atlas.
//
// One HTTP request for the entire sheet (~3MB WebP) instead of 450 PNGs.
// Each sprite gets a CanvasTexture cropped from the sheet.
// ---------------------------------------------------------------------------

addStep('sprites', 4, 'Loading species sprites');

/** Body-group → accent color (used by filter UI chips) */
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

interface SpriteRect {
  sheet: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SheetManifest {
  sheets: { png: string; webp: string; width: number; height: number }[];
  sprites: Record<string, SpriteRect & { group?: string; bodyType?: string }>;
}

let manifest: SheetManifest | null = null;
let sheetImages: HTMLImageElement[] = [];
let sheetLoaded = false;
const textureCache = new Map<string, THREE.Texture>();

let placeholderTexture: THREE.Texture | null = null;

function getPlaceholder(): THREE.Texture {
  if (!placeholderTexture) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    placeholderTexture = new THREE.CanvasTexture(c);
  }
  return placeholderTexture;
}

/** Check WebP support. */
function supportsWebP(): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width > 0);
    img.onerror = () => resolve(false);
    img.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  });
}

/** Load the spritesheet manifest + images. Called once on startup. */
async function loadSpriteSheet(): Promise<void> {
  if (sheetLoaded) return;

  try {
    const resp = await fetch('/data/sprites/spritesheet.json');
    if (!resp.ok) throw new Error('manifest fetch failed');
    manifest = await resp.json();
    if (!manifest) throw new Error('empty manifest');

    const useWebP = await supportsWebP();

    // Load each sheet image
    const promises = manifest.sheets.map((sheet, idx) => {
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          sheetImages[idx] = img;
          resolve();
        };
        img.onerror = () => reject(new Error(`sheet ${idx} load failed`));
        img.src = `/data/sprites/${useWebP ? sheet.webp : sheet.png}`;
      });
    });

    await Promise.all(promises);
    sheetLoaded = true;
    completeStep('sprites');
  } catch (err) {
    console.error('[SpriteLoader] spritesheet load failed, falling back to individual PNGs', err);
    completeStep('sprites');
  }
}

// Start loading immediately
const sheetReady = loadSpriteSheet();

/** Extract a sprite texture from the loaded sheet. */
function extractSprite(spriteName: string): THREE.CanvasTexture | null {
  if (!manifest || !sheetLoaded) return null;

  const rect = manifest.sprites[spriteName];
  if (!rect) return null;

  const img = sheetImages[rect.sheet];
  if (!img) return null;

  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Fallback: individual PNG loader (if spritesheet fails)
// ---------------------------------------------------------------------------

const pngLoader = new THREE.TextureLoader();
const pendingLoads = new Map<string, Promise<THREE.Texture>>();
const MAX_CONCURRENT = 8;
const pngQueue: { url: string; resolve: (t: THREE.Texture) => void; reject: (e: unknown) => void }[] = [];
let pngInFlight = 0;

function processPngQueue(): void {
  while (pngInFlight < MAX_CONCURRENT && pngQueue.length > 0) {
    const entry = pngQueue.shift()!;
    const cached = textureCache.get(entry.url);
    if (cached) { entry.resolve(cached); continue; }
    pngInFlight++;
    pngLoader.load(
      entry.url,
      (tex) => { tex.colorSpace = THREE.SRGBColorSpace; textureCache.set(entry.url, tex); pngInFlight--; entry.resolve(tex); processPngQueue(); },
      undefined,
      (err) => { pngInFlight--; entry.reject(err); processPngQueue(); },
    );
  }
}

function loadPngFallback(url: string): Promise<THREE.Texture> {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = pendingLoads.get(url);
  if (pending) return pending;
  const p = new Promise<THREE.Texture>((resolve, reject) => {
    pngQueue.push({ url, resolve, reject });
    processPngQueue();
  });
  pendingLoads.set(url, p);
  p.then(() => pendingLoads.delete(url), () => pendingLoads.delete(url));
  return p;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a sprite texture. Tries spritesheet first, falls back to individual PNG.
 * The `url` should be like `/data/sprites/sp-blue_whale.png`.
 */
export function loadSpriteTexture(url: string): Promise<THREE.Texture> {
  // Check cache first
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);

  // Extract sprite name from URL: /data/sprites/sp-blue_whale.png → sp-blue_whale
  const spriteName = url.split('/').pop()?.replace('.png', '') ?? '';

  return sheetReady.then(() => {
    // Try spritesheet
    if (sheetLoaded && manifest) {
      const tex = extractSprite(spriteName);
      if (tex) {
        textureCache.set(url, tex);
        return tex;
      }
    }
    // Fallback to individual PNG
    return loadPngFallback(url);
  });
}

/**
 * Synchronous — returns cached texture or placeholder.
 */
export function getSpriteTexture(url: string): THREE.Texture {
  const cached = textureCache.get(url);
  if (cached) return cached;
  loadSpriteTexture(url).catch(() => {});
  return getPlaceholder();
}

/**
 * Get sprite dimensions from manifest (without loading texture).
 * Returns { w, h } or null if not found.
 */
export function getSpriteDimensions(spriteName: string): { w: number; h: number } | null {
  if (!manifest) return null;
  const rect = manifest.sprites[spriteName];
  if (!rect) return null;
  return { w: rect.w, h: rect.h };
}
