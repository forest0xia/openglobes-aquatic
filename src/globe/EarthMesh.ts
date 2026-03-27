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
  const material = new THREE.MeshPhongMaterial({
    shininess: options.shininess ?? 15,
  });

  loader.load(options.textureUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    material.map = tex;
    material.needsUpdate = true;
  });

  if (options.bumpUrl) {
    loader.load(options.bumpUrl, (tex) => {
      material.bumpMap = tex;
      material.bumpScale = options.bumpScale ?? 10;
      material.needsUpdate = true;
    });
  }

  if (options.specularUrl) {
    loader.load(options.specularUrl, (tex) => {
      material.specularMap = tex;
      material.specular = new THREE.Color(options.specularColor ?? 'grey');
      material.needsUpdate = true;
    });
  }

  return new THREE.Mesh(geometry, material);
}
