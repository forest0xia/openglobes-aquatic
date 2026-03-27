import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const _tmp = new THREE.Vector3();

export function latLngToVec3(
  lat: number,
  lng: number,
  radius: number,
  alt = 0,
  target?: THREE.Vector3,
): THREE.Vector3 {
  // Reuse a module-level vector when no target is provided
  // to avoid allocating a new Vector3 every call (GC pressure)
  const v = target ?? _tmp;
  const r = radius * (1 + alt);
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  v.setFromSphericalCoords(r, phi, theta);
  return v;
}

export const GLOBE_RADIUS = 100;
