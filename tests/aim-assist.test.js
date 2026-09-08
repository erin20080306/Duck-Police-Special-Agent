import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSIST_LEVELS,
  assistLevel,
  assistProximity,
  aimAssist,
  adsSnapPull,
  pickAssistTarget,
  shortestAngle,
} from "../src/aim-assist.js";

const light = ASSIST_LEVELS.light;

test("assist only acts inside the bubble and strengthens toward its center", () => {
  assert.equal(assistProximity(light.outer, light), 0);
  assert.equal(assistProximity(light.outer + 0.01, light), 0);
  assert.equal(assistProximity(light.inner, light), 1);
  assert.equal(assistProximity(0, light), 1);
  const mid = assistProximity((light.inner + light.outer) / 2, light);
  assert.ok(mid > 0 && mid < 1);
  assert.ok(
    assistProximity(light.inner + 0.005, light) >
      assistProximity(light.outer - 0.005, light),
  );
  assert.equal(assistProximity(0.01, ASSIST_LEVELS.off), 0);
});

test("friction slows the same swipe over a target without ever stopping it", () => {
  const far = aimAssist({
    distance: 0.5,
    level: light,
    turnSpeed: 1,
    dt: 0.016,
  });
  assert.deepEqual(far, { friction: 1, pull: 0 });
  const near = aimAssist({
    distance: 0,
    level: light,
    turnSpeed: 1,
    dt: 0.016,
  });
  assert.ok(near.friction > 0 && near.friction < 1);
  assert.equal(near.friction, 1 - light.friction);
  const strong = aimAssist({
    distance: 0,
    level: ASSIST_LEVELS.strong,
    turnSpeed: 1,
    dt: 0.016,
  });
  assert.ok(strong.friction < near.friction && strong.friction > 0);
});

test("magnetism requires player input and never snaps the whole gap at once", () => {
  const resting = aimAssist({
    distance: 0.02,
    level: light,
    turnSpeed: 0,
    dt: 0.016,
  });
  assert.equal(resting.pull, 0, "a still thumb must not be aimed for");
  const turning = aimAssist({
    distance: 0.02,
    level: light,
    turnSpeed: 1,
    dt: 0.016,
  });
  assert.ok(turning.pull > 0 && turning.pull < 0.1);
  const long = aimAssist({ distance: 0, level: light, turnSpeed: 1, dt: 5 });
  assert.ok(long.pull <= 0.5, "a stalled frame cannot teleport the crosshair");
  assert.equal(
    aimAssist({
      distance: 0.02,
      level: light,
      turnSpeed: 1,
      dt: 0.016,
      visible: false,
    }).pull,
    0,
  );
  assert.equal(
    aimAssist({ distance: 0.02, level: ASSIST_LEVELS.off, turnSpeed: 1, dt: 1 })
      .pull,
    0,
  );
});

test("ads snap runs only inside its window and only for a level that has one", () => {
  assert.equal(adsSnapPull(0.02, light, 0.016, 0), 0);
  assert.ok(adsSnapPull(0.02, light, 0.016, 0.1) > 0);
  assert.equal(adsSnapPull(0.5, light, 0.016, 0.1), 0);
  assert.equal(adsSnapPull(0.02, ASSIST_LEVELS.off, 0.016, 0.1), 0);
  assert.ok(adsSnapPull(0.02, light, 5, 0.1) <= 0.6);
});

test("target choice prefers the nearest visible enemy in front of the camera", () => {
  const candidates = [
    { id: "blocked", distance: 0.01, visible: false },
    { id: "behind", distance: 0.02, visible: true, behind: true },
    { id: "far", distance: 0.5, visible: true },
    { id: "near", distance: 0.06, visible: true },
    { id: "nearest", distance: 0.03, visible: true },
  ];
  assert.equal(pickAssistTarget(candidates, light).id, "nearest");
  assert.equal(pickAssistTarget([], light), null);
  assert.equal(pickAssistTarget(candidates, ASSIST_LEVELS.off), null);
});

test("assist level names fall back to off, and yaw pull takes the short way round", () => {
  assert.equal(assistLevel("light"), ASSIST_LEVELS.light);
  assert.equal(assistLevel("nonsense"), ASSIST_LEVELS.off);
  assert.equal(assistLevel(undefined), ASSIST_LEVELS.off);
  assert.ok(Math.abs(shortestAngle(3.1, -3.1)) < 0.09);
  assert.ok(Math.abs(shortestAngle(-3.1, 3.1)) < 0.09);
  assert.equal(shortestAngle(0, 0), 0);
  assert.ok(
    Math.abs(shortestAngle(7.5, 0.3) - (0.3 - (7.5 - Math.PI * 2))) < 1e-9,
  );
});
