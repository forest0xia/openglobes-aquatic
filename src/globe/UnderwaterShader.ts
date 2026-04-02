// ---------------------------------------------------------------------------
// UnderwaterShader — GPU shaders for underwater visual effects.
//
// 1. Caustic projection on seabed (animated voronoi-like pattern)
// 2. God rays (volumetric light beams from ocean surface)
// 3. Particle dust (floating plankton/debris)
// 4. Post-processing fog tint (deep blue absorption)
// ---------------------------------------------------------------------------

/** Seabed plane with animated caustic light pattern. */
export const seabedVertexShader = `
  varying vec2 vUV;
  varying vec3 vWorldPos;

  // Reuse noise from fragment shader for consistent terrain
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vUV = uv;
    vec3 pos = position;

    // Terrain hills — 2 octaves of Perlin noise
    vec2 terrainUV = pos.xz * 0.02;
    // Broad rolling hills
    float hill = noise(terrainUV * 1.0) * 8.0
               + noise(terrainUV * 2.5) * 4.0
               + noise(terrainUV * 6.0) * 1.5;
    // Occasional ridges / cliffs — sharp terrain features
    float ridge = pow(noise(terrainUV * 1.5 + vec2(3.7, 1.2)), 3.0) * 20.0;
    pos.y += hill + ridge;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const seabedFragmentShader = `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uCausticColor;

  varying vec2 vUV;
  varying vec3 vWorldPos;

  // Simple pseudo-random
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Smooth noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Caustic pattern — layered animated noise resembling light refraction
  float caustic(vec2 uv, float time) {
    float c = 0.0;
    // Layer 1: large slow caustics
    c += noise(uv * 4.0 + vec2(time * 0.3, time * 0.2)) * 0.5;
    // Layer 2: medium caustics
    c += noise(uv * 8.0 - vec2(time * 0.4, time * 0.15)) * 0.3;
    // Layer 3: fine detail
    c += noise(uv * 16.0 + vec2(time * 0.2, -time * 0.35)) * 0.2;
    // Sharpen the pattern
    c = pow(c, 1.5);
    return c;
  }

  void main() {
    vec2 uv = vWorldPos.xz * 0.02;
    float c = caustic(uv, uTime);
    vec3 color = uBaseColor + uCausticColor * c * 0.6;

    // Subtle sand grain noise
    float grain = noise(vWorldPos.xz * 2.0) * 0.08;
    color += grain;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** God rays — vertical light shafts from above. */
export const godRayVertexShader = `
  attribute float aOffset;
  attribute float aSpeed;
  attribute float aOpacity;
  attribute float aWidth;

  uniform float uTime;

  varying float vOpacity;
  varying vec2 vQuadPos;

  void main() {
    vQuadPos = position.xy; // -0.5..0.5
    vOpacity = aOpacity;

    // Sway the ray slightly over time
    float sway = sin(uTime * aSpeed * 0.5 + aOffset * 6.28) * 0.3;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    // Billboard on X axis only (keep vertical)
    mvPos.x += position.x * aWidth + sway;
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const godRayFragmentShader = `
  uniform float uTime;
  uniform vec3 uRayColor;

  varying float vOpacity;
  varying vec2 vQuadPos;

  void main() {
    // Fade from center outward (horizontal)
    float hFade = 1.0 - abs(vQuadPos.x) * 2.0;
    hFade = max(0.0, hFade);
    hFade = pow(hFade, 2.0);

    // Fade from top to bottom
    float vFade = 1.0 - (vQuadPos.y + 0.5); // 1 at top, 0 at bottom
    vFade = pow(vFade, 0.8);

    float alpha = hFade * vFade * vOpacity * 0.15;
    // Subtle flicker
    alpha *= 0.8 + 0.2 * sin(uTime * 1.2 + vQuadPos.y * 3.0);

    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uRayColor, alpha);
  }
