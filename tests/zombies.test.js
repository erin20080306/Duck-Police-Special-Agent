import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createZombie, ZOMBIE_TYPES } from "../src/zombies.js";

for (const type of Object.keys(ZOMBIE_TYPES)) {
  test(`${type}: grounded zombie has bounded geometry and independent animation pivots`, () => {
    const model = createZombie({ type });
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    assert.ok(
      Math.abs(bounds.min.y) < 0.001,
      `feet must touch y=0, received ${bounds.min.y}`,
    );
    assert.ok(
      bounds.max.y > 2 && bounds.max.y < 2.5,
      `human-scale silhouette: ${bounds.max.y}`,
    );
    assert.equal(model.userData.enemyKind, "zombie");
    assert.equal(model.userData.type, type);
    assert.equal(model.userData.legs.length, 2);
    assert.equal(model.userData.arms.length, 2);
    assert.equal(model.userData.head.parent, model);
    assert.ok(
      model.userData.headHeight > 1.4 &&
        model.userData.headHeight < bounds.max.y,
    );
    const pivots = [...model.userData.legs, ...model.userData.arms];
    assert.equal(new Set(pivots).size, 4);
    for (const pivot of pivots) {
      assert.equal(pivot.parent, model);
      assert.ok(pivot.children.length > 0);
    }
    let meshes = 0,
      triangles = 0;
    model.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      triangles +=
        (object.geometry.index?.count ||
          object.geometry.attributes.position.count) / 3;
      const positions = object.geometry.attributes.position;
      assert.ok(positions.count > 0);
      for (const coordinate of positions.array)
        assert.ok(Number.isFinite(coordinate));
      if (object !== model.userData.gun?.userData.flash)
        assert.equal(object.geometry.userData.owned, true);
    });
    assert.ok(meshes <= 24, `mobile actor budget exceeded: ${meshes} draws`);
    assert.ok(
      triangles < 10000,
      `mobile triangle budget exceeded: ${triangles}`,
    );
  });
}

test("sniper muzzle points forward and remains attached after batching", () => {
  const sniper = createZombie({ type: "sniper" });
  const { gun } = sniper.userData;
  assert.ok(gun?.isGroup);
  assert.equal(gun.userData.muzzle.parent, gun);
  assert.equal(gun.userData.flash.visible, false);
  sniper.updateMatrixWorld(true);
  const muzzlePosition = gun.userData.muzzle.getWorldPosition(
    new THREE.Vector3(),
  );
  assert.ok(muzzlePosition.z < -1);
  assert.ok(muzzlePosition.y > 1 && muzzlePosition.y < 1.5);
  assert.equal(createZombie({ type: "walker" }).userData.gun, undefined);
  assert.equal(createZombie({ type: "runner" }).userData.gun, undefined);
});

test("humanoid proportions and desktop mesh budgets remain bounded", () => {
  for (const type of Object.keys(ZOMBIE_TYPES)) {
    const model = createZombie({ type, low: false });
    assert.ok(
      model.userData.legs[0].position.y >= 0.94,
      "longer human legs retain hip pivots",
    );
    assert.ok(
      model.userData.head.scale.x < 0.9,
      "head uses smaller human proportions",
    );
    let triangles = 0;
    model.traverse((object) => {
      if (object.isMesh)
        triangles +=
          (object.geometry.index?.count ||
            object.geometry.attributes.position.count) / 3;
    });
    assert.ok(triangles < 10000, `${type} desktop triangles: ${triangles}`);
  }
});

test("actor disposal owns batches but leaves shared materials and flash source intact", () => {
  const first = createZombie({ type: "sniper" });
  const second = createZombie({ type: "sniper", low: false });
  const firstBatches = [],
    secondBatches = [];
  first.traverse((object) => {
    if (object.geometry?.userData.owned) firstBatches.push(object);
  });
  second.traverse((object) => {
    if (object.geometry?.userData.owned) secondBatches.push(object);
  });
  const secondGeometries = new Set(secondBatches.map((mesh) => mesh.geometry));
  for (const mesh of firstBatches)
    assert.equal(secondGeometries.has(mesh.geometry), false);
  assert.equal(firstBatches[0].material, secondBatches[0].material);
  const sharedFlash = first.userData.gun.userData.flash.geometry;
  assert.equal(sharedFlash, second.userData.gun.userData.flash.geometry);
  let sharedDisposed = false;
  sharedFlash.addEventListener("dispose", () => {
    sharedDisposed = true;
  });
  first.traverse((object) => {
    if (object.geometry?.userData.owned) object.geometry.dispose();
  });
  assert.equal(sharedDisposed, false);
});

test("unknown zombie variants fall back to the playable walker", () => {
  assert.equal(createZombie({ type: "unknown" }).userData.type, "walker");
});
