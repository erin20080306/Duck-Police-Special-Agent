import test from "node:test";
import assert from "node:assert/strict";
import { movementMode } from "../src/movement.js";
test("phone forward movement runs with one thumb and no sprint button", () => {
  const input = {
    touch: true,
    forward: -1,
    moving: true,
    aim: false,
    crouch: false,
    shift: false,
  };
  assert.deepEqual(movementMode(input), { running: true, speed: 6.7 });
  assert.equal(movementMode({ ...input, forward: 1 }).running, false);
  assert.equal(movementMode({ ...input, forward: 0 }).running, false);
  assert.equal(movementMode({ ...input, moving: false }).running, false);
  assert.equal(movementMode({ ...input, aim: true }).speed, 2.7);
  assert.equal(movementMode({ ...input, crouch: true }).speed, 2.2);
});
test("desktop keeps the Shift sprint shortcut", () => {
  const input = {
    touch: false,
    forward: -1,
    moving: true,
    aim: false,
    crouch: false,
    shift: false,
  };
  assert.equal(movementMode(input).running, false);
  assert.equal(movementMode({ ...input, shift: true }).running, true);
});
