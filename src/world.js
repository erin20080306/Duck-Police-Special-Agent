import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const boxGeo = new THREE.BoxGeometry(1, 1, 1),
  cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12),
  sphereGeo = new THREE.SphereGeometry(1, 10, 7);
const materials = new Map();
let concrete;
export async function loadMaterials() {
  concrete = await new THREE.TextureLoader().loadAsync("/assets/concrete.webp");
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
  concrete.colorSpace = THREE.SRGBColorSpace;
  concrete.anisotropy = 4;
}
function material(
  name,
  color,
  roughness = 0.9,
  metalness = 0,
  textured = false,
) {
  if (materials.has(name)) return materials.get(name);
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (textured && concrete) {
    m.map = concrete;
    m.bumpMap = concrete;
    m.bumpScale = 0.07;
  }
  materials.set(name, m);
  return m;
}
function surfaceUV(geo, w, h, d) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4),
      a = face < 2 ? d : w,
      b = face < 2 ? h : face < 4 ? d : h;
    uv.setXY(i, (uv.getX(i) * a) / 3, (uv.getY(i) * b) / 3);
  }
  return geo;
}
export function createLevel(kind = "foundry", low = false) {
  const root = new THREE.Group(),
    boxes = [],
    rayTargets = [],
    batches = new Map(),
    lights = [];
  const ownedMaterials = new Set(),
    lampPositions = [];
  const own = (m) => {
    ownedMaterials.add(m);
    return m;
  };
  const M = {
    stone: material("stone", 0x848078, 0.91, 0, true),
    dark: material("dark", 0x464843, 0.91, 0, true),
    brick: material("brick", 0x706457, 0.95, 0, true),
    road: material("road", 0x555b5b, 0.47, 0.12, true),
    metal: material("metal", 0x525b59, 0.46, 0.72),
    rust: material("rust", 0x5b4638, 0.85, 0.38, true),
    wood: material("wood", 0x4b3a30, 0.89, 0, true),
    glass: material("glass", 0x182326, 0.22, 0.66),
    black: material("black", 0x171b1b, 0.95),
    sand: material("sand", 0x8d8770, 0.95, 0, true),
    red: material("red", 0x652d25, 0.85),
    roof: material("roof", 0x323b3b, 0.6, 0.32),
    stripe: material("stripe", 0xaaa18a, 0.9),
    crate: material("crate", 0x2f5a60, 0.74, 0.34),
    crateWarm: material("crateWarm", 0x7a4132, 0.78, 0.3),
  };
  // Everything that only differs by tone between locations lives here, so the
  // geometry below reads as layout rather than a chain of per-map ternaries.
  const THEMES = {
    foundry: {
      lamp: 0xffe6b3,
      halo: 0xffdfad,
      smoke: 0x869195,
      rain: 0.09,
      crossings: [-22, -8, 6, 20],
      cabinet: M.rust,
      streetLights: false,
    },
    temple: {
      lamp: 0xffbf72,
      halo: 0xffbd79,
      smoke: 0x6e858c,
      rain: 0.18,
      crossings: [-18, 0, 18],
      cabinet: M.stone,
      streetLights: false,
    },
    harbor: {
      lamp: 0xd6f4ff,
      halo: 0x9fe4ff,
      smoke: 0x55707f,
      rain: 0.24,
      crossings: [-20, -4, 14],
      cabinet: M.metal,
      streetLights: true,
    },
  };
  const theme = THEMES[kind] ?? THEMES.foundry;
  const lampMaterial = own(new THREE.MeshBasicMaterial({ color: theme.lamp }));
  // One neon tone, not two: every extra material is another mobile draw call.
  const neonMaterial = own(new THREE.MeshBasicMaterial({ color: 0x63e6ff }));
  function add(
    geo,
    m,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(rx, ry, rz);
    mesh.updateMatrix();
    const copy = geo.clone().applyMatrix4(mesh.matrix);
    if (!batches.has(m)) batches.set(m, []);
    batches.get(m).push(copy);
    return mesh;
  }
  function box(m, x, y, z, w, h, d, ry = 0, rz = 0) {
    const geo = surfaceUV(boxGeo.clone(), w, h, d);
    add(geo, m, x, y, z, w, h, d, 0, ry, rz);
    geo.dispose();
  }
  function cyl(m, x, y, z, r, h, rx = 0, rz = 0) {
    add(cylGeo, m, x, y, z, r, h, r, rx, 0, rz);
  }
  function block(x, z, w, d, h, m = M.stone) {
    box(m, x, h / 2, z, w, h, d);
    boxes.push({ x, z, w: w / 2, d: d / 2, h });
  }
  function beam(a, b, width, m = M.metal) {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      mid = av.clone().add(bv).multiplyScalar(0.5),
      len = av.distanceTo(bv);
    const o = new THREE.Object3D();
    o.position.copy(mid);
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      bv.sub(av).normalize(),
    );
    o.scale.set(width, len, width);
    o.updateMatrix();
    const geo = boxGeo.clone().applyMatrix4(o.matrix);
    if (!batches.has(m)) batches.set(m, []);
    batches.get(m).push(geo);
  }
  function sign(text, x, y, z, w, ry = 0) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#303938";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = "#a99e79";
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, 502, 118);
    ctx.fillStyle = "#d5cab0";
    ctx.font = "bold 52px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4),
      own(new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 })),
    );
    p.position.set(x, y, z);
    p.rotation.y = ry;
    root.add(p);
    rayTargets.push(p);
  }
  // Ground, two sidewalk heights and gutters. Roads remain continuously walkable.
  box(M.road, 0, -0.12, 0, 120, 0.2, 130);
  for (const s of [-1, 1]) {
    box(M.dark, s * 17, -0.015, 0, 6, 0.1, 72);
    box(M.stone, s * 13.9, 0.01, 0, 0.18, 0.14, 72);
    for (let z = -34; z < 36; z += 3)
      box(M.dark, s * 14.15, 0.06, z, 0.04, 0.01, 2.95);
  }
  for (let z = -32; z < 34; z += 7) box(M.stripe, 0, 0.002, z, 0.1, 0.007, 2.6);
  // Walls define the playable area; surrounding buildings continue beyond it.
  for (const s of [-1, 1]) {
    block(s * 33, 0, 1, 123, 2.8, M.dark);
    block(0, s * 61, 67, 1, 3, M.dark);
  }
  function facade(x, z, w, d, h, side, index) {
    block(x, z, w, d, h, index % 2 ? M.stone : M.brick);
    box(M.dark, x, 0.42, z, w + 0.35, 0.5, d + 0.35);
    box(M.dark, x, h - 0.3, z, w + 0.45, 0.35, d + 0.5);
    const face = x - side * (w / 2 + 0.035);
    for (let y = 2.1; y < h - 1; y += 2.7) {
      box(M.dark, face, y - 1.2, z, 0.14, 0.13, d);
      for (let zz = z - d / 2 + 1; zz < z + d / 2 - 0.5; zz += 2) {
        const broken = (Math.floor(zz + y) + index) % 5 === 0;
        box(M.black, face - side * 0.045, y, zz, 0.035, 1.45, 1.1);
        if (!broken) box(M.glass, face - side * 0.06, y, zz, 0.028, 1.3, 0.94);
        for (const s of [-1, 1])
          box(M.dark, face - side * 0.08, y, zz + s * 0.58, 0.19, 1.6, 0.09);
        box(M.dark, face - side * 0.13, y - 0.76, zz, 0.33, 0.12, 1.35);
        box(M.metal, face - side * 0.1, y, zz, 0.04, 1.4, 0.035);
        box(M.metal, face - side * 0.1, y, zz, 0.04, 0.035, 1.08);
        if (broken)
          box(
            M.metal,
            face - side * 0.12,
            y - 0.3,
            zz - 0.15,
            0.035,
            0.05,
            0.9,
            0,
            0.3,
          );
      }
    }
    for (let i = 0; i < 4; i++) {
      box(
        M.dark,
        x - w / 2 + (i * w) / 3,
        h + 0.25,
        z - d / 2,
        0.22,
        0.8,
        0.25,
      );
      box(
        M.dark,
        x - w / 2 + (i * w) / 3,
        h + 0.25,
        z + d / 2,
        0.22,
        0.8,
        0.25,
      );
    }
    box(M.dark, x, h + 0.3, z - d / 2, w, 0.16, 0.2);
    box(M.dark, x, h + 0.3, z + d / 2, w, 0.16, 0.2);
    cyl(M.rust, face - side * 0.22, h / 2, z + d / 2 - 0.4, 0.055, h);
    box(M.metal, face - side * 0.28, 1.5, z - d / 2 + 0.8, 0.4, 0.7, 0.6);
  }
  if (kind === "foundry") {
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const z = -29 + i * 14,
          x = side * (17.6 + (i % 2) * 1.3),
          h = 7 + ((i * 7) % 5) * 1.5;
        facade(x, z, 7.5, 11.5, h, side, i);
      }
    // Skeletal steel loading gantry across the street.
    for (const x of [-10, 10]) {
      cyl(M.rust, x, 4, -20, 0.19, 8);
      for (const z of [-20, -15])
        beam([x, 7.8, z], [x, 2, z + 2], 0.12, M.rust);
    }
    beam([-10, 7.8, -20], [10, 7.8, -20], 0.36, M.rust);
    beam([-10, 7, -20], [10, 7, -20], 0.12, M.rust);
    for (let x = -10; x < 10; x += 2)
      beam([x, 7, -20], [x + 2, 7.8, -20], 0.08, M.rust);
    // Brick smokestacks, rooftop tanks and distant silhouettes.
    for (let i = 0; i < 4; i++) {
      cyl(M.brick, -27 + i * 17, 12, -85, 0.9, 24 + i * 2);
      cyl(M.dark, -27 + i * 17, 24 + i, -85, 1.05, 0.4);
    }
    for (let i = 0; i < 10; i++)
      box(M.dark, -55 + i * 12, 8 + (i % 4), -91, 9, 16 + (i % 4) * 2, 13);
    sign("QUARANTINE / 07", 0, 6.2, -36.45, 8);
    sign("07 / RESTRICTED", -13.79, 2.5, 13, 4, Math.PI / 2);
    for (const x of [-4.25, 4.25]) block(x, -36.45, 0.16, 0.16, 7.25, M.metal);
    beam([-4.25, 7.25, -36.45], [4.25, 7.25, -36.45], 0.12, M.metal);
    // Abandoned armoured transport: multiple physical components, one collision body.
    const vx = -6,
      vz = 10;
    block(vx, vz, 2.65, 6.1, 1.45, M.dark);
    box(M.olive || M.metal, vx, 1.7, vz - 1.0, 2.5, 0.75, 2.4);
    box(M.glass, vx, 1.86, vz - 2.21, 2.1, 0.46, 0.025);
    box(M.metal, vx, 1.48, vz + 1.65, 2.5, 0.62, 2.1);
    for (const s of [-1, 1])
      for (const z of [-1.8, 1.7]) {
        cyl(M.black, vx + s * 1.33, 0.55, vz + z, 0.55, 0.28, 0, Math.PI / 2);
        cyl(M.metal, vx + s * 1.48, 0.55, vz + z, 0.25, 0.02, 0, Math.PI / 2);
      }
    for (let x = -0.9; x < 1; x += 0.22)
      box(M.black, vx + x, 1.02, vz - 3.08, 0.12, 0.42, 0.02);
    // Corrugated freight containers form offset lanes with clear crossings.
    for (const [x, z, w, d] of [
      [6, -9, 3, 7],
      [-6, -23, 3, 6],
      [7, 24, 3, 6],
    ]) {
      block(x, z, w, d, 2.65, M.rust);
      for (let i = 0; i < 12; i++)
        for (const s of [-1, 1])
          box(
            M.metal,
            x + s * (w / 2 + 0.02),
            1.3,
            z - d / 2 + 0.3 + (i * (d - 0.6)) / 11,
            0.08,
            2.45,
            0.065,
          );
      for (const s of [-1, 1]) {
        box(M.metal, x + s * 0.65, 1.3, z + d / 2 + 0.035, 0.055, 2.4, 0.05);
        box(M.black, x + s * 0.73, 1.3, z + d / 2 + 0.075, 0.14, 0.035, 0.04);
      }
    }

    // A damaged barrel-vault roof gives the district a recognisable silhouette.
    // Its feet sit inside the existing building footprint; player routes stay open.
    const archSteps = low ? 12 : 18;
    const archPoint = (step, z) => {
      const angle = (Math.PI * step) / archSteps;
      return [Math.cos(angle) * 14.5, 4.4 + Math.sin(angle) * 8.7, z];
    };
    for (const z of [-26, -19, -12, -5]) {
      for (let step = 0; step < archSteps; step++) {
        // One missing section reveals the damaged structure against the sky.
        if (z === -5 && step === Math.floor(archSteps * 0.64)) continue;
        beam(archPoint(step, z), archPoint(step + 1, z), 0.18, M.rust);
      }
    }
    for (let step = 1; step < archSteps; step += 2) {
      beam(archPoint(step, -26), archPoint(step, -5), 0.075, M.metal);
      if (step % 3 === 1) {
        beam(archPoint(step, -26), archPoint(step + 1, -19), 0.045, M.rust);
        beam(archPoint(step, -12), archPoint(step + 1, -5), 0.045, M.rust);
      }
    }
    // Surviving dark roof plates are confined to the edges of the structure.
    for (const side of [-1, 1]) {
      box(M.roof, side * 12.8, 8.3, -22.5, 3.2, 0.08, 7, 0, side * 0.8);
      box(M.roof, side * 13.6, 6.6, -8.8, 1.8, 0.08, 5.8, 0, side * 0.9);
    }

    // Rooftop ventilation, broken parapets and pipework add depth to the facades.
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const z = -29 + i * 14,
          x = side * (17.6 + (i % 2) * 1.3),
          h = 7 + ((i * 7) % 5) * 1.5;
        const front = x - side * 3.8;
        for (let j = 0; j < 7; j++) {
          if ((j + i) % 5 === 0) continue;
          box(M.stone, front, h + 0.55, z - 4.8 + j * 1.55, 0.48, 1.15, 1.25);
        }
        box(M.metal, x, h + 0.6, z - 1.3, 2.3, 1.2, 2.2);
        for (let j = 0; j < 5; j++)
          box(
            M.black,
            front - side * 0.03,
            h - 1.3,
            z - 2 + j * 0.2,
            0.025,
            0.7,
            0.095,
          );
        cyl(M.metal, x, h + 1.4, z - 1.3, 0.6, 0.6);
        cyl(M.black, x, h + 1.73, z - 1.3, 0.75, 0.09);
        beam(
          [front - side * 0.25, 3, z - 4.3],
          [front - side * 0.25, h - 1, z - 4.3],
          0.12,
          M.rust,
        );
        beam(
          [front - side * 0.25, h - 1, z - 4.3],
          [front - side * 0.25, h - 1, z + 1.3],
          0.12,
          M.rust,
        );
        for (let j = 0; j < 3; j++) {
          box(
            M.dark,
            front - side * 0.06,
            2.7 + j * 0.33,
            z + 2.4,
            0.03,
            0.11,
            2.1,
          );
          box(
            M.metal,
            front - side * 0.12,
            2.7 + j * 0.33,
            z + 3.1,
            0.25,
            0.035,
            0.2,
          );
        }
        // Thin roof fragments are visible without obstructing the combat lanes.
        for (let j = 0; j < 4; j++)
          box(
            M.brick,
            front + side * 0.3,
            h + 0.12,
            z - 3 + j * 1.7,
            0.6,
            0.25,
            0.7,
            j * 0.6,
            0.2,
          );
      }

    // Raised outer decks remain beyond the enlarged boundary, leaving side lanes open.
    for (const side of [-1, 1]) {
      box(M.dark, side * 43, 3.8, 4, 15, 7.6, 75);
      box(M.stone, side * 43, 7.8, 4, 16, 0.35, 76);
      for (let z = -31; z < 40; z += 3) {
        box(M.stone, side * 35.4, 8.5, z, 0.55, 1.25, 0.45);
        box(M.dark, side * 35.4, 8.98, z + 1.25, 0.25, 0.2, 2.8);
      }
      for (let i = 0; i < 4; i++) {
        const x = side * (47 + (i % 2) * 9),
          z = -40 + i * 23,
          h = 16 + ((i * 7) % 4) * 5;
        box(M.dark, x, h / 2, z, 9, h, 12);
        box(M.stone, x, h - 1.2, z, 9.7, 0.8, 12.7);
        for (let y = 5; y < h - 2; y += 4)
          box(M.black, x - side * 4.53, y, z, 0.025, 1.7, 10.5);
        beam([x, h, z], [x, h + 5.5, z], 0.07, M.metal);
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = -32 + i * 13,
        h = 19 + ((i * 11) % 5) * 4,
        z = -67 - (i % 2) * 7;
      box(M.dark, x, h / 2, z, 7 + (i % 3) * 2, h, 9);
      box(M.roof, x, h + 0.65, z, 8, 1.3, 10);
      for (let floor = 6; floor < h - 2; floor += 4)
        box(M.black, x, floor, z + 4.52, 5.6, 0.7, 0.025);
    }
    // A crane and elevated reservoir break up the horizontal skyline.
    const craneX = 29,
      craneZ = -43;
    for (const x of [craneX - 1, craneX + 1])
      beam([x, 8, craneZ], [x, 29, craneZ], 0.17, M.rust);
    for (let y = 8; y < 29; y += 3.5) {
      beam(
        [craneX - 1, y, craneZ],
        [craneX + 1, y + 3.5, craneZ],
        0.085,
        M.rust,
      );
      beam(
        [craneX + 1, y, craneZ],
        [craneX - 1, y + 3.5, craneZ],
        0.085,
        M.rust,
      );
    }
    beam([craneX - 18, 29, craneZ], [craneX + 7, 29, craneZ], 0.3, M.rust);
    beam([craneX - 18, 30.2, craneZ], [craneX + 7, 30.2, craneZ], 0.12, M.rust);
    for (let x = craneX - 18; x < craneX + 7; x += 2.5)
      beam([x, 29, craneZ], [x + 2.5, 30.2, craneZ], 0.07, M.rust);
    beam([craneX - 13, 29, craneZ], [craneX - 13, 18, craneZ], 0.025, M.black);
    cyl(M.metal, -39, 19, -24, 2.7, 4.8);
    cyl(M.roof, -39, 21.55, -24, 2.9, 0.3);
    for (const x of [-41, -37])
      for (const z of [-26, -22]) beam([x, 8, z], [x, 16.6, z], 0.18, M.rust);

    // Service hatches and slab seams replace the visual rhythm of a pristine road.
    for (let z = -34; z < 36; z += 4) {
      box(M.dark, 0, 0.005, z, 26, 0.008, 0.035);
      for (const x of [-8, -3, 3, 8])
        box(M.dark, x, 0.006, z + 2, 0.025, 0.008, 3.95);
    }
    for (const [x, z] of [
      [-1, 21],
      [10, 6],
      [-10, -17],
    ]) {
      box(M.metal, x, 0.007, z, 1.5, 0.018, 1.15);
      for (let slot = -0.5; slot <= 0.5; slot += 0.2)
        box(M.black, x + slot, 0.019, z, 0.055, 0.006, 0.9);
    }
    sign("KEEP CLEAR", 6, 2.1, -5.47, 2.5);
    sign("EVACUATION →", -13.76, 3.4, -13, 3.8, Math.PI / 2);
  } else if (kind === "harbor") {
    // Stacked containers take the place of street facades: the same lane
    // discipline as the foundry, but cover is colour-coded, staggered in height
    // and split by loading gaps that open cross-lane sightlines.
    const stackColors = [M.crate, M.crateWarm, M.rust, M.metal, M.dark];
    function container(x, y, z, m, length = 11.2, width = 5.8, height = 2.75) {
      box(m, x, y + height / 2, z, width, height, length);
      for (let i = -length / 2 + 0.7; i < length / 2 - 0.4; i += 0.86)
        for (const s of [-1, 1])
          box(
            M.dark,
            x + s * (width / 2 + 0.014),
            y + height / 2,
            z + i,
            0.028,
            height - 0.4,
            0.17,
          );
      for (const s of [-1, 1]) {
        box(
          M.dark,
          x,
          y + 0.13,
          z + s * (length / 2 - 0.07),
          width + 0.07,
          0.26,
          0.2,
        );
        box(
          M.dark,
          x,
          y + height - 0.13,
          z + s * (length / 2 - 0.07),
          width + 0.07,
          0.26,
          0.2,
        );
      }
      // Door end: two leaves with locking rods, so a stack has a readable front.
      for (const s of [-1, 1])
        box(
          M.metal,
          x + s * 1.35,
          y + height / 2,
          z + length / 2 + 0.03,
          0.07,
          height - 0.55,
          0.05,
        );
      box(M.dark, x, y + height + 0.04, z, width + 0.06, 0.08, length + 0.06);
    }
    for (const side of [-1, 1])
      for (let i = 0; i < 6; i++) {
        const z = -31 + i * 12.6,
          x = side * (17.4 + (i % 2) * 1.1);
        // The shed occupies one slot per side; everything else stacks.
        if (i === 3) continue;
        const tiers = 1 + ((i + (side < 0 ? 2 : 0)) % 3);
        for (let tier = 0; tier < tiers; tier++)
          container(
            x + (tier % 2 ? 0.55 : -0.4),
            tier * 2.82,
            z + (tier % 2 ? 1.4 : -1.1) * (tier ? 1 : 0),
            stackColors[(i + tier * 2) % stackColors.length],
            tier ? 8.6 : 11.2,
          );
        boxes.push({ x, z, w: 3.35, d: 5.9, h: tiers * 2.82 });
      }
    // Corrugated transit shed with an arched truss roof over the quay: the long
    // covered sightline that gives the map its silhouette.
    for (const side of [-1, 1]) {
      const x = side * 19.5,
        z = 6.8;
      block(x, z, 9.5, 15.5, 5.6, M.metal);
      for (let i = -7; i < 7.5; i += 0.7)
        box(M.dark, x - side * 4.78, 2.9, z + i, 0.035, 5.2, 0.22);
      box(M.roof, x, 5.85, z, 10.8, 0.4, 16.6);
      for (let i = 0; i <= 9; i++) {
        const a = (i / 9) * Math.PI;
        const rx = x - side * (Math.cos(a) * 5.3),
          ry = 6.05 + Math.sin(a) * 3.1;
        if (i < 9) {
          const b = ((i + 1) / 9) * Math.PI;
          for (const zz of [z - 7.6, z, z + 7.6])
            beam(
              [rx, ry, zz],
              [x - side * (Math.cos(b) * 5.3), 6.05 + Math.sin(b) * 3.1, zz],
              0.13,
              M.rust,
            );
        }
        beam([rx, ry, z - 7.6], [rx, ry, z + 7.6], 0.07, M.rust);
      }
      // Loading bay: shutter, dock light and a lit interior slot.
      box(M.black, x - side * 4.85, 1.85, z, 0.06, 3.7, 5.4);
      box(M.metal, x - side * 4.9, 3.75, z, 0.12, 0.35, 5.8);
      box(neonMaterial, x - side * 4.92, 4.35, z, 0.06, 0.16, 4.6);
      lampPositions.push(x - side * 5.1, 4.3, z);
    }
    sign("BERTH 07 / 貨櫃調度", -14.2, 4.6, 6.8, 6, Math.PI / 2);
    sign("HARBOUR CONTROL / 港務管制", 14.2, 4.6, 6.8, 6, -Math.PI / 2);
    // Conveyor bridge crossing the quay, the harbour answer to the foundry gantry.
    for (const x of [-12.4, 12.4]) {
      cyl(M.rust, x, 4.6, -20, 0.24, 9.2);
      cyl(M.rust, x, 4.6, -16.4, 0.16, 9.2);
      beam([x, 9.2, -20], [x, 5.4, -16.4], 0.1, M.rust);
    }
    beam([-12.4, 9.2, -20], [12.4, 9.2, -20], 0.4, M.rust);
    beam([-12.4, 9.2, -16.6], [12.4, 9.2, -16.6], 0.4, M.rust);
    beam([-12.4, 10.4, -18.3], [12.4, 10.4, -18.3], 0.24, M.rust);
    for (let x = -12; x < 12; x += 2.4) {
      beam([x, 9.2, -20], [x + 2.4, 10.4, -18.3], 0.075, M.rust);
      beam([x + 2.4, 9.2, -16.6], [x, 10.4, -18.3], 0.075, M.rust);
      box(M.metal, x + 1.2, 9.35, -18.3, 2.2, 0.1, 3.1);
    }
    // Rail-mounted crane track and quayside bollards with slack mooring lines.
    for (const s of [-1, 1]) {
      box(M.metal, s * 12.55, 0.055, 0, 0.34, 0.11, 70);
      box(M.rust, s * 12.55, 0.02, 0, 0.62, 0.04, 70);
      for (let z = -30; z <= 30; z += 10) {
        cyl(M.black, s * 13.55, 0.36, z, 0.29, 0.72);
        cyl(M.black, s * 13.55, 0.78, z, 0.36, 0.16);
        boxes.push({ x: s * 13.55, z, w: 0.32, d: 0.32, h: 0.9 });
        if (z < 30) {
          const rope = [];
          for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            rope.push([
              s * 13.55,
              0.78 - Math.sin(t * Math.PI) * 0.42,
              z + t * 10,
            ]);
          }
          for (let i = 0; i < 6; i++) beam(rope[i], rope[i + 1], 0.035, M.sand);
        }
      }
    }
    // Neon-lit dock offices at the ends of the avenue keep the axis readable.
    for (const [x, z, ry] of [
      [-8.5, -33.5, 0],
      [8.5, 33.5, Math.PI],
    ]) {
      block(x, z, 7, 6, 4.2, M.dark);
      box(M.roof, x, 4.4, z, 7.6, 0.3, 6.6);
      for (const xx of [-2, 0, 2])
        box(M.glass, x + xx, 2.5, z - Math.sign(z || 1) * 3.05, 1.5, 1.7, 0.06);
      box(neonMaterial, x, 4.9, z, 5.4, 0.5, 0.16, ry);
      lampPositions.push(x, 4.9, z);
      // Phones already carry the two street lamps; extra point lights are desktop only.
      if (!low) {
        const light = new THREE.PointLight(0x74d8ff, 8, 12, 2);
        light.position.set(x, 4.2, z);
        root.add(light);
        lights.push(light);
      }
    }
    // Distant harbour skyline: ship-to-shore cranes and a container terminal.
    for (let i = 0; i < 4; i++) {
      const x = -30 + i * 20,
        h = 26 + (i % 3) * 5;
      for (const dz of [-4, 4]) {
        cyl(M.rust, x - 5, h / 2, -84 + dz, 0.75, h);
        cyl(M.rust, x + 5, h / 2, -84 + dz, 0.75, h);
      }
      beam([x - 5, h, -88], [x + 5, h, -88], 1.5, M.rust);
      beam([x - 5, h, -80], [x + 5, h, -80], 1.5, M.rust);
      beam([x - 20, h - 3, -84], [x + 16, h + 2, -84], 1.2, M.rust);
      box(M.metal, x, h + 3.4, -84, 5, 5, 9);
    }
    for (let i = 0; i < 16; i++)
      box(
        i % 2 ? M.crate : M.crateWarm,
        -46 + i * 6,
        2 + (i % 3) * 2.6,
        -72,
        5.4,
        (1 + (i % 3)) * 2.6,
        11,
      );
  } else {
    // Stone perimeter houses and a long vermilion shrine approach.
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const x = side * 17.5,
          z = -27 + i * 18;
        block(x, z, 7, 13, 3.7, M.dark);
        for (const xx of [-2.6, 0, 2.6])
          box(M.wood, x + xx, 1.8, z + 6.54, 0.17, 3.6, 0.12);
        box(M.roof, x, 4.0, z, 9, 0.35, 15);
        for (const s of [-1, 1]) {
          box(M.roof, x + s * 2.1, 4.9, z, 5, 0.18, 15, 0, s * 0.36);
        }
        for (let zz = z - 7; zz < z + 7; zz += 0.24)
          box(M.metal, x, 4.08, zz, 8.8, 0.045, 0.035);
      }
    for (const z of [-18, 8]) {
      for (const s of [-1, 1]) {
        cyl(M.red, s * 5, 3, z, 0.22, 6);
        box(M.dark, s * 5, 0.3, z, 0.75, 0.6, 0.75);
      }
      box(M.red, 0, 5.2, z, 11.8, 0.35, 0.4);
      box(M.red, 0, 6, z, 13, 0.43, 0.7);
      box(M.black, 0, 6.3, z, 14, 0.17, 0.85);
      for (const s of [-1, 1])
        box(M.black, s * 6.7, 6.39, z, 1.6, 0.16, 0.85, 0, s * 0.13);
    }
    for (let z = -30; z < 33; z += 3)
      for (let x = -2; x <= 2; x++)
        box(M.stone, x * 1.05, 0.005, z, 0.99, 0.03, 2.9);
    for (const side of [-1, 1])
      for (const z of [-27, -3, 22]) {
        const x = side * 10.5;
        block(x, z, 1, 1, 1.25, M.stone);
        box(M.stone, x, 1.7, z, 0.7, 0.13, 0.7);
        box(M.stone, x, 2.35, z, 1.2, 0.18, 1.2);
        for (const s of [-1, 1])
          box(M.stone, x + s * 0.27, 2.0, z, 0.1, 0.65, 0.65);
        box(lampMaterial, x, 2, z, 0.38, 0.48, 0.38);
        lampPositions.push(x, 2, z);
        if (!low || z === -3) {
          const light = new THREE.PointLight(0xf9bc79, 6, 7, 2);
          light.position.set(x, 2.2, z);
          root.add(light);
          lights.push(light);
        }
      }
    // Shrine front closes the far axis while side routes remain open.
    block(0, -31, 9, 5, 4, M.wood);
    for (const x of [-3.7, -1.2, 1.2, 3.7])
      box(M.red, x, 2.0, -28.4, 0.22, 4, 0.3);
    box(M.black, 0, 1.7, -28.45, 2.0, 3.2, 0.05);
    box(M.roof, 0, 4.3, -31, 12, 0.35, 8);
    for (const s of [-1, 1])
      box(M.roof, s * 2.7, 5.3, -31, 6, 0.2, 8, 0, s * 0.33);
    sign("影 / SHADOW", 0, 3.45, -28.36, 2);
    for (const [x, z, w, d] of [
      [-5, -9, 2.6, 2.2],
      [5, 20, 3, 2.4],
      [6, -21, 2.5, 3],
      [-6, 25, 3, 2],
    ])
      block(x, z, w, d, 1.35, M.stone);
    // Bare trunks and fine branches frame the courtyard.
    for (const s of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const x = s * (12.5 + (i % 2)),
          z = -28 + i * 14;
        cyl(M.wood, x, 2.6, z, 0.17, 5.2);
        for (let j = 0; j < 4; j++) {
          const a = j * 1.7 + i;
          beam(
            [x, 2.5 + j * 0.6, z],
            [x + Math.sin(a) * 2, 5 + j * 0.25, z + Math.cos(a) * 2],
            0.055,
            M.wood,
          );
          beam(
            [x + Math.sin(a) * 1.6, 4.5 + j * 0.25, z + Math.cos(a) * 1.6],
            [
              x + Math.sin(a + 0.4) * 3,
              5.5 + j * 0.25,
              z + Math.cos(a + 0.4) * 3,
            ],
            0.025,
            M.wood,
          );
        }
      }
  }
  // Connected outer lanes and two substantial courtyards extend the playable map.
  // Existing facades now separate the main avenue from walkable service alleys;
  // their gaps, plus the open north/south ends, provide several return routes.
  for (const side of [-1, 1]) {
    box(M.road, side * 27, -0.018, 0, 8, 0.035, 118);
    for (let z = -55; z <= 55; z += 6)
      box(M.stripe, side * 27, 0.004, z, 0.085, 0.012, 1.8);
    for (const z of theme.crossings) {
      box(M.dark, side * 21, 0.008, z, 11, 0.032, 1.65);
      for (let x = 15; x < 29; x += 1.3)
        box(M.stripe, side * x, 0.028, z, 0.55, 0.008, 1.1);
    }
    // Recessed service cabinets and low offset cover leave the alley continuous.
    for (const z of [-23, 7, 27]) {
      block(side * 30.4, z, 1.6, 3.2, 1.45, theme.cabinet);
      box(M.metal, side * 30.4, 1.52, z, 1.75, 0.12, 3.4);
      for (let i = 0; i < 4; i++)
        box(M.black, side * 29.585, 0.94, z - 1.1 + i * 0.65, 0.025, 0.4, 0.35);
    }
    for (const z of [-42, 42]) {
      cyl(M.metal, side * 25.5, 3.4, z, 0.075, 6.8);
      beam([side * 25.5, 6.8, z], [side * 23.9, 6.8, z], 0.07);
      box(M.black, side * 23.9, 6.76, z, 0.65, 0.15, 0.32);
      box(lampMaterial, side * 23.9, 6.66, z, 0.56, 0.025, 0.25);
      lampPositions.push(side * 23.9, 6.6, z);
    }
  }
  // Continue the center pavement into the courtyards instead of stretching scenery.
  for (const z of [-49, 49]) {
    box(M.dark, 0, -0.012, z, 47, 0.03, 22);
    for (let lane = -18; lane <= 18; lane += 6) {
      box(M.stripe, lane, 0.012, z, 2.2, 0.01, 0.08);
      box(M.stripe, lane - 1.1, 0.012, z - 2.4, 0.08, 0.01, 4.8);
    }
  }
  if (kind === "foundry") {
    // Northern cargo yard: long central sightline, staggered containers and a crane.
    for (const side of [-1, 1]) {
      const x = side * 15,
        z = side < 0 ? -46 : -51;
      block(x, z, 6, 10, 2.8, M.rust);
      box(M.metal, x, 2.88, z, 6.15, 0.13, 10.15);
      for (let i = 0; i < 11; i++)
        for (const edge of [-1, 1])
          box(
            M.metal,
            x + edge * 3.04,
            1.4,
            z - 4.6 + i * 0.92,
            0.07,
            2.7,
            0.06,
          );
      // Warehouse backs, with roof plant silhouetted beyond the alley intersections.
      block(side * 30, -49, 4, 18, 6.8, M.brick);
      box(M.roof, side * 30, 6.95, -49, 4.4, 0.2, 18.4);
      box(M.dark, side * 30, 7.9, -49, 2.2, 1.8, 3.4);
      cyl(M.rust, side * 30, 9.6, -54, 0.35, 4.5);
      block(side * 10, -56, 0.55, 0.55, 7.5, M.rust);
    }
    beam([-10, 7.5, -56], [10, 7.5, -56], 0.4, M.rust);
    beam([-10, 6.75, -56], [10, 6.75, -56], 0.13, M.rust);
    for (let x = -10; x < 10; x += 2)
      beam([x, 6.75, -56], [x + 2, 7.5, -56], 0.1, M.rust);
    beam([3, 7.4, -56], [3, 4.3, -56], 0.035, M.black);
    box(M.metal, 3, 4.1, -56, 0.5, 0.35, 0.5);
    block(4, -45, 2.1, 3.2, 1.15, M.dark);
    for (const x of [3.3, 4.7])
      beam([x, 0.12, -47], [x, 0.12, -49], 0.11, M.metal);
    // Southern extraction apron and two ruined checkpoint offices.
    for (const side of [-1, 1]) {
      block(side * 19, 50, 7, 11, 3.5, M.dark);
      box(M.roof, side * 19, 3.64, 50, 7.5, 0.24, 11.5);
      box(M.glass, side * 19, 2.15, 44.46, 4.8, 0.95, 0.035);
      for (const x of [-2, 0, 2])
        box(M.metal, side * 19 + x, 2.12, 44.41, 0.055, 1.1, 0.055);
      block(side * 6, 43, 3.4, 0.75, 1.02, M.stone);
      for (let i = 0; i < 5; i++)
        box(
          i % 2 ? M.black : M.stripe,
          side * 6 - 1.3 + i * 0.62,
          0.74,
          43.386,
          0.42,
          0.29,
          0.025,
          0,
          0.28,
        );
    }
    // Grounded painted extraction target; it does not obstruct movement or shots.
    const landingRing = new THREE.RingGeometry(4.65, 4.77, 32);
    add(landingRing, M.stripe, 0, 0.018, 53, 1, 1, 1, -Math.PI / 2);
    landingRing.dispose();
    for (const x of [-1.2, 1.2]) box(M.stripe, x, 0.022, 53, 0.16, 0.014, 3.0);
    box(M.stripe, 0, 0.022, 53, 2.5, 0.014, 0.16);
  } else if (kind === "harbor") {
    // North apron: two rail portal cranes straddle the road, so the long axis
    // stays open while their legs and container blocks break up the approach.
    for (const z of [-44, -54]) {
      for (const side of [-1, 1])
        for (const dz of [-1.5, 1.5]) {
          cyl(M.rust, side * 13.6, 5.6, z + dz, 0.34, 11.2);
          cyl(M.rust, side * 21.5, 5.6, z + dz, 0.34, 11.2);
          beam(
            [side * 13.6, 11, z + dz],
            [side * 21.5, 11, z + dz],
            0.24,
            M.rust,
          );
          beam([side * 13.6, 3, z + dz], [side * 21.5, 8, z + dz], 0.1, M.rust);
          boxes.push({ x: side * 13.6, z: z + dz, w: 0.5, d: 0.5, h: 11.2 });
          boxes.push({ x: side * 21.5, z: z + dz, w: 0.5, d: 0.5, h: 11.2 });
        }
      beam([-21.5, 11.4, z], [21.5, 11.4, z], 0.42, M.rust);
      beam([-21.5, 12.6, z], [21.5, 12.6, z], 0.2, M.rust);
      for (let x = -21; x < 21; x += 3) {
        beam([x, 11.4, z], [x + 3, 12.6, z], 0.08, M.rust);
        beam([x + 3, 11.4, z], [x, 12.6, z], 0.08, M.rust);
      }
      // Trolley and a suspended spreader hang over the lane without blocking it.
      const trolley = z === -44 ? -6 : 7;
      box(M.metal, trolley, 11.9, z, 4.2, 1.5, 3.4);
      for (const s of [-1, 1])
        beam(
          [trolley + s * 1.6, 11.2, z],
          [trolley + s * 1.6, 7.4, z],
          0.05,
          M.metal,
        );
      box(M.crateWarm, trolley, 6.8, z, 5.6, 1.2, 10.4);
      box(M.metal, 0, 0.05, z, 44, 0.1, 0.4);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++)
        box(
          i % 2 ? M.crate : M.crateWarm,
          side * (17 + (i % 2)),
          1.4 + i * 2.82,
          -49 + (i % 2) * 2,
          5.8,
          2.75,
          i ? 8.6 : 11.2,
        );
      boxes.push({ x: side * 17.5, z: -49, w: 3.3, d: 5.8, h: 8.5 });
      block(side * 27.5, -56, 5, 7, 3.4, M.metal);
    }
    // South berth: a moored hull closes the far edge behind a lit gangway.
    box(M.roof, 20.5, 3, 56.5, 20, 6.4, 5);
    boxes.push({ x: 20.5, z: 56.5, w: 10, d: 2.5, h: 6.4 });
    for (let i = 0; i < 9; i++)
      box(M.dark, 11.5 + i * 2.2, 4.6, 53.95, 1.5, 1.1, 0.12);
    for (let i = 0; i < 5; i++)
      box(M.rust, 11 + i * 4.8, 0.35, 53.9, 0.5, 0.7, 0.5);
    box(M.metal, 12.5, 6.5, 56.5, 5, 1.6, 4.4);
    box(M.glass, 12.5, 6.9, 54.28, 4, 0.8, 0.1);
    cyl(M.rust, 24.5, 8.4, 56.5, 0.6, 4.5);
    box(neonMaterial, 20.5, 5.5, 53.92, 7, 0.4, 0.1);
    lampPositions.push(20.5, 5.4, 53.9);
    for (let i = 0; i < 7; i++)
      box(
        M.metal,
        10.2 - i * 0.55,
        2.4 + i * 0.62,
        51 - i * 0.4,
        2.6,
        0.12,
        1.3,
        0,
        -0.85,
      );
    for (const s of [-1, 1]) {
      box(M.metal, 9.3, 3.6, 51.4 + s * 0.62, 0.07, 1.5, 5.4, 0, -0.85);
      box(M.rust, s * 8, 0.05, 47, 0.34, 0.11, 18);
    }
    // Stacked crates and a reefer row give the extraction pad usable cover.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++)
        block(
          side * (16 + i * 6.6),
          44 + i * 5,
          5.6,
          9.4,
          2.75,
          i % 2 ? M.crate : M.crateWarm,
        );
      block(side * 13.6, 52, 2.2, 2.2, 1.5, M.rust);
      for (let i = 0; i < 4; i++)
        box(M.metal, side * 13.6, 1.6, 51 + i * 0.62, 2.3, 0.09, 0.3);
    }
    const landingRing = new THREE.RingGeometry(4.65, 4.77, 32);
    add(landingRing, M.stripe, 0, 0.018, 51, 1, 1, 1, -Math.PI / 2);
    landingRing.dispose();
    for (const x of [-1.2, 1.2]) box(M.stripe, x, 0.022, 51, 0.16, 0.014, 3.0);
    box(M.stripe, 0, 0.022, 51, 2.5, 0.014, 0.16);
  } else {
    // Northern temple service court: subdued stone beds, bare trees and old stores.
    // Beds and buildings have physical collision; their central axis stays open.
    for (const side of [-1, 1]) {
      block(side * 12, -49, 5.5, 12, 0.68, M.dark);
      box(M.stone, side * 12, 0.72, -49, 5.8, 0.12, 12.3);
      for (const z of [-53, -48, -44]) {
        cyl(M.wood, side * 12, 2.8, z, 0.15, 4.9);
        beam(
          [side * 12, 3.2, z],
          [side * 12 + 1.7, 5.6, z + 0.8],
          0.065,
          M.wood,
        );
        beam(
          [side * 12, 3.7, z],
          [side * 12 - 1.3, 5.3, z - 1.0],
          0.055,
          M.wood,
        );
      }
      block(side * 27, -50, 7, 15, 3.6, M.wood);
      box(M.roof, side * 27, 3.85, -50, 7.8, 0.3, 15.8);
      for (const slope of [-1, 1])
        box(
          M.roof,
          side * 27 + slope * 1.8,
          4.55,
          -50,
          4.4,
          0.13,
          15.8,
          0,
          slope * 0.34,
        );
      // South service houses and broken low walls frame a broad stone court.
      block(side * 24, 50, 8, 14, 3.3, M.dark);
      box(M.roof, side * 24, 3.53, 50, 8.8, 0.25, 14.8);
      for (const x of [-2.5, 0, 2.5])
        box(M.wood, side * 24 + x, 1.85, 42.95, 0.15, 3.2, 0.15);
      block(side * 12, 49, 4.5, 8, 0.62, M.stone);
      block(side * 6, 41, 3.5, 0.65, 1.12, M.dark);
    }
    // Empty stone fountain/altar preserves an open perimeter and offset sightlines.
    block(0, 54, 4.2, 4.2, 0.75, M.stone);
    box(M.dark, 0, 0.8, 54, 3.45, 0.12, 3.45);
    cyl(M.stone, 0, 1.2, 54, 0.42, 0.8);
    box(M.stone, 0, 1.67, 54, 1.6, 0.14, 1.6);
    for (let z = -57; z <= 57; z += 3)
      if (Math.abs(z) > 36)
        for (let x = -2; x <= 2; x++)
          box(M.stone, x * 1.1, 0.022, z, 1.03, 0.04, 2.86);
  }
  // Four readable signs identify the new destinations without adding billboard walls.
  const zoneSigns = {
    foundry: ["NORTH / CARGO YARD", "SOUTH / EXTRACTION"],
    temple: ["NORTH / SERVICE COURT", "SOUTH / STONE COURT"],
    harbor: ["NORTH / CRANE APRON", "SOUTH / BERTH 07"],
  }[kind] ?? ["NORTH", "SOUTH"];
  sign(zoneSigns[0], 0, 4.8, -60.43, 8);
  sign(zoneSigns[1], 0, 4.8, 60.43, 8, Math.PI);
  sign("WEST / SERVICE LANE", -32.44, 2.0, 0, 4, Math.PI / 2);
  sign("EAST / SERVICE LANE", 32.44, 2.0, 0, 4, -Math.PI / 2);
  for (const z of [-60.25, 60.25])
    for (const x of [-4.25, 4.25]) cyl(M.metal, x, 2.65, z, 0.055, 5.3);

  // Low sandbags are traversable visually but block movement. Crouching hides behind them.
  for (const [x, z] of [
    [-4, -3],
    [5, 5],
    [-5, 29],
    [4, -27],
  ]) {
    boxes.push({ x, z, w: 1.8, d: 0.6, h: 1.12 });
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 4; i++) {
        const xx = x - 1.3 + i * 0.85 + (row % 2) * 0.12;
        add(
          sphereGeo,
          M.sand,
          xx,
          0.19 + row * 0.31,
          z,
          0.47,
          0.2,
          0.47,
          0,
          0.1 * i,
          0,
        );
      }
  }
  // Worn road barriers, barrels and concrete fragments; decorative debris has no invisible colliders.
  for (const [x, z] of [
    [8, 13],
    [-9, -13],
    [9, -31],
  ]) {
    block(x, z, 2.7, 0.7, 0.95, M.stone);
    for (let i = 0; i < 5; i++)
      box(
        i % 2 ? M.black : M.stripe,
        x - 1 + i * 0.5,
        0.72,
        z + 0.356,
        0.4,
        0.22,
        0.018,
        0,
        0.3,
      );
  }
  for (const [x, z] of [
    [-11, 17],
    [11, -3],
    [-10, -30],
  ]) {
    cyl(M.rust, x, 0.58, z, 0.4, 1.15);
    for (const y of [0.15, 0.9]) cyl(M.metal, x, y, z, 0.415, 0.045);
    boxes.push({ x, z, w: 0.42, d: 0.42, h: 1.15 });
  }
  let seed = 714;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < (low ? 70 : 150); i++) {
    const s = i % 2 ? 1 : -1,
      x = s * (10 + rand() * 3.5),
      z = -34 + rand() * 68;
    box(
      i % 3 ? M.stone : M.brick,
      x,
      0.07,
      z,
      0.1 + rand() * 0.4,
      0.07 + rand() * 0.14,
      0.13 + rand() * 0.4,
      rand() * 3,
      rand() * 0.3,
    );
  }
  for (const s of [-1, 1])
    for (let z = -30; z < 35; z += 17) {
      cyl(M.metal, s * 12.9, 3.3, z, 0.065, 6.6);
      beam([s * 12.9, 6.6, z], [s * 11.3, 6.6, z], 0.055);
      box(M.black, s * 11.3, 6.58, z, 0.65, 0.15, 0.3);
      box(lampMaterial, s * 11.3, 6.49, z, 0.55, 0.02, 0.25);
      lampPositions.push(s * 11.3, 6.43, z);
      if ((kind === "foundry" || theme.streetLights) && z === 4) {
        const light = new THREE.PointLight(0xffdba2, low ? 5 : 10, 11, 2);
        light.position.set(s * 11.3, 6.15, z);
        root.add(light);
        lights.push(light);
      }
    }
  // Overhead cables, physical geometry rather than flat background art.
  for (const s of [-1, 1])
    for (let z = -30; z < 22; z += 17) {
      const points = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        points.push(
          new THREE.Vector3(
            s * 12.9,
            6.6 - Math.sin(t * Math.PI) * 0.6,
            z + t * 17,
          ),
        );
      }
      const geo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        20,
        0.016,
        4,
        false,
      );
      add(geo, M.black, 0, 0, 0);
      geo.dispose();
    }
  // Merge static surfaces by material to keep mobile draw calls low.
  for (const [m, geos] of batches) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    rayTargets.push(mesh);
  }
  // Puddles share one draw call and stay out of the bullet/collision meshes.
  const wet = own(
    new THREE.MeshStandardMaterial({
      color: 0x82969c,
      transparent: true,
      opacity: 0.31,
      roughness: 0.09,
      metalness: 0.86,
      depthWrite: false,
    }),
  );
  const puddleGeometries = [];
  for (let i = 0; i < (low ? 18 : 28); i++) {
    const geometry = new THREE.CircleGeometry(1, low ? 12 : 20);
    const transform = new THREE.Object3D();
    transform.rotation.x = -Math.PI / 2;
    transform.position.set((rand() - 0.5) * 54, 0.025, -56 + rand() * 112);
    transform.scale.set(0.5 + rand() * 1.7, 0.8 + rand() * 2.9, 1);
    transform.updateMatrix();
    geometry.applyMatrix4(transform.matrix);
    puddleGeometries.push(geometry);
  }
  const puddleMesh = new THREE.Mesh(
    mergeGeometries(puddleGeometries, false),
    wet,
  );
  puddleGeometries.forEach((geometry) => geometry.dispose());
  puddleMesh.receiveShadow = true;
  root.add(puddleMesh);

  // Cheap pools of warm light reinforce the wet ground below the street lamps.
  const reflectionGeometries = [];
  for (let i = 0; i < lampPositions.length; i += 3) {
    const geometry = new THREE.CircleGeometry(1, 16);
    const transform = new THREE.Object3D();
    transform.rotation.x = -Math.PI / 2;
    transform.position.set(lampPositions[i], 0.031, lampPositions[i + 2]);
    transform.scale.set(0.38, 1.8, 1);
    transform.updateMatrix();
    geometry.applyMatrix4(transform.matrix);
    reflectionGeometries.push(geometry);
  }
  const reflectionMaterial = own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: `
   varying vec2 vUv;
   void main(){
    vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
   }`,
      fragmentShader: `
   varying vec2 vUv;
   uniform float time;
   void main(){
    float falloff=pow(max(0.,1.-length(vUv-.5)*2.),2.);
    float ripple=.6+.4*sin(vUv.y*86.+sin(vUv.x*27.)+time*1.8);
    gl_FragColor=vec4(.88,.68,.37,falloff*ripple*.16);
   }`,
    }),
  );
  const reflections = new THREE.Mesh(
    mergeGeometries(reflectionGeometries, false),
    reflectionMaterial,
  );
  reflectionGeometries.forEach((geometry) => geometry.dispose());
  root.add(reflections);

  // Lamp halos use one depth-tested point field; walls still occlude their glow.
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(lampPositions, 3),
  );
  const haloMaterial = own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        color: {
          value: new THREE.Color(theme.halo),
        },
      },
      vertexShader: `
   void main(){
    vec4 mv=modelViewMatrix*vec4(position,1.);
    gl_PointSize=min(100.,1500./max(4.,-mv.z));
    gl_Position=projectionMatrix*mv;
   }`,
      fragmentShader: `
   uniform vec3 color;
   void main(){
    float radius=length(gl_PointCoord-.5)*2.;
    float halo=exp(-radius*radius*8.)*.3;
    gl_FragColor=vec4(color,halo);
   }`,
    }),
  );
  const halos = new THREE.Points(haloGeometry, haloMaterial);
  root.add(halos);

  // Low drifting mist and six anchored steam plumes use a single particle draw.
  const ambientCount = low ? 22 : 40,
    plumeCount = low ? 4 : 7;
  const emitters =
    {
      foundry: [
        [-27, 24, -85],
        [-10, 26, -85],
        [7, 28, -85],
        [24, 30, -85],
        [-12.8, 0.6, -17],
        [12.8, 0.6, 14],
      ],
      temple: [
        [-12, 0.4, -20],
        [12, 0.4, 17],
      ],
      harbor: [
        [22, 9, -78],
        [-24, 8, -78],
        [-13.4, 0.5, -6],
        [13.4, 0.5, 22],
        [8.5, 3.2, 47],
      ],
    }[kind] ?? [];
  const count = ambientCount + emitters.length * plumeCount;
  const positions = new Float32Array(count * 3),
    sizes = new Float32Array(count);
  const strengths = new Float32Array(count),
    ages = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    ages[i] = rand();
    if (i < ambientCount) {
      positions[i * 3] = (rand() - 0.5) * 60;
      positions[i * 3 + 1] = 0.8 + rand() * 5;
      positions[i * 3 + 2] = -58 + rand() * 116;
      sizes[i] = 5 + rand() * 6;
      strengths[i] = 0.065;
    } else {
      const emitter = emitters[Math.floor((i - ambientCount) / plumeCount)];
      const age = ages[i];
      positions[i * 3] = emitter[0] + age * 3;
      positions[i * 3 + 1] = emitter[1] + age * 8;
      positions[i * 3 + 2] = emitter[2] + Math.sin(age * 5) * 0.5;
      sizes[i] = 2 + age * 4;
      strengths[i] = Math.sin(age * Math.PI) * 0.32;
    }
  }
  const smokeGeometry = new THREE.BufferGeometry();
  smokeGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  smokeGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  smokeGeometry.setAttribute(
    "strength",
    new THREE.BufferAttribute(strengths, 1),
  );
  const smokeMaterial = own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        color: {
          value: new THREE.Color(theme.smoke),
        },
      },
      vertexShader: `
   attribute float size;
   attribute float strength;
   varying float vAlpha;
   void main(){
    vec4 mv=modelViewMatrix*vec4(position,1.);
    vAlpha=strength*clamp((-mv.z-1.)/7.,0.,1.);
    gl_PointSize=min(180.,size*420./max(1.,-mv.z));
    gl_Position=projectionMatrix*mv;
   }`,
      fragmentShader: `
   uniform vec3 color;
   varying float vAlpha;
   void main(){
    vec2 p=(gl_PointCoord-.5)*2.;
    float edge=pow(max(0.,1.-length(p)),2.);
    float wisps=.7+.3*sin(p.x*11.+sin(p.y*9.)*2.);
    gl_FragColor=vec4(color,edge*wisps*vAlpha);
   }`,
    }),
  );
  const smoke = new THREE.Points(smokeGeometry, smokeMaterial);
  // The moving field spans the arena and chimney tops throughout its lifecycle.
  smoke.frustumCulled = false;
  root.add(smoke);

  // Both locations have weather; the foundry uses a lighter industrial drizzle.
  const rainCount = low ? 110 : 280;
  const rainPositions = new Float32Array(rainCount * 6);
  for (let i = 0; i < rainPositions.length; i += 6) {
    rainPositions[i] = (rand() - 0.5) * 62;
    rainPositions[i + 1] = rand() * 18;
    rainPositions[i + 2] = (rand() - 0.5) * 118;
    rainPositions[i + 3] = rainPositions[i] - 0.055;
    rainPositions[i + 4] = rainPositions[i + 1] - 0.45;
    rainPositions[i + 5] = rainPositions[i + 2];
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(rainPositions, 3),
  );
  const rain = new THREE.LineSegments(
    rainGeometry,
    own(
      new THREE.LineBasicMaterial({
        color: 0x9cbbc5,
        transparent: true,
        opacity: theme.rain,
        depthWrite: false,
      }),
    ),
  );
  rain.frustumCulled = false;
  root.add(rain);

  const spawn = { x: 0, z: 28 };
  const spawnPoints = [
    { x: -8, z: -28 },
    { x: 8, z: -19 },
    { x: -9, z: 0 },
    { x: 10, z: 28 },
    { x: 3, z: -15 },
    { x: -9, z: 19 },
    { x: 2, z: 12 },
    { x: 9, z: -30 },
    { x: -7.5, z: -49.5 },
    { x: 7.5, z: -55.5 },
    { x: -7.5, z: 51 },
    { x: 7.5, z: 55.5 },
    { x: -27, z: -12 },
    { x: 27, z: 15 },
  ];
  const sectors =
    {
      foundry: [
        { name: "隔離主街", x: 0, z: 0 },
        { name: "北側貨運場", x: 0, z: -49 },
        { name: "南側撤離廣場", x: 0, z: 49 },
        { name: "西側維修巷", x: -27, z: 0 },
        { name: "東側巡邏巷", x: 27, z: 0 },
      ],
      temple: [
        { name: "神社參道", x: 0, z: 0 },
        { name: "北側勤務庭院", x: 0, z: -49 },
        { name: "南側石庭", x: 0, z: 49 },
        { name: "西側外廊", x: -27, z: 0 },
        { name: "東側外廊", x: 27, z: 0 },
      ],
      harbor: [
        { name: "碼頭主道", x: 0, z: 0 },
        { name: "北側吊掛區", x: 0, z: -49 },
        { name: "南側泊位", x: 0, z: 49 },
        { name: "西側倉儲巷", x: -27, z: 0 },
        { name: "東側裝卸巷", x: 27, z: 0 },
      ],
    }[kind] ?? [];
  return {
    root,
    boxes,
    rayTargets,
    spawn,
    spawnPoints,
    sectors,
    kind,
    lights,
    tick(dt, time) {
      reflectionMaterial.uniforms.time.value = time;
      for (let i = 0; i < count; i++) {
        if (i < ambientCount) {
          positions[i * 3] += 0.16 * dt;
          if (positions[i * 3] > 32) positions[i * 3] = -32;
        } else {
          const emitter = emitters[Math.floor((i - ambientCount) / plumeCount)];
          ages[i] = (ages[i] + dt * 0.065) % 1;
          const age = ages[i];
          positions[i * 3] = emitter[0] + age * 3;
          positions[i * 3 + 1] = emitter[1] + age * 8;
          positions[i * 3 + 2] =
            emitter[2] + Math.sin(age * 5 + time * 0.12) * 0.5;
          sizes[i] = 2 + age * 4;
          strengths[i] = Math.sin(age * Math.PI) * 0.32;
        }
      }
      smokeGeometry.attributes.position.needsUpdate = true;
      smokeGeometry.attributes.size.needsUpdate = true;
      smokeGeometry.attributes.strength.needsUpdate = true;
      for (let i = 0; i < rainPositions.length; i += 6) {
        rainPositions[i + 1] -= dt * 10;
        rainPositions[i + 4] -= dt * 10;
        if (rainPositions[i + 1] < 0) {
          rainPositions[i + 1] = 18;
          rainPositions[i + 4] = 17.55;
        }
      }
      rainGeometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      root.traverse((object) => object.geometry?.dispose());
      for (const m of ownedMaterials) {
        if (m.map && m.map !== concrete) m.map.dispose();
        m.dispose();
      }
      root.clear();
    },
  };
}
export function createSky(scene, kind) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(350, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        night: { value: kind === "foundry" ? 0 : 1 },
        harbor: { value: kind === "harbor" ? 1 : 0 },
      },
      vertexShader: `
    varying vec3 vPos;
    void main(){
     vPos=position;
     gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,
      fragmentShader: `
    varying vec3 vPos;
    uniform float night;
    uniform float harbor;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){
     vec2 i=floor(p),f=fract(p);
     f=f*f*(3.-2.*f);
     return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
      mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
    }
    float cloud(vec2 p){
     float value=0.;
     float weight=.55;
     for(int i=0;i<4;i++){
      value+=noise(p)*weight;
      p=p*2.03+vec2(5.1,7.3);
      weight*=.5;
     }
     return value;
    }
    void main(){
     vec3 d=normalize(vPos);
     float height=max(0.,d.y);
     vec2 cloudUv=d.xz/(max(.12,height)+.32)*3.1;
     float cloudMass=cloud(cloudUv);
     float cloudDetail=noise(cloudUv*7.);
     vec3 day=mix(vec3(.58,.61,.61),vec3(.17,.22,.26),pow(height,.38));
     day-=smoothstep(.23,.85,cloudMass)*.24;
     day+=cloudDetail*.022;
     float sun=pow(max(0.,dot(d,normalize(vec3(-.35,.2,-.9)))),55.);
     day+=vec3(.40,.35,.25)*sun*(1.-cloudMass*.7);
     vec3 dark=mix(vec3(.16,.21,.23),vec3(.018,.038,.061),pow(height,.55));
     dark-=cloudMass*.06;
     // Sodium and neon off the terminal bounce back from the low cloud base.
     vec3 dock=mix(vec3(.20,.24,.30),vec3(.020,.045,.075),pow(height,.62));
     dock+=vec3(.16,.09,.05)*pow(max(0.,1.-height*2.6),3.)*(1.-cloudMass*.45);
     dock+=vec3(.02,.07,.10)*smoothstep(.30,.95,cloudMass)*(1.-height);
     gl_FragColor=vec4(mix(mix(day,dark,night),dock,harbor),1.);
    }`,
    }),
  );
  scene.add(sky);
  return sky;
}
