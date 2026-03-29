// ---------------------------------------------------------------------------
// SpeciesShader — GLSL for instanced species sprite billboards.
//
// Features:
// - Per-instance billboard with aspect-ratio-correct sizing
// - 5 animation types for swimming displacement
// - Fish body wave: sinusoidal bend along the sprite body (S-curve swim)
// - Smooth highlight scale via uHighlightScale (lerped in JS)
// - Zoom-aware spread when camera is far
// - Back-face fade
// ---------------------------------------------------------------------------

export const speciesVertexShader = `
  attribute vec3 instancePos;
  attribute vec4 instanceUV;       // x, y, w, h in atlas (normalized 0-1)
  attribute float instancePhase;
  attribute float instanceAnim;    // 0=static, 1=cruise, 2=hover, 3=drift, 4=dart
  attribute vec2 instanceSize;     // width, height in world units

  uniform float uTime;
  uniform vec3 uCamPos;
  uniform int uHighlightIdx;
  uniform float uHighlightScale;   // smoothly lerped 1.0 → 1.3

  varying vec2 vUV;
  varying float vAlpha;

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

    // ── Zoom-aware spread ──────────────────────────────────────────
    // When globe is small (camera far), push fish apart so they don't
    // stack on top of each other. Spread increases with distance.
    float camDist = length(uCamPos);
    float spreadFactor = smoothstep(140.0, 300.0, camDist); // 0 close, 1 far
    if (spreadFactor > 0.001) {
      float idx = instancePhase;
      vec3 nrm = normalize(pos);
      vec3 tan = normalize(cross(vec3(0.0, 1.0, 0.0), nrm));
      if (length(tan) < 0.001) tan = normalize(cross(vec3(1.0, 0.0, 0.0), nrm));
      vec3 btn = cross(nrm, tan);
      // Stronger spread: up to 8 world units lateral, 3 outward
      float spreadStrength = 8.0 * spreadFactor;
      float outStrength = 3.0 * spreadFactor;
      pos += tan * (hash(idx) - 0.5) * spreadStrength
           + btn * (hash(idx * 2.0) - 0.5) * spreadStrength
           + nrm * hash(idx * 3.0) * outStrength;
    }

    // ── Swimming path displacement ─────────────────────────────────
    float t = uTime + instancePhase;
    vec3 normal = normalize(pos);
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    if (length(tangent) < 0.001) tangent = normalize(cross(vec3(1.0, 0.0, 0.0), normal));
    vec3 bitangent = cross(normal, tangent);

    vec3 swimOffset = vec3(0.0);
    float anim = instanceAnim;
    if (anim > 0.5 && anim < 1.5) {
      // slow_cruise: broad sweeping arcs
      swimOffset = tangent * sin(t * 0.4) * 0.2 + bitangent * sin(t * 0.15) * 0.12;
    } else if (anim > 1.5 && anim < 2.5) {
      // hovering: gentle bob
      swimOffset = tangent * sin(t * 0.6) * 0.015 + normal * sin(t * 0.8) * 0.02;
    } else if (anim > 2.5 && anim < 3.5) {
      // drifting: lazy current-driven
      swimOffset = tangent * cos(t * 0.1) * 0.04 + bitangent * sin(t * 0.15) * 0.06;
    } else if (anim > 3.5) {
      // darting: bursts then glide
      float cycle = mod(t * 0.5, 8.0);
      float burst = cycle < 0.8 ? sin(cycle / 0.8 * 3.14159) * 0.25 : sin(t * 0.3) * 0.03;
      swimOffset = bitangent * burst;
    }
    pos += swimOffset;

    // ── Billboard ──────────────────────────────────────────────────
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec2 size = instanceSize;

    // Minimum size: ensure fish never shrink below a visible threshold.
    // At camDist=350 (default zoom out), ensure at least ~0.8 world units.
    // The further the camera, the larger the minimum (compensates for distance).
    float minSize = 0.4 + smoothstep(150.0, 400.0, camDist) * 0.8;
    size = max(size, vec2(minSize));

    // Smooth highlight scale
    if (uHighlightIdx >= 0 && gl_InstanceID == uHighlightIdx) {
      size *= uHighlightScale;
      vAlpha = min(vAlpha + 0.15, 1.0);
    }

    // ── Fish body wave (S-curve swim) ──────────────────────────────
    // position.x goes from -0.5 (tail) to +0.5 (head)
    // Apply a traveling sine wave along the body for organic swim feel
    // Static species (anim=0) skip the body wave
    float bodyWave = 0.0;
    if (anim > 0.5) {
      float bodyX = position.x; // -0.5 to 0.5 along the fish
      // Wave amplitude increases from head to tail (head barely moves, tail whips)
      float amp = (0.5 - bodyX) * 0.35; // 0 at head, 0.35 at tail — visible wave
      // Traveling wave: moves from head to tail
      float waveSpeed = anim > 3.5 ? 8.0 : anim > 0.5 && anim < 1.5 ? 3.0 : 5.0;
      bodyWave = sin(bodyX * 6.28 - t * waveSpeed) * amp;
    }

    mvPos.x += position.x * size.x;
    mvPos.y += position.y * size.y + bodyWave * size.y;

    gl_Position = projectionMatrix * mvPos;

    // UV — flip Y so sprites render right-side-up
    // (quad Y goes bottom-to-top, but spritesheet Y goes top-to-bottom with flipY=false)
    vec2 quadUV = vec2(position.x + 0.5, 0.5 - position.y);
    vUV = instanceUV.xy + quadUV * instanceUV.zw;
  }
`;

export const speciesFragmentShader = `
  uniform sampler2D uAtlas;
  varying vec2 vUV;
  varying float vAlpha;

  void main() {
    vec4 texel = texture2D(uAtlas, vUV);
    if (texel.a < 0.05) discard;
    gl_FragColor = vec4(texel.rgb, texel.a * vAlpha);
  }
`;

export const ANIM_CODE: Record<string, number> = {
  none: 0, static: 0,
  slow_cruise: 1, schooling: 1,
  hovering: 2,
  drifting: 3,
  darting: 4,
};
