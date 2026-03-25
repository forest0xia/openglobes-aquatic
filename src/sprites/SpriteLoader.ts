import * as THREE from 'three';
import { addStep, completeStep } from '../utils/loadProgress';

// ---------------------------------------------------------------------------
// SpriteLoader — PNG texture loader with concurrency-limited queue.
//
// - Max 8 concurrent fetches, viewport-aware cancellation
// - Pending-load deduplication (same URL → same promise)
// - LRU eviction: textures unused after N syncs are disposed
// ---------------------------------------------------------------------------

addStep('sprites', 4, 'Loading species sprites');
let spritesStepDone = false;
let spritesLoaded = 0;
const SPRITES_FIRST_BATCH = 8;

/** Body-group → accent color (used by filter UI chips, not sprite rendering) */
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

const MAX_CONCURRENT = 8;
const MAX_CACHED_TEXTURES = 80; // LRU cap — dispose oldest beyond this

const loader = new THREE.TextureLoader();

/** Resolved texture cache: url → texture */
const textureCache = new Map<string, THREE.Texture>();

/** Pending load dedup: url → promise (removed on resolve/reject) */
const pendingLoads = new Map<string, Promise<THREE.Texture>>();

/** LRU order: most recently used URL at end */
const lruOrder: string[] = [];

function touchLru(url: string): void {
  const idx = lruOrder.indexOf(url);
  if (idx !== -1) lruOrder.splice(idx, 1);
  lruOrder.push(url);

  // Evict oldest if over cap
  while (lruOrder.length > MAX_CACHED_TEXTURES) {
    const evictUrl = lruOrder.shift()!;
    const tex = textureCache.get(evictUrl);
    if (tex) {
      tex.dispose();
      textureCache.delete(evictUrl);
    }
  }
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

interface QueueEntry {
  url: string;
  resolve: (tex: THREE.Texture) => void;
  reject: (err: unknown) => void;
  cancelled: boolean;
}

const queue: QueueEntry[] = [];
let inFlight = 0;
let neededUrls: Set<string> | null = null;

function processQueue(): void {
  while (inFlight < MAX_CONCURRENT && queue.length > 0) {
    const entry = queue.shift()!;

    if (entry.cancelled || (neededUrls && !neededUrls.has(entry.url))) {
      entry.reject(new Error('cancelled'));
      continue;
    }

    const cached = textureCache.get(entry.url);
    if (cached) {
      touchLru(entry.url);
      entry.resolve(cached);
      continue;
    }

    inFlight++;
    loader.load(
      entry.url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        textureCache.set(entry.url, tex);
        touchLru(entry.url);
        inFlight--;
        entry.resolve(tex);
        pendingLoads.delete(entry.url);
        if (!spritesStepDone) {
          spritesLoaded++;
          if (spritesLoaded >= SPRITES_FIRST_BATCH) {
            spritesStepDone = true;
            completeStep('sprites');
          }
        }
        processQueue();
      },
      undefined,
      (err) => {
        inFlight--;
        pendingLoads.delete(entry.url);
        entry.reject(err);
        processQueue();
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

/**
 * Load a PNG sprite texture (async). Cached + deduped.
 */
export function loadSpriteTexture(url: string): Promise<THREE.Texture> {
  const cached = textureCache.get(url);
  if (cached) {
    touchLru(url);
    return Promise.resolve(cached);
  }

  // Dedup: if already loading this URL, return the same promise
  const pending = pendingLoads.get(url);
  if (pending) return pending;

  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    queue.push({ url, resolve, reject, cancelled: false });
    processQueue();
  });
  pendingLoads.set(url, promise);
  return promise;
}

/**
 * Synchronous — returns cached texture or 1×1 placeholder.
 */
export function getSpriteTexture(url: string): THREE.Texture {
  const cached = textureCache.get(url);
  if (cached) {
    touchLru(url);
    return cached;
  }
  loadSpriteTexture(url).catch(() => {});
  return getPlaceholder();
}

/**
 * Mark which URLs the current viewport needs.
 * Queued entries for other URLs are cancelled.
 */
export function markNeeded(urls: string[]): void {
  neededUrls = new Set(urls);
  for (const entry of queue) {
    if (!neededUrls.has(entry.url) && !textureCache.has(entry.url)) {
      entry.cancelled = true;
    }
  }
}

export function clearNeeded(): void {
  neededUrls = null;
}

export function preloadSprites(items: { sprite: string }[]): void {
  for (const item of items) {
    if (item.sprite) loadSpriteTexture(`/data/sprites/${item.sprite}`).catch(() => {});
  }
}
