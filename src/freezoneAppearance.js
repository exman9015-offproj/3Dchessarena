import * as THREE from 'three';

const geometry = {
  sphere: new THREE.SphereGeometry(0.27, 10, 8),
  cone: new THREE.ConeGeometry(0.2, 0.48, 8),
  wing: new THREE.ConeGeometry(0.16, 0.62, 6),
  ring: new THREE.TorusGeometry(0.32, 0.08, 6, 12),
  eye: new THREE.SphereGeometry(0.075, 8, 6),
  beak: new THREE.ConeGeometry(0.12, 0.28, 6)
};

const identity = (id, x = 0, y = 1.3, z = 0, sx = 1, sy = 1, sz = 1, rotationZ = 0) => ({
  id, x, y, z, sx, sy, sz, rotationZ
});

const designs = {
  frog: [identity('sphere', -0.22, 1.55), identity('sphere', 0.22, 1.55), identity('eye', -0.22, 1.59, 0.2), identity('eye', 0.22, 1.59, 0.2)],
  eagle: [identity('wing', -0.38, 1.15, 0, 1, 1, 1, -1.05), identity('wing', 0.38, 1.15, 0, 1, 1, 1, 1.05), identity('beak', 0, 1.35, 0.23)],
  wolf: [identity('cone', -0.19, 1.55, 0, 0.75, 0.9, 0.75), identity('cone', 0.19, 1.55, 0, 0.75, 0.9, 0.75), identity('sphere', 0, 1.28, 0.18, 0.65, 0.5, 0.8)],
  owl: [identity('sphere', -0.18, 1.4, 0.13, 0.72, 0.82, 0.6), identity('sphere', 0.18, 1.4, 0.13, 0.72, 0.82, 0.6), identity('eye', -0.18, 1.43, 0.29, 1.4, 1.4, 1), identity('eye', 0.18, 1.43, 0.29, 1.4, 1.4, 1), identity('cone', 0, 1.17, 0.26, 0.4, 0.5, 0.4)],
  lion: [identity('sphere', 0, 1.35, 0, 1.65, 1.55, 1.4), identity('sphere', 0, 1.35, 0.18, 0.72, 0.82, 0.72)],
  turtle: [identity('sphere', 0, 1.26, -0.02, 1.45, 0.95, 1.35), identity('ring', 0, 1.22, 0, 1, 1, 0.9), identity('sphere', 0, 1.43, 0.25, 0.55, 0.5, 0.55)],
  fox: [identity('cone', -0.18, 1.58, 0, 0.85, 1.1, 0.85), identity('cone', 0.18, 1.58, 0, 0.85, 1.1, 0.85), identity('cone', 0, 1.28, 0.22, 0.48, 0.75, 0.48)],
  bear: [identity('sphere', -0.26, 1.55, 0, 0.85, 0.85, 0.8), identity('sphere', 0.26, 1.55, 0, 0.85, 0.85, 0.8), identity('sphere', 0, 1.31, 0.15, 0.85, 0.7, 0.8)],
  horse: [identity('cone', -0.2, 1.54, 0, 0.65, 1.1, 0.65, -0.15), identity('cone', 0.2, 1.54, 0, 0.65, 1.1, 0.65, 0.15), identity('sphere', 0, 1.34, 0.12, 0.72, 0.95, 0.85)],
  dragon: [identity('cone', -0.22, 1.57, 0, 0.65, 1.1, 0.65, -0.4), identity('cone', 0.22, 1.57, 0, 0.65, 1.1, 0.65, 0.4), identity('wing', -0.35, 1.2, -0.05, 0.9, 1, 1, -0.8), identity('wing', 0.35, 1.2, -0.05, 0.9, 1, 1, 0.8)]
};

export function addFreezoneAppearance(root, appearanceId, primaryMaterial, accentMaterial) {
  const parts = designs[appearanceId];
  if (!parts) return null;
  const group = new THREE.Group();
  for (const part of parts) {
    const mesh = new THREE.Mesh(geometry[part.id], part.id === 'eye' ? accentMaterial : primaryMaterial);
    mesh.position.set(part.x, part.y, part.z);
    mesh.scale.set(part.sx, part.sy, part.sz);
    mesh.rotation.z = part.rotationZ;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  root.add(group);
  return group;
}

export function createFreezoneAppearancePreview(appearanceId, primaryColor) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.54, 0.24, 16),
    new THREE.MeshStandardMaterial({ color: '#b99759', metalness: 0.5, roughness: 0.4 })
  );
  base.position.y = 0.12;
  group.add(base);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.36, 0.85, 12),
    new THREE.MeshStandardMaterial({ color: primaryColor, metalness: 0.35, roughness: 0.42 })
  );
  body.position.y = 0.65;
  group.add(body);
  addFreezoneAppearance(
    group,
    appearanceId,
    new THREE.MeshStandardMaterial({ color: primaryColor, metalness: 0.3, roughness: 0.45 }),
    new THREE.MeshStandardMaterial({ color: '#f3d37a', metalness: 0.6, roughness: 0.3 })
  );
  return group;
}
