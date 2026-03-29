import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { latLngToVec3, GLOBE_RADIUS } from './coordUtils';

export interface TrailData {
  waypoints: { lat: number; lng: number }[];
  color: string;
  width?: number;
  speed?: number;
}

export class TrailLayer {
  private scene: THREE.Scene;
  private lines: Line2[] = [];
  private materials: LineMaterial[] = [];
  private time = 0;
  private frameCount = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(trails: TrailData[], resolution: THREE.Vector2): void {
    this.dispose();

    const v = new THREE.Vector3();

    for (const trail of trails) {
      const points: number[] = [];

      for (let i = 0; i < trail.waypoints.length - 1; i++) {
        const from = trail.waypoints[i];
        const to = trail.waypoints[i + 1];
        // Reduced interpolation: 8 steps (was 20) — 60% fewer vertices
        const steps = 8;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          latLngToVec3(
            from.lat + (to.lat - from.lat) * t,
            from.lng + (to.lng - from.lng) * t,
            GLOBE_RADIUS, 0.005, v,
          );
          points.push(v.x, v.y, v.z);
        }
      }

      if (points.length < 6) continue;

      const geometry = new LineGeometry();
      geometry.setPositions(points);

      const material = new LineMaterial({
        color: new THREE.Color(trail.color || '#4cc9f0').getHex(),
        linewidth: trail.width ?? 1.5,
        transparent: true,
        opacity: 0.4,
        resolution,
        dashed: true,
        dashScale: 1,
        dashSize: 3,
        gapSize: 2,
      });

      const line = new Line2(geometry, material);
      line.computeLineDistances();
      this.scene.add(line);
      this.lines.push(line);
      this.materials.push(material);
    }
  }

  /** Animate dash offset — only update every 3 frames to reduce overhead. */
  update(dt: number): void {
    this.time += dt;
    this.frameCount++;
    // 91 materials × dashOffset write is expensive — throttle to every 3rd frame
    if (this.frameCount % 3 !== 0) return;
    const offset = -this.time * 2;
    for (let i = 0, len = this.materials.length; i < len; i++) {
      this.materials[i].dashOffset = offset;
    }
  }

  setVisible(visible: boolean): void {
    for (const line of this.lines) line.visible = visible;
  }

  dispose(): void {
    for (const line of this.lines) {
      this.scene.remove(line);
      line.geometry.dispose();
    }
    for (const mat of this.materials) mat.dispose();
    this.lines = [];
    this.materials = [];
  }
}
