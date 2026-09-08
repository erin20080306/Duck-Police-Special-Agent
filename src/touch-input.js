/**
 * Each control owns one pointer. Ownership is independent of isPrimary: the
 * second and third fingers must still be able to aim and fire while moving.
 */
export function bindTouchInput({
  stick,
  moveZone = stick,
  lookZone,
  fire,
  isPlaying,
  onMove,
  onLook,
  onFire,
  getMovementStyle = () => "strafe",
  onSteer = () => {},
}) {
  const ownedPointers = new Set();
  const controls = [];
  let lookX = 0;
  let lookY = 0;
  let moveX = 0;
  let moveY = 0;
  const floating = moveZone !== stick;
  const restingPosition = floating
    ? {
        left: stick.style.left,
        top: stick.style.top,
        bottom: stick.style.bottom,
      }
    : null;

  function stopMovement() {
    stick.firstElementChild.style.transform = "";
    if (floating) {
      Object.assign(stick.style, restingPosition);
      moveZone.classList.remove("engaged");
    }
    onMove(0, 0);
    onSteer(0);
  }

  function release(control) {
    const pointerId = control.pointerId;
    if (pointerId === null) return false;
    // Clear ownership before releasePointerCapture, which may synchronously
    // dispatch lostpointercapture. A late event cannot release a new finger.
    control.pointerId = null;
    ownedPointers.delete(pointerId);
    try {
      if (control.element.hasPointerCapture(pointerId)) {
        control.element.releasePointerCapture(pointerId);
      }
    } catch {
      // The browser may already have canceled or released this pointer.
    }
    return true;
  }

  function reset() {
    for (const control of controls) release(control);
    stopMovement();
    onFire(false);
  }

  function bind(element, start, move, end) {
    const control = { element, pointerId: null };
    controls.push(control);
    element.addEventListener("pointerdown", (event) => {
      if (
        !isPlaying() ||
        control.pointerId !== null ||
        ownedPointers.has(event.pointerId) ||
        (event.button !== undefined && event.button !== 0)
      )
        return;
      event.preventDefault();
      control.pointerId = event.pointerId;
      ownedPointers.add(event.pointerId);
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // An ended pointer must not leave movement or fire held forever.
        control.pointerId = null;
        ownedPointers.delete(event.pointerId);
        return;
      }
      start(event);
    });
    element.addEventListener("pointermove", (event) => {
      if (event.pointerId !== control.pointerId) return;
      if (!isPlaying()) {
        reset();
        return;
      }
      event.preventDefault();
      move?.(event);
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      element.addEventListener(name, (event) => {
        if (event.pointerId !== control.pointerId) return;
        if (release(control)) end();
      });
    }
  }

  function moveStick(event) {
    const rect = stick.getBoundingClientRect();
    const diameter = Math.min(rect.width, rect.height);
    const radius = Math.max(1, diameter * 0.38);
    const x = (event.clientX - moveX) / radius;
    const z = (event.clientY - moveY) / radius;
    const length = Math.max(1, Math.hypot(x, z));
    const travel = Math.min(28, diameter * 0.28);
    stick.firstElementChild.style.transform = `translate(${(x / length) * travel}px,${(z / length) * travel}px)`;
    if (getMovementStyle() === "swipe") {
      // Steering and forward speed are independent: turning must not slow a
      // full forward swipe. The visual thumb still stays within its circle.
      onMove(0, Math.max(-1, Math.min(1, z)));
      onSteer(Math.max(-1, Math.min(1, x)));
    } else {
      onMove(x / length, z / length);
      onSteer(0);
    }
  }

  bind(
    moveZone,
    (event) => {
      const rect = stick.getBoundingClientRect();
      moveX = floating ? event.clientX : rect.left + rect.width / 2;
      moveY = floating ? event.clientY : rect.top + rect.height / 2;
      if (floating) {
        const zone = moveZone.getBoundingClientRect();
        // Keep the circle visible near screen edges, while the gesture remains
        // anchored to the actual finger position so initial contact never moves.
        const left = Math.max(
          0,
          Math.min(zone.width - rect.width, moveX - zone.left - rect.width / 2),
        );
        const top = Math.max(
          0,
          Math.min(
            zone.height - rect.height,
            moveY - zone.top - rect.height / 2,
          ),
        );
        Object.assign(stick.style, {
          left: `${left}px`,
          top: `${top}px`,
          bottom: "auto",
        });
        moveZone.classList.add("engaged");
      }
      moveStick(event);
    },
    moveStick,
    stopMovement,
  );
  bind(
    lookZone,
    (event) => {
      lookX = event.clientX;
      lookY = event.clientY;
    },
    (event) => {
      const dx = event.clientX - lookX;
      const dy = event.clientY - lookY;
      lookX = event.clientX;
      lookY = event.clientY;
      onLook(dx, dy);
    },
    () => {},
  );
  bind(
    fire,
    () => onFire(true),
    null,
    () => onFire(false),
  );

  return { reset };
}
