import "./style.css";
import "./combat.css";
import { touchLookDelta, smoothLook, steeringRate } from "./look.js";
import {
  assistLevel,
  aimAssist,
  adsSnapPull,
  shortestAngle,
} from "./aim-assist.js";
import { bindGyro } from "./gyro.js";
import { vibrate } from "./haptics.js";
import { movementMode } from "./movement.js";
import { bindTouchInput } from "./touch-input.js";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createDuck, createWeapon } from "./models.js";
import { createZombie } from "./zombies.js";
import {
  ZOMBIES,
  PULSE,
  zombieType,
  pulseReaches,
  incomingDamage,
  needsZombieRoute,
} from "./combat.js";
import { CombatEffects } from "./combat-effects.js";
import { createLevel, createSky, loadMaterials } from "./world.js";
import {
  GUNS,
  DIFFICULTY,
  BOUNDS,
  blocked,
  moveActor,
  lineBlocked,
  reloadAmmo,
  formatTime,
  waveSize,
  routeTo,
  sectorFor,
} from "./rules.js";
const $ = (id) => document.getElementById(id),
  canvas = $("scene"),
  touch =
    (import.meta.env.DEV &&
      new URLSearchParams(location.search).has("touch")) ||
    matchMedia("(any-pointer:coarse)").matches ||
    navigator.maxTouchPoints > 0,
  reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
if (touch) document.body.classList.add("touch-device");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !touch,
    powerPreference: "high-performance",
  });
} catch (e) {
  $("fatal").hidden = false;
  throw e;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(
    72,
    innerWidth / innerHeight,
    0.055,
    450,
  );
camera.rotation.order = "YXZ";
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xb9c2c3, 0x373c35, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xe7dec5, 2.7);
sun.position.set(-17, 32, -30);
sun.castShadow = true;
// The shadow frustum follows the player rather than covering the whole map: at
// the enlarged size a fixed box would either miss the outskirts or waste most of
// its resolution on ground nobody is standing near.
Object.assign(sun.shadow.camera, {
  left: -34,
  right: 34,
  top: 34,
  bottom: -34,
  near: 1,
  far: 110,
});
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.035;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
scene.add(sun.target);
if (!touch) {
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
}
scene.environmentIntensity = 0.3;
// Mobile never allocates the desktop half-float postprocessing framebuffers.
let composer;
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: reduced ? 0 : 0.013 },
  },
  vertexShader:
    "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader: `uniform sampler2D tDiffuse;uniform float time;uniform float grain;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,.78);vec2 p=vUv-.5;float vig=1.-smoothstep(.20,.75,length(p))*.26;c*=vig;float n=fract(sin(dot(vUv*917.,vec2(12.9898,78.233))+time)*43758.5453)-.5;c+=n*grain;gl_FragColor=vec4(c,1.);}`,
});
function ensureComposer() {
  if (composer) return;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  composer.addPass(grade);
}
const combatFX = new CombatEffects(scene);
let skillCooldown = 0,
  shieldRemaining = 0,
  skillLabel = "",
  resolutionScale = 1;
const falling = [];
const lookGoal = { yaw: 0, pitch: 0 };
// Aim assist reads last frame's screen positions; one frame of latency is well
// under a thumb's reaction time and keeps the work off the input handlers.
const assist = { friction: 1, target: null, distance: 1 };
const assistPoint = new THREE.Vector3();
let adsSnapRemaining = 0,
  lookInput = 0;
let steerInput = 0;
let haptics = true;
let low = touch,
  level,
  sky,
  map = "foundry",
  state = "loading",
  time = 0,
  elapsed = 0,
  wave = 0,
  kills = 0,
  score = 0,
  health = 100,
  timeLeft = 300,
  transition = 0,
  noticeTimer = 0,
  feedTimer = 0,
  hitTimer = 0,
  damage = 0,
  shots = 0,
  hits = 0;
let yaw = 0,
  pitch = 0,
  ads = 0,
  aim = false,
  crouch = false,
  sprinting = false,
  fireHeld = false,
  semiReady = true,
  gunIndex = 0,
  reloadRemaining = 0,
  reloadTotal = 1,
  shotCooldown = 0,
  recoil = 0,
  lookSwayX = 0,
  lookSwayY = 0,
  footstepTimer = 0,
  flashTimer = 0;
const player = new THREE.Vector3(),
  keys = new Set(),
  joystick = { x: 0, z: 0 },
  ammoState = GUNS.map((g) => ({ ammo: g.capacity, reserve: g.reserve })),
  actors = [],
  effects = [],
  ray = new THREE.Raycaster();
const guns = GUNS.map((_, i) => createWeapon(i)),
  weaponRig = new THREE.Group();
weaponRig.scale.setScalar(0.74);
camera.add(weaponRig);
for (const g of guns) {
  weaponRig.add(g);
  g.visible = false;
  g.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.depthTest = false;
      o.material.depthWrite = false;
      o.renderOrder = 20;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
}
weaponRig.visible = false;
const hero = createDuck({ low: touch });
scene.add(hero);
const muzzleLight = new THREE.PointLight(0xffc584, 0, 5, 2);
camera.add(muzzleLight);
muzzleLight.position.set(0.1, -0.1, -1.2);
// Sound is synthesized locally: no external audio requests or playback before interaction.
let audio,
  master,
  windGain,
  muted = false;
