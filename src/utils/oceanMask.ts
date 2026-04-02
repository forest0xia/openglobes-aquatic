// ---------------------------------------------------------------------------
// Ocean Mask — detects whether a lat/lng coordinate is ocean or land.
//
// Uses a NASA equirectangular grayscale image (white=land, black=ocean).
// The image is drawn to an offscreen canvas and sampled via getImageData().
// ---------------------------------------------------------------------------

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let loaded = false;
let loading: Promise<void> | null = null;

const MASK_W = 1024;
const MASK_H = 512;

/** Preload the ocean mask image. Call early (e.g., on mount). */
export function loadOceanMask(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas = document.createElement('canvas');
      canvas.width = MASK_W;
      canvas.height = MASK_H;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, MASK_W, MASK_H);
        loaded = true;
      }
      resolve();
    };
    img.onerror = () => {
      // If mask fails to load, allow diving everywhere (graceful fallback)
      console.warn('[oceanMask] Failed to load ocean mask — all areas will be diveable');
      loaded = true;
      resolve();
    };
    img.src = '/textures/ocean-mask.png';
  });
  return loading;
}

/**
 * Returns true if the given lat/lng is over ocean (diveable).
 * If the mask hasn't loaded yet, returns true (permissive fallback).
 */
export function isOcean(lat: number, lng: number): boolean {
  if (!ctx) return true; // mask not loaded → allow

  // Equirectangular: lng -180..180 → x 0..1, lat 90..-90 → y 0..1
  const x = Math.floor(((lng + 180) / 360) * MASK_W) % MASK_W;
  const y = Math.floor(((90 - lat) / 180) * MASK_H) % MASK_H;

  const pixel = ctx.getImageData(x, y, 1, 1).data;
  // NASA mask: white (255) = land, black (0) = ocean
  const ocean = pixel[0] < 128;
  console.debug(`[oceanMask] lat=${lat.toFixed(1)} lng=${lng.toFixed(1)} → px(${x},${y}) val=${pixel[0]} → ${ocean ? 'OCEAN' : 'LAND'}`);
  return ocean;
}
