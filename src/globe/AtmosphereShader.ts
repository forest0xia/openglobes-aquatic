import * as THREE from 'three';

/**
 * Create a subtle atmosphere glow around the globe.
 * Uses a slightly larger back-face sphere with a fresnel rim shader.
 * Tighter radius (1.06x) and softer falloff for a delicate halo, not a thick ring.
 */
export function createAtmosphere(color: string, radius = 100): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius * 1.06, 48, 48);

  const material = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(-vPosition);
        float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
        // Steeper power (4.0) + lower intensity (0.35) = thin soft glow
        float intensity = pow(rim, 4.0) * 0.35;
        gl_FragColor = vec4(uColor, intensity);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}
