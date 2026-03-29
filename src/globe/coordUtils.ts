import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const _tmp = new THREE.Vector3();

/**
 * Convert lat/lng to Three.js world position matching SphereGeometry UV mapping.
 *
 * Three.js SphereGeometry vertex formula:
 *   x = -r * cos(phiAngle) * sin(thetaAngle)
 *   y =  r * cos(thetaAngle)
 *   z =  r * sin(phiAngle) * sin(thetaAngle)
 *
 * where phiAngle = u * 2π (longitude), thetaAngle = v * π (latitude)
 *   u = (lng + 180) / 360
 *   v = (90 - lat) / 180
 */
export function latLngToVec3(
  lat: number,
  lng: number,
  radius: number,
  alt = 0,
  target?: THREE.Vector3,
): THREE.Vector3 {
  const v = target ?? _tmp;
  const r = radius * (1 + alt);
  const u = (lng + 180) / 360;           // 0..1 around the equator
  const vv = (90 - lat) / 180;            // 0..1 from north pole to south
  const phiAngle = u * Math.PI * 2;       // longitude angle
  const thetaAngle = vv * Math.PI;        // latitude angle from pole

  v.x = -r * Math.cos(phiAngle) * Math.sin(thetaAngle);
  v.y =  r * Math.cos(thetaAngle);
  v.z =  r * Math.sin(phiAngle) * Math.sin(thetaAngle);
  return v;
}

export const GLOBE_RADIUS = 100;
