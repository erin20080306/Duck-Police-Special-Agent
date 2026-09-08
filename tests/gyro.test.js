import test from "node:test";
import assert from "node:assert/strict";
import {
  wrapDegrees,
  gyroDelta,
  gyroSteady,
  gyroSupported,
  gyroNeedsPermission,
  bindGyro,
} from "../src/gyro.js";

const DEG = Math.PI / 180;

test("heading wrap never turns one degree of drift into a full spin", () => {
  assert.equal(wrapDegrees(2), 2);
  assert.equal(wrapDegrees(-358), 2);
  assert.equal(wrapDegrees(358), -2);
  // Half a turn is the same rotation either way; only its magnitude is defined.
  assert.equal(Math.abs(wrapDegrees(180)), 180);
  assert.equal(Math.abs(wrapDegrees(-180)), 180);
  const across = gyroDelta({ alpha: 359 }, { alpha: 1 }, 1, 0);
  assert.ok(Math.abs(across.yaw - 2 * DEG) < 1e-12);
});

test("the first sample only sets a baseline, so enabling gyro cannot flick the view", () => {
  assert.deepEqual(gyroDelta(null, { alpha: 90, beta: 40 }), {
    yaw: 0,
    pitch: 0,
  });
  assert.deepEqual(gyroDelta({ alpha: 90 }, null), { yaw: 0, pitch: 0 });
});

test("screen rotation moves pitch onto the axis the player actually tilts", () => {
  const portrait = gyroDelta(
    { alpha: 0, beta: 90, gamma: 0 },
    { alpha: 0, beta: 100, gamma: 0 },
    1,
    0,
  );
  assert.ok(Math.abs(portrait.pitch - 10 * DEG) < 1e-12);
  const landscape = gyroDelta(
    { alpha: 0, beta: 90, gamma: 0 },
    { alpha: 0, beta: 90, gamma: 10 },
    1,
    90,
  );
  assert.ok(Math.abs(landscape.pitch - 10 * DEG) < 1e-12);
  const flipped = gyroDelta(
    { alpha: 0, beta: 90, gamma: 0 },
    { alpha: 0, beta: 90, gamma: 10 },
    1,
    -90,
  );
  assert.ok(Math.abs(flipped.pitch + 10 * DEG) < 1e-12);
  assert.ok(Math.abs(landscape.pitch + flipped.pitch) < 1e-12);
});

test("sensitivity scales the delta and inverting pitch only flips the vertical axis", () => {
  const base = gyroDelta(
    { alpha: 10, beta: 0, gamma: 0 },
    { alpha: 4, beta: 6, gamma: 0 },
    1,
    0,
  );
  const half = gyroDelta(
    { alpha: 10, beta: 0, gamma: 0 },
    { alpha: 4, beta: 6, gamma: 0 },
    0.5,
    0,
  );
  assert.ok(Math.abs(half.yaw - base.yaw / 2) < 1e-12);
  assert.ok(Math.abs(half.pitch - base.pitch / 2) < 1e-12);
  const inverted = gyroDelta(
    { alpha: 10, beta: 0, gamma: 0 },
    { alpha: 4, beta: 6, gamma: 0 },
    1,
    0,
    true,
  );
  assert.equal(inverted.yaw, base.yaw);
  assert.equal(inverted.pitch, -base.pitch);
});

test("a resting phone is not aim: sub-threshold samples are discarded", () => {
  assert.deepEqual(gyroSteady({ yaw: 0.0001, pitch: 0.0001 }), {
    yaw: 0,
    pitch: 0,
  });
  const moving = { yaw: 0.01, pitch: -0.004 };
  assert.equal(gyroSteady(moving), moving);
});

test("binding starts, stops and re-baselines without leaking listeners", () => {
  const listeners = new Map();
  const deltas = [];
  const scope = {
    DeviceOrientationEvent: function () {},
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
  };
  const gyro = bindGyro({
    onDelta: (d) => deltas.push(d),
    getSensitivity: () => 1,
    getScreenAngle: () => 0,
    scope,
  });
  assert.equal(gyro.supported, true);
  assert.equal(gyro.needsPermission, false);
  gyro.start();
  gyro.start();
  assert.equal(listeners.size, 1);
  const emit = (alpha, beta) =>
    listeners.get("deviceorientation")({ alpha, beta, gamma: 0 });
  emit(0, 0);
  assert.deepEqual(deltas, [], "the baseline sample produces no motion");
  emit(-6, 0);
  assert.equal(deltas.length, 1);
  assert.ok(deltas[0].yaw < 0);
  // A pause must not replay the phone's old orientation as one huge flick.
  gyro.recenter();
  emit(120, 0);
  assert.equal(deltas.length, 1);
  emit(121, 0);
  assert.equal(deltas.length, 2);
  gyro.stop();
  assert.equal(listeners.size, 0);
  assert.equal(gyro.running, false);
});

test("permission is requested only where the platform demands it", async () => {
  assert.equal(gyroSupported({}), false);
  assert.equal(gyroNeedsPermission({}), false);
  const plain = { DeviceOrientationEvent: function () {} };
  assert.equal(gyroSupported(plain), true);
  assert.equal(gyroNeedsPermission(plain), false);
  const ios = { DeviceOrientationEvent: function () {} };
  ios.DeviceOrientationEvent.requestPermission = async () => "granted";
  assert.equal(gyroNeedsPermission(ios), true);
  assert.equal(await bindGyro({ onDelta() {}, scope: ios }).request(), true);
  const denied = { DeviceOrientationEvent: function () {} };
  denied.DeviceOrientationEvent.requestPermission = async () => "denied";
  assert.equal(
    await bindGyro({ onDelta() {}, scope: denied }).request(),
    false,
  );
  const broken = { DeviceOrientationEvent: function () {} };
  broken.DeviceOrientationEvent.requestPermission = async () => {
    throw new Error("blocked");
  };
  assert.equal(
    await bindGyro({ onDelta() {}, scope: broken }).request(),
    false,
  );
});
