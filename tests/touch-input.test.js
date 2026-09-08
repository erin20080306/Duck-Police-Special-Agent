import test from "node:test";
import assert from "node:assert/strict";
import { bindTouchInput } from "../src/touch-input.js";

class Control extends EventTarget {
  captures = new Set();
  captureAttempts = [];
  releases = [];
  style = { left: "", top: "", bottom: "" };
  classes = new Set();
  classList = {
    add: (name) => this.classes.add(name),
    remove: (name) => this.classes.delete(name),
    contains: (name) => this.classes.has(name),
  };
  firstElementChild = { style: { transform: "" } };
  rect = { left: 20, top: 500, width: 100, height: 100 };
  failCapture = false;

  getBoundingClientRect() {
    return this.rect;
  }
  setPointerCapture(pointerId) {
    this.captureAttempts.push(pointerId);
    if (this.failCapture) throw new Error("Pointer no longer active");
    this.captures.add(pointerId);
  }
  hasPointerCapture(pointerId) {
    return this.captures.has(pointerId);
  }
  releasePointerCapture(pointerId) {
    assert.ok(this.captures.has(pointerId));
    this.captures.delete(pointerId);
    this.releases.push(pointerId);
    // Exercise reentrancy: release can deliver a lost-capture event immediately.
    this.emit("lostpointercapture", pointerId);
  }
  emit(type, pointerId, values = {}) {
    if (type === "lostpointercapture") this.captures.delete(pointerId);
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      pointerId,
      pointerType: "touch",
      isPrimary: pointerId === 1,
      button: 0,
      clientX: 70,
      clientY: 550,
      ...values,
    });
    this.dispatchEvent(event);
    return event;
  }
}

function game({ floating = false, style = "strafe" } = {}) {
  const stick = new Control(),
    lookZone = new Control(),
    fire = new Control();
  const moveZone = floating ? new Control() : stick;
  if (floating) moveZone.rect = { left: 0, top: 0, width: 170, height: 844 };
  const movement = [],
    looks = [],
    firing = [],
    steering = [];
  let playing = true;
  let movementStyle = style;
  const input = bindTouchInput({
    stick,
    moveZone: floating ? moveZone : undefined,
    lookZone,
    fire,
    isPlaying: () => playing,
    onMove: (x, z) => movement.push([x, z]),
    onLook: (dx, dy) => looks.push([dx, dy]),
    onFire: (held) => firing.push(held),
    getMovementStyle: () => movementStyle,
    onSteer: (value) => steering.push(value),
  });
  return {
    stick,
    moveZone,
    lookZone,
    fire,
    movement,
    looks,
    firing,
    steering,
    input,
    pause: () => {
      playing = false;
    },
    resume: () => {
      playing = true;
    },
    setStyle: (value) => {
      movementStyle = value;
    },
  };
}

test("three fingers can move, look and fire simultaneously without stealing ownership", () => {
  const g = game();
  g.stick.emit("pointerdown", 1, { clientX: 108 });
  g.lookZone.emit("pointerdown", 2, { clientX: 270, clientY: 310 });
  g.fire.emit("pointerdown", 3);
  g.lookZone.emit("pointermove", 2, { clientX: 282, clientY: 306 });
  assert.deepEqual(g.movement.at(-1), [1, 0]);
  assert.deepEqual(g.looks, [[12, -4]]);
  assert.deepEqual(g.firing, [true]);
  assert.equal(
    g.stick.firstElementChild.style.transform,
    "translate(28px,0px)",
  );
  for (const [control, id] of [
    [g.stick, 1],
    [g.lookZone, 2],
    [g.fire, 3],
  ])
    assert.ok(control.hasPointerCapture(id));
  g.lookZone.emit("pointerup", 2);
  assert.deepEqual(g.movement.at(-1), [1, 0]);
  assert.equal(g.firing.at(-1), true);
  g.fire.emit("pointerup", 3);
  assert.deepEqual(g.firing, [true, false]);
  assert.deepEqual(g.movement.at(-1), [1, 0]);
  g.stick.emit("pointerup", 1);
  assert.deepEqual(g.movement.at(-1), [0, 0]);
});

