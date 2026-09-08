export const LOOK = Object.freeze({
  base: 2.15,
  pitchRatio: 0.78,
  adsScale: 0.6,
  // A flick and a careful drag should not share one sensitivity: fast strokes
  // gain speed so a 180 fits one thumb sweep, slow strokes keep full precision.
  boost: 0.85,
  boostSpan: 0.055,
  adsBoost: 0.32,
  steerDeadZone: 0.12,
});

export function lookAcceleration(dx, dy, shortEdge, boost = LOOK.boost) {
  if (!(boost > 0)) return 1;
  const speed = Math.hypot(dx, dy) / Math.max(320, shortEdge);
  return 1 + boost * Math.min(1, speed / LOOK.boostSpan);
}

export function touchLookDelta(
  dx,
  dy,
  shortEdge,
  sensitivity = 1,
  aiming = false,
  options = {},
) {
  const { adsScale = LOOK.adsScale, boost = LOOK.boost } = options;
  const accel = lookAcceleration(
    dx,
    dy,
    shortEdge,
    boost * (aiming ? LOOK.adsBoost : 1),
  );
  const scale =
    (LOOK.base / Math.max(320, shortEdge)) *
    sensitivity *
    (aiming ? adsScale : 1) *
    accel;
  return { yaw: -dx * scale, pitch: -dy * scale * LOOK.pitchRatio };
}

export function smoothLook(current, target, dt) {
  return current + (target - current) * (1 - Math.exp(-24 * Math.max(0, dt)));
}

// Single-thumb turning. The dead zone keeps a mostly-vertical run swipe from
// drifting the camera, which is what makes one-finger movement feel loose.
export function steeringRate(
  value,
  sensitivity = 1,
  deadZone = LOOK.steerDeadZone,
) {
  const normalized = Math.max(-1, Math.min(1, value));
  const magnitude = Math.abs(normalized);
  if (magnitude <= deadZone) return 0;
  const live = (magnitude - deadZone) / (1 - deadZone);
  return -Math.sign(normalized) * Math.pow(live, 1.55) * 2.05 * sensitivity;
}
