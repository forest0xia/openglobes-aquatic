// ---------------------------------------------------------------------------
// SpeciesShader — instanced sprite billboards with bioluminescent glow.
//
// The quad is 2x the sprite size. The inner region (|position.xy| < 0.25)
// renders the texture. The outer ring renders a colored glow halo that
// fades with distance — this creates the "light radiating outward" effect.
// ---------------------------------------------------------------------------

export const speciesVertexShader = `
  attribute vec3 instancePos;
  attribute vec4 instanceUV;
  attribute float instancePhase;
  attribute float instanceAnim;
  attribute vec2 instanceSize;
  attribute vec3 instanceColor;
  attribute vec3 instanceSpread;    // pre-computed spread direction (tangent-space)

  uniform float uTime;
  uniform vec3 uCamPos;
  uniform int uHighlightIdx;
  uniform float uHighlightScale;

  varying vec2 vUV;
  varying vec2 vQuadPos;             // raw quad position for glow calculation
  varying float vAlpha;
  varying vec3 vGlowColor;
  varying float vGlowStrength;
  varying float vAnimType;

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

    vGlowColor = instanceColor;
    vAnimType = instanceAnim;
    float anim = instanceAnim;

    // Glow strength by type
    if (anim < 0.5) {
      vGlowStrength = 0.8;  // coral: strong fluorescence
    } else if (anim > 2.5 && anim < 3.5) {
      vGlowStrength = 0.5;  // jellyfish: ethereal
    } else {
      vGlowStrength = 0.25; // fish: subtle
    }

    // ── Zoom-aware spread (consistent direction from instanceSpread) ──
    float camDist = length(uCamPos);
    float spreadFactor = smoothstep(140.0, 300.0, camDist);
    if (spreadFactor > 0.001) {
      // instanceSpread is a pre-computed direction in world space
      pos += instanceSpread * spreadFactor;
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

    // Highlight
    if (uHighlightIdx >= 0 && gl_InstanceID == uHighlightIdx) {
      size *= uHighlightScale;
      vAlpha = min(vAlpha + 0.15, 1.0);
      vGlowStrength = min(vGlowStrength + 0.4, 1.0);
    }

    // Expand quad 2x for glow halo (texture only in inner 50%)
    vec2 glowSize = size * 2.0;

    // Body wave (fish only)
    float bodyWave = 0.0;
    if (anim > 0.5) {
      float bodyX = position.x;
      float amp = (0.5 - bodyX) * 0.35;
      float waveSpeed = anim > 3.5 ? 8.0 : anim > 0.5 && anim < 1.5 ? 3.0 : 5.0;
      bodyWave = sin(bodyX * 6.28 - t * waveSpeed) * amp;
    }

    vQuadPos = position.xy; // -0.5 to 0.5

    mvPos.x += position.x * glowSize.x;
    mvPos.y += position.y * glowSize.y + bodyWave * size.y;

    gl_Position = projectionMatrix * mvPos;

    // UV — map inner 50% of quad to texture, outer 50% is glow-only
    vec2 innerUV = (position.xy * 2.0); // remap: -0.5..0.5 → -1..1
    innerUV = innerUV * 0.5 + 0.5;      // → 0..1
    // Flip Y for spritesheet
    innerUV.y = 1.0 - innerUV.y;
    vUV = instanceUV.xy + innerUV * instanceUV.zw;
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
    // Distance from center of quad (0 at center, 0.5 at texture edge, 0.707 at corner)
    float dist = length(vQuadPos);

    // Texture is in the inner region (|xy| < 0.25 maps to full texture)
    vec4 texel = texture2D(uAtlas, vUV);

    // Pulse
    float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vGlowColor.r * 20.0 + vGlowColor.g * 30.0);
    float glowIntensity = vGlowStrength * pulse;

    // ── Outer glow halo (beyond texture body) ────────────────────
    // Radial falloff from body edge
    float haloFalloff = 1.0 - smoothstep(0.15, 0.5, dist);
    float halo = haloFalloff * glowIntensity * 0.6;

    // Inner body region: show texture + subtle glow tint
    if (dist < 0.25 && texel.a > 0.05) {
      vec3 color = texel.rgb;
      // Body glow: additive color
      color += vGlowColor * glowIntensity * 0.25;
      // Edge enhancement within body
      float bodyEdge = 1.0 - smoothstep(0.05, 0.4, texel.a);
      color += vGlowColor * bodyEdge * glowIntensity * 0.5;
      color *= 1.0 + glowIntensity * 0.15;

      gl_FragColor = vec4(color, texel.a * vAlpha);
    }
    // Outer glow region: pure colored light
    else if (halo > 0.01) {
      // Soft radial glow
      vec3 glowColor = vGlowColor * halo;

      // For corals: extra bright fluorescent glow
      if (vAnimType < 0.5) {
        glowColor *= 1.5;
      }

      gl_FragColor = vec4(glowColor, halo * vAlpha * 0.8);
    }
    else {
      discard;
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
