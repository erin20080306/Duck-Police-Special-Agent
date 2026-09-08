/**
 * Gyroscope aiming. Phone shooters use it for the fine correction a thumb cannot
 * make: the thumb swings the view, small wrist rotations land the shot. Motion is
 * relative — the first sample only sets a baseline — so the player can hold the
 * phone at any angle, and re-centering never yanks the camera.
 */
const DEG2RAD = Math.PI / 180;

// Heading wraps at 360; a raw subtraction would spin the view a full turn there.
export function wrapDegrees(delta) {
  let value = delta % 360;
  if (value > 180) value -= 360;
  if (value < -180) value += 360;
  return value;
}

/**
 * Screen rotation swaps which device axis the player reads as pitch, so the
 * beta/gamma pair is rotated by the screen angle before it becomes look input.
 * @returns {{yaw:number, pitch:number}} radians to add to the look target.
 */
export function gyroDelta(
  previous,
  current,
  sensitivity = 1,
  screenAngle = 0,
  invertPitch = false,
) {
  if (!previous || !current) return { yaw: 0, pitch: 0 };
  const alpha = wrapDegrees((current.alpha ?? 0) - (previous.alpha ?? 0));
  const beta = wrapDegrees((current.beta ?? 0) - (previous.beta ?? 0));
  const gamma = wrapDegrees((current.gamma ?? 0) - (previous.gamma ?? 0));
  const a = screenAngle * DEG2RAD;
  const cos = Math.cos(a),
    sin = Math.sin(a);
  const pitchAxis = beta * cos + gamma * sin;
  return {
    yaw: alpha * DEG2RAD * sensitivity,
    pitch: pitchAxis * DEG2RAD * sensitivity * (invertPitch ? -1 : 1),
  };
}

// A wrist tremor is not aim. Samples below the floor are dropped so a resting
// phone never drifts the crosshair, which is the usual complaint about gyro.
export function gyroSteady(delta, floor = 0.00035) {
  const magnitude = Math.hypot(delta.yaw, delta.pitch);
  return magnitude < floor ? { yaw: 0, pitch: 0 } : delta;
}

export function gyroSupported(scope = globalThis) {
  return typeof scope.DeviceOrientationEvent !== "undefined";
}

// iOS only grants motion after an explicit tap, so permission is requested from
// a button rather than on load.
export function gyroNeedsPermission(scope = globalThis) {
  return (
    gyroSupported(scope) &&
    typeof scope.DeviceOrientationEvent.requestPermission === "function"
  );
}

export function bindGyro({
  onDelta,
  getSensitivity = () => 1,
  getScreenAngle = () => screen.orientation?.angle ?? 0,
  scope = globalThis,
}) {
  let previous = null,
    running = false;
  function handle(event) {
    if (event.alpha === null && event.beta === null) return;
    const sample = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
    };
    const delta = gyroSteady(
      gyroDelta(previous, sample, getSensitivity(), getScreenAngle()),
    );
    previous = sample;
    if (delta.yaw || delta.pitch) onDelta(delta);
  }
  return {
    supported: gyroSupported(scope),
    needsPermission: gyroNeedsPermission(scope),
    async request() {
      if (!gyroNeedsPermission(scope)) return gyroSupported(scope);
      try {
        return (
          (await scope.DeviceOrientationEvent.requestPermission()) === "granted"
        );
      } catch {
        return false;
      }
    },
    start() {
      if (running || !gyroSupported(scope)) return;
      running = true;
      previous = null;
      scope.addEventListener("deviceorientation", handle);
    },
    stop() {
      if (!running) return;
      running = false;
      previous = null;
      scope.removeEventListener("deviceorientation", handle);
    },
    // A pause or a tab switch must not replay a stale baseline as one huge flick.
    recenter() {
      previous = null;
    },
    get running() {
      return running;
    },
  };
}
