import * as THREE from 'three';
import {
  seabedVertexShader,
  seabedFragmentShader,
  particleVertexShader,
  particleFragmentShader,
  uwFishVertexShader,
  uwFishFragmentShader,
  decorVertexShader,
  decorFragmentShader,
  surfaceVertexShader,
  surfaceFragmentShader,
} from './UnderwaterShader';
import { BLOOM_LAYER } from './constants';
import type { Species } from '../hooks/useSpeciesData';

// ---------------------------------------------------------------------------
// UnderwaterScene — immersive underwater environment.
//
// Creates seabed, caustics, floating particles, and scattered fish
// sprites in 3D space. Used when the user dives into an ocean region.
// ---------------------------------------------------------------------------

/** Data needed to spawn a fish in the underwater scene. */
export interface UnderwaterFishData {
  species: Species;
  uvRect: { x: number; y: number; w: number; h: number };
  sheetWidth: number;
  sheetHeight: number;
  facingLeft: boolean;
}

export class UnderwaterScene {
  readonly group = new THREE.Group();
  private seabed: THREE.Mesh | null = null;
  private particles: THREE.Points | null = null;
  private fishMeshRight: THREE.InstancedMesh | null = null;  // right-facing fish
  private fishMeshLeft: THREE.InstancedMesh | null = null;   // left-facing fish
  private decorMesh: THREE.InstancedMesh | null = null;
  private fishMatRight: THREE.ShaderMaterial | null = null;
  private fishMatLeft: THREE.ShaderMaterial | null = null;
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
    const seabedGeo = new THREE.PlaneGeometry(600, 600, 128, 128);
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

