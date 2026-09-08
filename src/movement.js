export function movementMode({ touch, forward, moving, aim, crouch, shift }) {
  const running =
    moving && !aim && !crouch && (touch ? forward < -0.15 : shift);
  return { running, speed: crouch ? 2.2 : aim ? 2.7 : running ? 6.7 : 4.1 };
}
