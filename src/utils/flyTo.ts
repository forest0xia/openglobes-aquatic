import type { GlobeSceneRefs } from '@openglobes/core';
import * as THREE from 'three';

/**
 * Animate the globe camera to look at a specific lat/lng.
 * Uses cinematic easing: slow start, fast middle, slow end.
 *
 * @param zoomDistance - target camera distance (120=close, 350=default, 500=far).
 *   If not set, keeps the current distance.
 */
export function flyTo(
  refs: GlobeSceneRefs,
  lat: number,
  lng: number,
  options: { duration?: number; altitude?: number; zoomDistance?: number } = {},
) {
  const { controls, camera, getCoords } = refs;
  const duration = options.duration ?? 2000;
  const altitude = options.altitude ?? 0;
  const targetDist = options.zoomDistance ?? camera.position.length();

  // Target position on globe surface
  const target = getCoords(lat, lng, altitude);
  const targetVec = new THREE.Vector3(target.x, target.y, target.z);

  // Camera end position: along the vector from origin through target, at target distance
  const camTarget = targetVec.clone().normalize().multiplyScalar(targetDist);

  // Store start positions
  const startCam = camera.position.clone();
  const startTarget = controls.target.clone();
  const endTarget = new THREE.Vector3(0, 0, 0);

  // Stop auto-rotate
  controls.autoRotate = false;

  const startTime = performance.now();

  function animate() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);

    // Cinematic easing: ease-in-out cubic
    const ease =
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(startCam, camTarget, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    controls.update();

    if (t < 1) requestAnimationFrame(animate);
  }

  animate();
}
