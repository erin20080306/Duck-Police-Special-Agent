import test from "node:test";
import assert from "node:assert/strict";
import {
  ZOMBIES,
  PULSE,
  zombieType,
  needsZombieRoute,
  pulseReaches,
  incomingDamage,
} from "../src/combat.js";
import { lineBlocked, moveActor, routeTo } from "../src/rules.js";

test("every wave has melee and telegraphed sniper enemies", () => {
  for (let wave = 1; wave <= 3; wave++) {
    const types = Array.from({ length: 3 + wave }, (_, i) =>
      zombieType(i, wave),
    );
    assert.ok(
      types.includes("walker") &&
        types.includes("runner") &&
        types.includes("sniper"),
    );
    assert.ok(types.every((type) => ZOMBIES[type]));
  }
});
test("pulse range and cover prevent damaging hidden or distant enemies", () => {
  const origin = { x: 0, z: 0 };
  assert.ok(pulseReaches(origin, { x: 0, z: -PULSE.radius }, []));
  assert.equal(
    pulseReaches(origin, { x: 0, z: -PULSE.radius - 0.01 }, []),
    false,
  );
  assert.equal(
    pulseReaches(origin, { x: 0, z: -5 }, [
      { x: 0, z: -2, w: 2, d: 0.4, h: 2 },
    ]),
    false,
  );
  assert.ok(
    pulseReaches(origin, { x: 3, z: 0 }, [{ x: 0, z: -2, w: 2, d: 0.4, h: 2 }]),
  );
});
test("shield reduces damage only while active", () => {
  assert.equal(incomingDamage(20, 4), 5);
  assert.equal(incomingDamage(20, 0), 20);
  assert.equal(incomingDamage(20, -0.01), 20);
});

test("visible low cover and narrow clearances still require a zombie route", () => {
  const boxes = [{ x: 0, z: 0, w: 1.8, d: 0.6, h: 1.12 }];
  const before = structuredClone(boxes);
  assert.equal(lineBlocked(0, -3, 0, 3, boxes, 1.6), false);
  assert.equal(needsZombieRoute({ x: 0, z: -3 }, { x: 0, z: 3 }, boxes), true);
  // The center line misses the sandbag, but a 0.43m actor would clip its edge.
  assert.equal(lineBlocked(2, -3, 2, 3, boxes, 0), false);
  assert.equal(needsZombieRoute({ x: 2, z: -3 }, { x: 2, z: 3 }, boxes), true);
  assert.equal(
    needsZombieRoute({ x: 2.4, z: -3 }, { x: 2.4, z: 3 }, boxes),
    false,
  );
  assert.deepEqual(boxes, before);
});

test("walker reaches a visible player around waist-high sandbags", () => {
  const boxes = [{ x: 0, z: 0, w: 1.8, d: 0.6, h: 1.12 }];
  const walker = { x: 0, z: -3 },
    player = { x: 0, z: 3 };
  const dt = 0.05,
    speed = ZOMBIES.walker.speed + 0.08;
  let path = [],
    repath = 0,
    detoured = false;
  for (let time = 0; time < 16; time += dt) {
    const distance = Math.hypot(player.x - walker.x, player.z - walker.z);
    if (distance <= ZOMBIES.walker.range * 0.88) break;
    repath -= dt;
    let target = player;
    if (needsZombieRoute(walker, player, boxes)) {
      if (repath <= 0) {
        path = routeTo(walker, player, boxes);
        repath = 1.2;
      }
      target = path[0];
      if (!target) continue;
      if (Math.hypot(target.x - walker.x, target.z - walker.z) < 0.35) {
        path.shift();
        continue;
      }
    }
    const distanceToTarget = Math.hypot(
      target.x - walker.x,
      target.z - walker.z,
    );
    moveActor(
      walker,
      ((target.x - walker.x) / distanceToTarget) * speed * dt,
      ((target.z - walker.z) / distanceToTarget) * speed * dt,
      boxes,
      0.43,
    );
    detoured ||= Math.abs(walker.x) > 2.23;
  }
  assert.ok(detoured, "walker must leave the blocked direct line");
  assert.ok(
    Math.hypot(player.x - walker.x, player.z - walker.z) <=
      ZOMBIES.walker.range,
    `walker must reach melee range within 16s: ${JSON.stringify(walker)}`,
  );
  assert.equal(needsZombieRoute(walker, player, boxes), false);
});
