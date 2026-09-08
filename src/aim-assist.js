/**
 * Screen-space aim assist for touch aiming, built from the two mechanics console
 * shooters use: rotational friction (look input slows near a target) and
 * magnetism (the view eases toward the target). Both scale with how hard the
 * player is already turning, so the camera never moves on its own — assist only
 * shapes input the player supplies.
 *
 * Distances are aspect-corrected NDC radii, so a bubble stays circular on screen
 * and tightens automatically in world angle while aiming down sights.
 */
export const ASSIST_LEVELS = Object.freeze({
  off: { outer: 0, inner: 0, friction: 0, magnet: 0, snap: 0 },
  light: { outer: 0.115, inner: 0.042, friction: 0.34, magnet: 1.7, snap: 0.1 },
  strong: { outer: 0.17, inner: 0.07, friction: 0.56, magnet: 3.4, snap: 0.15 },
});

export function assistLevel(name) {
  return ASSIST_LEVELS[name] ?? ASSIST_LEVELS.off;
}

// 1 at the inner bubble, easing to 0 at the outer edge. Smoothstep keeps the
// sensitivity change from stepping when the crosshair crosses the boundary.
export function assistProximity(distance, level) {
  if (!(level.outer > 0) || !(distance < level.outer)) return 0;
  if (distance <= level.inner) return 1;
  const t = (distance - level.inner) / (level.outer - level.inner);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * @returns {{friction:number, pull:number}} friction multiplies raw look input;
 * pull is the fraction of the remaining angular gap to close this frame.
 */
export function aimAssist({
  distance,
  level,
  turnSpeed = 0,
  dt = 0,
  visible = true,
}) {
  if (!visible) return { friction: 1, pull: 0 };
  const proximity = assistProximity(distance, level);
  if (proximity <= 0) return { friction: 1, pull: 0 };
  const friction = 1 - level.friction * proximity;
  // Magnetism is gated on player input, and never closes the whole gap at once.
  const drive = Math.min(1, Math.max(0, turnSpeed));
  const pull =
    1 - Math.exp(-level.magnet * proximity * drive * Math.max(0, dt));
  return { friction, pull: Math.min(0.5, pull) };
}

// Aiming down sights eases onto the nearest target inside a narrow cone. The
// window is short so a miss costs the player nothing.
export function adsSnapPull(distance, level, dt = 0, remaining = 0) {
  if (remaining <= 0 || !(level.snap > 0) || !(distance < level.outer))
    return 0;
  return Math.min(0.6, 1 - Math.exp(-9 * Math.max(0, dt)));
}

// Closest candidate to the crosshair that cover does not block.
export function pickAssistTarget(candidates, level) {
  let best = null;
  for (const candidate of candidates) {
    if (!candidate.visible || candidate.behind) continue;
    if (!(candidate.distance < level.outer)) continue;
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  return best;
}

// Wrapped difference so magnetism never takes the long way around the compass.
export function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
