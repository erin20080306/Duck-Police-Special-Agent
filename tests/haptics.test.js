import test from "node:test";
import assert from "node:assert/strict";
import { HAPTICS, hapticPattern, vibrate } from "../src/haptics.js";

test("every pattern is a short, bounded buzz that rapid fire cannot stack up", () => {
  for (const [kind, pattern] of Object.entries(HAPTICS)) {
    assert.ok(Array.isArray(pattern) && pattern.length, kind);
    assert.ok(
      pattern.every((ms) => Number.isFinite(ms) && ms > 0),
      kind,
    );
    assert.ok(
      pattern.reduce((total, ms) => total + ms, 0) <= 90,
      `${kind} must stay under a tenth of a second`,
    );
  }
  assert.equal(hapticPattern("kill"), HAPTICS.kill);
  assert.equal(hapticPattern("nonsense"), null);
});

test("vibration is skipped when disabled, unknown, or unsupported, and never throws", () => {
  const calls = [];
  const nav = { vibrate: (pattern) => (calls.push(pattern), true) };
  assert.equal(vibrate("hit", true, nav), true);
  assert.deepEqual(calls, [HAPTICS.hit]);
  assert.equal(vibrate("hit", false, nav), false);
  assert.equal(vibrate("nonsense", true, nav), false);
  assert.deepEqual(calls, [HAPTICS.hit], "no extra buzz was requested");
  assert.equal(vibrate("hit", true, {}), false);
  assert.equal(vibrate("hit", true, undefined), false);
  assert.equal(
    vibrate("hit", true, {
      vibrate() {
        throw new Error("blocked by the browser");
      },
    }),
    false,
  );
});
