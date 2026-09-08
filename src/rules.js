export const GUNS = [
  {
    name: "AR-07 突擊步槍",
    short: "AR-07",
    capacity: 30,
    reserve: 180,
    damage: 28,
    delay: 0.105,
    reload: 2.15,
    automatic: true,
    recoil: 0.012,
  },
  {
    name: "P-09 戰術手槍",
    short: "P-09",
    capacity: 12,
    reserve: 72,
    damage: 48,
    delay: 0.28,
    reload: 1.55,
    automatic: false,
    recoil: 0.021,
  },
];
export const DIFFICULTY = {
  easy: { hp: 65, damage: 6, interval: 1.8, accuracy: 0.35, time: 360 },
  normal: { hp: 90, damage: 9, interval: 1.35, accuracy: 0.48, time: 300 },
  hard: { hp: 115, damage: 13, interval: 1.05, accuracy: 0.62, time: 240 },
};
export const BOUNDS = { x: 32, z: 60 };
export function waveSize(wave, difficulty) {
  return 3 + wave + (difficulty === "hard" ? 2 : 0);
}
export function blocked(x, z, boxes, r = 0.4) {
  return boxes.some(
    (o) => Math.abs(x - o.x) < o.w + r && Math.abs(z - o.z) < o.d + r,
  );
}
export function moveActor(p, dx, dz, boxes, r = 0.4) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
  for (let i = 0; i < steps; i++) {
    const x = p.x + dx / steps,
      z = p.z + dz / steps;
    if (Math.abs(x) < BOUNDS.x - r && !blocked(x, p.z, boxes, r)) p.x = x;
    if (Math.abs(z) < BOUNDS.z - r && !blocked(p.x, z, boxes, r)) p.z = z;
  }
  return p;
}
export function lineBlocked(ax, az, bx, bz, boxes, height = 1.5) {
  return boxes.some((o) => {
    if (o.h < height) return false;
    let lo = 0,
      hi = 1;
    for (const [a, b, c, h] of [
      [ax, bx, o.x, o.w],
      [az, bz, o.z, o.d],
    ]) {
      const d = b - a;
      if (Math.abs(d) < 1e-8) {
        if (a < c - h || a > c + h) return false;
        continue;
      }
      let t0 = (c - h - a) / d,
        t1 = (c + h - a) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      lo = Math.max(lo, t0);
      hi = Math.min(hi, t1);
      if (lo > hi) return false;
    }
    return true;
  });
}
export function reloadAmmo(ammo, reserve, capacity) {
  const take = Math.min(Math.max(0, capacity - ammo), reserve);
  return { ammo: ammo + take, reserve: reserve - take };
}
export function formatTime(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  return (
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
// Grid route used only when a guard loses direct line of sight. Bounded breadth-first search.
export function routeTo(from, to, boxes) {
  const step = 1.5;
  const ix = (x) => Math.round(x / step),
    key = (x, z) => x + "," + z;
  const sx = ix(from.x),
    sz = ix(from.z),
    tx = ix(to.x),
    tz = ix(to.z);
  const queue = [[sx, sz]],
    seen = new Map([[key(sx, sz), null]]);
  let found = null;
  for (let i = 0; i < queue.length && i < 6000; i++) {
    const [x, z] = queue[i];
    if (x === tx && z === tz) {
      found = [x, z];
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        k = key(nx, nz);
      if (
        seen.has(k) ||
        Math.abs(nx * step) > BOUNDS.x - 0.7 ||
        Math.abs(nz * step) > BOUNDS.z - 0.7 ||
        blocked(nx * step, nz * step, boxes, 0.55)
      )
        continue;
      seen.set(k, [x, z]);
      queue.push([nx, nz]);
    }
  }
  if (!found) return [];
  const path = [];
  let p = found;
  while (p) {
    path.push({ x: p[0] * step, z: p[1] * step });
    p = seen.get(key(...p));
  }
  return path.reverse().slice(1);
}
