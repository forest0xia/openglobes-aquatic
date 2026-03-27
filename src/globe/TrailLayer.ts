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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(trails: TrailData[], resolution: THREE.Vector2): void {
    this.dispose();

    for (const trail of trails) {
      // Interpolate waypoints to create smooth curve
      const points: number[] = [];
      const v = new THREE.Vector3();

      for (let i = 0; i < trail.waypoints.length - 1; i++) {
        const from = trail.waypoints[i];
        const to = trail.waypoints[i + 1];
        const steps = 20; // interpolation steps per segment
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const lat = from.lat + (to.lat - from.lat) * t;
          const lng = from.lng + (to.lng - from.lng) * t;
          latLngToVec3(lat, lng, GLOBE_RADIUS, 0.005, v); // slightly above surface
          points.push(v.x, v.y, v.z);
        }
      }

      if (points.length < 6) continue; // need at least 2 points

      const geometry = new LineGeometry();
      geometry.setPositions(points);

      const color = new THREE.Color(trail.color || '#4cc9f0');
      const material = new LineMaterial({
        color: color.getHex(),
        linewidth: trail.width ?? 1.5, // pixels
        transparent: true,
        opacity: 0.4,
        resolution: resolution,
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

  /** Animate dash offset for flowing effect */
  update(dt: number): void {
    this.time += dt;
    for (const mat of this.materials) {
      mat.dashOffset = -this.time * 2; // flow speed
    }
  }

  setVisible(visible: boolean): void {
    for (const line of this.lines) {
      line.visible = visible;
    }
  }

  dispose(): void {
    for (const line of this.lines) {
      this.scene.remove(line);
      line.geometry.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
    this.lines = [];
    this.materials = [];
  }
}