`;

/** Floating particle dust (plankton / marine snow). */
export const particleVertexShader = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aBrightness;

  uniform float uTime;
  uniform float uPixelRatio;

  varying float vBrightness;
  varying float vPhase;

  void main() {
    vBrightness = aBrightness;
    vPhase = aPhase;

    vec3 pos = position;

    // Gentle drift
    pos.x += sin(uTime * 0.15 + aPhase) * 0.8;
    pos.y += sin(uTime * 0.1 + aPhase * 1.3) * 0.3 + uTime * 0.05;
    pos.z += cos(uTime * 0.12 + aPhase * 0.7) * 0.6;

    // Wrap vertically
    pos.y = mod(pos.y + 30.0, 60.0) - 30.0;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * uPixelRatio * (80.0 / -mvPos.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const particleFragmentShader = `
  uniform vec3 uParticleColor;
  uniform float uTime;

  varying float vBrightness;
  varying float vPhase;

  void main() {
    // Circular point sprite
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;

    float alpha = (1.0 - d * d) * vBrightness;
    // Gentle twinkle
    alpha *= 0.6 + 0.4 * sin(uTime * 2.0 + vPhase * 10.0);

    gl_FragColor = vec4(uParticleColor, alpha * 0.4);
  }
`;

/** Underwater fish billboard shader — split into left/right groups with hardcoded orbit direction. */
export const uwFishVertexShader = `
  attribute vec3 instancePos;
  attribute vec4 instanceUV;
  attribute float instancePhase;
  attribute vec2 instanceSize;
  attribute vec3 instanceColor;
  attribute vec3 instanceVelocity;

  uniform float uTime;
  uniform vec3 uCamPos;
  uniform float uOrbitDir; // +1.0 for right-facing group, -1.0 for left-facing group

  varying vec2 vUV;
  varying vec2 vQuadPos;
  varying float vAlpha;
  varying vec3 vGlowColor;
  varying float vGlowStrength;

  void main() {
    vGlowColor = instanceColor;
    vAlpha = 1.0;
    vGlowStrength = 0.5;

    float t = uTime + instancePhase;
    vec3 vel = instanceVelocity;

    // Orbit around camera. uOrbitDir (+1 or -1) controls rotation direction.
    // Right-facing fish: uOrbitDir=+1 → counter-clockwise → appear to swim rightward
    // Left-facing fish: uOrbitDir=-1 → clockwise → appear to swim leftward
    float orbitRadius = max(length(instancePos.xz), 25.0);
    float speedRand = fract(instancePhase * 0.0073) * 0.015;
    float orbitSpeed = (0.015 + vel.x * 0.04 + speedRand) * uOrbitDir;
    // Phase offset for starting position only (NOT multiplied by direction)
    float startAngle = instancePhase;
    float angle = startAngle + uTime * orbitSpeed;

    vec3 pos;
    pos.x = uCamPos.x + sin(angle) * orbitRadius;
    pos.z = uCamPos.z + cos(angle) * orbitRadius;
    pos.y = instancePos.y + sin(uTime * vel.y * 0.2 + instancePhase) * 0.6;

    // Billboard
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec2 size = instanceSize;

    // Body wave
    float bodyX = position.x;
    float amp = (0.5 - bodyX) * 0.2;
    float bodyWave = sin(bodyX * 6.28 - t * 3.0) * amp;

    vQuadPos = position.xy;
    mvPos.x += position.x * size.x;
    mvPos.y += position.y * size.y + bodyWave * size.y;

    gl_Position = projectionMatrix * mvPos;

    vec2 texUV = position.xy + 0.5;
    texUV.y = 1.0 - texUV.y;
    vUV = instanceUV.xy + clamp(texUV, 0.0, 1.0) * instanceUV.zw;
  }
`;

export const uwFishFragmentShader = `
  uniform sampler2D uAtlas;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec2 vUV;
  varying vec2 vQuadPos;
  varying float vAlpha;
  varying vec3 vGlowColor;
  varying float vGlowStrength;

  void main() {
    vec4 texel = texture2D(uAtlas, vUV);
    if (texel.a < 0.01) discard;

    vec3 color = texel.rgb;
    // Subtle color tint from species
    float pulse = 0.8 + 0.2 * sin(uTime * 1.5 + vGlowColor.r * 20.0);
    color += vGlowColor * 0.1 * pulse;

    gl_FragColor = vec4(color, texel.a * vAlpha);
  }