test("a second finger on each occupied control cannot move, cancel or release its owner", () => {
  const g = game();
  g.stick.emit("pointerdown", 1, { clientX: 108 });
  g.lookZone.emit("pointerdown", 2, { clientX: 250, clientY: 250 });
  g.fire.emit("pointerdown", 3);
  for (const control of [g.stick, g.lookZone, g.fire]) {
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ]) {
      control.emit(type, 9, { clientX: -400, clientY: -400 });
    }
    assert.equal(control.captureAttempts.length, 1);
  }
  assert.deepEqual(g.movement, [[1, 0]]);
  assert.deepEqual(g.looks, []);
  assert.deepEqual(g.firing, [true]);
  g.lookZone.emit("pointermove", 2, { clientX: 254, clientY: 256 });
  assert.deepEqual(
    g.looks,
    [[4, 6]],
    "ignored fingers must not change the look origin",
  );
  g.fire.emit("pointerup", 3);
  assert.deepEqual(g.firing, [true, false]);
});

test("one pointer cannot be claimed by multiple controls", () => {
  const g = game();
  g.stick.emit("pointerdown", 1);
  g.fire.emit("pointerdown", 1);
  g.lookZone.emit("pointerdown", 1);
  assert.deepEqual(g.fire.captureAttempts, []);
  assert.deepEqual(g.lookZone.captureAttempts, []);
  assert.deepEqual(g.firing, []);
  g.stick.emit("pointerup", 1);
  g.fire.emit("pointerdown", 1);
  assert.deepEqual(g.firing, [true]);
});

test("cancel and lost capture release only their owner, and stale releases cannot stop a new finger", () => {
  const g = game();
  g.stick.emit("pointerdown", 1, { clientX: 108 });
  g.lookZone.emit("pointerdown", 2);
  g.fire.emit("pointerdown", 3);
  g.fire.emit("pointercancel", 3);
  assert.deepEqual(g.firing, [true, false]);
  assert.ok(g.stick.hasPointerCapture(1));
  assert.ok(g.lookZone.hasPointerCapture(2));
  g.fire.emit("pointerdown", 4);
  g.fire.emit("lostpointercapture", 3);
  g.fire.emit("pointerup", 3);
  assert.equal(g.firing.at(-1), true);
  assert.ok(g.fire.hasPointerCapture(4));
  g.stick.emit("lostpointercapture", 1);
  assert.deepEqual(g.movement.at(-1), [0, 0]);
  assert.equal(g.stick.firstElementChild.style.transform, "");
  g.lookZone.emit("pointercancel", 2);
  g.lookZone.emit("pointermove", 2, { clientX: 150 });
  assert.deepEqual(g.looks, []);
  g.lookZone.emit("pointerdown", 5, { clientX: 280, clientY: 290 });
  g.lookZone.emit("pointermove", 5, { clientX: 283, clientY: 292 });
  assert.deepEqual(g.looks, [[3, 2]]);
});

test("reset releases all captures, stops held actions, ignores stale moves and accepts fresh input", () => {
  const g = game();
  g.stick.emit("pointerdown", 1, { clientX: 108 });
  g.lookZone.emit("pointerdown", 2);
  g.fire.emit("pointerdown", 3);
  g.input.reset();
  for (const control of [g.stick, g.lookZone, g.fire]) {
    assert.equal(control.captures.size, 0);
    assert.equal(control.releases.length, 1);
  }
  assert.deepEqual(g.movement, [
    [1, 0],
    [0, 0],
  ]);
  assert.deepEqual(
    g.firing,
    [true, false],
    "lost capture during reset must not double-release fire",
  );
  assert.equal(g.stick.firstElementChild.style.transform, "");
  g.stick.emit("pointermove", 1, { clientX: 120 });
  g.lookZone.emit("pointermove", 2, { clientX: 210 });
  g.fire.emit("pointerup", 3);
  assert.deepEqual(g.movement.at(-1), [0, 0]);
  assert.deepEqual(g.looks, []);
  assert.deepEqual(g.firing, [true, false]);
  g.fire.emit("pointerdown", 4);
  assert.deepEqual(g.firing, [true, false, true]);
  g.input.reset();
  g.input.reset();
  assert.equal(g.firing.at(-1), false);
});

