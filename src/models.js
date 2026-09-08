import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
const sphereLow = new THREE.SphereGeometry(1, 16, 10);
const sphere = new THREE.SphereGeometry(1, 28, 20),
  rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
  cube = new THREE.BoxGeometry(1, 1, 1),
  cylinder = new THREE.CylinderGeometry(1, 1, 1, 18);
function noise(seed) {
  const n = 128,
    d = new Uint8Array(n * n * 4);
  for (let i = 0; i < d.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    d[i] = d[i + 1] = d[i + 2] = 110 + (seed >>> 25);
    d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.needsUpdate = true;
  return t;
}
const clothNoise = noise(174),
  grain = noise(923);
const M = {
  cream: new THREE.MeshPhysicalMaterial({
    color: 0xeee5cf,
    roughness: 0.96,
    sheen: 1,
    sheenColor: new THREE.Color(0xfff1d7),
    bumpMap: grain,
    bumpScale: 0.014,
  }),
  tuft: new THREE.MeshPhysicalMaterial({
    color: 0xeee5cf,
    roughness: 0.96,
    sheen: 1,
    sheenColor: new THREE.Color(0xfff1d7),
  }),
  red: new THREE.MeshStandardMaterial({
    color: 0x812d2a,
    roughness: 0.94,
    bumpMap: clothNoise,
    bumpScale: 0.014,
  }),
  pink: new THREE.MeshStandardMaterial({
    color: 0xad8673,
    roughness: 0.95,
    bumpMap: clothNoise,
    bumpScale: 0.013,
  }),
  black: new THREE.MeshPhysicalMaterial({
    color: 0x121719,
    roughness: 0.62,
    bumpMap: grain,
    bumpScale: 0.006,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: 0x4b4e4c,
    metalness: 0.85,
    roughness: 0.33,
  }),
  gun: new THREE.MeshStandardMaterial({
    color: 0x252a2b,
    metalness: 0.72,
    roughness: 0.37,
  }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x111515, roughness: 0.95 }),
  yellow: new THREE.MeshPhysicalMaterial({ color: 0xc8a043, roughness: 0.52 }),
  gold: new THREE.MeshStandardMaterial({
    color: 0xc7a665,
    metalness: 0.8,
    roughness: 0.35,
  }),
  eye: new THREE.MeshPhysicalMaterial({
    color: 0x060807,
    roughness: 0.12,
    clearcoat: 1,
  }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9e9de }),
  olive: new THREE.MeshStandardMaterial({
    color: 0x3d4541,
    roughness: 0.88,
    bumpMap: grain,
    bumpScale: 0.012,
  }),
  enemy: new THREE.MeshStandardMaterial({ color: 0x403b36, roughness: 0.87 }),
  redPatch: new THREE.MeshStandardMaterial({ color: 0x9f3c30, roughness: 0.9 }),
};

// The supplied police reference uses navy textiles, satin leather and cyan modules.
Object.assign(M, {
  navy: new THREE.MeshPhysicalMaterial({
    color: 0x111d30,
    roughness: 0.68,
    sheen: 0.45,
    sheenColor: new THREE.Color(0x304767),
    bumpMap: clothNoise,
    bumpScale: 0.009,
  }),
  leather: new THREE.MeshPhysicalMaterial({
    color: 0x0b1320,
    roughness: 0.37,
    clearcoat: 0.28,
    clearcoatRoughness: 0.42,
    bumpMap: grain,
    bumpScale: 0.004,
  }),
  seam: new THREE.MeshStandardMaterial({
    color: 0x344151,
    roughness: 0.63,
    metalness: 0.18,
  }),
  cyan: new THREE.MeshStandardMaterial({
    color: 0x087dbb,
    emissive: 0x0074ff,
    emissiveIntensity: 0.72,
    roughness: 0.32,
    metalness: 0.08,
  }),
});
export function part(parent, geo, mat, pos, scale) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const box = (g, m, p, s) => part(g, rounded, m, p, s),
  ball = (g, m, p, s) => part(g, sphere, m, p, s);
function tube(g, points, r, material) {
  const geo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    20,
    r,
    6,
    false,
  );
  return part(g, geo, material, [0, 0, 0], [1, 1, 1]);
}
function fleece(g, center, scale, count) {
  const geo = new THREE.SphereGeometry(1, 6, 4),
    inst = new THREE.InstancedMesh(geo, M.tuft, count),
    dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count,
      r = Math.sqrt(1 - y * y),
      a = i * 2.39996,
      n = new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
    dummy.position.set(
      center[0] + n.x * scale[0],
      center[1] + n.y * scale[1],
      center[2] + n.z * scale[2],
    );
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const s = 0.014 + (Math.sin(i * 7.21) + 1) * 0.004;
    dummy.scale.set(s, s * 0.86, s * 0.16);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  geo.userData.owned = true;
  inst.receiveShadow = true;
  g.add(inst);
}

