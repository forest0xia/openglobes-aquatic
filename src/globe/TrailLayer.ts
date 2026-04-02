import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { latLngToVec3, GLOBE_RADIUS } from './coordUtils';

// ---------------------------------------------------------------------------
// TrailLayer — ocean currents + migration trails as smooth flowing curves.
//
// Each trail renders as 3 parallel colored lines offset laterally,
// using CatmullRom spline interpolation for smooth curves.
// ---------------------------------------------------------------------------

export interface TrailData {
  waypoints: { lat: number; lng: number }[];
  color: string;
  width?: number;
  speed?: number;
  dashed?: boolean; // true=dashed (migration), false/undefined=solid (currents)
}

// Parallel line offsets (lateral distance in degrees)
const PARALLEL_OFFSETS = [-0.3, 0, 0.3];
// Colors for the 3 parallel lines (tinted from base color)
const TINT_FACTORS = [0.7, 1.0, 0.85]; // slightly dimmer sides
const OPACITY_FACTORS = [0.3, 0.5, 0.35];

export class TrailLayer {
  private scene: THREE.Scene;
  private lines: Line2[] = [];
  private materials: LineMaterial[] = [];
  /** Highlight shimmer lines — animated faster for flowing light effect. */
  private shimmerLines: Line2[] = [];
  private shimmerMaterials: LineMaterial[] = [];
  private time = 0;
  private frameCount = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(trails: TrailData[], resolution: THREE.Vector2): void {
    this.dispose();

    const v = new THREE.Vector3();
    const v2 = new THREE.Vector3();

    for (const trail of trails) {
      if (trail.waypoints.length < 2) continue;

      // Generate smooth spline points from waypoints
      const rawPoints: THREE.Vector3[] = [];
      for (const wp of trail.waypoints) {
        latLngToVec3(wp.lat, wp.lng, GLOBE_RADIUS, 0.004, v);
        rawPoints.push(v.clone());
      }

      // CatmullRom spline for smooth curves
      const spline = new THREE.CatmullRomCurve3(rawPoints, false, 'catmullrom', 0.5);
      const splinePoints = spline.getSpacedPoints(rawPoints.length * 12);

      const baseColor = new THREE.Color(trail.color || '#4cc9f0');

      // Center-line points (used for both base line and shimmer)
      const centerPoints: number[] = [];
      for (const pt of splinePoints) {
        centerPoints.push(pt.x, pt.y, pt.z);
      }

      // Create 3 parallel lines
      for (let p = 0; p < PARALLEL_OFFSETS.length; p++) {
        const offset = PARALLEL_OFFSETS[p];
        const points: number[] = [];

        for (let i = 0; i < splinePoints.length; i++) {
          const pt = splinePoints[i];
          // Offset laterally on the globe surface
          if (Math.abs(offset) > 0.001) {
            const normal = pt.clone().normalize();
            const tangent = i < splinePoints.length - 1
              ? splinePoints[i + 1].clone().sub(pt).normalize()
              : pt.clone().sub(splinePoints[i - 1]).normalize();
            const lateral = new THREE.Vector3().crossVectors(normal, tangent).normalize();
            v2.copy(pt).addScaledVector(lateral, offset);
            v2.normalize().multiplyScalar(GLOBE_RADIUS * 1.004);
            points.push(v2.x, v2.y, v2.z);
          } else {
            points.push(pt.x, pt.y, pt.z);
          }
        }

        if (points.length < 6) continue;

        const geometry = new LineGeometry();
        geometry.setPositions(points);

        const tintedColor = baseColor.clone().multiplyScalar(TINT_FACTORS[p]);
        const isDashed = trail.dashed === true;
        const material = new LineMaterial({
          color: tintedColor.getHex(),
          linewidth: trail.width ?? 1.0,
          transparent: true,
          opacity: OPACITY_FACTORS[p],
          resolution,
          dashed: isDashed,
          ...(isDashed ? { dashScale: 1, dashSize: 4, gapSize: 3 } : {}),
        });

        const line = new Line2(geometry, material);
        line.computeLineDistances();
        this.scene.add(line);
        this.lines.push(line);
        this.materials.push(material);
      }

      // ── Shimmer highlight — bright pulse traveling along the trail ──
      if (centerPoints.length >= 6) {
        // Bright white-tinted version of trail color
        const shimColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.5);
        const shimGeo = new LineGeometry();
        shimGeo.setPositions(centerPoints);

        const shimMat = new LineMaterial({
          color: shimColor.getHex(),
          linewidth: (trail.width ?? 1.0) * 1.5,
          transparent: true,
          opacity: 0.7,
          resolution,
          dashed: true,
          dashScale: 1,
          dashSize: 3,
          gapSize: 18,
        });

        const shimLine = new Line2(shimGeo, shimMat);
        shimLine.computeLineDistances();
        this.scene.add(shimLine);
        this.shimmerLines.push(shimLine);
        this.shimmerMaterials.push(shimMat);
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.frameCount++;
    if (this.frameCount % 3 !== 0) return;

    // Base trail dash animation
    const offset = -this.time * 1.5;
    for (let i = 0, len = this.materials.length; i < len; i++) {
      this.materials[i].dashOffset = offset;
    }

    // Shimmer highlight — moves faster for flowing light effect
    const shimOffset = -this.time * 4.0;
    for (let i = 0, len = this.shimmerMaterials.length; i < len; i++) {
      this.shimmerMaterials[i].dashOffset = shimOffset;
      // Pulse opacity for sparkle
      this.shimmerMaterials[i].opacity = 0.5 + 0.3 * Math.sin(this.time * 2.0 + i * 1.5);
    }
  }

  setVisible(visible: boolean): void {
    for (const line of this.lines) line.visible = visible;
    for (const line of this.shimmerLines) line.visible = visible;
  }

  dispose(): void {
    for (const line of this.lines) {
      this.scene.remove(line);
      line.geometry.dispose();
    }
    for (const mat of this.materials) mat.dispose();
    for (const line of this.shimmerLines) {
      this.scene.remove(line);
      line.geometry.dispose();
    }
    for (const mat of this.shimmerMaterials) mat.dispose();
    this.lines = [];
    this.materials = [];
    this.shimmerLines = [];
    this.shimmerMaterials = [];
  }
}
