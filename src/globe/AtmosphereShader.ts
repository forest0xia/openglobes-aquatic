import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Dual-layer atmosphere: BackSide fresnel rim glow + FrontSide surface haze.
// Ported from openglobes-solar's per-planet atmosphere system.
// ---------------------------------------------------------------------------

const atmosphereVertexShader = `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// BackSide rim glow — visible as a halo around the globe edge
const rimFragmentShader = `
  uniform vec3 dayColor;
  uniform vec3 twilightColor;
  uniform vec3 camPos;
  uniform float fresnelLow;
  uniform float fresnelPow;

  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 viewDir = normalize(camPos - vPosW);
    float fresnel = dot(viewDir, vNormalW);
    // Remap fresnel: below fresnelLow → 1.0, above → falloff
    float rim = 1.0 - smoothstep(0.0, 1.0, (fresnel - fresnelLow) / (1.0 - fresnelLow));
    rim = pow(rim, fresnelPow);

    // Mix day/twilight based on vertical position (simple approximation)
    float mixF = smoothstep(-0.3, 0.5, vNormalW.y);
    vec3 color = mix(twilightColor, dayColor, mixF);

    gl_FragColor = vec4(color, rim * 0.6);
  }
`;

// FrontSide surface haze — subtle atmospheric scattering on the surface
const hazeFragmentShader = `
  uniform vec3 dayColor;
  uniform vec3 camPos;
  uniform float strength;

  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 viewDir = normalize(camPos - vPosW);
    float fresnel = 1.0 - max(dot(viewDir, vNormalW), 0.0);
    float haze = fresnel * fresnel * strength;
    gl_FragColor = vec4(dayColor, haze);
  }
`;

export interface AtmosphereConfig {
  dayColor: string;
  twilightColor?: string;
  fresnelLow?: number;
  fresnelPow?: number;
  hazeStrength?: number;
  scale?: number;
}

const OCEAN_DEFAULTS: AtmosphereConfig = {
    dayColor: '#3070FF',      // 日侧颜色
    twilightColor: '#1a3a6e', // 暗侧颜色
    fresnelLow: 0.73,         // 光晕起始边缘
    fresnelPow: 2.0,          // 光晕衰减曲线
    hazeStrength: 0.5,        // 表面散射强度
    scale: 1.01,              // 光晕球体大小 (1.04 = 比地球大4%)
};

export function createAtmosphere(
  config: AtmosphereConfig | string,
  radius = 100,
): { rim: THREE.Mesh; haze: THREE.Mesh; update: (cam: THREE.Camera) => void } {
  const cfg = typeof config === 'string'
    ? { ...OCEAN_DEFAULTS, dayColor: config }
    : { ...OCEAN_DEFAULTS, ...config };

  const dayCol = new THREE.Color(cfg.dayColor);
  const twilightCol = new THREE.Color(cfg.twilightColor ?? cfg.dayColor);
  const camPosUniform = { value: new THREE.Vector3() };

  // --- Rim glow (BackSide) ---
  const rimGeo = new THREE.SphereGeometry(radius * (cfg.scale ?? 1.04), 48, 48);
  const rimMat = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: rimFragmentShader,
    uniforms: {
      dayColor: { value: dayCol },
      twilightColor: { value: twilightCol },
      camPos: camPosUniform,
      fresnelLow: { value: cfg.fresnelLow ?? 0.73 },
      fresnelPow: { value: cfg.fresnelPow ?? 3.0 },
    },
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);

  // --- Surface haze (FrontSide) ---
  const hazeGeo = new THREE.SphereGeometry(radius * 1.002, 48, 48);
  const hazeMat = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: hazeFragmentShader,
    uniforms: {
      dayColor: { value: dayCol },
      camPos: camPosUniform,
      strength: { value: cfg.hazeStrength ?? 0.3 },
    },
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  const haze = new THREE.Mesh(hazeGeo, hazeMat);
  haze.renderOrder = 1;

  return {
    rim,
    haze,
    update(cam: THREE.Camera) {
      cam.getWorldPosition(camPosUniform.value);
    },
  };
}