function initAudio() {
  if (audio) {
    audio.resume();
    return;
  }
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    master = audio.createGain();
    master.gain.value = muted ? 0 : 0.65;
    master.connect(audio.destination);
    const buffer = audio.createBuffer(
        1,
        audio.sampleRate * 2,
        audio.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() - 0.5) * 0.35;
    const wind = audio.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 280;
    windGain = audio.createGain();
    windGain.gain.value = 0.07;
    wind.connect(filter).connect(windGain).connect(master);
    wind.start();
  } catch {}
}
function sound(type) {
  if (!audio || muted) return;
  const now = audio.currentTime;
  if (type === "shot") {
    const length = 0.15,
      b = audio.createBuffer(
        1,
        Math.floor(audio.sampleRate * length),
        audio.sampleRate,
      ),
      d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = audio.createBufferSource();
    s.buffer = b;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = gunIndex ? 3100 : 2100;
    const g = audio.createGain();
    g.gain.value = 0.48;
    s.connect(filter).connect(g).connect(master);
    s.start();
    tone(gunIndex ? 130 : 85, 0.12, 0.2, "triangle");
  } else if (type === "hit") tone(1150, 0.035, 0.1, "sine");
  else if (type === "reload") tone(340, 0.05, 0.08, "square");
  else if (type === "step") tone(65, 0.035, 0.07, "triangle");
  else if (type === "hurt") tone(80, 0.13, 0.1, "sine");
  else if (type === "ready") tone(700, 0.1, 0.06, "sine");
}
function tone(freq, duration, volume, type) {
  const o = audio.createOscillator(),
    g = audio.createGain(),
    now = audio.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  o.frequency.exponentialRampToValueAtTime(freq * 0.4, now + duration);
  g.gain.setValueAtTime(volume, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  o.connect(g).connect(master);
  o.start();
  o.stop(now + duration);
}
function notify(message, duration = 2) {
  $("notice").textContent = message;
  noticeTimer = duration;
}
function disposeActor(model) {
  scene.remove(model);
  model.traverse((o) => {
    if (o.geometry?.userData.owned) o.geometry.dispose();
  });
}
const MAPS = {
  foundry: {
    fog: 0x737976,
    density: 0.021,
    hemi: 0xc4cac5,
    hemiIntensity: 1.6,
    sun: 0xede1c7,
    sunIntensity: 2.7,
    environment: 0.3,
    exposure: 1.04,
    zone: "IRON DISTRICT",
    weather: "陰天 / 工業廢墟",
    brief:
      "穿越廢棄工業街區，在掩體間阻擋喪屍群，躲避狙擊紅線。完成三波清剿，確保街區安全。",
  },
  temple: {
    fog: 0x192a32,
    density: 0.029,
    hemi: 0x8ba7b6,
    hemiIntensity: 1.3,
    sun: 0x91afbd,
    sunIntensity: 1.6,
    environment: 0.17,
    exposure: 1.15,
    zone: "SHADOW SHRINE",
    weather: "雨夜 / 近距離交戰",
    brief:
      "沿石燈籠穿越神社庭院，在雨幕中追蹤感染者，使用脈衝護盾突圍。完成三波清剿，確保通道安全。",
  },
  harbor: {
    // Dark containers and wet asphalt reflect far less than the shrine's pale
    // stone, so this map needs more ambient and moonlight to stay readable.
    fog: 0x172833,
    density: 0.023,
    hemi: 0x93b3c6,
    hemiIntensity: 1.78,
    sun: 0x9dc0d4,
    sunIntensity: 2.05,
    environment: 0.24,
    exposure: 1.28,
    zone: "NEON HARBOR",
    weather: "暴雨夜 / 貨櫃迷宮",
    brief:
      "暴雨中封鎖貨櫃碼頭：利用貨櫃夾道與吊掛區的高低差移動，注意龍門吊下的長廊視線。完成三波清剿，守住泊位。",
  },
};
function setMap(value) {
  clearCombat();
  map = value;
  actors.splice(0).forEach((a) => disposeActor(a.model));
  effects.splice(0).forEach((e) => {
    scene.remove(e.obj);
    e.obj.geometry?.dispose();
    e.obj.material?.dispose();
  });
  if (level) {
    scene.remove(level.root);
    level.dispose();
  }
  if (sky) {
    scene.remove(sky);
    sky.geometry.dispose();
    sky.material.dispose();
  }
  low =
    $("quality").value === "low" || ($("quality").value === "auto" && touch);
  level = createLevel(map, low);
  scene.add(level.root);
  sky = createSky(scene, map);
  const look = MAPS[map] ?? MAPS.foundry;
  scene.fog = new THREE.FogExp2(look.fog, look.density);
  hemi.color.set(look.hemi);
  hemi.intensity = look.hemiIntensity;
  sun.color.set(look.sun);
  sun.intensity = look.sunIntensity;
  scene.environmentIntensity = look.environment;
  renderer.toneMappingExposure = look.exposure;
  applyQuality();
  $("brief").textContent = look.brief;
  $("mapWeather").textContent = look.weather;
  $("zoneLabel").textContent = look.zone;
  document.querySelectorAll("[data-map]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.map === map);
    b.setAttribute("aria-pressed", String(b.dataset.map === map));
  });
}
function applyQuality() {
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, low ? 1 : 1.6) * resolutionScale,
  );
  renderer.setSize(innerWidth, innerHeight);
  if (!low) ensureComposer();
  composer?.setPixelRatio(renderer.getPixelRatio());
  composer?.setSize(low ? 1 : innerWidth, low ? 1 : innerHeight);
  renderer.shadowMap.enabled = !low;
  grade.uniforms.grain.value = reduced || low ? 0 : 0.011;
}
function hud() {
  const a = ammoState[gunIndex];
  $("health").textContent = Math.max(0, Math.ceil(health));
  $("healthFill").style.width = Math.max(0, health) + "%";
  $("healthFill").style.background = health < 30 ? "#bb6651" : "#c8d0b4";
  $("ammo").textContent = String(a.ammo).padStart(2, "0");
  $("reserve").textContent = "/ " + a.reserve;
  $("weaponName").textContent = GUNS[gunIndex].name;
  $("reloadLabel").textContent = reloadRemaining
    ? "換彈中"
    : gunIndex
      ? "SEMI / 9 MM"
      : "AUTO / 5.56";
  $("wave").textContent = String(wave).padStart(2, "0") + " / 03";
  $("killScore").textContent = String(kills).padStart(2, "0");
  $("score").textContent = String(score).padStart(4, "0");
  $("posture").textContent = crouch ? "蹲姿" : sprinting ? "疾跑" : "站立";
}
function resetInput() {
  touchInput.reset();
  // A resumed session must not replay the phone's old orientation as one flick.
  gyro.recenter();
  assist.friction = 1;
  assist.target = null;
  adsSnapRemaining = lookInput = 0;
  $("crosshair").classList.remove("locked");
  steerInput = 0;
  lookGoal.yaw = yaw;
  lookGoal.pitch = pitch;
  keys.clear();
  joystick.x = joystick.z = 0;
  fireHeld = false;
  semiReady = true;
  aim = false;
  sprinting = false;
  lookId = null;
  $("stick").firstElementChild.style.transform = "";
  $("touchAim").setAttribute("aria-pressed", "false");
}
// Aiming down sights eases onto a target already inside the assist bubble, the
// short pull mobile shooters use so the first ADS frame is not a fresh search.
function setAim(value) {
  if (aim === value) return;
  aim = value;
  if (value) adsSnapRemaining = 0.18;
  $("touchAim").setAttribute("aria-pressed", String(aim));
}
function pointerLock() {
  if (touch) return;
  try {
    const p = canvas.requestPointerLock?.();
    p?.catch(() => notify("按住滑鼠拖曳轉向；點擊畫面可再次鎖定游標", 4));
  } catch {
    notify("按住滑鼠拖曳轉向", 3);
  }
}
function start() {
  if (!level) return;
  initAudio();
  resetInput();
  actors.splice(0).forEach((a) => disposeActor(a.model));
  player.set(level.spawn.x, 0, level.spawn.z);
  yaw = lookGoal.yaw = 0;
  pitch = lookGoal.pitch = 0;
  health = 100;
  clearCombat();
  skillCooldown = shieldRemaining = 0;
  skillLabel = "";
  updateSkillHUD();
  wave = kills = score = shots = hits = 0;
  elapsed = 0;
  timeLeft = DIFFICULTY[$("difficulty").value].time;
  reloadRemaining = shotCooldown = recoil = ads = transition = 0;
  gunIndex = Number($("primaryWeapon").value);
  ammoState.forEach((a, i) => {
    a.ammo = GUNS[i].capacity;
    a.reserve = GUNS[i].reserve;
  });
  crouch = false;
  $("touchCrouch").setAttribute("aria-pressed", "false");
  hero.visible = false;
  weaponRig.visible = true;
  guns.forEach((g, i) => (g.visible = i === gunIndex));
  state = "playing";
  $("lobby").hidden = true;
  $("hud").hidden = false;
  $("touch").hidden = !touch;
  $("overlay").hidden = true;
  document.body.classList.add("playing");
  if (windGain) windGain.gain.value = 0.07;
  spawnWave();
  pointerLock();
  // Keep the chosen portrait/landscape orientation; fullscreen is an explicit menu action.
}
function spawnWave() {
  wave++;
  transition = 0;
  const count = waveSize(wave, $("difficulty").value);
  for (let i = 0; i < count; i++) {
    const candidates = level.spawnPoints.filter(
      (p) =>
        Math.hypot(p.x - player.x, p.z - player.z) > 13 &&
        !blocked(p.x, p.z, level.boxes, 0.5),
    );
    let pos =
      candidates[(i + (wave - 1) * 4) % candidates.length] ||
      level.spawnPoints[0];
    let x = pos.x,
      z = pos.z;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (
        !actors.some(
          (a) =>
            Math.hypot(a.model.position.x - x, a.model.position.z - z) < 1.2,
        ) &&
        !blocked(x, z, level.boxes, 0.5)
      )
        break;
      x = pos.x + (Math.random() - 0.5) * 3;
      z = pos.z + (Math.random() - 0.5) * 3;
    }
    const type = zombieType(i, wave);
    const model = createZombie({ type, low });
    model.position.set(x, 0, z);
    scene.add(model);
    const actor = {
      model,
      type,
      stun: 0,
      windup: 0,
      laserClock: 0,
      hp: DIFFICULTY[$("difficulty").value].hp * ZOMBIES[type].health,
      cool: 1 + Math.random(),
      path: [],
      repath: Math.random(),
      strafe: Math.random() > 0.5 ? 1 : -1,
      phase: Math.random() * 6,
    };
    model.traverse((o) => {
      if (o.isMesh) o.userData.actor = actor;
    });
    actors.push(actor);
  }
  if (wave > 1) {
    health = Math.min(100, health + 20);
    ammoState.forEach((a, i) => (a.reserve += GUNS[i].capacity));
    hud();
  }
  notify(`第 ${wave} 波 / 清剿 ${count} 隻喪屍`, 3);
  hud();
}
function reload() {
  const a = ammoState[gunIndex];
  if (
    state !== "playing" ||
    reloadRemaining ||
    a.ammo === GUNS[gunIndex].capacity
  )
    return;
  if (!a.reserve) {
    notify("此武器備用彈藥耗盡，切換另一把武器");
    return;
  }
  reloadTotal = GUNS[gunIndex].reload;
  reloadRemaining = reloadTotal;
  aim = false;
  sound("reload");
  hud();
}
function switchGun(index) {
  if (state !== "playing" || index === gunIndex) return;
  gunIndex = index;
  reloadRemaining = 0;
  shotCooldown = 0.3;
  recoil = 0.08;
  guns.forEach((g, i) => (g.visible = i === index));
  sound("reload");
  hud();
}
function tracer(from, to, color, lifetime = 0.065) {
  const geom = new THREE.BufferGeometry().setFromPoints([from, to]),
    obj = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
  scene.add(obj);
  effects.push({ obj, life: lifetime, total: lifetime });
}
function impact(point, hit) {
  const count = low ? 4 : 8,
    arr = new Float32Array(count * 3),
    vel = [];
  for (let i = 0; i < count; i++) {
    arr.set(point.toArray(), i * 3);
    vel.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2,
        (Math.random() - 0.5) * 3,
      ),
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  const obj = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: hit ? 0xe8d6aa : 0xbdb9a5,
      size: 0.04,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  scene.add(obj);
  effects.push({ obj, life: 0.28, total: 0.28, vel });
}
function aimHit(x = 0, y = 0) {
  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  ray.setFromCamera(new THREE.Vector2(x, y), camera);
  ray.far = 100;
  const meshes = [...level.rayTargets];
  for (const actor of actors)
    actor.model.traverse((o) => {
      if (o.isMesh && o.visible && !o.isInstancedMesh) meshes.push(o);
    });
  return ray.intersectObjects(meshes, false)[0];
}
// Aim assist runs on phones only: a mouse already has the precision it lends.
function updateAimAssist(dt) {
  const previous = assist.target;
  assist.friction = 1;
  assist.target = null;
  assist.distance = 1;
  const tuning = assistLevel(touch ? $("aimAssist").value : "off");
  if (state === "playing" && tuning.outer > 0) {
    const aspect = Math.max(0.35, camera.aspect);
    camera.updateMatrixWorld(true);
    let best = null;
    for (const actor of actors) {
      const body = actor.model.position;
      assistPoint.set(
        body.x,
        body.y + actor.model.userData.headHeight * 0.82,
        body.z,
      );
      assistPoint.project(camera);
      if (assistPoint.z > 1) continue;
      const distance = Math.hypot(assistPoint.x * aspect, assistPoint.y);
      if (!(distance < tuning.outer)) continue;
      if (best && distance >= best.distance) continue;
      // Cover blocks assist exactly as it blocks bullets.
      if (lineBlocked(player.x, player.z, body.x, body.z, level.boxes, 1.1))
        continue;
      best = { actor, distance };
    }
    if (best) {
      const turnSpeed = Math.min(1, lookInput / 0.022);
      const { friction, pull } = aimAssist({
        distance: best.distance,
        level: tuning,
        turnSpeed,
        dt,
      });
      assist.friction = friction;
      assist.target = best.actor;
      assist.distance = best.distance;
      const gain = Math.max(
        pull,
        adsSnapPull(best.distance, tuning, dt, adsSnapRemaining),
      );
      if (gain > 0) {
        const body = best.actor.model.position;
        assistPoint
          .set(
            body.x,
            body.y + best.actor.model.userData.headHeight * 0.82,
            body.z,
          )
          .sub(camera.position);
        const length = Math.max(0.001, assistPoint.length());
        lookGoal.yaw +=
          shortestAngle(
            lookGoal.yaw,
            Math.atan2(-assistPoint.x, -assistPoint.z),
          ) * gain;
        lookGoal.pitch = THREE.MathUtils.clamp(
          lookGoal.pitch +
            (Math.asin(THREE.MathUtils.clamp(assistPoint.y / length, -1, 1)) -
              lookGoal.pitch) *
              gain,
          -1.15,
          1.15,
        );
      }
    }
  }
  lookInput = 0;
  adsSnapRemaining = Math.max(0, adsSnapRemaining - dt);
  if (!!assist.target !== !!previous)
    $("crosshair").classList.toggle("locked", !!assist.target);
}
let assistedClock = 0;
function assistedTrigger(dt) {
  if (
    !touch ||
    $("controlMode").value !== "assist" ||
    fireHeld ||
    reloadRemaining
  )
    return;
  assistedClock -= dt;
  if (assistedClock > 0 || shotCooldown > 0) return;
  assistedClock = 0.09;
  // Only fire at an unobstructed enemy under the crosshair, never through scenery.
  if (aimHit()?.object.userData.actor) {
    semiReady = true;
    shoot();
  }
}
function shoot() {
  if (state !== "playing" || reloadRemaining || shotCooldown > 0) return;
  const weapon = GUNS[gunIndex],
    a = ammoState[gunIndex];
  if (!weapon.automatic && !semiReady) return;
  if (a.ammo <= 0) {
    reload();
    semiReady = false;
    return;
  }
  a.ammo--;
  shots++;
  semiReady = false;
  shotCooldown = weapon.delay;
  recoil = Math.min(0.1, recoil + weapon.recoil);
  flashTimer = 0.045;
  sound("shot");
  camera.updateMatrixWorld(true);
  const hit = aimHit(
    (Math.random() - 0.5) * (1 - ads) * 0.012,
    (Math.random() - 0.5) * (1 - ads) * 0.012,
  );
  const end = hit?.point || ray.ray.at(80, new THREE.Vector3());
  const gun = guns[gunIndex];
  const origin = gun.userData.muzzle.getWorldPosition(new THREE.Vector3());
  tracer(origin, end, 0xffd8a0);
  combatFX.shot(gun, camera, low);
  if (hit) {
    const actor = hit.object.userData.actor;
    impact(hit.point, !!actor);
    combatFX.impact(hit.point, !!actor);
    if (actor) {
      hits++;
      const head =
        hit.point.y - actor.model.position.y > actor.model.userData.headHeight;
      actor.hp -= weapon.damage * (head ? 1.8 : 1);
      hitTimer = 0.13;
      $("hitmarker").style.color = head ? "#d6b579" : "#eee6cb";
      sound("hit");
      actor.stun = Math.max(actor.stun, 0.18);
      vibrate(head ? "head" : "hit", haptics);
      if (actor.hp <= 0) killActor(actor, head);
    }
  }
  hud();
}
function pause() {
  if (state !== "playing") return;
  state = "paused";
  resetInput();
  document.exitPointerLock?.();
  $("touch").hidden = true;
  $("overlayTag").textContent = "TACTICAL PAUSE";
  $("overlayTitle").textContent = "行動暫停";
  $("overlayCopy").textContent = "準備好後，繼續你的任務。";
  $("stats").innerHTML = "";
  $("continue").textContent = "繼續行動 →";
  $("overlay").hidden = false;
  if (windGain) windGain.gain.value = 0;
}
function resume() {
  state = "playing";
  $("overlay").hidden = true;
  $("touch").hidden = !touch;
  if (windGain) windGain.gain.value = 0.07;
  pointerLock();
}
function finish(win) {
  state = win ? "won" : "lost";
  resetInput();
  document.exitPointerLock?.();
  $("touch").hidden = true;
  $("overlayTag").textContent = win ? "OPERATION COMPLETE" : "OPERATION FAILED";
  $("overlayTitle").textContent = win ? "街區安全，任務完成。" : "行動失敗";
  $("overlayCopy").textContent = win
    ? "全數目標已清除。特工，返回總部。"
    : health <= 0
      ? "你已失去戰鬥能力。利用掩體、蹲姿與瞄準，重新規劃路線。"
      : "行動時間已結束。整裝後再次出發。";
  $("stats").replaceChildren();
  for (const [label, value] of [
    ["行動分數", score],
    ["清除目標", kills],
    ["命中率", (shots ? Math.round((hits / shots) * 100) : 0) + "%"],
    ["經過時間", formatTime(elapsed)],
  ]) {
    const d = document.createElement("div"),
      s = document.createElement("span"),
      b = document.createElement("b");
    s.textContent = label;
    b.textContent = value;
    d.append(s, b);
    $("stats").append(d);
  }
  $("continue").textContent = "重新行動 →";
  $("overlay").hidden = false;
  if (windGain) windGain.gain.value = 0;
}
function returnLobby() {
  clearCombat();
  shieldRemaining = 0;
  document.body.classList.remove("shield-active");
  state = "lobby";
  resetInput();
  document.exitPointerLock?.();
  $("overlay").hidden = true;
  $("hud").hidden = true;
  $("touch").hidden = true;
  $("lobby").hidden = false;
  document.body.classList.remove("playing");
  weaponRig.visible = false;
  hero.visible = true;
  actors.splice(0).forEach((a) => disposeActor(a.model));
  if (windGain) windGain.gain.value = 0;
}
function clearCombat() {
  combatFX.clear();
  for (const dead of falling.splice(0)) disposeActor(dead.model);
  for (const effect of effects.splice(0)) {
    scene.remove(effect.obj);
    effect.obj.geometry.dispose();
    effect.obj.material.dispose();
  }
  flashTimer = damage = hitTimer = 0;
}
function killActor(actor, head = false, skill = false) {
  const index = actors.indexOf(actor);
  if (index < 0) return;
  actors.splice(index, 1);
  kills++;
  score += head ? 150 : 100;
  $("killfeed").textContent =
    `DUCK 007  ›  ${ZOMBIES[actor.type].name}${skill ? " ／ 脈衝" : head ? " ／ 精準命中" : ""}`;
  feedTimer = 3.5;
  // Keep the silhouette briefly so a kill has readable weight rather than popping away.
  falling.push({ model: actor.model, life: 1.2 });
  vibrate("kill", haptics);
  if (!actors.length) transition = 3;
}
function updateSkillHUD() {
  const label =
    shieldRemaining > 0
      ? `護盾 ${Math.ceil(shieldRemaining)}s · 減傷 75%`
      : skillCooldown > 0
        ? `脈衝護盾 · ${Math.ceil(skillCooldown)}s`
        : `${touch ? "" : "Q · "}脈衝護盾 就緒`;
  if (label !== skillLabel) {
    $("skillStatus").textContent = label;
    $("touchSkill").textContent =
      shieldRemaining > 0
        ? "護盾中"
        : skillCooldown > 0
          ? `${Math.ceil(skillCooldown)}s`
          : "脈衝";
    $("touchSkill").disabled = skillCooldown > 0;
    skillLabel = label;
  }
  document.body.classList.toggle("shield-active", shieldRemaining > 0);
}
function activateSkill() {
  if (state !== "playing" || skillCooldown > 0) return;
  skillCooldown = PULSE.cooldown;
  shieldRemaining = PULSE.shield;
  combatFX.pulse(player);
  vibrate("skill", haptics);
  if (audio && !muted) {
    tone(170, 0.5, 0.16, "sine");
    tone(760, 0.3, 0.08, "triangle");
  }
  let affected = 0;
  for (const actor of [...actors]) {
    if (!pulseReaches(player, actor.model.position, level.boxes)) continue;
    actor.hp -= PULSE.damage;
    actor.stun = PULSE.stun;
    actor.windup = 0;
    const delta = actor.model.position.clone().sub(player);
    const length = Math.max(0.1, Math.hypot(delta.x, delta.z));
    moveActor(
      actor.model.position,
      (delta.x / length) * 1.6,
      (delta.z / length) * 1.6,
      level.boxes,
      0.43,
    );
    combatFX.impact(
      actor.model.position.clone().add(new THREE.Vector3(0, 1, 0)),
      true,
    );
    affected++;
    if (actor.hp <= 0) killActor(actor, false, true);
  }
  notify(
    `脈衝護盾啟動 · 4 秒減傷${affected ? ` ／ 震退 ${affected} 隻` : ""}`,
    2,
  );
  updateSkillHUD();
  hud();
}
function hurt(amount) {
  health -= incomingDamage(amount, shieldRemaining);
  damage = shieldRemaining > 0 ? 0.18 : 0.7;
  sound("hurt");
  vibrate("hurt", haptics);
  hud();
  if (health <= 0) finish(false);
}
function tickActors(dt) {
  const diff = DIFFICULTY[$("difficulty").value];
  for (const a of actors) {
    const p = a.model.position,
      config = ZOMBIES[a.type];
    const dist = Math.max(0.01, Math.hypot(player.x - p.x, player.z - p.z));
    const targetHeight = crouch ? 1.08 : 1.72;
    const visible = !lineBlocked(
      p.x,
      p.z,
      player.x,
      player.z,
      level.boxes,
      Math.min(1.6, targetHeight),
    );
    a.model.rotation.y = Math.atan2(p.x - player.x, p.z - player.z);
    a.stun = Math.max(0, a.stun - dt);
    if (a.stun > 0) {
      a.model.rotation.z = Math.sin(time * 19) * 0.035;
      a.windup = 0;
      continue;
    }
    a.model.rotation.z = 0;
    a.repath -= dt;
    a.cool -= dt;
    const sniper = a.type === "sniper";
    let dx = 0,
      dz = 0;
    const speed = config.speed + wave * 0.08;
    const navigationBlocked = needsZombieRoute(p, player, level.boxes);
    if (!visible || navigationBlocked) {
      if (a.repath <= 0) {
        a.path = routeTo(p, player, level.boxes);
        a.repath = 1.2;
      }
      const goal = a.path[0];
      if (goal) {
        const d = Math.hypot(goal.x - p.x, goal.z - p.z);
        if (d < 0.35) a.path.shift();
        else {
          dx = ((goal.x - p.x) / d) * speed * dt;
          dz = ((goal.z - p.z) / d) * speed * dt;
        }
      }
    } else if (dist > (sniper ? 21 : config.range * 0.88)) {
      dx = ((player.x - p.x) / dist) * speed * dt;
      dz = ((player.z - p.z) / dist) * speed * dt;
    } else if (sniper && dist < 9 && !a.windup) {
      dx = ((p.x - player.x) / dist) * speed * dt;
      dz = ((p.z - player.z) / dist) * speed * dt;
    }
    const oldX = p.x,
      oldZ = p.z;
    if (!a.windup) moveActor(p, dx, dz, level.boxes, 0.43);
    if (
      actors.some(
        (b) =>
          b !== a &&
          Math.hypot(p.x - b.model.position.x, p.z - b.model.position.z) < 0.6,
      )
    ) {
      p.x = oldX;
      p.z = oldZ;
    }
    const moving = Math.hypot(p.x - oldX, p.z - oldZ) > 0.001;
    a.model.userData.legs.forEach(
      (leg, i) =>
        (leg.rotation.x = moving
          ? Math.sin(time * (sniper ? 7 : config.speed * 4) + i * Math.PI) *
            0.36
          : 0),
    );
    if (!sniper)
      a.model.userData.arms.forEach(
        (arm, i) =>
          (arm.rotation.x =
            Math.sin(time * 5 + i) * 0.07 + (a.windup ? 0.25 : 0)),
      );
    if (!visible || dist > config.range || (!sniper && navigationBlocked)) {
      a.windup = 0;
      continue;
    }
    if (a.windup > 0) {
      a.windup -= dt;
      if (sniper) {
        a.laserClock -= dt;
        if (a.laserClock <= 0) {
          const from = a.model.userData.gun.userData.muzzle.getWorldPosition(
            new THREE.Vector3(),
          );
          tracer(
            from,
            player.clone().add(new THREE.Vector3(0, targetHeight - 0.15, 0)),
            0xff4e45,
            0.11,
          );
          a.laserClock = 0.09;
        }
      }
      if (a.windup <= 0) {
        a.windup = 0;
        a.cool = diff.interval + (sniper ? 0.9 : 0.25);
        if (sniper) {
          const from = a.model.userData.gun.userData.muzzle.getWorldPosition(
            new THREE.Vector3(),
          );
          tracer(
            from,
            player.clone().add(new THREE.Vector3(0, targetHeight, 0)),
            0xffcba3,
            0.14,
          );
          combatFX.puff(from, 0xf9c98c, 0.3, 0.25);
          const movingPlayer =
            Math.hypot(joystick.x, joystick.z) > 0.1 ||
            ["KeyW", "KeyA", "KeyS", "KeyD"].some((k) => keys.has(k));
          if (Math.random() < diff.accuracy * (movingPlayer ? 0.48 : 1))
            hurt(diff.damage * config.damage);
        } else hurt(diff.damage * config.damage);
        if (state !== "playing") return;
      }
    } else if (a.cool <= 0) {
      a.windup = sniper ? 1.25 : 0.5;
      if (sniper) notify("狙擊紅線！移動或躲入掩體", 1.3);
    }
  }
}
function renderRadar() {
  const sector = level.sectors?.[sectorFor(player.x, player.z)];
  if (sector) $("zoneLabel").textContent = sector.name;
  const c = $("radar"),
    ctx = c.getContext("2d"),
    size = c.width,
    r = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#172021b8";
  ctx.fillRect(0, 0, size, size);
  ctx.translate(r, r);
  ctx.rotate(yaw);
  const s = 4;
  ctx.fillStyle = "#8a908377";
  for (const o of level.boxes)
    ctx.fillRect(
      (o.x - player.x - o.w) * s,
      (o.z - player.z - o.d) * s,
      o.w * 2 * s,
      o.d * 2 * s,
    );
  ctx.strokeStyle = "#ffffff12";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 55, 0, Math.PI * 2);
  ctx.stroke();
  for (const a of actors) {
    const x = (a.model.position.x - player.x) * s,
      z = (a.model.position.z - player.z) * s;
    if (
      Math.hypot(x, z) > r ||
      lineBlocked(
        player.x,
        player.z,
        a.model.position.x,
        a.model.position.z,
        level.boxes,
        1.5,
      )
    )
      continue;
    ctx.fillStyle = "#cc7763";
    ctx.beginPath();
    ctx.arc(x, z, 3, 0, 7);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "#e9dfc0";
  ctx.beginPath();
  ctx.moveTo(r, r - 7);
  ctx.lineTo(r - 5, r + 5);
  ctx.lineTo(r + 5, r + 5);
  ctx.closePath();
  ctx.fill();
}
let radarClock = 0;
function tick(dt) {
  time += dt;
  syncGyro();
  grade.uniforms.time.value = time;
  if (level) level.tick(dt, time);
  if (state === "playing") {
    elapsed += dt;
    if (touch) {
      lookGoal.yaw +=
        steeringRate(steerInput, Number($("sensitivity").value)) * dt;
      yaw = smoothLook(yaw, lookGoal.yaw, dt);
      pitch = smoothLook(pitch, lookGoal.pitch, dt);
    }
    skillCooldown = Math.max(0, skillCooldown - dt);
    shieldRemaining = Math.max(0, shieldRemaining - dt);
    updateSkillHUD();
    timeLeft = Math.max(0, timeLeft - dt);
    $("timer").textContent = formatTime(timeLeft);
    if (!timeLeft) {
      finish(false);
      return;
    }
    shotCooldown = Math.max(0, shotCooldown - dt);
    if (reloadRemaining > 0) {
      const before = reloadRemaining;
      reloadRemaining = Math.max(0, reloadRemaining - dt);
      if (before > reloadTotal * 0.3 && reloadRemaining <= reloadTotal * 0.3)
        sound("reload");
      if (!reloadRemaining) {
        Object.assign(
          ammoState[gunIndex],
          reloadAmmo(
            ammoState[gunIndex].ammo,
            ammoState[gunIndex].reserve,
            GUNS[gunIndex].capacity,
          ),
        );
        sound("ready");
        hud();
      }
    }
    let x =
        (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + joystick.x,
      z = (keys.has("KeyS") ? 1 : 0) - (keys.has("KeyW") ? 1 : 0) + joystick.z;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const { running: run, speed } = movementMode({
      touch,
      forward: z,
      moving: len > 0.1,
      aim,
      crouch,
      shift: keys.has("ShiftLeft") || keys.has("ShiftRight"),
    });
    if (sprinting !== run) {
      sprinting = run;
      hud();
    }
    moveActor(
      player,
      (x * Math.cos(yaw) + z * Math.sin(yaw)) * speed * dt,
      (-x * Math.sin(yaw) + z * Math.cos(yaw)) * speed * dt,
      level.boxes,
      0.38,
    );
    if (len > 0.15) {
      footstepTimer -= dt;
      if (footstepTimer <= 0) {
        sound("step");
        footstepTimer = run ? 0.29 : crouch ? 0.59 : 0.43;
      }
    }
    ads = THREE.MathUtils.damp(
      ads,
      aim && !reloadRemaining && !run ? 1 : 0,
      13,
      dt,
    );
    recoil = THREE.MathUtils.damp(recoil, 0, 11, dt);
    const bob = reduced
      ? 0
      : Math.sin(time * (run ? 15 : 10)) * Math.min(len, 1) * 0.018 * (1 - ads);
    if (!low) {
      // Snapped to whole units so the moving frustum does not shimmer.
      const fx = Math.round(player.x),
        fz = Math.round(player.z);
      sun.position.set(fx - 17, 32, fz - 30);
      sun.target.position.set(fx, 0, fz);
      sun.target.updateMatrixWorld();
    }
    camera.position.set(player.x, (crouch ? 1.13 : 1.77) + bob, player.z);
    camera.rotation.set(pitch + recoil * 0.42, yaw, 0);
    camera.fov = THREE.MathUtils.damp(
      camera.fov,
      ads > 0 ? 72 - ads * 25 : run ? 78 : 72,
      11,
      dt,
    );
    camera.updateProjectionMatrix();
    const gun = guns[gunIndex],
      sight = gun.userData.sightHeight * weaponRig.scale.y;
    weaponRig.position.set(
      THREE.MathUtils.lerp(camera.aspect < 1 ? 0.12 : 0.24, 0, ads) +
        lookSwayX * 0.008,
      THREE.MathUtils.lerp(-0.26, -sight, ads) + bob * 0.25,
      -0.48 + recoil * 0.8,
    );
    weaponRig.rotation.set(
      -recoil * 1.5 + (run ? -0.23 : 0),
      lookSwayX * 0.012,
      (run ? -0.22 : 0) + lookSwayY * 0.004,
    );
    if (reloadRemaining) {
      const p = 1 - reloadRemaining / reloadTotal,
        e = Math.sin(p * Math.PI);
      weaponRig.position.y -= e * 0.22;
      weaponRig.rotation.z -= e * 0.4;
      weaponRig.rotation.x -= e * 0.5;
      if (gun.userData.mag)
        gun.userData.mag.position.y =
          -0.255 - Math.sin(Math.min(1, p / 0.65) * Math.PI) * 0.22;
      if (gun.userData.leftHand) gun.userData.leftHand.position.y = -e * 0.13;
    } else {
      if (gun.userData.mag) gun.userData.mag.position.y = -0.255;
      if (gun.userData.leftHand) gun.userData.leftHand.position.y = 0;
    }
    lookSwayX = THREE.MathUtils.damp(lookSwayX, 0, 9, dt);
    lookSwayY = THREE.MathUtils.damp(lookSwayY, 0, 9, dt);
    $("crosshair").style.opacity = String((1 - ads) * 0.7);
    $("crosshair").style.transform =
      `translate(-50%,-50%) scale(${1 + recoil * 12 + (len > 0.1 ? 0.1 : 0)})`;
    if (fireHeld) shoot();
    updateAimAssist(dt);
    assistedTrigger(dt);
    tickActors(dt);
    radarClock -= dt;
    if (radarClock <= 0) {
      renderRadar();
      radarClock = 0.1;
    }
    $("compass").textContent = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"][
      ((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8
    ];
    if (transition > 0 && state === "playing") {
      transition -= dt;
      if (transition <= 0) {
        if (wave === 3) finish(true);
        else spawnWave();
      }
    }
  } else if (state === "lobby" || state === "loading") {
    camera.position.set(0, 2.35, 30);
    camera.lookAt(0, 1.35, 12);
    camera.fov = 49;
    camera.updateProjectionMatrix();
    hero.position.set(2.35, 0, 23);
    hero.scale.setScalar(1.0);
    hero.rotation.y =
      Math.PI + 0.12 + (reduced ? 0 : Math.sin(time * 0.18) * 0.06);
  }
  const fxDt = state === "paused" ? 0 : dt;
  combatFX.tick(fxDt);
  for (let i = falling.length - 1; i >= 0; i--) {
    const dead = falling[i];
    dead.life -= fxDt;
    const progress = 1 - dead.life / 1.2;
    dead.model.rotation.x = -Math.min(1, progress * 2) * 1.45;
    dead.model.position.y = -Math.max(0, progress - 0.6) * 1.2;
    dead.model.scale.setScalar(
      Math.max(0.01, 1 - Math.max(0, progress - 0.7) * 2),
    );
    if (dead.life <= 0) {
      disposeActor(dead.model);
      falling.splice(i, 1);
    }
  }
  damage = Math.max(0, damage - dt);
  $("damage").style.opacity = damage;
  hitTimer = Math.max(0, hitTimer - dt);
  $("hitmarker").style.opacity = hitTimer > 0 ? 1 : 0;
  flashTimer = Math.max(0, flashTimer - dt);
  guns.forEach((g, i) => {
    g.userData.flash.visible =
      state === "playing" && i === gunIndex && flashTimer > 0;
  });
  muzzleLight.intensity = flashTimer > 0 ? 3 : 0;
  noticeTimer = Math.max(0, noticeTimer - dt);
  if (!noticeTimer) $("notice").textContent = "";
  feedTimer = Math.max(0, feedTimer - dt);
  if (!feedTimer) $("killfeed").textContent = "";
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    e.obj.material.opacity = Math.max(0, e.life / e.total);
    if (e.vel) {
      const p = e.obj.geometry.attributes.position;
      for (let j = 0; j < e.vel.length; j++) {
        e.vel[j].y -= dt * 4;
        p.array[j * 3] += e.vel[j].x * dt;
        p.array[j * 3 + 1] += e.vel[j].y * dt;
        p.array[j * 3 + 2] += e.vel[j].z * dt;
      }
      p.needsUpdate = true;
    }
    if (e.life <= 0) {
      scene.remove(e.obj);
      e.obj.geometry.dispose();
      e.obj.material.dispose();
      effects.splice(i, 1);
    }
  }
  if (level) {
    if (low) renderer.render(scene, camera);
    else composer.render();
  }
}
// Controls use pointer capture so releasing outside a button cannot leave fire or movement stuck.
let lookId = null,
  lookX = 0,
  lookY = 0;
function turn(dx, dy) {
  const sense = Number($("sensitivity").value);
  if (touch) {
    const shortEdge = Math.min(innerWidth, innerHeight);
    const delta = touchLookDelta(dx, dy, shortEdge, sense, aim, {
      adsScale: Number($("adsSensitivity").value),
    });
    // Rotational friction: the same swipe covers less angle over a target, so a
    // thumb can settle on it. It scales input the player gave, never adds any.
    lookGoal.yaw += delta.yaw * assist.friction;
    lookGoal.pitch = THREE.MathUtils.clamp(
      lookGoal.pitch + delta.pitch * assist.friction,
      -1.15,
      1.15,
    );
    lookInput += Math.hypot(dx, dy) / Math.max(320, shortEdge);
  } else {
    yaw -= dx * 0.002 * sense * (aim ? 0.62 : 1);
    pitch = THREE.MathUtils.clamp(
      pitch - dy * 0.0018 * sense * (aim ? 0.62 : 1),
      -1.15,
      1.15,
    );
    lookGoal.yaw = yaw;
    lookGoal.pitch = pitch;
  }
  lookSwayX = THREE.MathUtils.clamp(dx, -3, 3);
  lookSwayY = THREE.MathUtils.clamp(dy, -3, 3);
}
canvas.addEventListener("pointerdown", (e) => {
  if (state !== "playing") return;
  if (touch) return;
  if (document.pointerLockElement !== canvas) {
    lookId = e.pointerId;
    lookX = e.clientX;
    lookY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    if (!touch) pointerLock();
  }
  if (!touch) {
    if (e.button === 0) {
      fireHeld = true;
      semiReady = true;
      shoot();
    }
    if (e.button === 2) setAim(true);
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (state !== "playing") return;
  if (!touch && document.pointerLockElement === canvas) {
    turn(e.movementX, e.movementY);
    return;
  }
  if (e.pointerId === lookId) {
    turn(e.clientX - lookX, e.clientY - lookY);
    lookX = e.clientX;
    lookY = e.clientY;
  }
});
function releaseLook(e) {
  if (e.pointerId === lookId) lookId = null;
  if (!touch) {
    if (e.button === 0) fireHeld = false;
    if (e.button === 2) setAim(false);
  }
}
addEventListener("pointerup", releaseLook);
canvas.addEventListener("pointercancel", () => {
  lookId = null;
  fireHeld = false;
  setAim(false);
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("lostpointercapture", releaseLook);
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && state === "playing" && !touch) pause();
});
addEventListener("keydown", (e) => {
  if (state !== "playing") return;
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "KeyR") reload();
  if (e.code === "KeyQ") activateSkill();
  if (e.code === "KeyC") {
    crouch = !crouch;
    hud();
  }
  if (e.code === "Digit1") switchGun(0);
  if (e.code === "Digit2") switchGun(1);
  if (e.code === "Escape" || e.code === "KeyP") pause();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
const touchInput = bindTouchInput({
  stick: $("stick"),
  moveZone: $("moveZone"),
  getMovementStyle: () => $("movementStyle").value,
  onSteer: (value) => {
    steerInput = value;
  },
  lookZone: $("lookZone"),
  fire: $("touchFire"),
  isPlaying: () => state === "playing",
  onMove: (x, z) => {
    joystick.x = x;
    joystick.z = z;
  },
  onLook: turn,
  onFire: (held) => {
    fireHeld = held;
    if (held) {
      semiReady = true;
      shoot();
    }
  },
  // A still tap on the aim area is a shot, so the aiming thumb never has to
  // travel to the fire button for a single precise round.
  onLookTap: () => {
    if (state !== "playing") return;
    semiReady = true;
    shoot();
  },
  now: () => performance.now(),
});
$("touchReload").onclick = reload;
$("touchSkill").onclick = activateSkill;
// Aim settings persist per device: a tuned phone setup should survive a reload.
function bindSetting(id, apply = () => {}) {
  const el = $(id),
    key = "duck-" + id;
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      if (el.tagName === "SELECT") {
        if ([...el.options].some((o) => o.value === stored)) el.value = stored;
      } else if (Number.isFinite(Number(stored))) el.value = stored;
    }
  } catch {
    // Private browsing can refuse storage; defaults still apply.
  }
  const save = () => {
    try {
      localStorage.setItem(key, el.value);
    } catch {
      /* ignore */
    }
    apply();
  };
  el.addEventListener("change", save);
  el.addEventListener("input", apply);
  apply();
  return el;
}
/**
 * Gyroscope aiming. The thumb swings the view, the wrist lands the shot. It
 * ships off: iOS gates motion behind a tap, and unrequested camera drift is
 * worse than no gyro. "Only while aiming" is the gentlest way in.
 */
