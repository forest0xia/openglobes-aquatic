import * as THREE from 'three';

export function createAtmosphere(color: string, radius = 100): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius * 1.15, 48, 48);

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
        float intensity = pow(rim, 3.0) * 0.6;
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
