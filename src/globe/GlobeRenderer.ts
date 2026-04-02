import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createEarthMesh, type EarthMeshOptions } from './EarthMesh';
import { createAtmosphere, type AtmosphereConfig } from './AtmosphereShader';
import { SpeciesLayer } from './SpeciesLayer';
import { TrailLayer } from './TrailLayer';
import { UnderwaterScene, type UnderwaterFishData } from './UnderwaterScene';
import { latLngToVec3, GLOBE_RADIUS } from './coordUtils';

// ---------------------------------------------------------------------------
// GlobeRenderer — single RAF loop, custom spherical camera, ACES tone mapping.
//
// Camera uses exponential smoothing (ported from openglobes-solar):
//   rotation → near-instant (0.0001 time constant)
//   zoom/pan → smooth fluid  (0.008 time constant)
//
// Selective bloom: base scene renders directly (unchanged), then bloom-only
// objects are rendered to a separate EffectComposer → UnrealBloomPass and
// composited on top via a full-screen additive quad.  This avoids running the
// main scene through post-processing, so the globe looks identical to before.
// ---------------------------------------------------------------------------

import { BLOOM_LAYER } from './constants';
export { BLOOM_LAYER };

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
  // No fill light — uniform ambient handles all illumination

  readonly speciesLayer: SpeciesLayer;
  readonly trailLayer: TrailLayer;
  readonly underwaterScene: UnderwaterScene;

  // Underwater mode state
  private _isUnderwater = false;
  private uwTransition = 0; // 0 = globe, 1 = fully underwater
  private uwTransitionDir: 'in' | 'out' | null = null;
  private uwDiveTarget = new THREE.Vector3();
  private uwCamYaw = 0;
  private uwCamPitch = 0;
  private uwCamPos = new THREE.Vector3();
  private uwMouseLook = false;
  private uwLastMouse = { x: 0, y: 0 };
  private uwKeys = new Set<string>();
  /** Joystick input: x = right/left (-1..1), y = forward/back (-1..1) */
  private uwJoystick = { x: 0, y: 0 };
  /** Vertical joystick: positive = up, negative = down (-1..1) */
  private uwJoystickV = 0;
  private savedBackground: THREE.Color | THREE.Texture | null = null;
  private savedFog: THREE.Fog | THREE.FogExp2 | null = null;
  private onUnderwaterChangeCb: ((isUnderwater: boolean) => void) | null = null;

  // Selective bloom — only processes glow objects, composited additively
  private bloomComposer: EffectComposer | null = null;
  private bloomLayer = new THREE.Layers();
  private bloomOverlayScene: THREE.Scene | null = null;
  private bloomOverlayCamera: THREE.OrthographicCamera | null = null;
  private bloomOverlayMat: THREE.ShaderMaterial | null = null;

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

    // Lighting — uniform ambient only, no directional/specular.
    // Full illumination on all sides of the globe (daytime everywhere).
    this.ambientLight = new THREE.AmbientLight(0xffffff, 3.0);
    this.scene.add(this.ambientLight);

    // Bloom layer mask (used to identify bloom objects during selective pass)
    this.bloomLayer.set(BLOOM_LAYER);

    // Starfield background
    this.createStarfield();

    // Layers
    this.speciesLayer = new SpeciesLayer(this.scene);
    this.trailLayer = new TrailLayer(this.scene);
    this.underwaterScene = new UnderwaterScene();
    this.scene.add(this.underwaterScene.group);
  }

  // ─── Mount ──────────────────────────────────────────────────────────────

  private mounted = false;

  /** Scatter glowing points across the sky. */
  private createStarfield(): void {
    const count = 3000;
    const positions = new Float32Array(count * 3);
    const radius = 800;

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xccddff,
      size: 1.5,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: false, // fixed screen pixel size regardless of distance
      depthWrite: false,
    });

    const stars = new THREE.Points(geometry, material);
    stars.renderOrder = -1;
    this.scene.add(stars);
  }

  mount(container: HTMLElement): void {
    if (this.mounted) return; // prevent double-mount (React StrictMode)
    this.mounted = true;
    this.container = container;
    container.appendChild(this.renderer.domElement);
    this.setupBloomPipeline();
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

    // Underwater free-look controls (mouse + touch)
    el.addEventListener('mousedown', this.onUwMouseDown);
    el.addEventListener('mousemove', this.onUwMouseMove);
    el.addEventListener('mouseup', this.onUwMouseUp);
    el.addEventListener('touchstart', this.onUwTouchStart, { passive: true });
    el.addEventListener('touchmove', this.onUwTouchMove, { passive: true });
    el.addEventListener('touchend', this.onUwTouchEnd);
    el.addEventListener('touchcancel', this.onUwTouchEnd);
    document.addEventListener('keydown', this.onUwKeyDown);
    document.addEventListener('keyup', this.onUwKeyUp);

    // Pause rendering when tab is hidden — saves GPU/CPU
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.animate();
  }

  // ─── Selective Bloom Pipeline ────────────────────────────────────────────

  private setupBloomPipeline(): void {
    const dpr = this.renderer.getPixelRatio();
    const w = Math.round((this.renderer.domElement.clientWidth || 1) * dpr);
    const h = Math.round((this.renderer.domElement.clientHeight || 1) * dpr);

    // Bloom-only composer — processes ONLY glow objects, never the full scene
    const bloomRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.bloomComposer = new EffectComposer(this.renderer, bloomRT);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.2, 0));

    // Overlay quad — draws the bloom texture on top of the canvas additively
    this.bloomOverlayScene = new THREE.Scene();
    this.bloomOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bloomOverlayMat = new THREE.ShaderMaterial({
      uniforms: { tBloom: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tBloom;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(tBloom, vUv); }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bloomOverlayMat);
    this.bloomOverlayScene.add(quad);
  }

  /** Reusable Color for clear-color save/restore during bloom pass. */
  private _savedClearColor = new THREE.Color();
  /** Objects hidden during bloom pass. */
  private _hiddenForBloom: THREE.Object3D[] = [];

  /** Hide all non-bloom objects before the bloom-only render pass. */
  private hideNonBloom(): void {
    this._hiddenForBloom.length = 0;
    this.scene.traverse((obj) => {
      if (obj === this.scene) return;
      if (this.bloomLayer.test(obj.layers)) return;
      if (obj.visible) {
        this._hiddenForBloom.push(obj);
        obj.visible = false;
      }
    });
  }

  /** Restore visibility after bloom pass. */
  private restoreVisibility(): void {
    for (const obj of this._hiddenForBloom) obj.visible = true;
    this._hiddenForBloom.length = 0;
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

    // Background color rendered behind everything (including stars).
    // Stars are at z=900, so they render ON TOP of this clear color.
    this.renderer.setClearColor(config.backgroundColor, 1);

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

  /** Set joystick input for underwater movement. x: right/left, y: forward/back. Range -1..1. */
  setUnderwaterJoystick(x: number, y: number): void {
    this.uwJoystick.x = x;
    this.uwJoystick.y = y;
  }

  /** Set vertical joystick input. Positive = ascend, negative = descend. Range -1..1. */
  setUnderwaterVertical(v: number): void {
    this.uwJoystickV = v;
  }

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

  /** Register a callback for underwater mode changes. */
  onUnderwaterChange(cb: (isUnderwater: boolean) => void): void {
    this.onUnderwaterChangeCb = cb;
  }

  /** Whether the scene is currently in underwater mode. */
  get isUnderwater(): boolean { return this._isUnderwater; }

  // ─── Underwater Mode ─────────────────────────────────────────────────

  /**
   * Dive into the ocean at the given lat/lng.
   * Transitions the camera from globe view into an immersive underwater scene.
   */
  enterUnderwater(
    lat: number,
    lng: number,
    atlasTexture: THREE.Texture | null,
    nearbyFish: UnderwaterFishData[],
  ): void {
    if (this._isUnderwater) return;

    // Compute the dive point on the globe surface
    this.uwDiveTarget = latLngToVec3(lat, lng, GLOBE_RADIUS, 0);

    // Build the underwater scene
    this.underwaterScene.build(atlasTexture, nearbyFish);

    // Position the underwater group at the dive point
    // The underwater scene is centered at origin; we place it there
    // and move the camera into it during transition
    this.underwaterScene.group.position.set(0, 0, 0);

    // Save current scene state
    this.savedBackground = this.scene.background as THREE.Color | null;
    this.savedFog = this.scene.fog;

    // Instant switch — no transition animation
    this._isUnderwater = true;
    this.uwTransition = 1;
    this.uwTransitionDir = null;

    // Hide globe elements immediately
    if (this.earth) this.earth.visible = false;
    if (this.atmo) { this.atmo.rim.visible = false; this.atmo.haze.visible = false; }
    this.speciesLayer.setVisible(false);
    this.trailLayer.setVisible(false);

    // Apply underwater scene
    this.scene.background = new THREE.Color(0x041830);
    this.scene.fog = this.underwaterScene.createFog();
    this.underwaterScene.show();

    // Initialize underwater camera state
    this.uwCamPos.set(0, 2, 15);
    this.uwCamYaw = 0;
    this.uwCamPitch = 0;
    this.camera.near = 0.1;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();

    this.onUnderwaterChangeCb?.(true);
  }

  /** Exit underwater mode and return to the globe view. */
  exitUnderwater(): void {
    if (!this._isUnderwater) return;
    this.uwTransitionDir = 'out';
  }

  /** Underwater mouse-look handlers. */
  private onUwMouseDown = (e: MouseEvent): void => {
    if (!this._isUnderwater || this.uwTransitionDir) return;
    this.uwMouseLook = true;
    this.uwLastMouse.x = e.clientX;
    this.uwLastMouse.y = e.clientY;
  };

  private onUwMouseMove = (e: MouseEvent): void => {
    if (!this.uwMouseLook || !this._isUnderwater) return;
    const dx = e.clientX - this.uwLastMouse.x;
    const dy = e.clientY - this.uwLastMouse.y;
    this.uwLastMouse.x = e.clientX;
    this.uwLastMouse.y = e.clientY;

    this.uwCamYaw -= dx * 0.003;
    this.uwCamPitch = Math.max(-1.2, Math.min(1.2,
      this.uwCamPitch - dy * 0.003));
  };

  private onUwMouseUp = (): void => {
    this.uwMouseLook = false;
  };

  /** Underwater touch look-around (single finger on the canvas, not on joystick). */
  private uwTouchId: number | null = null;
  private onUwTouchStart = (e: TouchEvent): void => {
    if (!this._isUnderwater || this.uwTransitionDir) return;
    if (this.uwTouchId !== null) return; // already tracking a finger
    const touch = e.touches[0];
    this.uwTouchId = touch.identifier;
    this.uwLastMouse.x = touch.clientX;
    this.uwLastMouse.y = touch.clientY;
  };

  private onUwTouchMove = (e: TouchEvent): void => {
    if (!this._isUnderwater || this.uwTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier !== this.uwTouchId) continue;
      const dx = touch.clientX - this.uwLastMouse.x;
      const dy = touch.clientY - this.uwLastMouse.y;
      this.uwLastMouse.x = touch.clientX;
      this.uwLastMouse.y = touch.clientY;
      this.uwCamYaw -= dx * 0.003;
      this.uwCamPitch = Math.max(-1.2, Math.min(1.2,
        this.uwCamPitch - dy * 0.003));
      break;
    }
  };

  private onUwTouchEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.uwTouchId) {
        this.uwTouchId = null;
        break;
      }
    }
  };

  private onUwKeyDown = (e: KeyboardEvent): void => {
    if (!this._isUnderwater) return;
    this.uwKeys.add(e.key.toLowerCase());
  };

  private onUwKeyUp = (e: KeyboardEvent): void => {
    this.uwKeys.delete(e.key.toLowerCase());
  };

  // ─── Underwater animation tick ─────────────────────────────────────────

  private animateUnderwater(dt: number): void {
    const TRANSITION_SPEED = 1.2;

    if (this.uwTransitionDir === 'out') {
      this.uwTransition = Math.max(0, this.uwTransition - dt * TRANSITION_SPEED);
      if (this.uwTransition <= 0) {
        this.uwTransitionDir = null;
        this._isUnderwater = false;
        this.uwKeys.clear();
        this.uwMouseLook = false;

        // Restore globe elements
        if (this.earth) this.earth.visible = true;
        if (this.atmo) {
          this.atmo.rim.visible = true;
          this.atmo.haze.visible = true;
        }
        this.speciesLayer.setVisible(true);
        this.trailLayer.setVisible(true);

        // Restore scene
        if (this.savedBackground) this.scene.background = this.savedBackground;
        this.scene.fog = this.savedFog;
        this.underwaterScene.hide();
        this.underwaterScene.dispose();

        this.onUnderwaterChangeCb?.(false);
        return;
      }

      // During exit transition — show globe elements again
      if (this.earth) this.earth.visible = true;
      if (this.atmo) {
        this.atmo.rim.visible = true;
        this.atmo.haze.visible = true;
      }
      this.speciesLayer.setVisible(true);
    }

    // Fully underwater — free-look camera
    if (this.uwTransition >= 1) {
      // WASD movement
      const moveSpeed = 4 * dt;
      const forward = new THREE.Vector3(
        -Math.sin(this.uwCamYaw) * Math.cos(this.uwCamPitch),
        Math.sin(this.uwCamPitch),
        -Math.cos(this.uwCamYaw) * Math.cos(this.uwCamPitch),
      );
      const right = new THREE.Vector3(
        Math.cos(this.uwCamYaw), 0, -Math.sin(this.uwCamYaw),
      );

      // Keyboard input
      if (this.uwKeys.has('w') || this.uwKeys.has('arrowup')) {
        this.uwCamPos.addScaledVector(forward, moveSpeed);
      }
      if (this.uwKeys.has('s') || this.uwKeys.has('arrowdown')) {
        this.uwCamPos.addScaledVector(forward, -moveSpeed);
      }
      if (this.uwKeys.has('a') || this.uwKeys.has('arrowleft')) {
        this.uwCamPos.addScaledVector(right, -moveSpeed);
      }
      if (this.uwKeys.has('d') || this.uwKeys.has('arrowright')) {
        this.uwCamPos.addScaledVector(right, moveSpeed);
      }
      if (this.uwKeys.has(' ')) {
        this.uwCamPos.y += moveSpeed;
      }
      if (this.uwKeys.has('shift')) {
        this.uwCamPos.y -= moveSpeed;
      }
      // Joystick input (desktop + mobile)
      if (Math.abs(this.uwJoystick.x) > 0.05 || Math.abs(this.uwJoystick.y) > 0.05) {
        this.uwCamPos.addScaledVector(forward, this.uwJoystick.y * moveSpeed * 3);
        this.uwCamPos.addScaledVector(right, this.uwJoystick.x * moveSpeed * 3);
      }
      // Vertical joystick (up/down)
      if (Math.abs(this.uwJoystickV) > 0.05) {
        this.uwCamPos.y += this.uwJoystickV * moveSpeed * 3;
      }

      // Clamp position within bounds
      this.uwCamPos.x = THREE.MathUtils.clamp(this.uwCamPos.x, -120, 120);
      this.uwCamPos.y = THREE.MathUtils.clamp(this.uwCamPos.y, -18, 15);
      this.uwCamPos.z = THREE.MathUtils.clamp(this.uwCamPos.z, -120, 120);

      // Apply camera
      this.camera.position.copy(this.uwCamPos);
      const lookTarget = this.uwCamPos.clone().add(forward);
      this.camera.lookAt(lookTarget);
      this.camera.near = 0.1;
      this.camera.far = 400;
      this.camera.updateProjectionMatrix();

      // Update underwater scene
      this.underwaterScene.update(this.elapsedTime, this.camera);
    }
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
    if (this._isUnderwater) return;
    this.isDragging = true;
    this.lastPointer.x = e.clientX;
    this.lastPointer.y = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.isDragging || this._isUnderwater) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer.x = e.clientX;
    this.lastPointer.y = e.clientY;

    // Sensitivity scales with zoom — slower when zoomed in, faster when zoomed out
    const sensitivity = 0.002 + (this.curDist - 120) / (500 - 120) * 0.003;
    // At minDist(120): 0.002 (slow/precise), at maxDist(500): 0.005 (fast overview)
    this.tgtAngle.theta -= dx * sensitivity;
    this.tgtAngle.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
      this.tgtAngle.phi - dy * sensitivity));
  };

  private onPointerUp = (): void => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this._isUnderwater) return;
    e.preventDefault();
    // Zoom sensitivity: slower when close (fine control), faster when far
    const zoomPct = this.tgtDist < 160 ? 0.0005 : this.tgtDist < 250 ? 0.0008 : 0.001;
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

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      // Tab hidden — stop rendering completely
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    } else {
      // Tab visible again — restart
      if (this.frameId === 0 && this.mounted) {
        this.lastTime = 0; // reset dt so we don't get a huge jump
        this.animate();
      }
    }
  };

  // ─── Animation loop ─────────────────────────────────────────────────────

  private animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate);
    const now = performance.now() / 1000;
    const dt = this.lastTime > 0 ? Math.min(now - this.lastTime, 0.1) : 0.016;
    this.lastTime = now;
    this.elapsedTime += dt;

    // ── Underwater mode ──────────────────────────────────────────────────
    if (this._isUnderwater) {
      this.animateUnderwater(dt);

      // External callback
      this.onFrameCb?.(dt);

      this.renderer.render(this.scene, this.camera);
      return; // skip globe camera logic
    }

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

    // No per-frame light updates needed — uniform ambient only

    // Update atmosphere
    this.atmo?.update(this.camera);

    // Update species (GPU uniforms only)
    this.speciesLayer.update(this.elapsedTime, this.camera);

    // Update trails
    this.trailLayer.update(dt);

    // External callback
    this.onFrameCb?.(dt);

    // 1. Render full scene directly — identical to pre-bloom pipeline
    this.renderer.render(this.scene, this.camera);

    // 2. Bloom overlay — only glow objects, composited additively on top
    if (this.bloomComposer && this.bloomOverlayMat && this.bloomOverlayScene && this.bloomOverlayCamera) {
      const savedAlpha = this.renderer.getClearAlpha();
      this.renderer.getClearColor(this._savedClearColor);
      this.renderer.setClearColor(0x000000, 0);

      this.hideNonBloom();
      this.bloomComposer.render();
      this.restoreVisibility();

      this.renderer.setClearColor(this._savedClearColor, savedAlpha);

      // Draw bloom texture on top of the canvas with additive blending
      this.bloomOverlayMat.uniforms.tBloom.value = this.bloomComposer.renderTarget2.texture;
      this.renderer.autoClear = false;
      this.renderer.render(this.bloomOverlayScene, this.bloomOverlayCamera);
      this.renderer.autoClear = true;
    }
  };

  // ─── Resize ─────────────────────────────────────────────────────────────

  private handleResize = (): void => {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const dpr = this.renderer.getPixelRatio();
    this.bloomComposer?.setSize(Math.round(w * dpr), Math.round(h * dpr));
  };

  // ─── Dispose ────────────────────────────────────────────────────────────

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.mounted = false;
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    el.removeEventListener('mousedown', this.onUwMouseDown);
    el.removeEventListener('mousemove', this.onUwMouseMove);
    el.removeEventListener('mouseup', this.onUwMouseUp);
    el.removeEventListener('touchstart', this.onUwTouchStart);
    el.removeEventListener('touchmove', this.onUwTouchMove);
    el.removeEventListener('touchend', this.onUwTouchEnd);
    el.removeEventListener('touchcancel', this.onUwTouchEnd);
    document.removeEventListener('keydown', this.onUwKeyDown);
    document.removeEventListener('keyup', this.onUwKeyUp);

    this.underwaterScene.dispose();
    this.speciesLayer.dispose();
    this.trailLayer.dispose();
    if (this.earth) { this.scene.remove(this.earth); }
    if (this.atmo) { this.scene.remove(this.atmo.rim); this.scene.remove(this.atmo.haze); }
    this.bloomComposer?.dispose();
    this.bloomOverlayMat?.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
