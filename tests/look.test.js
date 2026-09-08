import test from "node:test";
import assert from "node:assert/strict";
import {
  touchLookDelta,
  smoothLook,
  steeringRate,
  lookAcceleration,
  LOOK,
} from "../src/look.js";
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

test("a flick turns faster than a careful drag, and aiming keeps its precision", () => {
  const edge = 390;
  assert.equal(lookAcceleration(0, 0, edge), 1);
  assert.equal(lookAcceleration(40, 0, edge, 0), 1, "boost is opt-out");
  const slow = lookAcceleration(2, 0, edge);
  const fast = lookAcceleration(120, 0, edge);
  assert.ok(fast > slow && slow >= 1);
  assert.ok(fast <= 1 + LOOK.boost + 1e-12, "acceleration stays bounded");
  // Angle per pixel must still rise with speed once sensitivity is applied.
  const perPixelSlow = Math.abs(touchLookDelta(2, 0, edge).yaw) / 2;
  const perPixelFast = Math.abs(touchLookDelta(120, 0, edge).yaw) / 120;
  assert.ok(perPixelFast > perPixelSlow);
  const aimedPerPixel =
    Math.abs(touchLookDelta(120, 0, edge, 1, true).yaw) / 120;
  assert.ok(aimedPerPixel < perPixelFast, "aiming damps the flick boost too");
});

test("the ads sensitivity scale is configurable and only applies while aiming", () => {
  const hip = touchLookDelta(60, 0, 390, 1, false, { adsScale: 0.3 });
  const aimed = touchLookDelta(60, 0, 390, 1, true, { adsScale: 0.3 });
  const looser = touchLookDelta(60, 0, 390, 1, true, { adsScale: 1 });
  assert.ok(Math.abs(aimed.yaw) < Math.abs(looser.yaw));
  assert.ok(Math.abs(aimed.yaw) < Math.abs(hip.yaw));
  assert.equal(
    touchLookDelta(60, 0, 390, 1, false, { adsScale: 1 }).yaw,
    hip.yaw,
    "hip fire ignores the ads scale",
  );
});

test("steering ignores the wobble in a mostly vertical run swipe", () => {
  assert.equal(steeringRate(LOOK.steerDeadZone), 0);
  assert.equal(steeringRate(-LOOK.steerDeadZone), 0);
  assert.equal(steeringRate(0.05), 0, "thumb drift must not turn the camera");
  assert.ok(Math.abs(steeringRate(LOOK.steerDeadZone + 0.01)) > 0);
  assert.equal(Math.abs(steeringRate(1)), 2.05);
  assert.equal(steeringRate(0.6, 2), steeringRate(0.6) * 2);
  assert.equal(steeringRate(0.05, 1, 0), steeringRate(0.05, 1, 0));
  assert.ok(Math.abs(steeringRate(0.05, 1, 0)) > 0, "the dead zone is tunable");
});
