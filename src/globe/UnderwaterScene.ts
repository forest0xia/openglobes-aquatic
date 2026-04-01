import * as THREE from 'three';
import {
  seabedVertexShader,
  seabedFragmentShader,
  godRayVertexShader,
  godRayFragmentShader,
  particleVertexShader,
  particleFragmentShader,
  uwFishVertexShader,
  uwFishFragmentShader,
} from './UnderwaterShader';
import type { Species } from '../hooks/useSpeciesData';

// ---------------------------------------------------------------------------
// UnderwaterScene — immersive underwater environment.
//
// Creates seabed, caustics, god rays, floating particles, and scattered fish
// sprites in 3D space. Used when the user dives into an ocean region.
// ---------------------------------------------------------------------------

/** Data needed to spawn a fish in the underwater scene. */
export interface UnderwaterFishData {
  species: Species;
  uvRect: { x: number; y: number; w: number; h: number };
  sheetWidth: number;
  sheetHeight: number;
}

export class UnderwaterScene {
  readonly group = new THREE.Group();
  private seabed: THREE.Mesh | null = null;
  private godRays: THREE.Mesh | null = null;
  private particles: THREE.Points | null = null;
  private fishMesh: THREE.InstancedMesh | null = null;
  private fishMaterial: THREE.ShaderMaterial | null = null;
  private materials: THREE.ShaderMaterial[] = [];
  private fog: THREE.FogExp2 | null = null;
  private surfaceLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private fillLights: THREE.PointLight[] = [];

  /** Number of fish instances in the scene. */
  fishCount = 0;

  // -------------------------------------------------------------------------
  // build — create the full underwater environment
  // -------------------------------------------------------------------------

