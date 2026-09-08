import * as THREE from "three";

// Small, bounded effects. One shared sprite texture, no postprocessing dependency.
export class CombatEffects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const glow = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    glow.addColorStop(0, "rgba(255,255,255,.6)");
    glow.addColorStop(0.35, "rgba(255,255,255,.28)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
    this.texture = new THREE.CanvasTexture(canvas);
    this.shellGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.075, 6);
  }
  add(object, life, update, ownedGeometry = false) {
    if (this.items.length >= 80) this.remove(this.items.shift());
    this.scene.add(object);
    this.items.push({ object, life, total: life, update, ownedGeometry });
  }
  remove(item) {
    this.scene.remove(item.object);
    item.object.material?.dispose();
    if (item.ownedGeometry) item.object.geometry.dispose();
  }
  puff(
    position,
    color = 0xaeb4ac,
    size = 0.25,
    life = 0.7,
    velocity = new THREE.Vector3(0, 0.6, 0),
  ) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.texture,
        color,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    this.add(sprite, life, (dt, t) => {
      sprite.position.addScaledVector(velocity, dt);
      sprite.scale.setScalar(size * (1 + t * 3));
      sprite.material.opacity = (1 - t) * 0.45;
    });
  }
  shot(weapon, camera, low) {
    const origin = weapon.userData.muzzle.getWorldPosition(new THREE.Vector3());
    const flare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.texture,
        color: 0xffe3a1,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 1,
      }),
    );
    flare.position.copy(origin);
    flare.scale.setScalar(low ? 0.42 : 0.65);
    this.add(flare, 0.075, (dt, t) => {
      flare.material.opacity = 1 - t;
      flare.scale.setScalar((low ? 0.42 : 0.65) * (1 + t * 0.5));
    });
    this.puff(origin, 0xc1bca9, 0.13, 0.48);
    if (low && this.items.length > 32) return;
    const shell = new THREE.Mesh(
      this.shellGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xc7a55b,
        metalness: 0.75,
        roughness: 0.35,
      }),
    );
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    shell.position
      .copy(camera.position)
      .addScaledVector(side, 0.25)
      .add(new THREE.Vector3(0, -0.2, 0));
    const velocity = side.multiplyScalar(1.7).add(new THREE.Vector3(0, 1.0, 0));
    this.add(shell, 1.2, (dt, t) => {
      velocity.y -= dt * 5;
      shell.position.addScaledVector(velocity, dt);
      shell.rotation.x += dt * 12;
      shell.rotation.z += dt * 8;
      if (shell.position.y < 0.035) {
        shell.position.y = 0.035;
        velocity.y = 0;
        velocity.x *= 0.5;
        velocity.z *= 0.5;
      }
      shell.scale.setScalar(t > 0.8 ? (1 - t) * 5 : 1);
    });
  }
  impact(position, infected) {
    this.puff(
      position,
      infected ? 0x95b680 : 0xaaa99d,
      infected ? 0.3 : 0.25,
      0.6,
      new THREE.Vector3(0, 0.3, 0),
    );
  }
  pulse(position) {
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.93, 1, 64),
        new THREE.MeshBasicMaterial({
          color: i ? 0xf3dca5 : 0x77eee2,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(position);
      ring.position.y = 0.07 + i * 0.3;
      this.add(
        ring,
        0.9,
        (dt, t) => {
          ring.scale.setScalar(0.5 + t * 10);
          ring.material.opacity = (1 - t) * 0.8;
        },
        true,
      );
    }
    this.puff(
      position.clone().add(new THREE.Vector3(0, 0.6, 0)),
      0x64dcd0,
      2,
      0.8,
    );
  }
  tick(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.remove(item);
        this.items.splice(i, 1);
        continue;
      }
      item.update(dt, 1 - item.life / item.total);
    }
  }
  clear() {
    for (const item of this.items) this.remove(item);
    this.items.length = 0;
  }
}