function compact(g, skip = []) {
  const bins = new Map();
  for (const o of [...g.children]) {
    if (!o.isMesh || o.isInstancedMesh || skip.includes(o)) continue;
    o.updateMatrix();
    if (!bins.has(o.material)) bins.set(o.material, []);
    bins
      .get(o.material)
      .push(
        (o.geometry.index
          ? o.geometry.toNonIndexed()
          : o.geometry.clone()
        ).applyMatrix4(o.matrix),
      );
    g.remove(o);
  }
  for (const [m, geos] of bins) {
    const merged = mergeGeometries(geos, false);
    merged.userData.owned = true;
    geos.forEach((o) => o.dispose());
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
}

// Finite-thickness tailored panels produce lapels/coat tails without boxy slabs.
function panel(parent, material, points, z, depth = 0.025) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.008,
    bevelSegments: 1,
    steps: 1,
  });
  geometry.userData.owned = true;
  return part(parent, geometry, material, [0, 0, z], [1, 1, 1]);
}

function shieldBadge(parent, x, y, z, scale = 1) {
  const badge = panel(
    parent,
    M.gold,
    [
      [-0.075, 0.08],
      [-0.06, -0.047],
      [0, -0.105],
      [0.06, -0.047],
      [0.075, 0.08],
      [0, 0.105],
    ],
    -0.012,
    0.019,
  );
  badge.position.set(x, y, z);
  badge.scale.setScalar(scale);
  const inset = panel(
    parent,
    M.black,
    [
      [-0.048, 0.052],
      [-0.04, -0.03],
      [0, -0.068],
      [0.04, -0.03],
      [0.048, 0.052],
      [0, 0.071],
    ],
    -0.012,
    0.012,
  );
  inset.position.set(x, y, z - 0.014);
  inset.scale.setScalar(scale);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 5,
      r = i % 2 ? 0.014 : 0.03;
    const xx = Math.cos(angle) * r,
      yy = Math.sin(angle) * r;
    i ? star.lineTo(xx, yy) : star.moveTo(xx, yy);
  }
  star.closePath();
  const geo = new THREE.ExtrudeGeometry(star, {
    depth: 0.01,
    bevelEnabled: false,
  });
  geo.userData.owned = true;
  const emblem = part(
    parent,
    geo,
    M.gold,
    [x, y, z - 0.038],
    [scale, scale, scale],
  );
  return emblem;
}

function lightBar(parent, x, y, z, width = 0.16, vertical = false) {
  const housing = box(parent, M.black, [x, y, z], [width + 0.035, 0.055, 0.04]);
  const strip = box(parent, M.cyan, [x, y, z - 0.024], [width, 0.018, 0.013]);
  if (vertical) {
    housing.rotation.z = Math.PI / 2;
    strip.rotation.z = Math.PI / 2;
  }
}

