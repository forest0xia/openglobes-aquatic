import * as THREE from 'three';

export interface EarthMeshOptions {
  textureUrl: string;
  bumpUrl?: string;
  bumpScale?: number;
  specularUrl?: string;
  specularColor?: string;
  shininess?: number;
}

const loader = new THREE.TextureLoader();

export function createEarthMesh(options: EarthMeshOptions): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(100, 64, 64);
  // MeshLambertMaterial: no specular highlights, uniform response to ambient light.
  // The globe looks evenly lit from all angles — no shiny reflections.
  const material = new THREE.MeshLambertMaterial();

  loader.load(options.textureUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    material.map = tex;
    material.needsUpdate = true;
  });

  if (options.bumpUrl) {
    loader.load(options.bumpUrl, (tex) => {
      material.bumpMap = tex;
      material.bumpScale = options.bumpScale ?? 5;
      material.needsUpdate = true;
    });
  }

  // No specular map — no shiny reflections

  return new THREE.Mesh(geometry, material);
}
