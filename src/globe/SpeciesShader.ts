// ---------------------------------------------------------------------------
// SpeciesShader — GLSL for instanced species sprite billboards.
//
// Features:
// - Per-instance billboard with aspect-ratio-correct sizing
// - 5 animation types driven by instanceAnim
// - Back-face fade via dot(camera, spriteDir)
// - Highlight: uHighlightIdx instance scales up 1.3x
// - Zoom-aware spread: fish offset outward when camera is far
// ---------------------------------------------------------------------------

export const speciesVertexShader = `
  attribute vec3 instancePos;
  attribute vec4 instanceUV;       // x, y, w, h in atlas (normalized 0-1)
  attribute float instancePhase;
  attribute float instanceAnim;    // 0=static, 1=cruise, 2=hover, 3=drift, 4=dart
  attribute vec2 instanceSize;     // width, height in world units

  uniform float uTime;
  uniform vec3 uCamPos;
  uniform int uHighlightIdx;      // -1 = none, >=0 = instance to highlight

  varying vec2 vUV;
  varying float vAlpha;

  // Simple hash for deterministic per-instance spread direction
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
    // When camera is far (globe looks small), push fish apart so they
    // don't overlap. When close, offset → 0 (real positions).
    float camDist = length(uCamPos);
    float spreadFactor = smoothstep(150.0, 350.0, camDist); // 0 at close, 1 at far
    if (spreadFactor > 0.001) {
      float idx = instancePhase; // unique per instance
      vec3 normal = normalize(pos);
      vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
      if (length(tangent) < 0.001) tangent = normalize(cross(vec3(1.0, 0.0, 0.0), normal));
      vec3 bitangent = cross(normal, tangent);
      // Random lateral + altitude offset, scaled by spreadFactor
      float offT = (hash(idx) - 0.5) * 4.0 * spreadFactor;
      float offB = (hash(idx * 2.0) - 0.5) * 4.0 * spreadFactor;
      float offN = hash(idx * 3.0) * 2.0 * spreadFactor; // push outward
      pos += tangent * offT + bitangent * offB + normal * offN;
    }

    // ── Swimming displacement ──────────────────────────────────────
    float t = uTime + instancePhase;
    vec3 normal = normalize(pos);
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    if (length(tangent) < 0.001) tangent = normalize(cross(vec3(1.0, 0.0, 0.0), normal));
    vec3 bitangent = cross(normal, tangent);

    vec3 offset = vec3(0.0);
    float anim = instanceAnim;
    if (anim > 0.5 && anim < 1.5) {
      offset = tangent * sin(t * 0.4) * 0.2 + bitangent * sin(t * 0.15) * 0.12;
    } else if (anim > 1.5 && anim < 2.5) {
      offset = tangent * sin(t * 0.6) * 0.015 + normal * sin(t * 0.8) * 0.02;
    } else if (anim > 2.5 && anim < 3.5) {
      offset = tangent * cos(t * 0.1) * 0.04 + bitangent * sin(t * 0.15) * 0.06;
    } else if (anim > 3.5) {
      float cycle = mod(t * 0.5, 8.0);
      float burst = cycle < 0.8 ? sin(cycle / 0.8 * 3.14159) * 0.25 : sin(t * 0.3) * 0.03;
      offset = bitangent * burst;
    }
    pos += offset;

    // ── Billboard + highlight scale ────────────────────────────────
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec2 size = instanceSize;

    // Highlight: scale up 1.3x if this is the highlighted instance
    if (uHighlightIdx >= 0 && gl_InstanceID == uHighlightIdx) {
      size *= 1.3;
      vAlpha = min(vAlpha + 0.2, 1.0); // also slightly brighter
    }

    mvPos.x += position.x * size.x;
    mvPos.y += position.y * size.y;

    gl_Position = projectionMatrix * mvPos;

    // UV
    vec2 quadUV = vec2(position.x + 0.5, position.y + 0.5);
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
