import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createEarthMesh, type EarthMeshOptions } from './EarthMesh';
import { createAtmosphere } from './AtmosphereShader';
import { SpeciesLayer } from './SpeciesLayer';
import { TrailLayer } from './TrailLayer';
import { latLngToVec3, GLOBE_RADIUS } from './coordUtils';

// ---------------------------------------------------------------------------
// GlobeRenderer — scene orchestrator that owns the Three.js scene, camera,
// renderer, orbit controls, and all visual layers (earth, atmosphere,
// species sprites, migration trails).
//
// Usage:
//   const globe = new GlobeRenderer();
//   globe.mount(containerDiv);
//   globe.setTheme({ globeTexture, atmosphereColor, backgroundColor });
//   // ... later
//   globe.dispose();
// ---------------------------------------------------------------------------

export interface GlobeThemeConfig {
  globeTexture: string;
  atmosphereColor: string;
  backgroundColor: string;
  terrain?: EarthMeshOptions;
}

export class GlobeRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private earth: THREE.Mesh | null = null;
  private atmosphere: THREE.Mesh | null = null;
  readonly speciesLayer: SpeciesLayer;
  readonly trailLayer: TrailLayer;
  private frameId = 0;
  private clock = new THREE.Clock();
  private onFrameCallbacks: ((dt: number) => void)[] = [];

  constructor() {
    // --- Renderer -----------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // --- Scene --------------------------------------------------------------
    this.scene = new THREE.Scene();

    // --- Camera -------------------------------------------------------------
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
    this.camera.position.set(0, 0, 350);

    // --- Orbit controls -----------------------------------------------------
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; // no inertia — instant response
    this.controls.rotateSpeed = 1.0;     // 1:1 mouse-to-globe mapping
    this.controls.zoomSpeed = 1.2;
    this.controls.minDistance = 120;
    this.controls.maxDistance = 500;
    this.controls.enablePan = false;
    this.controls.autoRotate = false;

    // --- Lighting -----------------------------------------------------------
    const ambient = new THREE.AmbientLight(0xcccccc, Math.PI);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(
      0xffffff,
      0.6 * Math.PI,
    );
    directional.position.set(1, 1, 1);
    this.scene.add(directional);

    // --- Layers -------------------------------------------------------------
    this.speciesLayer = new SpeciesLayer(this.scene);
    this.trailLayer = new TrailLayer(this.scene);
  }

  // -------------------------------------------------------------------------
  // mount — attach to DOM and start the render loop
  // -------------------------------------------------------------------------

  /** Mount into a DOM container. Starts the RAF loop. */
  mount(container: HTMLElement): void {
    container.appendChild(this.renderer.domElement);
    this.handleResize(); // set initial size from container
    window.addEventListener('resize', this.handleResize);
    this.clock.start();
    this.animate();
  }

  // -------------------------------------------------------------------------
  // setTheme — swap earth mesh, atmosphere, background
  // -------------------------------------------------------------------------

  /** Set the globe theme (texture, atmosphere, background). */
  setTheme(config: GlobeThemeConfig): void {
    // Remove existing earth mesh
    if (this.earth) {
      this.scene.remove(this.earth);
      this.earth.geometry.dispose();
      if (this.earth.material instanceof THREE.Material) {
        this.earth.material.dispose();
      }
      this.earth = null;
    }

    // Remove existing atmosphere
    if (this.atmosphere) {
      this.scene.remove(this.atmosphere);
      this.atmosphere.geometry.dispose();
      if (this.atmosphere.material instanceof THREE.Material) {
        this.atmosphere.material.dispose();
      }
      this.atmosphere = null;
    }

    // Create new earth mesh
    const earthOptions: EarthMeshOptions = config.terrain
      ? config.terrain
      : { textureUrl: config.globeTexture };
    this.earth = createEarthMesh(earthOptions);
    this.scene.add(this.earth);

    // Create new atmosphere
    this.atmosphere = createAtmosphere(config.atmosphereColor, GLOBE_RADIUS);
    this.scene.add(this.atmosphere);

    // Background color
    this.scene.background = new THREE.Color(config.backgroundColor);
  }

  // -------------------------------------------------------------------------
  // onFrame — register external per-frame callbacks
  // -------------------------------------------------------------------------

  /** Register a per-frame callback. Returns an unsubscribe function. */
  onFrame(cb: (dt: number) => void): () => void {
    this.onFrameCallbacks.push(cb);
    return () => {
      const idx = this.onFrameCallbacks.indexOf(cb);
      if (idx >= 0) this.onFrameCallbacks.splice(idx, 1);
    };
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /** Get the active camera (for hit testing, labels, etc.). */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /** Get the orbit controls (for external fly-to animations). */
  getControls(): OrbitControls {
    return this.controls;
  }

  /** Get the renderer (for reading canvas size, etc.). */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Convert lat/lng to world-space coordinates.
   * Compatible with GeoLabels and other consumers that expect `{x, y, z}`.
   */
  getCoords(
    lat: number,
    lng: number,
    alt?: number,
  ): { x: number; y: number; z: number } {
    const v = latLngToVec3(lat, lng, GLOBE_RADIUS, alt);
    return { x: v.x, y: v.y, z: v.z };
  }

  // -------------------------------------------------------------------------
  // animate — single RAF loop
  // -------------------------------------------------------------------------

  private animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();

    // Update orbit controls (handles damping)
    this.controls.update();

    // Update visual layers
    const elapsed = this.clock.elapsedTime;
    this.speciesLayer.update(elapsed, this.camera);
    this.trailLayer.update(dt);

    // External per-frame callbacks
    for (const cb of this.onFrameCallbacks) cb(dt);

    // Render
    this.renderer.render(this.scene, this.camera);
  };

  // -------------------------------------------------------------------------
  // handleResize — keep renderer + camera in sync with container
  // -------------------------------------------------------------------------

  private handleResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;

    const w = parent.clientWidth;
    const h = parent.clientHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // -------------------------------------------------------------------------
  // dispose — full teardown
  // -------------------------------------------------------------------------

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.handleResize);

    // Dispose layers
    this.speciesLayer.dispose();
    this.trailLayer.dispose();

    // Dispose earth + atmosphere
    if (this.earth) {
      this.scene.remove(this.earth);
      this.earth.geometry.dispose();
      if (this.earth.material instanceof THREE.Material) {
        this.earth.material.dispose();
      }
    }
    if (this.atmosphere) {
      this.scene.remove(this.atmosphere);
      this.atmosphere.geometry.dispose();
      if (this.atmosphere.material instanceof THREE.Material) {
        this.atmosphere.material.dispose();
      }
    }

    // Dispose controls, renderer, remove canvas
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
