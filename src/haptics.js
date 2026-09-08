/**
 * Short vibrations replace the recoil a controller would give. Patterns stay
 * under a frame's worth of buzz so rapid fire cannot leave the phone humming.
 */
export const HAPTICS = Object.freeze({
  hit: [12],
  head: [10, 24, 16],
  kill: [22, 30, 22],
  hurt: [34],
  skill: [16, 40, 26],
  lock: [8],
});

export function hapticPattern(kind) {
  return HAPTICS[kind] ?? null;
}

export function vibrate(kind, enabled = true, nav = globalThis.navigator) {
  const pattern = hapticPattern(kind);
  if (!enabled || !pattern || typeof nav?.vibrate !== "function") return false;
  try {
    return nav.vibrate(pattern) !== false;
  } catch {
    return false;
  }
}