  build(
    atlasTexture: THREE.Texture | null,
    nearbyFish: UnderwaterFishData[],
  ): void {
    this.dispose();

    // ── Seabed ──────────────────────────────────────────────────────────
    const seabedGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
    seabedGeo.rotateX(-Math.PI / 2);
    const seabedMat = new THREE.ShaderMaterial({
      vertexShader: seabedVertexShader,
      fragmentShader: seabedFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(0x0a1a2a) },
        uCausticColor: { value: new THREE.Color(0x2288bb) },
      },
    });
    this.seabed = new THREE.Mesh(seabedGeo, seabedMat);
    this.seabed.position.y = -25;
    this.materials.push(seabedMat);
    this.group.add(this.seabed);

    // ── God rays ────────────────────────────────────────────────────────
    this.buildGodRays();

    // ── Floating particles ──────────────────────────────────────────────
    this.buildParticles();

    // ── Lighting ────────────────────────────────────────────────────────
    // Main surface light — simulates sunlight filtering through water
    this.surfaceLight = new THREE.DirectionalLight(0x4488cc, 2.0);
    this.surfaceLight.position.set(5, 40, 5);
    this.group.add(this.surfaceLight);

    // Ambient — deep ocean blue fill
    this.ambientLight = new THREE.AmbientLight(0x0a2040, 1.2);
    this.group.add(this.ambientLight);

    // Scattered point lights for bioluminescent ambiance
    const bioColors = [0x00ccff, 0x00ff88, 0x4488ff, 0x22aacc];
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight(bioColors[i], 0.5, 30, 2);
      pl.position.set(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 40,
      );
      this.fillLights.push(pl);
      this.group.add(pl);
    }

    // ── Ocean surface shimmer (above) ───────────────────────────────────
    const surfaceGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
    surfaceGeo.rotateX(Math.PI / 2);
    const surfaceMat = new THREE.MeshBasicMaterial({
      color: 0x1155aa,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
    surface.position.y = 30;
    this.group.add(surface);

    // ── Fish ────────────────────────────────────────────────────────────
    if (atlasTexture && nearbyFish.length > 0) {
      this.buildFish(atlasTexture, nearbyFish);
    }

    this.group.visible = false;
  }

  // ─── God Rays ───────────────────────────────────────────────────────────

  private buildGodRays(): void {
    const RAY_COUNT = 12;
    const geo = new THREE.PlaneGeometry(1, 60, 1, 1);

    const offsets = new Float32Array(RAY_COUNT);
    const speeds = new Float32Array(RAY_COUNT);
    const opacities = new Float32Array(RAY_COUNT);
    const widths = new Float32Array(RAY_COUNT);
    const positions = new Float32Array(RAY_COUNT * 3);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < RAY_COUNT; i++) {
      offsets[i] = Math.random();
      speeds[i] = 0.3 + Math.random() * 0.7;
      opacities[i] = 0.2 + Math.random() * 0.5;
      widths[i] = 1.5 + Math.random() * 4;
    }

    const rayMat = new THREE.ShaderMaterial({
      vertexShader: godRayVertexShader,
      fragmentShader: godRayFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uRayColor: { value: new THREE.Color(0x88ccff) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.materials.push(rayMat);

    const mesh = new THREE.InstancedMesh(geo, rayMat, RAY_COUNT);
    for (let i = 0; i < RAY_COUNT; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * 80,
        5,
        (Math.random() - 0.5) * 80,
      );
      // Slight random tilt
      dummy.rotation.z = (Math.random() - 0.5) * 0.15;
      dummy.scale.set(widths[i], 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Store per-instance attributes
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
    geo.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(opacities, 1));
    geo.setAttribute('aWidth', new THREE.InstancedBufferAttribute(widths, 1));

    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.godRays = mesh;
    this.group.add(mesh);
  }

  // ─── Floating Particles ─────────────────────────────────────────────────

  private buildParticles(): void {
    const COUNT = 600;
    const positions = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const phases = new Float32Array(COUNT);
    const brightnesses = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
      sizes[i] = 1.0 + Math.random() * 3.0;
      phases[i] = Math.random() * Math.PI * 2;
      brightnesses[i] = 0.3 + Math.random() * 0.7;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geo.setAttribute('aBrightness', new THREE.Float32BufferAttribute(brightnesses, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uParticleColor: { value: new THREE.Color(0x88ccff) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.materials.push(mat);

    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
  }

  // ─── Underwater Fish ────────────────────────────────────────────────────

  private buildFish(
    atlasTexture: THREE.Texture,
    fishData: UnderwaterFishData[],
  ): void {
    // Scatter multiple copies of each species
    const COPIES_PER_SPECIES = 3;
    const totalFish = fishData.length * COPIES_PER_SPECIES;
    this.fishCount = totalFish;

    const geo = new THREE.PlaneGeometry(1, 1);

    const posArr = new Float32Array(totalFish * 3);
    const uvArr = new Float32Array(totalFish * 4);
    const phaseArr = new Float32Array(totalFish);
    const animArr = new Float32Array(totalFish);
    const sizeArr = new Float32Array(totalFish * 2);
    const colorArr = new Float32Array(totalFish * 3);
    const velArr = new Float32Array(totalFish * 3);

    let idx = 0;
    for (const fd of fishData) {
      for (let copy = 0; copy < COPIES_PER_SPECIES; copy++) {
        // Scatter fish in a sphere around the camera origin
        const radius = 8 + Math.random() * 25;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        // Constrain vertical range (more fish at eye level)
        const adjustedPhi = Math.PI * 0.3 + phi * 0.4;

        posArr[idx * 3] = radius * Math.sin(adjustedPhi) * Math.cos(theta);
        posArr[idx * 3 + 1] = radius * Math.cos(adjustedPhi) - 5; // slightly below center
        posArr[idx * 3 + 2] = radius * Math.sin(adjustedPhi) * Math.sin(theta);

        // UV from spritesheet
        uvArr[idx * 4] = fd.uvRect.x / fd.sheetWidth;
        uvArr[idx * 4 + 1] = fd.uvRect.y / fd.sheetHeight;
        uvArr[idx * 4 + 2] = fd.uvRect.w / fd.sheetWidth;
        uvArr[idx * 4 + 3] = fd.uvRect.h / fd.sheetHeight;

        phaseArr[idx] = Math.random() * Math.PI * 2 * 20;
        animArr[idx] = 1; // swimming

        // Size — slightly larger than globe view for immersion
        const scale = 1.5 + Math.random() * 1.5;
        const aspect = fd.uvRect.w / fd.uvRect.h;
        sizeArr[idx * 2] = scale * aspect;
        sizeArr[idx * 2 + 1] = scale;

        // Color
        const hex = fd.species.display.color || '#4cc9f0';
        colorArr[idx * 3] = parseInt(hex.slice(1, 3), 16) / 255;
        colorArr[idx * 3 + 1] = parseInt(hex.slice(3, 5), 16) / 255;
        colorArr[idx * 3 + 2] = parseInt(hex.slice(5, 7), 16) / 255;

        // Velocity — determines swimming pattern
        velArr[idx * 3] = 0.3 + Math.random() * 0.7;
        velArr[idx * 3 + 1] = 0.2 + Math.random() * 0.3;
        velArr[idx * 3 + 2] = 0.3 + Math.random() * 0.7;

        idx++;
      }
    }

    geo.setAttribute('instancePos', new THREE.InstancedBufferAttribute(posArr, 3));
    geo.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(uvArr, 4));
    geo.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(phaseArr, 1));
    geo.setAttribute('instanceAnim', new THREE.InstancedBufferAttribute(animArr, 1));
    geo.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(sizeArr, 2));
    geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colorArr, 3));
    geo.setAttribute('instanceVelocity', new THREE.InstancedBufferAttribute(velArr, 3));

    this.fishMaterial = new THREE.ShaderMaterial({
      vertexShader: uwFishVertexShader,
      fragmentShader: uwFishFragmentShader,
      uniforms: {
        uAtlas: { value: atlasTexture },
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(0x041830) },
        uFogDensity: { value: 0.02 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.materials.push(this.fishMaterial);

    this.fishMesh = new THREE.InstancedMesh(geo, this.fishMaterial, totalFish);
    this.fishMesh.frustumCulled = false;
    this.fishMesh.renderOrder = 10;

    // All transforms done in shader
    const identity = new THREE.Matrix4();
    for (let i = 0; i < totalFish; i++) {
      this.fishMesh.setMatrixAt(i, identity);
    }
    this.fishMesh.instanceMatrix.needsUpdate = true;

    this.group.add(this.fishMesh);
  }

  // ─── Update (called each frame) ────────────────────────────────────────

  update(time: number, _camera: THREE.Camera): void {
    for (const mat of this.materials) {
      if (mat.uniforms.uTime) mat.uniforms.uTime.value = time;
    }

    // Gently sway the bioluminescent point lights
    for (let i = 0; i < this.fillLights.length; i++) {
      const pl = this.fillLights[i];
      pl.position.x += Math.sin(time * 0.2 + i * 1.5) * 0.01;
      pl.position.z += Math.cos(time * 0.15 + i * 2.0) * 0.01;
      pl.intensity = 0.3 + 0.2 * Math.sin(time * 0.8 + i * 3.0);
    }
  }

  // ─── Show / Hide ───────────────────────────────────────────────────────

  show(): void {
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  // ─── Fog setup — call on the scene ─────────────────────────────────────

  /** Returns a FogExp2 for the underwater scene. Store reference to swap back. */
  createFog(): THREE.FogExp2 {
    this.fog = new THREE.FogExp2(0x041830, 0.012);
    return this.fog;
  }

  // ─── Dispose ───────────────────────────────────────────────────────────

  dispose(): void {
    // Remove all children
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    }

    this.seabed = null;
    this.godRays = null;
    this.particles = null;
    this.fishMesh = null;
    this.fishMaterial = null;
    this.surfaceLight = null;
    this.ambientLight = null;
    this.fillLights = [];
    this.materials = [];
    this.fog = null;
    this.fishCount = 0;
  }
}
