import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createLevel } from "../src/world.js";
import { createDuck, createWeapon } from "../src/models.js";
import { BOUNDS, blocked, routeTo, moveActor } from "../src/rules.js";
// Minimal label-canvas stub: validates scene construction without claiming browser rendering.
globalThis.document = {
  createElement: () => ({
    width: 512,
    height: 128,
    getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }),
  }),
};
for (const kind of ["foundry", "temple", "harbor"])
  test(`${kind}: geometry, spawn points and guard routes are valid`, () => {
    const level = createLevel(kind, true);
    assert.ok(
      level.rayTargets.length < 35,
      "static batches must remain bounded",
    );
    assert.equal(
      blocked(level.spawn.x, level.spawn.z, level.boxes, 0.5),
      false,
    );
    for (const p of level.spawnPoints) {
      assert.equal(
        blocked(p.x, p.z, level.boxes, 0.5),
        false,
        JSON.stringify(p),
      );
      assert.ok(
        routeTo(p, level.spawn, level.boxes).length > 0,
        JSON.stringify(p),
      );
    }
    level.root.traverse((o) => {
      if (o.isMesh) {
        assert.ok(o.geometry, "geometry exists");
        const pos = o.geometry.attributes.position;
        assert.ok(pos.count > 0);
        for (let i = 0; i < pos.array.length; i++)
          assert.ok(Number.isFinite(pos.array[i]));
      }
    });
    level.dispose();
  });
test("duck geometry batches and first-person weapon animation anchors exist", () => {
  const duck = createDuck({ low: true });
  let count = 0;
  duck.traverse((o) => {
    if (o.isMesh) {
      count++;
      assert.ok(o.geometry);
    }
  });
  assert.ok(count < 40);
  assert.equal(duck.userData.legs.length, 2);
  for (const index of [0, 1]) {
    const gun = createWeapon(index);
    assert.ok(gun.userData.muzzle);
    assert.ok(gun.userData.flash);
    assert.ok(gun.userData.leftHand);
    assert.ok(gun.userData.sightHeight > 0);
  }
});

for (const kind of ["foundry", "temple", "harbor"]) {
  test(`${kind}: both courtyards and side alleys are reachable physical play space`, () => {
    const level = createLevel(kind, true);
    assert.deepEqual(BOUNDS, { x: 46, z: 82 });
    assert.deepEqual(
      level.spawn,
      { x: 0, z: 28 },
      "the original deployment position is preserved",
    );
    assert.equal(level.sectors.length, 9);
    assert.ok(level.spawnPoints.length >= 20);
    const extensions = level.spawnPoints.filter(
      (point) => Math.abs(point.x) > 20 || Math.abs(point.z) > 36,
    );
    assert.equal(extensions.length, 12);
    // The ring road and the two new end districts are spawn territory too, or
    // waves would still only ever arrive inside the original block.
    const outskirts = level.spawnPoints.filter(
      (point) => Math.abs(point.x) > 34 || Math.abs(point.z) > 63,
    );
    assert.equal(outskirts.length, 6);
    for (const target of [...level.sectors.slice(1), ...extensions]) {
      const route = routeTo(level.spawn, target, level.boxes);
      assert.ok(
        route.length > 0,
        `${target.name || JSON.stringify(target)} needs a connected route`,
      );
      const position = { ...level.spawn };
      // Follow the actual path through moveActor: an abstract grid route alone
      // does not prove that the player can traverse a courtyard gate or alley gap.
      for (const waypoint of route) {
        let reached = false;
        for (let step = 0; step < 100; step++) {
          const dx = waypoint.x - position.x,
            dz = waypoint.z - position.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.05) {
            reached = true;
            break;
          }
          moveActor(
            position,
            (dx / distance) * Math.min(0.12, distance),
            (dz / distance) * Math.min(0.12, distance),
            level.boxes,
            0.43,
          );
          assert.equal(
            blocked(position.x, position.z, level.boxes, 0.43),
            false,
          );
        }
        assert.ok(
          reached,
          `collision stops movement near ${JSON.stringify(waypoint)}`,
        );
      }
      assert.ok(
        Math.hypot(position.x - target.x, position.z - target.z) < 0.8,
        JSON.stringify({ target, position }),
      );
    }
    // A guard must be able to walk the full diagonal of the enlarged map: the
    // search cap has to cover the whole grid, not just the original block.
    assert.ok(
      routeTo(
        { x: -BOUNDS.x + 2, z: -BOUNDS.z + 2 },
        { x: BOUNDS.x - 2, z: BOUNDS.z - 2 },
        level.boxes,
      ).length > 0,
      "corner to corner must stay routable",
    );
    level.root.updateMatrixWorld(true);
    for (const x of [-27, 27, -39.5, 39.5]) {
      // Former background decks used to occupy the future side lanes without
      // colliders. A real ray verifies the lane's visible floor is at ground level.
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, 40, 0),
        new THREE.Vector3(0, -1, 0),
      );
      const surface = ray.intersectObjects(level.rayTargets, false)[0];
      assert.ok(
        surface && Math.abs(surface.point.y) < 0.15,
        "background geometry must not fill the playable side lane",
      );
    }
    // Both new ends have actual cover/buildings; the expansion is not empty ground.
    assert.ok(
      level.boxes.filter((box) => box.z < -38 && Math.abs(box.x) < 32).length >=
        4,
    );
    assert.ok(
      level.boxes.filter((box) => box.z > 38 && Math.abs(box.x) < 32).length >=
        4,
    );
    // The new ground is furnished, not an empty apron behind an invisible wall.
    for (const [label, inside] of [
      ["north end", (box) => box.z < -63],
      ["south end", (box) => box.z > 63],
      ["west ring", (box) => box.x < -34 && Math.abs(box.z) < 63],
      ["east ring", (box) => box.x > 34 && Math.abs(box.z) < 63],
    ])
      assert.ok(
        level.boxes.filter(inside).length >= 3,
        `${label} needs real cover`,
      );
    // Enlarging the boundary turns former background into playable ground. A
    // solid volume with faces both above head height and across it, on a square
    // with no collider, is a wall the player walks straight through.
    const solid = level.rayTargets.filter((object) => !object.userData.flat);
    const phantom = [];
    for (let x = -BOUNDS.x + 2; x <= BOUNDS.x - 2; x += 3)
      for (let z = -BOUNDS.z + 2; z <= BOUNDS.z - 2; z += 3) {
        if (blocked(x, z, level.boxes, 0.5)) continue;
        const heights = new THREE.Raycaster(
          new THREE.Vector3(x, 60, z),
          new THREE.Vector3(0, -1, 0),
        )
          .intersectObjects(solid, false)
          .map((hit) => hit.point.y);
        if (
          heights.some((y) => y > 2.2) &&
          heights.some((y) => y > 0.35 && y < 1.9)
        )
          phantom.push([x, z]);
      }
    assert.deepEqual(
      phantom,
      [],
      "walkable ground must not sit inside solid scenery",
    );
    level.dispose();
  });
}
