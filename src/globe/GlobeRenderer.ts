import * as THREE from 'three';
import { createEarthMesh, type EarthMeshOptions } from './EarthMesh';
import { createAtmosphere, type AtmosphereConfig } from './AtmosphereShader';
import { SpeciesLayer } from './SpeciesLayer';
import { TrailLayer } from './TrailLayer';
import { latLngToVec3, GLOBE_RADIUS } from './coordUtils';

// ---------------------------------------------------------------------------
// GlobeRenderer — single RAF loop, custom spherical camera, ACES tone mapping.
//
// Camera uses exponential smoothing (ported from openglobes-solar):
//   rotation → near-instant (0.0001 time constant)
//   zoom/pan → smooth fluid  (0.008 time constant)
// ---------------------------------------------------------------------------

export interface GlobeThemeConfig {
  globeTexture: string;
  atmosphereColor: string;
  backgroundColor: string;
  terrain?: EarthMeshOptions;
  atmosphere?: AtmosphereConfig;
}

export class GlobeRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Custom spherical camera state (no OrbitControls)
  private curAngle = { theta: 0.3, phi: Math.PI / 3 };
  private tgtAngle = { theta: 0.3, phi: Math.PI / 3 };
  private curDist = 350;
  private tgtDist = 350;
  private curTarget = new THREE.Vector3();
  private tgtTarget = new THREE.Vector3();

  // Pointer state
  private isDragging = false;
  private lastPointer = { x: 0, y: 0 };
  private pinchDist = 0;

  // Scene objects
  private earth: THREE.Mesh | null = null;
  private atmo: { rim: THREE.Mesh; haze: THREE.Mesh; update: (c: THREE.Camera) => void } | null = null;
  private ambientLight: THREE.AmbientLight;
  private fillLight: THREE.PointLight;

  readonly speciesLayer: SpeciesLayer;
  readonly trailLayer: TrailLayer;

  private frameId = 0;
  private lastTime = 0;
  private elapsedTime = 0;
  private onFrameCb: ((dt: number) => void) | null = null;
  private container: HTMLElement | null = null;

  constructor() {
    // Renderer — ACES cinematic tone mapping
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);

    // Lighting
    this.ambientLight = new THREE.AmbientLight(0x405060, 0.8);
    this.scene.add(this.ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
    dirLight.position.set(1, 1, 1);
    this.scene.add(dirLight);

    // Camera fill light — softens shadow side, fades with distance
    this.fillLight = new THREE.PointLight(0xffffff, 1.5, 0, 0);
    this.scene.add(this.fillLight);

    // Layers
    this.speciesLayer = new SpeciesLayer(this.scene);
    this.trailLayer = new TrailLayer(this.scene);
  }

  // ─── Mount ──────────────────────────────────────────────────────────────

  private mounted = false;

  mount(container: HTMLElement): void {
    if (this.mounted) return; // prevent double-mount (React StrictMode)
    this.mounted = true;
    this.container = container;
    container.appendChild(this.renderer.domElement);
    this.handleResize();
    window.addEventListener('resize', this.handleResize);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd);

    this.animate();
  }

  // ─── Theme ──────────────────────────────────────────────────────────────

  setTheme(config: GlobeThemeConfig): void {
    // Remove + dispose old earth + atmosphere (prevent GPU memory leak)
    if (this.earth) {
      this.scene.remove(this.earth);
      this.earth.geometry.dispose();
      (this.earth.material as THREE.Material).dispose();
      this.earth = null;
    }
    if (this.atmo) {
      this.scene.remove(this.atmo.rim);
      this.scene.remove(this.atmo.haze);
      this.atmo.rim.geometry.dispose();
      (this.atmo.rim.material as THREE.Material).dispose();
      this.atmo.haze.geometry.dispose();
      (this.atmo.haze.material as THREE.Material).dispose();
      this.atmo = null;
    }

    // Background
    this.scene.background = new THREE.Color(config.backgroundColor);

    // Earth
    this.earth = createEarthMesh(config.terrain ?? { textureUrl: config.globeTexture });
    this.scene.add(this.earth);

    // Atmosphere (dual-layer)
    this.atmo = createAtmosphere(
      config.atmosphere ?? config.atmosphereColor,
      GLOBE_RADIUS,
    );
    this.scene.add(this.atmo.rim);
    this.scene.add(this.atmo.haze);
  }

  // ─── Accessors ──────────────────────────────────────────────────────────

  getCamera(): THREE.PerspectiveCamera { return this.camera; }
  getRenderer(): THREE.WebGLRenderer { return this.renderer; }

  /** OrbitControls-compatible target for flyTo (returns the target vector). */
  getControls(): { target: THREE.Vector3; update: () => void; autoRotate: boolean } {
    return {
      target: this.tgtTarget,
      update: () => {},
      autoRotate: false,
    };
  }

  getCoords(lat: number, lng: number, alt?: number): { x: number; y: number; z: number } {
    const v = latLngToVec3(lat, lng, GLOBE_RADIUS, alt);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** Set the per-frame callback (replaces any previous — only one allowed). */
  onFrame(cb: (dt: number) => void): void {
    this.onFrameCb = cb;
  }

  /** Fly camera to look at a lat/lng. */
  flyTo(lat: number, lng: number, dist?: number, duration = 2000): void {
    const target = latLngToVec3(lat, lng, GLOBE_RADIUS, 0);
    const dir = target.clone().normalize();

    // Compute spherical angles for the target direction
    this.tgtAngle.phi = Math.acos(Math.max(-0.999, Math.min(0.999, dir.y)));
    this.tgtAngle.theta = Math.atan2(dir.x, dir.z);
    if (dist !== undefined) this.tgtDist = dist;
    this.tgtTarget.set(0, 0, 0);
  }

  // ─── Pointer handling (custom spherical camera) ─────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    this.isDragging = true;
    this.lastPointer.x = e.clientX;
    this.lastPointer.y = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer.x = e.clientX;
    this.lastPointer.y = e.clientY;

    this.tgtAngle.theta -= dx * 0.004;
    this.tgtAngle.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
      this.tgtAngle.phi - dy * 0.004));
  };

  private onPointerUp = (): void => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const zoomPct = this.tgtDist < 200 ? 0.001 : 0.0005;
    this.tgtDist = Math.max(120, Math.min(500,
      this.tgtDist * (1 + e.deltaY * zoomPct)));
  };

  // Touch (pinch zoom)
  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  };
  private onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = this.pinchDist - dist;
      this.tgtDist = Math.max(120, Math.min(500, this.tgtDist * (1 + delta * 0.003)));
      this.pinchDist = dist;
    }
  };
  private onTouchEnd = (): void => { this.pinchDist = 0; };

  // ─── Animation loop ─────────────────────────────────────────────────────

  private animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate);
    const now = performance.now() / 1000;
    const dt = this.lastTime > 0 ? Math.min(now - this.lastTime, 0.1) : 0.016;
    this.lastTime = now;
    this.elapsedTime += dt;

    // Exponential smoothing (solar-style split damping)
    const lfRot = 1 - Math.pow(0.0001, dt);  // rotation: near-instant
    const lfZoom = 1 - Math.pow(0.008, dt);   // zoom/position: smooth fluid

    this.curAngle.theta += (this.tgtAngle.theta - this.curAngle.theta) * lfRot;
    this.curAngle.phi += (this.tgtAngle.phi - this.curAngle.phi) * lfRot;
    this.curDist += (this.tgtDist - this.curDist) * lfZoom;
    this.curTarget.lerp(this.tgtTarget, lfZoom);

    // Spherical → Cartesian camera position
    const sinPhi = Math.sin(this.curAngle.phi);
    this.camera.position.set(
      this.curTarget.x + this.curDist * sinPhi * Math.sin(this.curAngle.theta),
      this.curTarget.y + this.curDist * Math.cos(this.curAngle.phi),
      this.curTarget.z + this.curDist * sinPhi * Math.cos(this.curAngle.theta),
    );
    this.camera.lookAt(this.curTarget);

    // Dynamic near/far — only update projection when values actually change
    const newNear = Math.max(this.curDist * 0.01, 0.1);
    const newFar = Math.max(this.curDist * 100, 2000);
    if (Math.abs(this.camera.near - newNear) > 0.01 || Math.abs(this.camera.far - newFar) > 1) {
      this.camera.near = newNear;
      this.camera.far = newFar;
      this.camera.updateProjectionMatrix();
    }

    // Fill light follows camera, intensity fades with distance
    this.fillLight.position.copy(this.camera.position);
    const fillIntensity = this.curDist < 200 ? 1.5 : Math.max(0, 1.5 - (this.curDist - 200) * 0.005);
    this.fillLight.intensity = fillIntensity;

    // Update atmosphere
    this.atmo?.update(this.camera);

    // Update species (GPU uniforms only)
    this.speciesLayer.update(this.elapsedTime, this.camera);

    // Update trails
    this.trailLayer.update(dt);

    // External callback
    this.onFrameCb?.(dt);

    this.renderer.render(this.scene, this.camera);
  };

  // ─── Resize ─────────────────────────────────────────────────────────────

  private handleResize = (): void => {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // ─── Dispose ────────────────────────────────────────────────────────────

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.handleResize);

    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);

    this.speciesLayer.dispose();
    this.trailLayer.dispose();
    if (this.earth) { this.scene.remove(this.earth); }
    if (this.atmo) { this.scene.remove(this.atmo.rim); this.scene.remove(this.atmo.haze); }
    this.renderer.dispose();
    el.remove();
  }
}