`;

/** Underwater decoration billboard shader — sprite-based corals & reef life. */
export const decorVertexShader = `
  attribute vec3 instancePos;
  attribute vec2 instanceSize;
  attribute vec4 instanceUV;
  attribute float instancePhase;

  uniform float uTime;

  varying vec2 vUV;

  // Same noise as seabed shader — compute terrain height on GPU to match exactly
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 pos = instancePos;

    // Compute terrain height using the EXACT same formula as the seabed shader.
    // This guarantees corals sit on the ground regardless of CPU/GPU precision.
    vec2 tUV = pos.xz * 0.02;
    float terrainY = noise(tUV * 1.0) * 8.0
                   + noise(tUV * 2.5) * 4.0
                   + noise(tUV * 6.0) * 1.5
                   + pow(noise(tUV * 1.5 + vec2(3.7, 1.2)), 3.0) * 20.0;
    pos.y = -25.0 + terrainY; // seabed base + terrain displacement

    // No sway — corals are fixed to the ground

    // Billboard — face camera, anchor at bottom
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    mvPos.x += position.x * instanceSize.x;
    mvPos.y += (position.y + 0.5) * instanceSize.y;
    gl_Position = projectionMatrix * mvPos;

    // UV from sprite atlas
    vec2 texUV = position.xy + 0.5;
    texUV.y = 1.0 - texUV.y;
    vUV = instanceUV.xy + clamp(texUV, 0.0, 1.0) * instanceUV.zw;
  }
`;

export const decorFragmentShader = `
  uniform sampler2D uAtlas;
  uniform float uTime;

  varying vec2 vUV;

  void main() {
    vec4 texel = texture2D(uAtlas, vUV);
    if (texel.a < 0.05) discard;

    // Shimmer / sparkle — bright pulses on coral edges
    float edge = 1.0 - smoothstep(0.1, 0.6, texel.a);
    float sparkle = pow(sin(uTime * 3.0 + vUV.x * 40.0 + vUV.y * 30.0) * 0.5 + 0.5, 8.0);
    vec3 color = texel.rgb + vec3(0.4, 0.6, 1.0) * edge * sparkle * 0.8;
    // Overall gentle glow pulse
    float glow = 0.9 + 0.1 * sin(uTime * 1.5 + vUV.x * 10.0);
    color *= glow;

    gl_FragColor = vec4(color, texel.a);
  }
`;

/** Ocean surface seen from below — animated caustic light ripples. */
export const surfaceVertexShader = `
  varying vec2 vUV;
  varying vec3 vWorldPos;

  void main() {
    vUV = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const surfaceFragmentShader = `
  uniform float uTime;
  varying vec2 vUV;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 uv = vWorldPos.xz * 0.03;

    // Animated wave pattern — 3 overlapping layers
    float wave = noise(uv * 3.0 + vec2(uTime * 0.2, uTime * 0.15)) * 0.4
               + noise(uv * 6.0 - vec2(uTime * 0.3, uTime * 0.1)) * 0.3
               + noise(uv * 12.0 + vec2(uTime * 0.15, -uTime * 0.25)) * 0.2;

    // Caustic-like bright lines
    float caustic = pow(wave, 2.0) * 2.0;

    // Base ocean color with bright caustic highlights
    vec3 deepBlue = vec3(0.05, 0.15, 0.35);
    vec3 lightBlue = vec3(0.3, 0.6, 0.9);
    vec3 color = mix(deepBlue, lightBlue, caustic);

    // Brighter at center (sun overhead), darker at edges
    float centerDist = length(vWorldPos.xz) * 0.005;
    float sunGlow = exp(-centerDist * centerDist * 2.0);
    color += vec3(0.15, 0.25, 0.35) * sunGlow;

    // Soft alpha — more transparent at edges
    float alpha = 0.25 + caustic * 0.15 + sunGlow * 0.1;

    gl_FragColor = vec4(color, alpha);
  }
`;
