// ---------------------------------------------------------------------------
// SpeciesShader — instanced sprite billboards with bioluminescent glow.
//
// The quad is 1.8x the sprite size to allow glow halo around the body.
// Body vs halo is determined by texture alpha, not distance.
// ---------------------------------------------------------------------------

export const speciesVertexShader = `
  attribute vec3 instancePos;
  attribute vec4 instanceUV;
  attribute float instancePhase;
  attribute float instanceAnim;
  attribute vec2 instanceSize;
  attribute vec3 instanceColor;

  uniform float uTime;
  uniform vec3 uCamPos;
  uniform int uHighlightIdx;
  uniform float uHighlightScale;

  varying vec2 vUV;
  varying vec2 vQuadPos;
  varying float vAlpha;
  varying vec3 vGlowColor;
  varying float vGlowStrength;
  varying float vAnimType;

  void main() {
    vec3 pos = instancePos;
    float camDist = length(uCamPos);
    vec3 camDir = normalize(uCamPos);
    vec3 spriteDir = normalize(pos);
    float facing = dot(camDir, spriteDir);
    vAlpha = smoothstep(0.0, 0.15, facing);

    if (facing < -0.05) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      return;
    }

    vGlowColor = instanceColor;
    vAnimType = instanceAnim;
    float anim = instanceAnim;

    vGlowStrength = anim < 0.5 ? 1.0    // coral
                  : anim > 2.5 && anim < 3.5 ? 0.8  // jellyfish
                  : 0.5;               // fish

    // ── Swimming ──────────────────────────────────────────────────
    float t = uTime + instancePhase;
    vec3 normal = normalize(pos);
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    if (length(tangent) < 0.001) tangent = normalize(cross(vec3(1.0, 0.0, 0.0), normal));
    vec3 bitangent = cross(normal, tangent);

    if (anim > 0.5 && anim < 1.5) {
      pos += tangent * sin(t * 0.4) * 0.2 + bitangent * sin(t * 0.15) * 0.12;
    } else if (anim > 1.5 && anim < 2.5) {
      pos += tangent * sin(t * 0.6) * 0.015 + normal * sin(t * 0.8) * 0.02;
    } else if (anim > 2.5 && anim < 3.5) {
      pos += tangent * cos(t * 0.1) * 0.04 + bitangent * sin(t * 0.15) * 0.06;
    } else if (anim > 3.5) {
      float cycle = mod(t * 0.5, 8.0);
      float burst = cycle < 0.8 ? sin(cycle / 0.8 * 3.14159) * 0.25 : sin(t * 0.3) * 0.03;
      pos += bitangent * burst;
    }

    // ── Billboard ──────────────────────────────────────────────────
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec2 size = instanceSize;

    float minSize = 0.4 + smoothstep(150.0, 400.0, camDist) * 0.8;
    size = max(size, vec2(minSize));

    if (uHighlightIdx >= 0 && gl_InstanceID == uHighlightIdx) {
      size *= uHighlightScale;
      vAlpha = min(vAlpha + 0.15, 1.0);
      vGlowStrength = min(vGlowStrength + 0.4, 1.0);
    }

    // Expand quad by 1.8x for glow halo around the body
    vec2 expandedSize = size * 1.8;

    // Body wave (fish)
    float bodyWave = 0.0;
    if (anim > 0.5) {
      float bodyX = position.x;
      float amp = (0.5 - bodyX) * 0.35;
      float waveSpeed = anim > 3.5 ? 8.0 : anim > 0.5 && anim < 1.5 ? 3.0 : 5.0;
      bodyWave = sin(bodyX * 6.28 - t * waveSpeed) * amp;
    }

    vQuadPos = position.xy; // -0.5 to 0.5

    mvPos.x += position.x * expandedSize.x;
    mvPos.y += position.y * expandedSize.y + bodyWave * size.y;

    gl_Position = projectionMatrix * mvPos;

    // UV: the sprite texture fills the CENTER of the expanded quad.
    // Map position.xy from the expanded space back to texture 0..1
    // position goes -0.5..0.5, sprite fills the inner 1/1.8 = 55.6%
    float uvScale = 1.8; // matches expandedSize multiplier
    vec2 texUV = position.xy * uvScale + 0.5;
    texUV.y = 1.0 - texUV.y; // flip Y for spritesheet
    vUV = instanceUV.xy + clamp(texUV, 0.0, 1.0) * instanceUV.zw;
  }
`;

export const speciesFragmentShader = `
  uniform sampler2D uAtlas;
  uniform float uTime;

  varying vec2 vUV;
  varying vec2 vQuadPos;
  varying float vAlpha;
  varying vec3 vGlowColor;
  varying float vGlowStrength;
  varying float vAnimType;

  void main() {
    vec4 texel = texture2D(uAtlas, vUV);
    float dist = length(vQuadPos);

    float pulse = 0.6 + 0.4 * sin(uTime * 1.5 + vGlowColor.r * 20.0 + vGlowColor.g * 30.0);
    float glow = vGlowStrength * pulse;

    // If texture has alpha → this is the body
    if (texel.a > 0.05) {
      vec3 color = texel.rgb;
      // Additive glow tint on body
      color += vGlowColor * glow * 0.4;
      // Edge glow (where alpha transitions)
      float bodyEdge = 1.0 - smoothstep(0.05, 0.5, texel.a);
      color += vGlowColor * bodyEdge * glow * 0.7;
      color *= 1.0 + glow * 0.25;

      // Coral extra fluorescence
      if (vAnimType < 0.5) {
        color = mix(color, vGlowColor * 2.0, bodyEdge * 0.35);
      }

      gl_FragColor = vec4(color, texel.a * vAlpha);
    }
    // Outside body: radiant glow halo
    else {
      // Two-layer halo
      float innerHalo = (1.0 - smoothstep(0.1, 0.3, dist)) * glow * 1.2;
      float outerHalo = (1.0 - smoothstep(0.2, 0.5, dist)) * glow * 0.5;
      float totalHalo = innerHalo + outerHalo;

      if (totalHalo < 0.005) discard;

      vec3 haloColor = vGlowColor * totalHalo;
      if (vAnimType < 0.5) haloColor *= 2.0;
      if (vAnimType > 2.5 && vAnimType < 3.5) {
        haloColor *= 0.8 + 0.5 * sin(uTime * 2.5 + vGlowColor.b * 40.0);
      }

      gl_FragColor = vec4(haloColor, totalHalo * vAlpha);
    }
  }
`;

export const ANIM_CODE: Record<string, number> = {
  none: 0, static: 0,
  slow_cruise: 1, schooling: 1,
  hovering: 2,
  drifting: 3,
  darting: 4,
};