test("capture failure never starts an action or reserves its pointer", () => {
  const g = game();
  g.fire.failCapture = true;
  g.fire.emit("pointerdown", 3);
  assert.deepEqual(g.firing, []);
  g.lookZone.emit("pointerdown", 3);
  assert.ok(g.lookZone.hasPointerCapture(3));
  g.lookZone.emit("pointerup", 3);
  g.fire.failCapture = false;
  g.fire.emit("pointerdown", 4);
  assert.deepEqual(g.firing, [true]);
});

test("paused input cannot begin or continue moving and firing", () => {
  const g = game();
  g.pause();
  for (const [control, id] of [
    [g.stick, 1],
    [g.lookZone, 2],
    [g.fire, 3],
  ]) {
    control.emit("pointerdown", id);
    assert.equal(control.captures.size, 0);
  }
  assert.deepEqual(g.movement, []);
  assert.deepEqual(g.firing, []);
  g.resume();
  g.stick.emit("pointerdown", 1, { clientX: 108 });
  g.fire.emit("pointerdown", 3);
  g.pause();
  g.stick.emit("pointermove", 1, { clientX: 112 });
  assert.deepEqual(g.movement.at(-1), [0, 0]);
  assert.equal(g.firing.at(-1), false);
  assert.equal(g.fire.captures.size, 0);
});

test("joystick capture outside its bounds stays normalized, with a bounded visual thumb", () => {
  const g = game();
  g.stick.emit("pointerdown", 1);
  g.stick.emit("pointermove", 1, { clientX: 5000, clientY: -5000 });
  const [x, z] = g.movement.at(-1);
  assert.ok(Math.abs(Math.hypot(x, z) - 1) < 1e-12);
  assert.ok(x > 0 && z < 0);
  const offsets = [
    ...g.stick.firstElementChild.style.transform.matchAll(/(-?[\d.]+)px/g),
  ].map((match) => Number(match[1]));
  assert.ok(Math.hypot(...offsets) <= 28.000001);
  const event = g.stick.emit("pointermove", 1);
  assert.equal(event.defaultPrevented, true);
  g.stick.emit("pointerup", 1);
  assert.equal(g.stick.firstElementChild.style.transform, "");
});

test("left swipe begins wherever the finger lands and controls forward/backward and continuous steering", () => {
  const g = game({ floating: true, style: "swipe" });
  g.moveZone.emit("pointerdown", 1, { clientX: 130, clientY: 310 });
  assert.deepEqual(
    g.movement.at(-1),
    [0, 0],
    "contact away from the resting stick must not jump into movement",
  );
  assert.equal(g.steering.at(-1), 0);
  assert.equal(
    g.stick.style.left,
    "70px",
    "the circle stays inside the left control region",
  );
  assert.equal(g.stick.style.top, "260px");
  assert.ok(g.moveZone.classList.contains("engaged"));
  g.moveZone.emit("pointermove", 1, { clientX: 149, clientY: 272 });
  assert.deepEqual(g.movement.at(-1), [0, -1]);
  assert.equal(g.steering.at(-1), 0.5);
  assert.deepEqual(
    g.looks,
    [],
    "left steering has its own continuous signal, separate from right look deltas",
  );
  g.moveZone.emit("pointermove", 1, { clientX: 92, clientY: 348 });
  assert.deepEqual(g.movement.at(-1), [0, 1]);
  assert.equal(g.steering.at(-1), -1);
  g.moveZone.emit("pointerup", 1);
  assert.deepEqual(g.movement.at(-1), [0, 0]);
  assert.equal(g.steering.at(-1), 0);
  assert.deepEqual(g.stick.style, { left: "", top: "", bottom: "" });
  assert.ok(!g.moveZone.classList.contains("engaged"));
});