export function createDuck({ enemy = false, low = false } = {}) {
  const g = new THREE.Group(),
    legs = [],
    arms = [];
  const ball = (parent, material, position, scale) =>
    part(parent, low ? sphereLow : sphere, material, position, scale);
  g.name = "Duck-007-Navy-Police";
  const coat = enemy ? M.enemy : M.navy;

  // The head-to-body ratio is elongated from the former round toy silhouette.
  ball(g, coat, [0, 1.62, 0.01], [0.39, 0.45, 0.26]);
  ball(g, coat, [0, 1.82, 0.005], [0.44, 0.24, 0.27]);
  ball(g, M.black, [0, 1.15, 0.01], [0.34, 0.21, 0.26]);
  ball(g, M.cream, [0, 2.04, 0], [0.19, 0.2, 0.18]);
  ball(g, M.cream, [0, 2.39, -0.005], [0.385, 0.405, 0.345]);
  fleece(g, [0, 2.39, -0.005], [0.387, 0.406, 0.347], low ? 450 : 1000);

  // A broad duck bill: embedded cheeks, flattened tip, closed seam and nostrils.
  const billGeometry = (low ? sphereLow : sphere).clone();
  const billVertices = billGeometry.attributes.position;
  for (let i = 0; i < billVertices.count; i++) {
    const y = billVertices.getY(i),
      upper = Math.max(0, y);
    billVertices.setXYZ(
      i,
      billVertices.getX(i) * (1 - 0.28 * upper),
      y < 0 ? y * 0.13 : y,
      billVertices.getZ(i) * (1 - 0.12 * upper),
    );
  }
  billGeometry.computeVertexNormals();
  billGeometry.userData.owned = true;
  part(g, billGeometry, M.yellow, [0, 2.238, -0.337], [0.263, 0.187, 0.205]);
  ball(g, M.yellow, [0, 2.21, -0.341], [0.246, 0.041, 0.193]);
  tube(
    g,
    [
      [-0.235, 2.244, -0.414],
      [-0.165, 2.236, -0.493],
      [0, 2.229, -0.539],
      [0.165, 2.236, -0.493],
      [0.235, 2.244, -0.414],
    ],
    0.0038,
    M.olive,
  );
  for (const side of [-1, 1]) {
    ball(g, M.eye, [side * 0.205, 2.47, -0.295], [0.04, 0.056, 0.031]);
    ball(
      g,
      M.white,
      [side * 0.205 - 0.009, 2.491, -0.32],
      [0.009, 0.012, 0.005],
    );
    ball(g, M.olive, [side * 0.089, 2.348, -0.48], [0.006, 0.01, 0.005]);
  }

  // Peaked police cap: substantial crown, polished band and forward-projecting visor.
  ball(g, coat, [0, 2.775, 0.022], [0.455, 0.165, 0.371]);
  part(g, cylinder, M.leather, [0, 2.7, 0.005], [0.407, 0.103, 0.334]);
  const visor = ball(g, M.leather, [0, 2.67, -0.235], [0.424, 0.026, 0.273]);
  visor.rotation.x = 0.1;
  tube(
    g,
    [
      [-0.39, 2.683, -0.266],
      [-0.21, 2.656, -0.455],
      [0, 2.65, -0.495],
      [0.21, 2.656, -0.455],
      [0.39, 2.683, -0.266],
    ],
    0.006,
    M.seam,
  );
  tube(
    g,
    [
      [-0.368, 2.724, -0.214],
      [0, 2.724, -0.34],
      [0.368, 2.724, -0.214],
    ],
    0.009,
    M.gold,
  );
  shieldBadge(g, 0, 2.8, -0.333, 0.84);
  for (const side of [-1, 1])
    ball(g, M.gold, [side * 0.389, 2.727, -0.158], [0.018, 0.02, 0.014]);

  // White collar and black tie remain visible between layered, angular lapels.
  panel(
    g,
    M.white,
    [
      [-0.19, 2.0],
      [-0.12, 1.74],
      [0, 1.63],
      [0.12, 1.74],
      [0.19, 2.0],
      [0, 2.07],
    ],
    -0.269,
    0.025,
  );
  panel(
    g,
    M.white,
    [
      [-0.19, 2.0],
      [-0.035, 1.92],
      [-0.13, 1.78],
      [-0.24, 1.99],
    ],
    -0.293,
    0.025,
  );
  panel(
    g,
    M.white,
    [
      [0.19, 2.0],
      [0.035, 1.92],
      [0.13, 1.78],
      [0.24, 1.99],
    ],
    -0.293,
    0.025,
  );
  panel(
    g,
    M.black,
    [
      [-0.037, 1.94],
      [-0.055, 1.875],
      [0, 1.828],
      [0.055, 1.875],
      [0.037, 1.94],
    ],
    -0.329,
    0.023,
  );
  panel(
    g,
    M.black,
    [
      [-0.026, 1.85],
      [-0.065, 1.64],
      [0, 1.57],
      [0.065, 1.64],
      [0.026, 1.85],
    ],
    -0.322,
    0.023,
  );
  for (const side of [-1, 1]) {
    const lapel = panel(
      g,
      M.leather,
      [
        [side * 0.2, 2.01],
        [side * 0.39, 1.91],
        [side * 0.28, 1.78],
        [side * 0.345, 1.74],
        [side * 0.115, 1.48],
        [side * 0.12, 1.8],
      ],
      -0.286,
      0.035,
    );
    lapel.name = side > 0 ? "lapel-left" : "lapel-right";
    tube(
      g,
      [
        [side * 0.21, 2.008, -0.304],
        [side * 0.365, 1.905, -0.309],
        [side * 0.252, 1.783, -0.322],
        [side * 0.318, 1.74, -0.32],
        [side * 0.121, 1.493, -0.322],
      ],
      0.006,
      M.seam,
    );
    ball(g, M.gold, [side * 0.31, 1.94, -0.325], [0.012, 0.012, 0.007]);
  }

  // Linked chain, chest hardware and blue identification lamps.
  for (let i = 0; i < 13; i++) {
    const t = i / 12,
      x = -0.2 + t * 0.4,
      y = 1.82 - Math.sin(t * Math.PI) * 0.19;
    const link = part(
      g,
      new THREE.TorusGeometry(0.022, 0.0065, 5, 10),
      M.gold,
      [x, y, -0.338],
      [1, 0.78, 1],
    );
    link.geometry.userData.owned = true;
    link.rotation.y = (i % 2 ? 1 : -1) * 0.6;
  }
  shieldBadge(g, 0.282, 1.78, -0.258, 0.83);
  for (const side of [-1, 1]) {
    box(g, M.leather, [side * 0.215, 1.5, -0.261], [0.21, 0.23, 0.065]);
    panel(
      g,
      M.leather,
      [
        [side * 0.32, 1.6],
        [side * 0.11, 1.6],
        [side * 0.145, 1.53],
        [side * 0.285, 1.53],
      ],
      -0.305,
      0.02,
    );
    tube(
      g,
      [
        [side * 0.31, 1.58, -0.302],
        [side * 0.3, 1.41, -0.308],
        [side * 0.13, 1.41, -0.308],
      ],
      0.004,
      M.seam,
    );
    lightBar(g, side * 0.24, 1.68, -0.291, 0.145);
    for (let j = 0; j < 3; j++)
      box(
        g,
        M.gold,
        [side * 0.32, 1.52 - j * 0.043, -0.309],
        [0.01, 0.016, 0.007],
      );
  }
  box(g, M.leather, [0, 1.39, -0.287], [0.055, 0.34, 0.035]);
  for (let y = 1.27; y < 1.55; y += 0.035)
    box(g, M.gold, [0, y, -0.31], [0.015, 0.012, 0.008]);

  // Longcoat skirts flare below a cinched utility belt; centre gap exposes trousers.
  for (const side of [-1, 1]) {
    panel(
      g,
      coat,
      [
        [side * 0.08, 1.29],
        [side * 0.355, 1.28],
        [side * 0.51, 0.63],
        [side * 0.3, 0.54],
        [side * 0.145, 0.67],
      ],
      -0.246,
      0.1,
    );
    tube(
      g,
      [
        [side * 0.095, 1.25, -0.26],
        [side * 0.155, 0.73, -0.267],
        [side * 0.3, 0.565, -0.265],
        [side * 0.487, 0.635, -0.262],
      ],
      0.007,
      M.seam,
    );
    const rear = panel(
      g,
      coat,
      [
        [side * 0.025, 1.27],
        [side * 0.34, 1.27],
        [side * 0.45, 0.59],
        [side * 0.055, 0.55],
      ],
      0.195,
      0.095,
    );
    rear.name = side > 0 ? "coat-rear-left" : "coat-rear-right";
    box(g, M.leather, [side * 0.44, 0.94, -0.19], [0.18, 0.37, 0.12]);
    box(g, M.black, [side * 0.44, 1.1, -0.22], [0.2, 0.085, 0.13]);
    ball(g, M.gold, [side * 0.44, 1.08, -0.292], [0.013, 0.013, 0.006]);
  }
  part(g, cylinder, M.leather, [0, 1.235, 0], [0.36, 0.108, 0.282]);
  box(g, M.gold, [0, 1.235, -0.288], [0.18, 0.127, 0.038]);
  box(g, M.black, [0, 1.235, -0.311], [0.124, 0.076, 0.018]);
  box(g, M.gold, [0.015, 1.235, -0.327], [0.018, 0.07, 0.012]);
  for (const side of [-1, 1]) {
    box(g, M.black, [side * 0.22, 1.232, -0.257], [0.12, 0.17, 0.075]);
    lightBar(g, side * 0.23, 1.277, -0.306, 0.04);
  }

  // Each limb retains a local pivot for existing game animation.
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side > 0 ? "leg-left" : "leg-right";
    leg.position.set(side * 0.19, 1.11, 0.015);
    g.add(leg);
    ball(leg, coat, [0, -0.245, 0], [0.168, 0.31, 0.177]);
    ball(leg, coat, [0, -0.655, -0.006], [0.143, 0.265, 0.151]);
    box(leg, M.leather, [0, -0.48, -0.118], [0.19, 0.145, 0.048]);
    box(leg, M.leather, [0, -0.88, -0.01], [0.25, 0.23, 0.25]);
    box(leg, M.black, [0, -0.998, -0.09], [0.31, 0.18, 0.43]);
    box(leg, M.black, [0, -1.08, -0.08], [0.33, 0.06, 0.45]);
    for (let i = 0; i < 4; i++)
      box(
        leg,
        M.seam,
        [0, -0.873 - i * 0.039, -0.14 - i * 0.018],
        [0.15, 0.011, 0.02],
      );
    legs.push(leg);

    const arm = new THREE.Group();
    arm.name = side > 0 ? "arm-left" : "arm-right";
    arm.position.set(side * 0.43, 1.91, 0);
    g.add(arm);
    ball(arm, coat, [side * 0.055, -0.18, 0], [0.157, 0.264, 0.178]);
    ball(arm, M.leather, [side * 0.1, -0.445, -0.016], [0.136, 0.214, 0.15]);
    box(arm, M.leather, [side * 0.07, -0.024, -0.11], [0.2, 0.075, 0.25]);
    lightBar(arm, side * 0.08, -0.085, -0.177, 0.15);
    for (let i = 0; i < 5; i++) {
      const y = -0.24 - i * 0.055;
      tube(
        arm,
        [
          [side * 0.035, y, -0.156],
          [side * 0.105, y - 0.006, -0.168],
          [side * 0.2, y + 0.013, -0.1],
        ],
        0.01,
        M.seam,
      );
    }
    part(
      arm,
      cylinder,
      M.leather,
      [side * 0.12, -0.573, -0.021],
      [0.147, 0.09, 0.154],
    );
    ball(arm, M.cream, [side * 0.12, -0.699, -0.038], [0.114, 0.153, 0.119]);
    if (!low)
      fleece(arm, [side * 0.12, -0.699, -0.038], [0.115, 0.154, 0.12], 120);
    box(arm, M.black, [side * 0.12, -0.548, -0.17], [0.12, 0.1, 0.039]);
    lightBar(arm, side * 0.12, -0.548, -0.198, 0.074);
    ball(arm, M.seam, [side * 0.238, -0.554, -0.07], [0.012, 0.014, 0.012]);
    arms.push(arm);
  }

  // Keep the public gun and muzzle hierarchy used by lobby presentation.
  const gun = createWeapon(1, { hands: false });
  arms[0].rotation.set(1.28, 0, -0.18);
  gun.position.set(-0.12, -0.777, -0.217);
  gun.rotation.x = -1.28;
  gun.scale.setScalar(0.74);
  arms[0].add(gun);
  g.userData = {
    legs,
    arms,
    gun,
    reference: "IMG_0366.png",
    style: "navy-police-longcoat",
    sculptRuntime: {
      coordinateFrame: "right-handed Y-up, forward -Z",
      rigMode: "rigid-group",
      parts: [
        "head",
        "cap",
        "bill",
        "eyes",
        "torso",
        "lapels",
        "coat",
        "belt",
        "arms",
        "legs",
        "gun",
      ],
      limitations: [
        "single-view approximation",
        "rear coat and lower legs inferred",
        "no skeletal deformation certification",
      ],
    },
  };
  for (const limb of [...legs, ...arms]) compact(limb);
  compact(g);
  return g;
}
export function createWeapon(index = 0, { hands = true } = {}) {
  const g = new THREE.Group();
  g.name = index ? "P-09" : "AR-07";
  const rifle = index === 0;
  const receiver = box(
    g,
    M.gun,
    [0, 0, 0],
    [rifle ? 0.16 : 0.13, 0.17, rifle ? 0.54 : 0.36],
  );
  box(
    g,
    M.metal,
    [0, 0.091, rifle ? -0.05 : 0],
    [rifle ? 0.135 : 0.125, 0.035, rifle ? 0.64 : 0.38],
  );
  if (rifle) {
    box(g, M.rubber, [0, -0.02, 0.42], [0.16, 0.23, 0.35]);
    box(g, M.gun, [0, -0.015, -0.5], [0.145, 0.14, 0.4]);
    for (let i = 0; i < 10; i++)
      box(g, M.rubber, [0, 0.085, -0.52 + i * 0.062], [0.145, 0.013, 0.026]);
    for (const s of [-1, 1])
      for (let i = 0; i < 7; i++)
        box(
          g,
          M.rubber,
          [s * 0.075, 0, -0.65 + i * 0.055],
          [0.009, 0.05, 0.025],
        );
    const barrel = part(
      g,
      cylinder,
      M.metal,
      [0, 0, -0.85],
      [0.035, 0.4, 0.035],
    );
    barrel.rotation.x = Math.PI / 2;
    const brake = part(
      g,
      cylinder,
      M.gun,
      [0, 0, -1.035],
      [0.053, 0.12, 0.053],
    );
    brake.rotation.x = Math.PI / 2;
    for (const s of [-1, 1])
      box(g, M.rubber, [s * 0.048, 0, -1.05], [0.007, 0.03, 0.055]);
    const mag = box(g, M.gun, [0, -0.255, -0.11], [0.105, 0.34, 0.19]);
    mag.rotation.x = -0.12;
    for (let i = 0; i < 4; i++)
      box(g, M.rubber, [0.055, -0.16 - i * 0.06, -0.11], [0.01, 0.013, 0.17]);
    g.userData.mag = mag;
    const optic = new THREE.Group();
    optic.position.set(0, 0.2, 0.05);
    g.add(optic);
    box(optic, M.gun, [0, -0.055, 0], [0.13, 0.045, 0.18]);
    for (const s of [-1, 1])
      box(optic, M.gun, [s * 0.065, 0.022, 0], [0.023, 0.115, 0.14]);
    box(optic, M.gun, [0, 0.083, 0], [0.15, 0.023, 0.14]);
    const dot = part(
      optic,
      new THREE.SphereGeometry(0.003, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xff5c44 }),
      [0, 0.012, -0.07],
      [1, 1, 1],
    );
    g.userData.sightHeight = 0.212;
    compact(optic);
  } else {
    for (let i = 0; i < 6; i++)
      for (const s of [-1, 1])
        box(
          g,
          M.rubber,
          [s * 0.067, 0.025, 0.035 + i * 0.018],
          [0.006, 0.07, 0.008],
        );
    const muzzle = part(
      g,
      cylinder,
      M.rubber,
      [0, 0.015, -0.199],
      [0.033, 0.012, 0.033],
    );
    muzzle.rotation.x = Math.PI / 2;
    box(g, M.gun, [0, 0.126, -0.14], [0.024, 0.041, 0.03]);
    for (const s of [-1, 1])
      box(g, M.gun, [s * 0.041, 0.126, 0.12], [0.027, 0.04, 0.035]);
    g.userData.sightHeight = 0.144;
  }
  const grip = box(g, M.rubber, [0, -0.2, 0.17], [0.1, 0.26, 0.145]);
  grip.rotation.x = -0.23;
  const guard = part(
    g,
    new THREE.TorusGeometry(0.066, 0.012, 6, 16),
    M.gun,
    [0, -0.112, 0.045],
    [1, 1, 1],
  );
  guard.rotation.y = Math.PI / 2;
  guard.scale.y = 0.75;
  if (hands) {
    const right = new THREE.Group();
    g.add(right);
    ball(right, M.cream, [0.025, -0.2, 0.19], [0.105, 0.135, 0.115]);
    ball(right, M.navy, [0.055, -0.36, 0.36], [0.135, 0.17, 0.26]);
    box(right, M.leather, [0.07, -0.278, 0.235], [0.2, 0.09, 0.17]);
    lightBar(right, 0.08, -0.255, 0.136, 0.1);
    const left = new THREE.Group();
    g.add(left);
    ball(
      left,
      M.cream,
      [-0.03, -0.12, rifle ? -0.45 : -0.02],
      [0.1, 0.11, 0.145],
    );
    ball(
      left,
      M.navy,
      [-0.2, -0.27, rifle ? -0.4 : -0.01],
      [0.24, 0.135, 0.145],
    );
    box(
      left,
      M.leather,
      [-0.13, -0.22, rifle ? -0.49 : -0.1],
      [0.14, 0.11, 0.13],
    );
    lightBar(left, -0.13, -0.187, rifle ? -0.557 : -0.167, 0.078);
    compact(right);
    compact(left);
    g.userData.leftHand = left;
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, rifle ? -1.1 : -0.22);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  const flash = part(
    g,
    new THREE.ConeGeometry(0.1, 0.3, 5),
    new THREE.MeshBasicMaterial({
      color: 0xffe4aa,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
    [0, 0, rifle ? -1.17 : -0.31],
    [1, 1, 1],
  );
  flash.rotation.x = -Math.PI / 2;
  flash.visible = false;
  g.userData.flash = flash;
  compact(g, [flash, g.userData.mag]);
  return g;
}