const gyro = bindGyro({
  onDelta: ({ yaw: deltaYaw, pitch: deltaPitch }) => {
    if (state !== "playing") return;
    if ($("gyroMode").value === "ads" && !aim) return;
    lookGoal.yaw += deltaYaw * assist.friction;
    lookGoal.pitch = THREE.MathUtils.clamp(
      lookGoal.pitch + deltaPitch * assist.friction,
      -1.15,
      1.15,
    );
    lookInput += Math.hypot(deltaYaw, deltaPitch) / 0.05;
  },
  getSensitivity: () => Number($("gyroSensitivity").value) * (aim ? 0.72 : 1),
});
let gyroGranted = !gyro.needsPermission;
function gyroHint() {
  $("gyroStatus").textContent = !gyro.supported
    ? "此裝置未提供陀螺儀"
    : $("gyroMode").value === "off"
      ? "關閉時僅使用滑動與搖桿轉向"
      : gyroGranted
        ? "傾斜手機做細部修正，滑動仍可大幅轉向"
        : "需要授權動作感測器";
  $("gyroPermission").hidden =
    !gyro.needsPermission || gyroGranted || $("gyroMode").value === "off";
}
$("gyroPermission").onclick = async () => {
  gyroGranted = await gyro.request();
  if (!gyroGranted) $("gyroMode").value = "off";
  gyroHint();
};
function syncGyro() {
  const wanted =
    touch &&
    state === "playing" &&
    gyroGranted &&
    gyro.supported &&
    $("gyroMode").value !== "off";
  if (wanted === gyro.running) return;
  if (wanted) gyro.start();
  else gyro.stop();
}
bindSetting("aimAssist");
bindSetting("gyroMode", gyroHint);
bindSetting("gyroSensitivity");
bindSetting("adsSensitivity");
$("haptics").onclick = () => {
  haptics = !haptics;
  $("haptics").textContent = "震動回饋：" + (haptics ? "開啟" : "關閉");
  $("haptics").setAttribute("aria-pressed", String(haptics));
  try {
    localStorage.setItem("duck-haptics", String(haptics));
  } catch {
    /* ignore */
  }
  if (haptics) vibrate("hit", true);
};
try {
  haptics = localStorage.getItem("duck-haptics") !== "false";
} catch {
  /* ignore */
}
$("haptics").textContent = "震動回饋：" + (haptics ? "開啟" : "關閉");
$("haptics").setAttribute("aria-pressed", String(haptics));
gyroHint();
const controlMode = $("controlMode");
try {
  controlMode.value =
    localStorage.getItem("duck-control-mode") === "manual"
      ? "manual"
      : "assist";
} catch {}
function updateControlMode() {
  try {
    localStorage.setItem("duck-control-mode", controlMode.value);
  } catch {}
  $("lookZone").firstElementChild.textContent =
    controlMode.value === "assist"
      ? "滑動瞄準 · 對準敵人自動開火"
      : "滑動轉向 · 按鍵開火";
}
controlMode.addEventListener("change", updateControlMode);
updateControlMode();
const movementStyle = $("movementStyle");
try {
  movementStyle.value =
    localStorage.getItem("duck-movement-style") === "strafe"
      ? "strafe"
      : "swipe";
} catch {}
function updateMovementStyle() {
  touchInput.reset();
  try {
    localStorage.setItem("duck-movement-style", movementStyle.value);
  } catch {}
  $("moveHint").replaceChildren();
  $("moveHint").append(
    "↑ 上滑快跑",
    document.createElement("br"),
    movementStyle.value === "swipe" ? "↓ 後退 · ↔ 轉向" : "↓ 後退 · ↔ 平移",
  );
}
movementStyle.addEventListener("change", updateMovementStyle);
updateMovementStyle();
$("touchSwitch").onclick = () => switchGun(1 - gunIndex);
$("touchAim").onclick = () => setAim(!aim);
$("touchCrouch").onclick = () => {
  crouch = !crouch;
  $("touchCrouch").setAttribute("aria-pressed", String(crouch));
  hud();
};
async function fullscreen() {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen?.();
    if (touch && innerWidth > innerHeight)
      await screen.orientation?.lock?.("landscape");
  } catch {
    /* iOS may require manual rotation; the HUD provides the hint. */
  }
}
$("fullscreen").onclick = fullscreen;
$("start").onclick = start;
$("pauseButton").onclick = pause;
$("continue").onclick = () => (state === "paused" ? resume() : start());
$("return").onclick = returnLobby;
$("sound").onclick = () => {
  muted = !muted;
  $("sound").textContent = "音效：" + (muted ? "關閉" : "開啟");
  $("sound").setAttribute("aria-pressed", String(!muted));
  if (master) master.gain.value = muted ? 0 : 0.65;
};
for (const [tab, panel] of [
  ["deployTab", "deployPanel"],
  ["settingsTab", "settingsPanel"],
])
  $(tab).onclick = () => {
    for (const [t, p] of [
      ["deployTab", "deployPanel"],
      ["settingsTab", "settingsPanel"],
    ]) {
      $(t).classList.toggle("active", t === tab);
      $(p).hidden = p !== panel;
    }
  };
