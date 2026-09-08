export const WEAPONS = [
  { name: 'AR-07 脈衝步槍', mag: 30, reserve: 150, damage: 29, rate: .105, reload: 1.8, spread: .011, label: 'AUTO · 5.56' },
  { name: 'P-08 特勤手槍', mag: 12, reserve: 72, damage: 43, rate: .27, reload: 1.2, spread: .008, label: 'SEMI · 9 MM' },
];
export const DIFFICULTY = {
  easy: { damage: 7, interval: 1.55, aim: .58, time: 180, count: 4 },
  normal: { damage: 11, interval: 1.1, aim: .7, time: 150, count: 5 },
  hard: { damage: 16, interval: .82, aim: .83, time: 120, count: 6 },
};
export const BOXES = [
  { x: -7, z: 10, w: 5, d: 3, h: 2.6 }, { x: 6, z: 7, w: 3, d: 5, h: 2.5 },
  { x: -14, z: 0, w: 4, d: 7, h: 3.4 }, { x: -5, z: -3, w: 5, d: 3, h: 2.2 },
  { x: 7, z: -5, w: 5, d: 3, h: 2.9 }, { x: 15, z: -12, w: 4, d: 6, h: 3.5 },
  { x: -10, z: -14, w: 5, d: 3, h: 2.7 }, { x: 0, z: -11, w: 3, d: 2, h: 1.15 },
  { x: -20, z: 10, w: 2, d: 11, h: 5 }, { x: 20, z: 5, w: 2, d: 12, h: 5 },
];
export function blocked(x,z,r=.4,boxes=BOXES) {
  return Math.abs(x)>21.3-r || Math.abs(z)>21.3-r || boxes.some(b=>Math.abs(x-b.x)<b.w/2+r && Math.abs(z-b.z)<b.d/2+r);
}
export function moveActor(position,dx,dz,r=.4,boxes=BOXES) {
  // Substeps prevent tunnelling even on slow frames and allow sliding along cover.
  const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18));
  for(let i=0;i<n;i++){if(!blocked(position.x+dx/n,position.z,r,boxes))position.x+=dx/n;if(!blocked(position.x,position.z+dz/n,r,boxes))position.z+=dz/n;}
  return position;
}
export function timeLabel(t){const seconds=Math.ceil(Math.max(0,t));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
export function advanceDefuse(progress,holding,near,dt){return holding&&near?Math.min(5,progress+dt):0;}
export function reloadAmmo(ammo,reserve,capacity){const transfer=Math.min(capacity-ammo,reserve);return {ammo:ammo+transfer,reserve:reserve-transfer};}
