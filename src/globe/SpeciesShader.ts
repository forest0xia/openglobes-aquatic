// ---------------------------------------------------------------------------
// SpeciesShader — instanced sprite billboards with bioluminescent glow.
//
// Position: lerp between instancePos (close) and instancePosFar (zoomed out).
// Glow: quad is 2.5x sprite size, outer ring = radiant colored halo.
// ---------------------------------------------------------------------------

export const speciesVertexShader = `
  attribute vec3 instancePos;        // close-zoom position (collision-resolved)
  attribute vec3 instancePosFar;     // far-zoom position (more spread out)
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
    // Lerp between close and far positions based on camera distance
    float camDist = length(uCamPos);
    float farMix = smoothstep(140.0, 320.0, camDist);
    vec3 pos = mix(instancePos, instancePosFar, farMix);

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
    vGlowStrength = anim < 0.5 ? 0.9    // coral: strong fluorescence
                  : anim > 2.5 && anim < 3.5 ? 0.6  // jellyfish
                  : 0.3;               // fish

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

    // Expand quad 2.5x for glow halo
    vec2 glowSize = size * 2.5;

    // Body wave (fish only)
    float bodyWave = 0.0;
    if (anim > 0.5) {
      float bodyX = position.x;
      float amp = (0.5 - bodyX) * 0.35;
      float waveSpeed = anim > 3.5 ? 8.0 : anim > 0.5 && anim < 1.5 ? 3.0 : 5.0;
      bodyWave = sin(bodyX * 6.28 - t * waveSpeed) * amp;
    }

    vQuadPos = position.xy;

    mvPos.x += position.x * glowSize.x;
    mvPos.y += position.y * glowSize.y + bodyWave * size.y;

    gl_Position = projectionMatrix * mvPos;

    // UV: map inner region to texture
    vec2 innerUV = position.xy * 2.5 * 0.5 + 0.5; // remap expanded quad to 0..1
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
    float dist = length(vQuadPos);
    vec4 texel = texture2D(uAtlas, vUV);

    // Breathing pulse
    float pulse = 0.65 + 0.35 * sin(uTime * 1.5 + vGlowColor.r * 20.0 + vGlowColor.g * 30.0);
    float glow = vGlowStrength * pulse;

    // ── Radiant halo (outer glow radiating from body) ────────────
    // Two-layer glow: inner bright ring + outer soft halo
    float innerHalo = (1.0 - smoothstep(0.08, 0.30, dist)) * glow * 1.2;
    float outerHalo = (1.0 - smoothstep(0.15, 0.50, dist)) * glow * 0.5;
    float totalHalo = innerHalo + outerHalo;

    // Body region: texture + glow tint
    if (dist < 0.20 && texel.a > 0.05) {
      vec3 color = texel.rgb;
      // Additive glow on body
      color += vGlowColor * glow * 0.35;
      // Edge glow within body
      float bodyEdge = 1.0 - smoothstep(0.05, 0.5, texel.a);
      color += vGlowColor * bodyEdge * glow * 0.6;
      // Brightness boost
      color *= 1.0 + glow * 0.2;

      // Coral extra fluorescence
      if (vAnimType < 0.5) {
        color = mix(color, vGlowColor * 2.0, bodyEdge * 0.3);
      }

      gl_FragColor = vec4(color, texel.a * vAlpha);
    }
    // Halo region: pure radiant light
    else if (totalHalo > 0.005) {
      vec3 haloColor = vGlowColor * totalHalo;

      // Coral: extra bright fluorescent halo
      if (vAnimType < 0.5) {
        haloColor *= 2.0;
      }
      // Jellyfish: ethereal double-pulse
      if (vAnimType > 2.5 && vAnimType < 3.5) {
        float ethereal = 0.5 + 0.5 * sin(uTime * 2.5 + vGlowColor.b * 40.0);
        haloColor *= 0.8 + ethereal * 0.4;
      }

      gl_FragColor = vec4(haloColor, totalHalo * vAlpha);
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