    // ── Seabed decorations (coral/reef sprites from atlas) ──────────────────
    // Gather coral/reef species UVs for seabed decorations
    const CORAL_KEYWORDS = ['珊瑚', '海葵', '海绵', '砗磲', '海星', '海胆', '海百合',
      'coral', 'anemone', 'sponge', 'urchin', 'clam', 'starfish'];
    const SKIP_KEYWORDS = /鲸|鲨|海豚|海豹|海狮|海龟|鱼|whale|shark|dolphin|seal|turtle|fish|ray/i;
    const decorUVs: { x: number; y: number; w: number; h: number; sheetW: number; sheetH: number }[] = [];
    if (atlasTexture) {
      for (const fd of nearbyFish) {
        const name = (fd.species.nameZh + ' ' + fd.species.name).toLowerCase();
        if (CORAL_KEYWORDS.some(k => name.includes(k))) {
          decorUVs.push({ ...fd.uvRect, sheetW: fd.sheetWidth, sheetH: fd.sheetHeight });
        }
      }
      // Fallback: use small/static species only — never large swimming animals
      if (decorUVs.length < 3) {
        for (const fd of nearbyFish) {
          const name = `${fd.species.nameZh} ${fd.species.name}`;
          if (SKIP_KEYWORDS.test(name)) continue;
          if (fd.species.display.scale === 'large' || fd.species.display.scale === 'massive') continue;
          decorUVs.push({ ...fd.uvRect, sheetW: fd.sheetWidth, sheetH: fd.sheetHeight });
        }
      }
    }
    if (atlasTexture && decorUVs.length > 0) {
      this.buildDecorations(atlasTexture, decorUVs);
    }

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
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 100,
      );
      this.fillLights.push(pl);
      this.group.add(pl);
    }

    // ── Ocean surface shimmer (above) ───────────────────────────────────
    const surfaceGeo = new THREE.PlaneGeometry(600, 600, 1, 1);
    surfaceGeo.rotateX(Math.PI / 2);
    const surfaceMat = new THREE.ShaderMaterial({
      vertexShader: surfaceVertexShader,
      fragmentShader: surfaceFragmentShader,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.push(surfaceMat);
    const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
    surface.position.y = 30;
    this.group.add(surface);

    // ── Fish ────────────────────────────────────────────────────────────
    if (atlasTexture && nearbyFish.length > 0) {
      this.buildFish(atlasTexture, nearbyFish);
    }

    this.group.visible = false;
  }

  // ─── Floating Particles ─────────────────────────────────────────────────

  private buildParticles(): void {
    const COUNT = 600;
    const positions = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const phases = new Float32Array(COUNT);
    const brightnesses = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
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

  // ─── Underwater Fish — two groups: right-facing and left-facing ─────────

  private buildFish(
    atlasTexture: THREE.Texture,
    fishData: UnderwaterFishData[],
  ): void {
    const COPIES = 5;

    // Split fish by facing direction — exclude coral/reef species (they go in decorations only)
    const CORAL_SKIP = /珊瑚|海葵|海绵|砗磲|海星|海胆|coral|anemone|sponge|urchin|starfish/i;
    const rightFish: UnderwaterFishData[] = [];
    const leftFish: UnderwaterFishData[] = [];
    for (const fd of fishData) {
      const name = `${fd.species.nameZh} ${fd.species.name}`;
      if (CORAL_SKIP.test(name)) continue; // corals are decorations, not swimming fish
      (fd.facingLeft ? leftFish : rightFish).push(fd);
    }

    this.fishCount = (rightFish.length + leftFish.length) * COPIES;
    console.log(`[UnderwaterScene] fish split: ${rightFish.length} right-facing, ${leftFish.length} left-facing`);

    // Build right-facing group (orbit direction = -1)
    if (rightFish.length > 0) {
      const { mesh, mat } = this.buildFishGroup(atlasTexture, rightFish, COPIES, -1.0);
      this.fishMeshRight = mesh;
      this.fishMatRight = mat;
      this.group.add(mesh);
    }

    // Build left-facing group (orbit direction = +1)
    if (leftFish.length > 0) {
      const { mesh, mat } = this.buildFishGroup(atlasTexture, leftFish, COPIES, 1.0);
      this.fishMeshLeft = mesh;
      this.fishMatLeft = mat;
      this.group.add(mesh);
    }
  }

  /** Build one InstancedMesh for a group of fish with the same orbit direction. */
  private buildFishGroup(
    atlasTexture: THREE.Texture,
    fishData: UnderwaterFishData[],
    copies: number,
    orbitDir: number,
  ): { mesh: THREE.InstancedMesh; mat: THREE.ShaderMaterial } {
    const total = fishData.length * copies;
    const geo = new THREE.PlaneGeometry(1, 1);

    const posArr = new Float32Array(total * 3);
    const uvArr = new Float32Array(total * 4);
    const phaseArr = new Float32Array(total);
    const sizeArr = new Float32Array(total * 2);
    const colorArr = new Float32Array(total * 3);
    const velArr = new Float32Array(total * 3);

    let idx = 0;
    for (const fd of fishData) {
      for (let c = 0; c < copies; c++) {
        const radius = 25 + Math.random() * 100;
        const theta = Math.random() * Math.PI * 2;
        const yPos = -10 + Math.random() * 20;

        posArr[idx * 3] = radius * Math.cos(theta);
        posArr[idx * 3 + 1] = yPos;
        posArr[idx * 3 + 2] = radius * Math.sin(theta);

        uvArr[idx * 4] = fd.uvRect.x / fd.sheetWidth;
        uvArr[idx * 4 + 1] = fd.uvRect.y / fd.sheetHeight;
        uvArr[idx * 4 + 2] = fd.uvRect.w / fd.sheetWidth;
        uvArr[idx * 4 + 3] = fd.uvRect.h / fd.sheetHeight;

        phaseArr[idx] = Math.random() * Math.PI * 2 * 20;

        const PX_TO_WORLD_UW = 120;
        const scaleMult = fd.species.display.scale === 'massive' ? 8.0
                        : fd.species.display.scale === 'large' ? 5.0
                        : fd.species.display.scale === 'medium' ? 2.0
                        : 1.0;
        const aspect = fd.uvRect.w / fd.uvRect.h;
        const worldH = (fd.uvRect.h / PX_TO_WORLD_UW) * scaleMult;
        sizeArr[idx * 2] = worldH * aspect;
        sizeArr[idx * 2 + 1] = worldH;

        const hex = fd.species.display.color || '#4cc9f0';
        colorArr[idx * 3] = parseInt(hex.slice(1, 3), 16) / 255;
        colorArr[idx * 3 + 1] = parseInt(hex.slice(3, 5), 16) / 255;
        colorArr[idx * 3 + 2] = parseInt(hex.slice(5, 7), 16) / 255;

        velArr[idx * 3] = 0.3 + Math.random() * 0.7;
        velArr[idx * 3 + 1] = 0.2 + Math.random() * 0.3;
        velArr[idx * 3 + 2] = 0.3 + Math.random() * 0.7;

        idx++;
      }
    }

    geo.setAttribute('instancePos', new THREE.InstancedBufferAttribute(posArr, 3));
    geo.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(uvArr, 4));
    geo.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(phaseArr, 1));
    geo.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(sizeArr, 2));
    geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colorArr, 3));
    geo.setAttribute('instanceVelocity', new THREE.InstancedBufferAttribute(velArr, 3));

    const mat = new THREE.ShaderMaterial({
      vertexShader: uwFishVertexShader,
      fragmentShader: uwFishFragmentShader,
      uniforms: {
        uAtlas: { value: atlasTexture },
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uOrbitDir: { value: orbitDir },  // +1 or -1 hardcoded per group
        uFogColor: { value: new THREE.Color(0x041830) },
        uFogDensity: { value: 0.02 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.materials.push(mat);

    const mesh = new THREE.InstancedMesh(geo, mat, total);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < total; i++) mesh.setMatrixAt(i, identity);
    mesh.instanceMatrix.needsUpdate = true;

    return { mesh, mat };
  }

  // ─── Underwater Decorations (sprite-based corals & reef life) ───────────

  private buildDecorations(atlasTexture: THREE.Texture, decorUVs: { x: number; y: number; w: number; h: number; sheetW: number; sheetH: number }[]): void {
    if (decorUVs.length === 0) return;
    const COUNT = 1000;
    const geo = new THREE.PlaneGeometry(1, 1);

    const posArr = new Float32Array(COUNT * 3);
    const sizeArr = new Float32Array(COUNT * 2);
    const uvArr = new Float32Array(COUNT * 4);
    const phaseArr = new Float32Array(COUNT);

    // Terrain height sampling (must match seabed shader noise)
    const hash = (x: number, y: number) => {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const noise2d = (px: number, py: number) => {
      const ix = Math.floor(px), iy = Math.floor(py);
      const fx = px - ix, fy = py - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = hash(ix, iy), b = hash(ix + 1, iy);
      const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
    const terrainHeight = (x: number, z: number) => {
      const u = x * 0.02, v = z * 0.02;
      return noise2d(u, v) * 8.0 + noise2d(u * 2.5, v * 2.5) * 4.0 + noise2d(u * 6, v * 6) * 1.5
           + Math.pow(noise2d(u * 1.5 + 3.7, v * 1.5 + 1.2), 3) * 20.0;
    };

    // Generate cluster centers
    const CLUSTER_COUNT = 80;
    const clusterCenters: {x: number, z: number}[] = [];
    for (let c = 0; c < CLUSTER_COUNT; c++) {
      const distBias = Math.pow(Math.random(), 0.5);
      const r = 8 + distBias * 140;
      const a = Math.random() * Math.PI * 2;
      clusterCenters.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }

    for (let i = 0; i < COUNT; i++) {
      // Pick a random cluster center, then scatter around it
      const cluster = clusterCenters[Math.floor(Math.random() * clusterCenters.length)];
      const jitter = 3 + Math.random() * 8; // 3-11 unit spread within cluster
      const jAngle = Math.random() * Math.PI * 2;
      const x = cluster.x + Math.cos(jAngle) * jitter;
      const z = cluster.z + Math.sin(jAngle) * jitter;
      const y = terrainHeight(x, z) - 25;

      posArr[i * 3] = x;
      posArr[i * 3 + 1] = y;
      posArr[i * 3 + 2] = z;

      phaseArr[i] = Math.random() * Math.PI * 2;

      // Pick a random coral sprite
      const uv = decorUVs[Math.floor(Math.random() * decorUVs.length)];
      uvArr[i * 4] = uv.x / uv.sheetW;
      uvArr[i * 4 + 1] = uv.y / uv.sheetH;
      uvArr[i * 4 + 2] = uv.w / uv.sheetW;
      uvArr[i * 4 + 3] = uv.h / uv.sheetH;

      // Size based on sprite proportions — large enough to be visible
      const scale = 0.6 + Math.random() * 1.4; // 0.6 to 2.0
      const aspect = uv.w / uv.h;
      sizeArr[i * 2] = scale * aspect;
      sizeArr[i * 2 + 1] = scale;
    }

    geo.setAttribute('instancePos', new THREE.InstancedBufferAttribute(posArr, 3));
    geo.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(sizeArr, 2));
    geo.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(uvArr, 4));
    geo.setAttribute('instancePhase', new THREE.InstancedBufferAttribute(phaseArr, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: decorVertexShader,
      fragmentShader: decorFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAtlas: { value: atlasTexture },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.materials.push(mat);

    this.decorMesh = new THREE.InstancedMesh(geo, mat, COUNT);
    this.decorMesh.frustumCulled = false;
    this.decorMesh.renderOrder = 7;
    this.decorMesh.layers.enable(BLOOM_LAYER);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < COUNT; i++) this.decorMesh.setMatrixAt(i, identity);
    this.decorMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.decorMesh);
  }

  // ─── Update (called each frame) ────────────────────────────────────────

  update(time: number, camera: THREE.Camera): void {
    for (const mat of this.materials) {
      if (mat.uniforms.uTime) mat.uniforms.uTime.value = time;
    }
    // Pass camera position to fish shaders so they orbit around the camera
    if (this.fishMatRight?.uniforms.uCamPos) {
      this.fishMatRight.uniforms.uCamPos.value.copy(camera.position);
    }
    if (this.fishMatLeft?.uniforms.uCamPos) {
      this.fishMatLeft.uniforms.uCamPos.value.copy(camera.position);
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
    this.particles = null;
    this.fishMeshRight = null;
    this.fishMeshLeft = null;
    this.decorMesh = null;
    this.fishMatRight = null;
    this.fishMatLeft = null;
    this.surfaceLight = null;
    this.ambientLight = null;
    this.fillLights = [];
    this.materials = [];
    this.fog = null;
    this.fishCount = 0;
  }
}