test("swipe turning does not reduce full forward speed, while strafe mode preserves a circular movement bound", () => {
  const g = game({ floating: true, style: "swipe" });
  g.moveZone.emit("pointerdown", 1, { clientX: 80, clientY: 350 });
  g.moveZone.emit("pointermove", 1, { clientX: 156, clientY: 274 });
  assert.deepEqual(g.movement.at(-1), [0, -1]);
  assert.equal(g.steering.at(-1), 1);
  g.setStyle("strafe");
  g.moveZone.emit("pointermove", 1, { clientX: 156, clientY: 274 });
  const [x, z] = g.movement.at(-1);
  assert.ok(x > 0 && z < 0);
  assert.ok(Math.abs(Math.hypot(x, z) - 1) < 1e-12);
  assert.equal(
    g.steering.at(-1),
    0,
    "switching to strafe clears any previous turn rate",
  );
});

test("floating region clamps the circle near edges without moving the actual gesture anchor", () => {
  const g = game({ floating: true, style: "swipe" });
  for (const [clientX, clientY, left, top] of [
    [2, 3, "0px", "0px"],
    [169, 842, "70px", "744px"],
  ]) {
    g.moveZone.emit("pointerdown", 1, { clientX, clientY });
    assert.deepEqual(g.movement.at(-1), [0, 0]);
    assert.equal(g.steering.at(-1), 0);
    assert.equal(g.stick.style.left, left);
    assert.equal(g.stick.style.top, top);
    g.moveZone.emit("pointermove", 1, { clientX: clientX + 19, clientY });
    assert.equal(g.steering.at(-1), 0.5);
    g.moveZone.emit("pointerup", 1);
  }
});

test("floating move, steering, right look and firing keep separate pointer ownership through cancel and reset", () => {
  const g = game({ floating: true, style: "swipe" });
  g.moveZone.emit("pointerdown", 1, { clientX: 80, clientY: 350 });
  g.lookZone.emit("pointerdown", 2, { clientX: 280, clientY: 320 });
  g.fire.emit("pointerdown", 3);
  g.moveZone.emit("pointermove", 1, { clientX: 99, clientY: 312 });
  const position = { ...g.stick.style };
  g.moveZone.emit("pointerdown", 4, { clientX: 10, clientY: 700 });
  g.moveZone.emit("pointercancel", 4);
  assert.deepEqual(g.stick.style, position);
  assert.equal(g.steering.at(-1), 0.5);
  g.lookZone.emit("pointermove", 2, { clientX: 286, clientY: 317 });
  assert.deepEqual(g.looks, [[6, -3]]);
  assert.deepEqual(g.movement.at(-1), [0, -1]);
  assert.equal(g.firing.at(-1), true);
  g.lookZone.emit("pointercancel", 2);
  assert.equal(g.steering.at(-1), 0.5);
  g.input.reset();
  assert.equal(g.steering.at(-1), 0);
  assert.deepEqual(g.movement.at(-1), [0, 0]);
  assert.equal(g.firing.at(-1), false);
  for (const control of [g.moveZone, g.lookZone, g.fire])
    assert.equal(control.captures.size, 0);
  assert.deepEqual(g.stick.style, { left: "", top: "", bottom: "" });
  g.moveZone.emit("pointermove", 1, { clientX: 30, clientY: 450 });
  assert.equal(g.steering.at(-1), 0);
});

test("losing floating movement capture stops steering but leaves an independently held fire pointer active", () => {
  const g = game({ floating: true, style: "swipe" });
  g.moveZone.emit("pointerdown", 1, { clientX: 80, clientY: 350 });
  g.moveZone.emit("pointermove", 1, { clientX: 118, clientY: 312 });
  g.fire.emit("pointerdown", 3);
  g.moveZone.emit("lostpointercapture", 1);
  assert.equal(g.steering.at(-1), 0);
  assert.deepEqual(g.movement.at(-1), [0, 0]);
  assert.equal(g.firing.at(-1), true);
  assert.deepEqual(g.stick.style, { left: "", top: "", bottom: "" });
});
