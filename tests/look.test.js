import test from "node:test";
import assert from "node:assert/strict";
import { touchLookDelta, smoothLook, steeringRate } from "../src/look.js";
test("touch rotation has a consistent scale across portrait and landscape", () => {
  const portrait = touchLookDelta(100, 40, Math.min(390, 844));
  const landscape = touchLookDelta(100, 40, Math.min(844, 390));
  assert.deepEqual(portrait, landscape);
  assert.ok(portrait.yaw < 0 && portrait.pitch < 0);
  assert.ok(
    Math.abs(touchLookDelta(100, 40, 390, 1, true).yaw) <
      Math.abs(portrait.yaw),
  );
});
test("camera smoothing is frame-rate independent and never overshoots", () => {
  let a = 0,
    b = 0;
  for (let i = 0; i < 30; i++) a = smoothLook(a, 1, 1 / 30);
  for (let i = 0; i < 60; i++) b = smoothLook(b, 1, 1 / 60);
  assert.ok(Math.abs(a - b) < 1e-10);
  assert.ok(a > 0 && a <= 1);
  assert.equal(smoothLook(1, 2, 0), 1);
});
test("single-finger steering stops on release and is gentle near center", () => {
  assert.equal(steeringRate(0), 0);
  assert.equal(steeringRate(-1), -steeringRate(1));
  assert.ok(Math.abs(steeringRate(0.2)) < Math.abs(steeringRate(1)) * 0.2);
  assert.equal(steeringRate(100), steeringRate(1));
});
