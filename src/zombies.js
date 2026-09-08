import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Shared source geometry/materials survive actor disposal. Only the final batches
// belong to an individual actor, matching main.js's geometry.userData.owned rule.
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereLow = new THREE.SphereGeometry(1, 12, 8);
const sphereHigh = new THREE.SphereGeometry(1, 14, 8);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
const rag = new THREE.Shape();
rag.moveTo(-0.5, 0.5);
rag.lineTo(0.5, 0.5);
rag.lineTo(0.5, -0.31);
rag.lineTo(0.34, -0.45);
rag.lineTo(0.19, -0.28);
rag.lineTo(0.11, -0.5);
rag.lineTo(-0.08, -0.34);
rag.lineTo(-0.27, -0.48);
rag.lineTo(-0.34, -0.29);
rag.lineTo(-0.5, -0.39);
rag.closePath();
const ragGeometry = new THREE.ExtrudeGeometry(rag, {
  depth: 1,
  bevelEnabled: false,
  steps: 1,
});
ragGeometry.translate(0, 0, -0.5);

const matte = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.96 });
const materials = {
  skin: matte(0x889e72),
  runnerSkin: matte(0x819b96),
  sniperSkin: matte(0x98a082),
  work: matte(0x917445),
  runner: matte(0x4e667b),
  hood: matte(0x4a554b),
  trousers: matte(0x353d39),
  dark: matte(0x202723),
  teeth: matte(0xd7ccb0),
  metal: new THREE.MeshStandardMaterial({
    color: 0x596566,
    metalness: 0.65,
    roughness: 0.55,
  }),
  glow: new THREE.MeshBasicMaterial({ color: 0xbaff5e }),
  flash: new THREE.MeshBasicMaterial({
    color: 0xffdca0,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  }),
};
const flashGeometry = new THREE.ConeGeometry(0.085, 0.25, 5);

export const ZOMBIE_TYPES = Object.freeze({
  walker: Object.freeze({ label: "遊蕩喪屍", headHeight: 1.73 }),
  runner: Object.freeze({ label: "疾奔喪屍", headHeight: 1.61 }),
  sniper: Object.freeze({ label: "狙擊喪屍", headHeight: 1.73 }),
});

