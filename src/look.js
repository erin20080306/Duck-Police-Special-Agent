export function touchLookDelta(
  dx,
  dy,
  shortEdge,
  sensitivity = 1,
  aiming = false,
) {
  const scale =
    (2.15 / Math.max(320, shortEdge)) * sensitivity * (aiming ? 0.62 : 1);
  return { yaw: -dx * scale, pitch: -dy * scale * 0.78 };
}
export function smoothLook(current, target, dt) {
  return current + (target - current) * (1 - Math.exp(-24 * Math.max(0, dt)));
}
export function steeringRate(value, sensitivity = 1) {
  const normalized = Math.max(-1, Math.min(1, value));
  if (normalized === 0) return 0;
  return (
    -Math.sign(normalized) *
    Math.pow(Math.abs(normalized), 1.55) *
    2.05 *
    sensitivity
  );
}
