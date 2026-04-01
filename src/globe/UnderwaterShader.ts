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

  void main() {
    vUV = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

/** Underwater fish billboard shader — similar to SpeciesShader but adapted for 3D space. */
export const uwFishVertexShader = `
  attribute vec3 instancePos;
  attribute vec4 instanceUV;
  attribute float instancePhase;
  attribute float instanceAnim;
  attribute vec2 instanceSize;
  attribute vec3 instanceColor;
  attribute vec3 instanceVelocity;

  uniform float uTime;

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

    // Animate position: fish swim in loops
    vec3 pos = instancePos;
    vec3 vel = instanceVelocity;

    // Circular swimming path + some wobble
    float swimRadius = length(vel) * 2.0;
    pos.x += sin(t * vel.x * 0.3) * swimRadius;
    pos.y += sin(t * vel.y * 0.5) * swimRadius * 0.3;
    pos.z += cos(t * vel.z * 0.3) * swimRadius;

    // Billboard
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec2 size = instanceSize;

    // Body wave
    float bodyX = position.x;
    float amp = (0.5 - bodyX) * 0.3;
    float bodyWave = sin(bodyX * 6.28 - t * 4.0) * amp;

    vec2 expandedSize = size * 1.8;
    vQuadPos = position.xy;

    mvPos.x += position.x * expandedSize.x;
    mvPos.y += position.y * expandedSize.y + bodyWave * size.y;

    gl_Position = projectionMatrix * mvPos;

    float uvScale = 1.8;
    vec2 texUV = position.xy * uvScale + 0.5;
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
    float dist = length(vQuadPos);

    float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vGlowColor.r * 20.0);
    float glow = vGlowStrength * pulse;

    if (texel.a > 0.05) {
      vec3 color = texel.rgb;
      color += vGlowColor * glow * 0.3;
      float bodyEdge = 1.0 - smoothstep(0.05, 0.5, texel.a);
      color += vGlowColor * bodyEdge * glow * 0.5;
      color *= 1.0 + glow * 0.2;
      gl_FragColor = vec4(color, texel.a * vAlpha);
    } else {
      float innerHalo = (1.0 - smoothstep(0.1, 0.3, dist)) * glow * 0.8;
      float outerHalo = (1.0 - smoothstep(0.2, 0.5, dist)) * glow * 0.3;
      float totalHalo = innerHalo + outerHalo;
      if (totalHalo < 0.005) discard;
      gl_FragColor = vec4(vGlowColor * totalHalo, totalHalo * vAlpha);
    }
  }
`;
