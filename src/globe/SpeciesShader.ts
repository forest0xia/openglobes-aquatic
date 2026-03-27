// ---------------------------------------------------------------------------
// SpeciesShader — GLSL for instanced species sprite billboards.
//
// Each instance has its own position, UV rect, animation type, and
// width/height scale (preserving aspect ratio from the spritesheet).
// ---------------------------------------------------------------------------

export const speciesVertexShader = `
  attribute vec3 instancePos;
  attribute vec4 instanceUV;       // x, y, w, h in atlas (normalized 0-1)
  attribute float instancePhase;
  attribute float instanceAnim;    // 0=static, 1=cruise, 2=hover, 3=drift, 4=dart
  attribute vec2 instanceSize;     // width, height in world units

  uniform float uTime;
  uniform vec3 uCamPos;

  varying vec2 vUV;
  varying float vAlpha;

  void main() {
    vec3 pos = instancePos;
    vec3 camDir = normalize(uCamPos);
    vec3 spriteDir = normalize(pos);
    float facing = dot(camDir, spriteDir);
    vAlpha = smoothstep(0.0, 0.15, facing);

    // Clip fully back-facing
    if (facing < -0.05) {
      gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      return;
    }

    // Swimming displacement
    float t = uTime + instancePhase;
    vec3 normal = normalize(pos);
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    if (length(tangent) < 0.001) tangent = normalize(cross(vec3(1.0, 0.0, 0.0), normal));
    vec3 bitangent = cross(normal, tangent);

    vec3 offset = vec3(0.0);
    float anim = instanceAnim;
    if (anim > 0.5 && anim < 1.5) {
      // slow_cruise / schooling
      offset = tangent * sin(t * 0.4) * 0.2 + bitangent * sin(t * 0.15) * 0.12;
    } else if (anim > 1.5 && anim < 2.5) {
      // hovering
      offset = tangent * sin(t * 0.6) * 0.015 + normal * sin(t * 0.8) * 0.02;
    } else if (anim > 2.5 && anim < 3.5) {
      // drifting
      offset = tangent * cos(t * 0.1) * 0.04 + bitangent * sin(t * 0.15) * 0.06;
    } else if (anim > 3.5) {
      // darting
      float cycle = mod(t * 0.5, 8.0);
      float burst = cycle < 0.8 ? sin(cycle / 0.8 * 3.14159) * 0.25 : sin(t * 0.3) * 0.03;
      offset = bitangent * burst;
    }

    pos += offset;

    // Billboard: offset the quad corners in model-view space
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    // position.xy is the quad vertex (-0.5 to 0.5), scale by per-instance width/height
    mvPos.x += position.x * instanceSize.x;
    mvPos.y += position.y * instanceSize.y;

    gl_Position = projectionMatrix * mvPos;

    // UV: map quad corners [(-0.5,-0.5)..(0.5,0.5)] to spritesheet region
    // flipY=false on the texture, so Y=0 at top matches the manifest
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
