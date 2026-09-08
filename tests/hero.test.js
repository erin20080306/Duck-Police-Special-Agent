import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createDuck, createWeapon } from "../src/models.js";

test("reference hero has grounded humanoid proportions within mobile geometry limits", () => {
  const hero = createDuck({ low: true });
  const bounds = new THREE.Box3().setFromObject(hero);
  let meshes = 0,
    triangles = 0;
  hero.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    triangles +=
      ((geometry.index?.count ?? geometry.attributes.position.count) / 3) *
      (object.isInstancedMesh ? object.count : 1);
    assert.ok(geometry.attributes.position.array.every(Number.isFinite));
    assert.ok(
      ![0x812d2a, 0xad8673].includes(object.material.color?.getHex()),
      "old red/pink outfit is absent",
    );
  });
  assert.ok(meshes < 40);
  assert.ok(triangles < 60000, "budget includes every fleece instance");
  assert.ok(Math.abs(bounds.min.y) < 0.01, "boots meet the ground");
  assert.ok(bounds.max.y > 2.8 && bounds.max.y < 3.1);
  assert.equal(hero.userData.legs.length, 2);
  assert.equal(hero.userData.arms.length, 2);
});

test("raised pistol stays attached to the animated right hand", () => {
  const hero = createDuck({ low: true });
  const { gun, arms } = hero.userData;
  assert.equal(gun.parent, arms[0]);
  assert.equal(gun.name, "P-09");
  hero.updateMatrixWorld(true);
  const before = gun.userData.muzzle.getWorldPosition(new THREE.Vector3());
  arms[0].rotation.x += 0.25;
  hero.updateMatrixWorld(true);
  const after = gun.userData.muzzle.getWorldPosition(new THREE.Vector3());
  assert.ok(before.distanceTo(after) > 0.1, "muzzle follows the arm pose");
  assert.ok(after.toArray().every(Number.isFinite));
});

for (const index of [0, 1]) {
  test(`${index}: first-person sleeves share navy cloth and cyan wrist modules`, () => {
    const weapon = createWeapon(index);
    let navy = false,
      cyan = false;
    weapon.traverse((object) => {
      if (!object.isMesh) return;
      const material = object.material;
      if (material.color?.getHex() === 0x111d30) navy = true;
      if (material.emissive?.b > material.emissive?.r + 0.2) cyan = true;
      assert.ok(![0x812d2a, 0xad8673].includes(material.color?.getHex()));
    });
    assert.ok(navy && cyan);
    assert.ok(weapon.userData.leftHand);
    assert.ok(weapon.userData.muzzle);
  });
}
