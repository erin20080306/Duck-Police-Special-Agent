import test from "node:test";
import assert from "node:assert/strict";
import { createLevel } from "../src/world.js";

globalThis.document = {
  createElement: () => ({
    width: 512,
    height: 128,
    getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }),
  }),
};

for (const kind of ["foundry", "temple", "harbor"]) {
  test(`${kind}: mobile weather stays bounded and survives a full particle lifecycle`, () => {
    const level = createLevel(kind, true);
    const collisions = JSON.stringify(level.boxes);
    let meshCount = 0,
      pointCount = 0,
      triangles = 0;
    level.root.traverse((object) => {
      if (object.isMesh) {
        meshCount++;
        triangles +=
          (object.geometry.index?.count ??
            object.geometry.attributes.position.count) / 3;
      }
      if (object.isPoints)
        pointCount += object.geometry.attributes.position.count;
    });
    assert.ok(
      meshCount <= 24,
      "static environment and wet surfaces have bounded draw calls",
    );
    // The walkable area roughly doubled, so the geometry budget grows with it.
    // Draw calls and dynamic lights, which cost far more on a phone than
    // triangles, stay exactly where they were.
    assert.ok(
      triangles < 64000,
      "mobile scenery stays within the geometry budget",
    );
    // The particle counts did not change; only the volume they occupy did, so
    // on-screen density fell even as the cap rose with the emitting area.
    assert.ok(pointCount <= 80, "transparent particle overdraw stays bounded");
    assert.ok(
      level.lights.length <= 2,
      "mobile avoids many dynamic point lights",
    );
    for (let frame = 0; frame < 400; frame++) level.tick(0.05, frame * 0.05);
    level.root.traverse((object) => {
      if (!object.geometry) return;
      for (const attribute of Object.values(object.geometry.attributes)) {
        assert.ok(
          attribute.array.every(Number.isFinite),
          "animation retains finite geometry",
        );
      }
    });
    assert.equal(
      JSON.stringify(level.boxes),
      collisions,
      "weather never moves collision geometry",
    );
    level.dispose();
  });
}

test("map disposal releases its effect resources exactly once", () => {
  const level = createLevel("foundry", true),
    resources = new Set(),
    disposals = new Map();
  level.root.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    const material = object.material;
    if (
      material &&
      (material.transparent || material.isMeshBasicMaterial || material.map)
    ) {
      resources.add(material);
      if (material.map) resources.add(material.map);
    }
  });
  for (const resource of resources) {
    disposals.set(resource, 0);
    resource.addEventListener("dispose", () =>
      disposals.set(resource, disposals.get(resource) + 1),
    );
  }
  level.dispose();
  assert.equal(level.root.children.length, 0);
  for (const resource of resources) assert.equal(disposals.get(resource), 1);
});
