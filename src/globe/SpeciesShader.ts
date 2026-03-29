// ---------------------------------------------------------------------------
// SpeciesShader — GLSL for instanced species sprite billboards.
//
// Features:
// - Billboard with per-instance width/height (aspect ratio correct)
// - 5 animation types for swimming displacement
// - Fish body S-wave along spine
// - Bioluminescence glow per species color
// - Zoom-aware spread + minimum size
// - Smooth highlight scale
// - Back-face fade
// ---------------------------------------------------------------------------

export const speciesVertexShader = `
  attribute vec3 instancePos;
  attribute vec4 instanceUV;
  attribute float instancePhase;
  attribute float instanceAnim;
  attribute vec2 instanceSize;
  attribute vec3 instanceColor;     // species display color → glow tint

  uniform float uTime;
  uniform vec3 uCamPos;
  uniform int uHighlightIdx;
  uniform float uHighlightScale;

  varying vec2 vUV;
  varying float vAlpha;
  varying vec3 vGlowColor;
  varying float vGlowStrength;      // 0=none, 1=full fluorescence
  varying float vAnimType;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    vec3 pos = instancePos;
    vec3 camDir = normalize(uCamPos);
    vec3 spriteDir = normalize(pos);
    float facing = dot(camDir, spriteDir);
    vAlpha = smoothstep(0.0, 0.15, facing);

    if (facing < -0.05) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      return;
    }

    // Pass glow data to fragment
    vGlowColor = instanceColor;
    vAnimType = instanceAnim;
    // Glow strength: static species (coral) glow strongest, drifting (jellyfish) medium, others subtle
    float anim = instanceAnim;
    if (anim < 0.5) {
      vGlowStrength = 0.6; // static: strong fluorescence
    } else if (anim > 2.5 && anim < 3.5) {
      vGlowStrength = 0.4; // drifting: ethereal glow
    } else {
      vGlowStrength = 0.15; // swimming fish: subtle bioluminescence
    }

    // ── Zoom-aware spread ──────────────────────────────────────────
    float camDist = length(uCamPos);
    float spreadFactor = smoothstep(140.0, 300.0, camDist);
    if (spreadFactor > 0.001) {
      float idx = instancePhase;
      vec3 nrm = normalize(pos);
      vec3 tan = normalize(cross(vec3(0.0, 1.0, 0.0), nrm));
      if (length(tan) < 0.001) tan = normalize(cross(vec3(1.0, 0.0, 0.0), nrm));
      vec3 btn = cross(nrm, tan);
      float spreadStrength = 8.0 * spreadFactor;
      float outStrength = 3.0 * spreadFactor;
      pos += tan * (hash(idx) - 0.5) * spreadStrength
           + btn * (hash(idx * 2.0) - 0.5) * spreadStrength
           + nrm * hash(idx * 3.0) * outStrength;
    }

    // ── Swimming displacement ──────────────────────────────────────
    float t = uTime + instancePhase;
    vec3 normal = normalize(pos);
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    if (length(tangent) < 0.001) tangent = normalize(cross(vec3(1.0, 0.0, 0.0), normal));
    vec3 bitangent = cross(normal, tangent);

    vec3 swimOffset = vec3(0.0);
    if (anim > 0.5 && anim < 1.5) {
      swimOffset = tangent * sin(t * 0.4) * 0.2 + bitangent * sin(t * 0.15) * 0.12;
    } else if (anim > 1.5 && anim < 2.5) {
      swimOffset = tangent * sin(t * 0.6) * 0.015 + normal * sin(t * 0.8) * 0.02;
    } else if (anim > 2.5 && anim < 3.5) {
      swimOffset = tangent * cos(t * 0.1) * 0.04 + bitangent * sin(t * 0.15) * 0.06;
    } else if (anim > 3.5) {
      float cycle = mod(t * 0.5, 8.0);
      float burst = cycle < 0.8 ? sin(cycle / 0.8 * 3.14159) * 0.25 : sin(t * 0.3) * 0.03;
      swimOffset = bitangent * burst;
    }
    pos += swimOffset;

    // ── Billboard ──────────────────────────────────────────────────
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec2 size = instanceSize;

    // Minimum size
    float minSize = 0.4 + smoothstep(150.0, 400.0, camDist) * 0.8;
    size = max(size, vec2(minSize));

    // Highlight scale
    if (uHighlightIdx >= 0 && gl_InstanceID == uHighlightIdx) {
      size *= uHighlightScale;
      vAlpha = min(vAlpha + 0.15, 1.0);
      vGlowStrength = min(vGlowStrength + 0.3, 1.0); // highlighted = brighter glow
    }

    // ── Fish body wave ─────────────────────────────────────────────
    float bodyWave = 0.0;
    if (anim > 0.5) {
      float bodyX = position.x;
      float amp = (0.5 - bodyX) * 0.35;
      float waveSpeed = anim > 3.5 ? 8.0 : anim > 0.5 && anim < 1.5 ? 3.0 : 5.0;
      bodyWave = sin(bodyX * 6.28 - t * waveSpeed) * amp;
    }

    mvPos.x += position.x * size.x;
    mvPos.y += position.y * size.y + bodyWave * size.y;

    gl_Position = projectionMatrix * mvPos;

    // UV
    vec2 quadUV = vec2(position.x + 0.5, 0.5 - position.y);
    vUV = instanceUV.xy + quadUV * instanceUV.zw;
  }
`;

export const speciesFragmentShader = `
  uniform sampler2D uAtlas;
  uniform float uTime;

  varying vec2 vUV;
  varying float vAlpha;
  varying vec3 vGlowColor;
  varying float vGlowStrength;
  varying float vAnimType;

  void main() {
    vec4 texel = texture2D(uAtlas, vUV);
    if (texel.a < 0.05) discard;

    vec3 color = texel.rgb;

    // ── Bioluminescence glow ─────────────────────────────────────
    // Pulse: subtle breathing rhythm unique per species (via vGlowColor hash)
    float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vGlowColor.r * 20.0 + vGlowColor.g * 30.0);

    // Glow intensity based on species type
    float glow = vGlowStrength * pulse;

    // Edge glow: stronger near sprite edges (where alpha is lower)
    float edgeFactor = 1.0 - smoothstep(0.1, 0.6, texel.a);
    float edgeGlow = edgeFactor * glow * 0.8;

    // Inner body glow: subtle tint throughout the body
    float bodyGlow = glow * 0.3;

    // Combine: additive glow color on top of texture
    color += vGlowColor * (bodyGlow + edgeGlow);

    // Slight brightness boost for glowing species
    color *= 1.0 + glow * 0.2;

    // For static species (coral), add extra fluorescent saturation
    if (vAnimType < 0.5) {
      // Coral fluorescence: boost the glow color channel
      color = mix(color, vGlowColor * 1.5, edgeGlow * 0.4);
      color *= 1.0 + pulse * 0.15; // breathing brightness
    }

    // For drifting (jellyfish): ethereal translucent glow
    if (vAnimType > 2.5 && vAnimType < 3.5) {
      float ethereal = 0.15 + 0.1 * sin(uTime * 2.0 + vGlowColor.b * 40.0);
      color += vGlowColor * ethereal;
    }

    gl_FragColor = vec4(color, texel.a * vAlpha);
  }
`;

export const ANIM_CODE: Record<string, number> = {
  none: 0, static: 0,
  slow_cruise: 1, schooling: 1,
  hovering: 2,
  drifting: 3,
  darting: 4,
};
