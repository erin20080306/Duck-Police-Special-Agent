import test from "node:test";
import assert from "node:assert/strict";
import {
  blocked,
  moveActor,
  lineBlocked,
  reloadAmmo,
  formatTime,
  waveSize,
  routeTo,
  sectorFor,
  BOUNDS,
} from "../src/rules.js";
const box = { x: 0, z: 0, w: 1, d: 2, h: 1.2 };
test("standing line of sight clears low cover but crouching is concealed", () => {
  assert.equal(lineBlocked(-4, 0, 4, 0, [box], 1.7), false);
  assert.equal(lineBlocked(-4, 0, 4, 0, [box], 1.0), true);
  assert.equal(lineBlocked(-4, 3, 4, 3, [box], 1), false);
  assert.equal(lineBlocked(0, -5, 0, 5, [box], 1), true);
});
test("fast movement cannot tunnel through cover and slides along it", () => {
  const p = { x: -3, z: 0 };
  moveActor(p, 8, 1, [box]);
  assert.ok(p.x <= -1.4);
  assert.ok(Math.abs(p.z - 1) < 1e-6);
  assert.equal(blocked(p.x, p.z, [box]), false);
});
test("ammo transfer conserves total rounds and never invents ammunition", () => {
  assert.deepEqual(reloadAmmo(8, 4, 30), { ammo: 12, reserve: 0 });
  assert.deepEqual(reloadAmmo(8, 100, 30), { ammo: 30, reserve: 78 });
  assert.deepEqual(reloadAmmo(30, 100, 30), { ammo: 30, reserve: 100 });
});
test("timer and waves handle boundaries", () => {
  assert.equal(formatTime(60), "01:00");
  assert.equal(formatTime(-2), "00:00");
  assert.deepEqual(
    [1, 2, 3].map((w) => waveSize(w, "normal")),
    [4, 5, 6],
  );
});
test("guard path routes around a wall instead of entering it", () => {
  const wall = { x: 0, z: 0, w: 1, d: 4, h: 3 },
    path = routeTo({ x: -4.5, z: 0 }, { x: 4.5, z: 0 }, [wall]);
  assert.ok(path.length > 6);
  assert.deepEqual(path.at(-1), { x: 4.5, z: 0 });
  assert.ok(path.every((p) => !blocked(p.x, p.z, [wall], 0.55)));
});

test("every point inside the enlarged bounds falls in exactly one named district", () => {
  assert.equal(sectorFor(0, 0), 0);
  assert.equal(sectorFor(0, -49), 1);
  assert.equal(sectorFor(0, 49), 2);
  assert.equal(sectorFor(-27, 0), 3);
  assert.equal(sectorFor(27, 0), 4);
  assert.equal(sectorFor(0, -71), 5);
  assert.equal(sectorFor(0, 71), 6);
  assert.equal(sectorFor(-39.5, 0), 7);
  assert.equal(sectorFor(39.5, 0), 8);
  // The end districts win over the ring so a corner still reads as north/south.
  assert.equal(sectorFor(-42, -75), 5);
  assert.equal(sectorFor(42, 75), 6);
  const seen = new Set();
  for (let x = -BOUNDS.x; x <= BOUNDS.x; x += 1.5)
    for (let z = -BOUNDS.z; z <= BOUNDS.z; z += 1.5) {
      const index = sectorFor(x, z);
      assert.ok(Number.isInteger(index) && index >= 0 && index < 9);
      seen.add(index);
    }
  assert.equal(seen.size, 9, "no district is unreachable inside the bounds");
});

test("a guard can still route the full diagonal of the enlarged map", () => {
  const wall = [];
  // A staggered maze forces the search wide rather than straight down a lane.
  for (let z = -BOUNDS.z + 10; z < BOUNDS.z - 10; z += 12)
    wall.push({ x: 0, z, w: BOUNDS.x - 6, d: 1, h: 3 });
  const route = routeTo(
    { x: -BOUNDS.x + 3, z: -BOUNDS.z + 3 },
    { x: BOUNDS.x - 3, z: BOUNDS.z - 3 },
    wall,
  );
  assert.ok(route.length > 0, "the search cap must cover the whole grid");
  assert.ok(
    Math.hypot(
      route.at(-1).x - (BOUNDS.x - 3),
      route.at(-1).z - (BOUNDS.z - 3),
    ) < 1.6,
  );
  assert.deepEqual(
    routeTo({ x: 0, z: 0 }, { x: 0, z: 0 }, wall),
    [],
    "a guard already on the target needs no path",
  );
});