function part(parent, geometry, material, position, scale, rotation) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function batch(group) {
  const bins = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh || mesh.userData.animated) continue;
    mesh.updateMatrix();
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    if (!bins.has(mesh.material)) bins.set(mesh.material, []);
    bins.get(mesh.material).push(geometry);
    group.remove(mesh);
  }
  for (const [material, geometries] of bins) {
    const geometry = mergeGeometries(geometries, false);
    geometry.userData.owned = true;
    geometries.forEach((source) => source.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function segment(group, material, start, end, radius, depth = radius) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const delta = to.clone().sub(from);
  const middle = from.clone().add(to).multiplyScalar(0.5);
  const mesh = part(group, cylinderGeometry, material, middle.toArray(), [
    radius,
    delta.length(),
    depth,
  ]);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return mesh;
}

function createRifle() {
  const gun = new THREE.Group();
  gun.name = "salvaged-zombie-marksman-rifle";
  const box = (m, p, s, r) => part(gun, boxGeometry, m, p, s, r);
  box(materials.dark, [0, 0, 0], [0.13, 0.15, 0.51]);
  box(materials.dark, [0, -0.035, 0.35], [0.15, 0.21, 0.35]);
  box(materials.dark, [0, -0.016, -0.33], [0.13, 0.12, 0.27]);
  box(materials.metal, [0, 0.085, -0.11], [0.075, 0.023, 0.62]);
  box(materials.dark, [0, -0.18, 0.12], [0.08, 0.24, 0.13], [-0.2, 0, 0]);
  box(materials.dark, [0, -0.17, -0.1], [0.08, 0.21, 0.15]);
  segment(gun, materials.metal, [0, 0, -0.44], [0, 0, -1.04], 0.021);
  segment(gun, materials.dark, [0, 0, -0.94], [0, 0, -1.1], 0.04);
  // Tall scope and a bright objective remain readable from the playable distance.
  box(materials.dark, [0, 0.13, 0.005], [0.065, 0.12, 0.21]);
  segment(gun, materials.dark, [0, 0.205, 0.16], [0, 0.205, -0.23], 0.063);
  segment(gun, materials.glow, [0, 0.205, -0.232], [0, 0.205, -0.24], 0.047);
  // Raised stock wraps reuse the dark batch instead of adding textures.
  for (const z of [-0.29, -0.18, 0.37])
    box(materials.dark, [0, 0.005, z], [0.145, 0.155, 0.045], [0, 0, 0.12]);
  batch(gun);
  const muzzle = new THREE.Object3D();
  muzzle.name = "muzzle";
  muzzle.position.set(0, 0, -1.12);
  gun.add(muzzle);
  const flash = part(
    gun,
    flashGeometry,
    materials.flash,
    [0, 0, -1.21],
    [1, 1, 1],
    [-Math.PI / 2, 0, 0],
  );
  flash.userData.animated = true;
  flash.visible = false;
  gun.userData = { muzzle, flash };
  return gun;
}

/** Original cartoon undead; root is grounded at y=0 and faces local negative Z.
 * headHeight is the local vertical threshold for a headshot, not total height.
 * Animate legs/arms around their existing pivots without replacing their children.
 */
export function createZombie({ type = "walker", low = true } = {}) {
  if (!Object.hasOwn(ZOMBIE_TYPES, type)) type = "walker";
  const runner = type === "runner";
  const sniper = type === "sniper";
  const sphere = low ? sphereLow : sphereHigh;
  const skin = runner
    ? materials.runnerSkin
    : sniper
      ? materials.sniperSkin
      : materials.skin;
  const cloth = runner
    ? materials.runner
    : sniper
      ? materials.hood
      : materials.work;
  const root = new THREE.Group();
  root.name = `zombie-${type}`;
  const legs = [],
    arms = [];
  const box = (g, m, p, s, r) => part(g, boxGeometry, m, p, s, r);
  const ball = (g, m, p, s, r) => part(g, sphere, m, p, s, r);
  const bodyWidth = runner ? 0.53 : 0.63;
  const chestZ = runner ? -0.13 : -0.035;

  // A jagged jacket hem, asymmetrical shoulders, reflective strips and an empty
  // utility belt give the walker a ruined workwear silhouette without gore.
  ball(
    root,
    materials.trousers,
    [0.015, 1.0, 0.025],
    [bodyWidth * 0.4, 0.2, 0.17],
    [0, 0, -0.045],
  );
  // Continuous rounded chest and a narrower waist replace the block-shaped body.
  // Only the dangling cloth panels use the angular torn outline.
  ball(
    root,
    cloth,
    [0, 1.435, chestZ],
    [bodyWidth * 0.51, 0.31, 0.205],
    [runner ? -0.32 : -0.17, 0, -0.055],
  );
  ball(
    root,
    cloth,
    [0.018, 1.19, chestZ + 0.045],
    [bodyWidth * 0.39, 0.27, 0.165],
    [-0.1, 0, -0.055],
  );
  part(
    root,
    ragGeometry,
    cloth,
    [0.015, 1.13, chestZ - 0.115],
    [bodyWidth * 0.82, 0.32, 0.075],
    [-0.1, 0, -0.07],
  );
  box(
    root,
    materials.dark,
    [0.016, 1.065, -0.15],
    [bodyWidth * 0.79, 0.045, 0.055],
    [0, 0, -0.06],
  );
  box(
    root,
    materials.dark,
    [0.23, 1.12, 0.065],
    [0.12, 0.17, 0.12],
    [0, 0, -0.15],
  );
  if (!runner) {
    // All jacket details share the jacket material; raised folds catch light.
    for (const s of [-1, 1]) {
      part(
        root,
        ragGeometry,
        cloth,
        [s * 0.16, 1.39, -0.229],
        [0.13, 0.13, 0.034],
        [-0.08, s * -0.15, s * 0.06],
      );
      segment(
        root,
        materials.trousers,
        [s * 0.13, 1.55, -0.231],
        [s * 0.21, 1.23, -0.2],
        0.018,
        0.012,
      );
    }
  } else {
    for (const s of [-1, 1]) {
      ball(
        root,
        skin,
        [s * 0.112, 1.59, -0.306],
        [0.081, 0.052, 0.025],
        [-0.2, 0, s * -0.3],
      );
      box(
        root,
        materials.dark,
        [s * 0.1, 1.4, -0.32],
        [0.012, 0.11, 0.008],
        [0, 0, s * -0.3],
      );
    }
  }
  // Reuse trouser material for strips to keep the body at three/four batches.
  segment(
    root,
    materials.trousers,
    [0.025, 1.65, runner ? -0.295 : -0.175],
    [0.035, 1.14, runner ? -0.255 : -0.158],
    0.012,
    0.008,
  );
  if (sniper) {
    part(
      root,
      ragGeometry,
      cloth,
      [0, 1.39, 0.195],
      [0.72, 1.0, 0.045],
      [-0.12, 0, -0.09],
    );
    box(
      root,
      materials.dark,
      [0, 1.41, -0.238],
      [0.055, 0.54, 0.028],
      [-0.08, 0, -0.6],
    );
  }

  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = s < 0 ? "left-leg" : "right-leg";
    leg.position.set(s * (runner ? 0.135 : 0.16), 0.95, 0);
    root.add(leg);
    const kneeZ = runner ? -0.15 : s < 0 ? -0.11 : -0.035;
    const kneeX = s * (runner ? 0.033 : 0.015);
    segment(
      leg,
      materials.trousers,
      [0, -0.015, 0],
      [kneeX, -0.43, kneeZ],
      runner ? 0.09 : 0.11,
    );
    ball(
      leg,
      materials.trousers,
      [0, -0.11, -0.015],
      [runner ? 0.095 : 0.117, 0.19, 0.113],
    );
    segment(
      leg,
      materials.trousers,
      [kneeX, -0.43, kneeZ],
      [0, -0.77, 0.022],
      runner ? 0.066 : 0.083,
    );
    // A broken trouser knee exposes an actual rounded joint; the two legs have
    // different bends instead of identical straight toy cylinders.
    ball(leg, skin, [kneeX, -0.431, kneeZ - 0.055], [0.08, 0.096, 0.055]);
    part(
      leg,
      ragGeometry,
      materials.trousers,
      [kneeX, -0.354, kneeZ - 0.067],
      [0.174, 0.13, 0.061],
      [0.06, 0, s * 0.12],
    );
    ball(
      leg,
      materials.dark,
      [0, -0.76, 0.01],
      [runner ? 0.08 : 0.094, 0.145, 0.106],
    );
    ball(
      leg,
      materials.dark,
      [0, -0.845, -0.101],
      [runner ? 0.09 : 0.104, 0.078, 0.165],
    );
    box(
      leg,
      materials.dark,
      [0, -0.924, -0.066],
      [runner ? 0.185 : 0.215, 0.052, 0.345],
    );
    batch(leg);
    legs.push(leg);

    const arm = new THREE.Group();
    arm.name = s < 0 ? "left-arm" : "right-arm";
    arm.position.set(
      s * (runner ? 0.285 : 0.345),
      runner ? 1.53 : 1.61,
      chestZ,
    );
    root.add(arm);
    const elbow = sniper
      ? [s < 0 ? 0.1 : -0.035, -0.31, -0.16]
      : [s * 0.067, s < 0 ? -0.28 : -0.24, -0.16];
    const hand = sniper
      ? [s < 0 ? 0.515 : -0.135, -0.35, s < 0 ? -0.495 : -0.145]
      : [
          s * 0.05,
          runner ? -0.46 : s < 0 ? -0.33 : -0.255,
          runner ? -0.37 : -0.55,
        ];
    const shoulder = [0, -0.025, -0.015];
    segment(arm, cloth, shoulder, elbow, runner ? 0.075 : 0.098);
    ball(arm, cloth, shoulder, [runner ? 0.092 : 0.117, 0.132, 0.119]);
    // Exposed elbow, uneven sleeve edge, a long reaching forearm and three
    // separated fingers produce a recognizably undead gesture even in silhouette.
    ball(arm, skin, elbow, [0.064, 0.076, 0.066]);
    segment(arm, skin, elbow, hand, runner ? 0.049 : 0.057);
    ball(arm, skin, hand, [0.077, 0.044, 0.101], [0, 0, s * 0.1]);
    for (let finger = 0; finger < 3; finger++) {
      const x = hand[0] + (finger - 1) * 0.045;
      const length = finger === 1 ? 0.15 : 0.12;
      segment(
        arm,
        skin,
        [x, hand[1] - 0.005, hand[2] - 0.04],
        [x + s * 0.01, hand[1] - 0.035, hand[2] - length],
        0.014,
      );
      segment(
        arm,
        skin,
        [x + s * 0.01, hand[1] - 0.035, hand[2] - length],
        [x + s * 0.014, hand[1] - 0.068, hand[2] - length - 0.022],
        0.012,
      );
    }
    segment(
      arm,
      skin,
      [hand[0] - s * 0.059, hand[1], hand[2]],
      [hand[0] - s * 0.098, hand[1] - 0.039, hand[2] - 0.047],
      0.019,
    );
    part(
      arm,
      ragGeometry,
      cloth,
      [s * 0.024, -0.225, -0.105],
      [runner ? 0.14 : 0.184, 0.17, 0.085],
      [0.38, 0, s * -0.16],
    );
    batch(arm);
    arms.push(arm);
  }

  const head = new THREE.Group();
  head.name = "zombie-head";
  head.position.set(
    runner ? 0.055 : 0.018,
    runner ? 1.865 : 1.995,
    runner ? -0.265 : -0.116,
  );
  head.scale.setScalar(0.81);
  head.rotation.z = runner ? -0.12 : 0.065;
  root.add(head);
  ball(
    head,
    skin,
    [-0.012, runner ? -0.13 : -0.23, runner ? 0.025 : 0.008],
    [0.115, 0.19, 0.105],
  );
  ball(head, skin, [0, 0.025, 0.0], [0.231, 0.299, 0.214]);
  ball(
    head,
    skin,
    [0.005, -0.182, -0.016],
    [0.166, 0.132, 0.166],
    [0, 0, -0.075],
  );
  ball(head, materials.dark, [0, -0.124, -0.186], [0.119, 0.05, 0.043]);
  ball(
    head,
    skin,
    [0.006, -0.187, -0.18],
    [0.127, 0.03, 0.049],
    [0.12, 0, -0.075],
  );
  // A projecting human nose bridge and narrower chin keep the face recognizably
  // human, with recessed sockets and sagging lips supplying the undead expression.
  ball(head, skin, [0, 0.014, -0.2], [0.036, 0.098, 0.039], [0.22, 0, 0]);
  ball(head, skin, [0.003, -0.026, -0.237], [0.043, 0.034, 0.05]);
  for (const s of [-1, 1]) {
    ball(head, skin, [s * 0.231, -0.005, -0.005], [0.037, 0.084, 0.043]);
    ball(
      head,
      materials.dark,
      [s * 0.239, -0.003, -0.035],
      [0.012, 0.046, 0.012],
    );
    ball(
      head,
      skin,
      [s * 0.148, -0.048, -0.167],
      [0.064, 0.107, 0.056],
      [0, 0, s * 0.35],
    );
    ball(
      head,
      materials.dark,
      [s * 0.092, 0.061, -0.195],
      [0.078, 0.064, 0.028],
      [0, 0, s * -0.16],
    );
    ball(
      head,
      materials.glow,
      [s * 0.092, 0.045, -0.219],
      [0.027, 0.024, 0.01],
    );
    ball(
      head,
      skin,
      [s * 0.091, 0.109, -0.192],
      [0.096, 0.031, 0.042],
      [0, 0, s * -0.19],
    );
    ball(
      head,
      skin,
      [s * 0.081, -0.034, -0.183],
      [0.06, 0.022, 0.033],
      [0, 0, s * -0.26],
    );
    box(
      head,
      materials.dark,
      [s * 0.029, -0.043, -0.271],
      [0.014, 0.016, 0.009],
      [0, 0, s * -0.23],
    );
  }
  for (let i = 0; i < 5; i++)
    box(
      head,
      materials.teeth,
      [(i - 2) * 0.035, -0.103 - (i % 2) * 0.009, -0.224],
      [0.024, 0.026 + (i % 2) * 0.01, 0.012],
      [0, 0, (i - 2) * 0.05],
    );
  if (sniper) {
    // Three thick hood panels leave the face visibly recessed in an open cowl.
    ball(head, cloth, [0, 0.222, 0.038], [0.303, 0.13, 0.268]);
    for (const s of [-1, 1])
      part(
        head,
        ragGeometry,
        cloth,
        [s * 0.254, -0.02, 0.061],
        [0.14, 0.58, 0.42],
        [0, 0, s * 0.11],
      );
    ball(head, cloth, [0, 0.012, 0.184], [0.276, 0.282, 0.12]);
    // Scope supplies the glow batch; sniper eyes use the same material.
  } else {
    // Matted receding hair hugs the cranium instead of forming squared spikes.
    for (let i = 0; i < (runner ? 2 : 4); i++)
      ball(
        head,
        materials.dark,
        [-0.13 + i * 0.055, 0.245 + (i % 2) * 0.018, 0.04 + (i % 2) * 0.035],
        [0.065, 0.05, 0.092],
        [0, 0, -0.3 + i * 0.12],
      );
  }
  batch(head);
  batch(root);

  let gun;
  if (sniper) {
    gun = createRifle();
    gun.position.set(0.17, 1.26, -0.23);
    root.add(gun);
  }
  root.userData = {
    type,
    enemyKind: "zombie",
    legs,
    arms,
    head,
    headHeight: ZOMBIE_TYPES[type].headHeight,
    gun,
  };
  return root;
}
