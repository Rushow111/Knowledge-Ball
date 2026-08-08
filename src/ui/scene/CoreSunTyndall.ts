import * as THREE from 'three';

/**
 * Creates a cheap volumetric/Tyndall-style radiation shell for the core Sun.
 * It intentionally uses layered additive sprites instead of post-processing so
 * mobile/WebGL performance remains predictable.
 */
export function createCoreSunTyndall(texture: THREE.Texture, physicalRadius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'core-sun-tyndall';

  const layers = [
    { scale: 4.5, opacity: 0.20 },
    { scale: 7.5, opacity: 0.11 },
    { scale: 11, opacity: 0.055 },
  ];

  for (const layer of layers) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      color: 0xffd98a,
      transparent: true,
      opacity: layer.opacity,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sprite.scale.setScalar(physicalRadius * 2 * layer.scale);
    sprite.renderOrder = 8;
    group.add(sprite);
  }

  return group;
}
