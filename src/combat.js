import { lineBlocked } from "./rules.js";

export const ZOMBIES = Object.freeze({
  walker: { name: "感染工人", speed: 1.8, health: 1, range: 1.8, damage: 1.1 },
  runner: {
    name: "狂奔喪屍",
    speed: 3.25,
    health: 0.72,
    range: 1.65,
    damage: 0.8,
  },
  sniper: {
    name: "狙擊喪屍",
    speed: 1.15,
    health: 1.15,
    range: 34,
    damage: 1.65,
  },
});
export const PULSE = Object.freeze({
  cooldown: 18,
  shield: 4,
  radius: 10,
  damage: 55,
  stun: 2.4,
});

export function zombieType(index, wave) {
  if (index === 2 || (wave === 3 && index === 5)) return "sniper";
  return index % 3 === 1 ? "runner" : "walker";
}

// Navigation uses ground clearance, separately from eye-height attack visibility.
// Expanding each collider stops a visible target drawing an actor into low cover
// or a gap too narrow for its body. Inputs remain untouched.
export function needsZombieRoute(from, to, boxes) {
  const clearance = boxes.map((box) => ({
    ...box,
    w: box.w + 0.43,
    d: box.d + 0.43,
  }));
  return lineBlocked(from.x, from.z, to.x, to.z, clearance, 0);
}

// Cover blocks the pulse as well as bullets. An ability must not clear hidden rooms.
export function pulseReaches(origin, target, boxes) {
  return (
    Math.hypot(origin.x - target.x, origin.z - target.z) <= PULSE.radius &&
    !lineBlocked(origin.x, origin.z, target.x, target.z, boxes, 1.1)
  );
}

export function incomingDamage(amount, shieldRemaining) {
  return amount * (shieldRemaining > 0 ? 0.25 : 1);
}