document.querySelectorAll("[data-map]").forEach(
  (b) =>
    (b.onclick = () => {
      if (state === "lobby" && b.dataset.map !== map) setMap(b.dataset.map);
    }),
);
$("quality").onchange = () => {
  if (state === "lobby") setMap(map);
};
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyQuality();
});
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  pause();
  $("fatal").hidden = false;
  $("fatalMessage").textContent =
    "繪圖連線中斷。請關閉其他分頁後重新載入，並使用效能畫質。";
});
canvas.addEventListener("webglcontextrestored", () => {
  $("fatalMessage").textContent = "繪圖連線已恢復，請重新載入遊戲。";
});
let last = performance.now(),
  performanceWindow = 0,
  performanceFrames = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  const realDt = (now - last) / 1000;
  last = now;
  if (touch && state === "playing" && !document.hidden) {
    performanceWindow += realDt;
    performanceFrames++;
    if (performanceWindow >= 4) {
      if (
        performanceFrames / performanceWindow < 29 &&
        resolutionScale > 0.65
      ) {
        resolutionScale = Math.max(0.65, resolutionScale - 0.15);
        applyQuality();
      }
      performanceWindow = performanceFrames = 0;
    }
  }
  try {
    tick(dt);
  } catch (e) {
    console.error(e);
    pause();
    $("fatal").hidden = false;
    $("fatalMessage").textContent = "遊戲執行發生錯誤，請重新載入。";
    return;
  }
  requestAnimationFrame(frame);
}
try {
  await loadMaterials();
  setMap("foundry");
  state = "lobby";
  $("start").disabled = false;
  $("start").firstElementChild.textContent = "開始行動";
  $("loading").textContent = touch
    ? "直向 / 橫向皆可 · 雙區觸控"
    : "WASD 移動 · 滑鼠瞄準 · Esc 暫停";
  requestAnimationFrame(frame);
} catch (e) {
  console.error(e);
  $("fatal").hidden = false;
  $("fatalMessage").textContent =
    "場景初始化失敗。請重新載入，或嘗試最新版 Safari / Chrome。";
}

if (import.meta.env.DEV) {
  window.__duckDebug = {
    // Development only: checking a map this size on foot is impractical.
    teleport: (x, z, heading = yaw) => {
      player.set(x, 0, z);
      yaw = lookGoal.yaw = heading;
      pitch = lookGoal.pitch = 0;
      return { x: player.x, z: player.z };
    },
    snapshot: () => ({
      state,
      player: player.toArray(),
      yaw,
      pitch,
      lookGoal: { ...lookGoal },
      assist: {
        friction: assist.friction,
        distance: assist.distance,
        locked: !!assist.target,
      },
      map,
      health,
      wave,
      skillCooldown,
      shieldRemaining,
      ammo: ammoState[gunIndex].ammo,
      actors: actors.map((a) => ({
        type: a.type,
        hp: a.hp,
        position: a.model.position.toArray(),
      })),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      touch,
      low,
    }),
  };
}
