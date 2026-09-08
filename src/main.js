import * as THREE from 'three';
import './style.css';
import {WEAPONS,DIFFICULTY,BOXES,moveActor,timeLabel,advanceDefuse,reloadAmmo} from './rules.js';
import {createWorld,duck,weaponModel,mesh} from './world.js';

const $=id=>document.getElementById(id);
const coarse=matchMedia('(pointer: coarse)').matches;
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(error){$('fatal').hidden=false;$('menu').hidden=true;throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.4:1.8));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=!coarse;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;$('scene').append(renderer.domElement);
const scene=new THREE.Scene();const world=createWorld(scene);
const camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.06,140);camera.rotation.order='YXZ';scene.add(camera);
const gun=weaponModel();camera.add(gun);
const menuScene=new THREE.Scene();menuScene.background=new THREE.Color(0x07131d);menuScene.fog=new THREE.FogExp2(0x07131d,.055);
menuScene.add(new THREE.HemisphereLight(0xbbdaed,0x0c1826,2.7));
const keyLight=new THREE.DirectionalLight(0xffe1af,4);keyLight.position.set(-2,5,6);menuScene.add(keyLight);
const rim=new THREE.PointLight(0x24cfff,75,15);rim.position.set(4,3,-2);menuScene.add(rim);const redRim=new THREE.PointLight(0xff3655,32,12);redRim.position.set(-3,2,-3);menuScene.add(redRim);
const hero=duck();hero.position.set(1.55,.12,0);hero.scale.setScalar(1.32);hero.rotation.y=-.32;menuScene.add(hero);
mesh(menuScene,'cylinder',0x122536,[1.55,-.08,0],[1.8,.25,1.8],.75,.36);
const halo=mesh(menuScene,'torus',0x369dae,[1.55,.057,0],[1.74,1.74,1.74],.4,.3,true);halo.rotation.x=Math.PI/2;
mesh(menuScene,'box',0x0b1722,[0,-.25,0],[100,.2,100],.55,.38);
for(let i=0;i<20;i++){const x=(i-10)*1.2,h=4+(i%4)*1.4;mesh(menuScene,'box',0x132333,[x,h/2-1,-5-(i%3)],[.9,h,.8],.5,.5);for(let j=0;j<5;j++)mesh(menuScene,'box',i%3?0x1d5368:0x813647,[x,j*.8,-4.58-(i%3)],[.62,.03,.03],0,.3,true);}
const menuCamera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,80);menuCamera.position.set(0,2.7,9);menuCamera.lookAt(0,1.95,0);

let mode='menu',round=1,hp=100,time=150,kills=0,totalKills=0,elapsed=0,score=0,defuse=0;
let difficulty=DIFFICULTY.normal,enemies=[],traces=[],weapon=0,inventory=[],reload=0,shotTimer=0,damageFx=0,hitFx=0,noticeTime=0;
let yaw=0,pitch=0,aim=false,firing=false,interact=false,walkTime=0,roundKills=0;
let audioEnabled=true,audioContext=null;
const keys=new Set(),joy={x:0,y:0},ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3();
const player={x:0,z:18},touches={look:null,joy:null},touchStart={x:0,y:0},botSpawn=[[-13,11],[13,9],[-2,2],[13,-3],[-15,-8],[-3,-17],[11,-18],[0,-7]];
function tone(freq,duration=.08,type='square',volume=.025){if(!audioEnabled||!audioContext)return;const t=audioContext.currentTime,o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.3),t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t+duration);}
function initAudio(){if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume().catch(()=>{});}
function notify(text,duration=2.4){$('notice').textContent=text;noticeTime=duration;}
function clearInput(){keys.clear();firing=false;aim=false;interact=false;joy.x=joy.y=0;touches.look=touches.joy=null;$('joystick').firstElementChild.style.transform='';}
function lockMouse(){if(!coarse){try{const promise=renderer.domElement.requestPointerLock();promise?.catch(()=>notify('請點擊遊戲畫面，啟用滑鼠瞄準'));}catch{notify('請點擊遊戲畫面，啟用滑鼠瞄準');}}}
function resetInventory(){inventory=WEAPONS.map(w=>({ammo:w.mag,reserve:w.reserve}));weapon=0;reload=shotTimer=0;gun.scale.z=1;}
function createEnemy(x,z,index){const model=duck({enemy:true});model.position.set(x,0,z);scene.add(model);model.traverse(o=>{if(o.isMesh)o.userData.enemyIndex=index;});return {model,hp:78+round*12,fire:.8+index*.2,phase:Math.random()*6,alert:0,patrol:{x,z},lastSeen:{x:0,z:18},stuck:0};}
function removeTrace(t){scene.remove(t.line);t.line.geometry.dispose();t.line.material.dispose();}
function beginRound(){
  enemies.forEach(e=>scene.remove(e.model));traces.forEach(removeTrace);traces=[];enemies=[];
  player.x=0;player.z=18;yaw=0;pitch=0;hp=100;defuse=0;roundKills=0;elapsed=0;time=difficulty.time;damageFx=hitFx=0;resetInventory();clearInput();
  const count=Math.min(8,difficulty.count+round-1);for(let i=0;i<count;i++)enemies.push(createEnemy(...botSpawn[i],i));
  mode='playing';$('menu').hidden=true;$('overlay').hidden=true;$('hud').hidden=false;document.body.classList.add('playing');
  $('round-label').textContent=`回合 0${round} / 03`;$('objective-title').textContent='前往 B 區，拆除干擾裝置';$('objective-detail').textContent='壓制守衛，善用掩體接近目標';notify(`回合 ${round} · 夜港封鎖線`,3);tone(640,.18,'sine',.06);lockMouse();updateHUD();
}
function startGame(){initAudio();difficulty=DIFFICULTY[$('difficulty').value];round=1;kills=totalKills=score=0;beginRound();}
function showOverlay(kicker,title,description,action){$('result-kicker').textContent=kicker;$('result-title').textContent=title;$('result-description').textContent=description;$('continue').innerHTML=`${action} <span>↗</span>`;$('overlay').hidden=false;}
function pause(){if(mode!=='playing')return;mode='paused';clearInput();document.exitPointerLock?.();$('result-stats').innerHTML='';showOverlay('TACTICAL PAUSE','行動暫停','深呼吸。下一步，善用掩體接近目標。','繼續行動');}
function endRound(won,reason){if(mode!=='playing')return;mode=won?'won':'lost';clearInput();document.exitPointerLock?.();totalKills+=roundKills;if(won)score+=Math.round(time*10)+hp*5+roundKills*150;const final=won&&round===3;$('result-stats').innerHTML=`<div>本回合擊倒<strong>${roundKills}</strong></div><div>任務用時<strong>${timeLabel(elapsed)}</strong></div><div>行動積分<strong>${score}</strong></div>`;showOverlay(final?'OPERATION COMPLETE':won?'SECTOR SECURED':'MISSION FAILED',final?'夜港，恢復平靜。':won?'裝置已解除':'行動未完成',reason,final?'再次出勤':won?'進入下一回合':'重試本回合');tone(won?880:130,.4,'sine',.07);}
function goMenu(){mode='menu';clearInput();document.exitPointerLock?.();$('overlay').hidden=true;$('hud').hidden=true;$('menu').hidden=false;document.body.classList.remove('playing');}
function updateHUD(){$('hp').textContent=Math.ceil(hp);$('health-fill').style.width=`${hp}%`;$('health-fill').style.background=hp<30?'#ff6a75':'#67e5ef';$('time').textContent=timeLabel(time);$('time').parentElement.classList.toggle('urgent',time<30);$('enemy-count').textContent=`守衛 ${enemies.filter(e=>e.hp>0).length}`;const w=WEAPONS[weapon],inv=inventory[weapon];if(inv){$('ammo').textContent=inv.ammo;$('reserve').textContent=` / ${inv.reserve}`;}$('weapon-name').textContent=w.name;$('reload-label').textContent=reload>0?`換彈中 ${reload.toFixed(1)}s`:w.label;}
function switchWeapon(index){if(mode!=='playing'||index===weapon)return;weapon=index;reload=0;shotTimer=.25;gun.scale.z=index===1?.72:1;tone(320,.08,'triangle');updateHUD();}
function startReload(){if(mode!=='playing'||reload>0)return;const w=WEAPONS[weapon],inv=inventory[weapon];if(inv.ammo===w.mag)return;if(inv.reserve<=0){notify('備用彈藥不足，按 1 / 2 切換武器');return;}reload=w.reload;tone(210,.12,'triangle');}
function line(a,b,color){const geometry=new THREE.BufferGeometry().setFromPoints([a.clone(),b.clone()]);const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:.85});const trace=new THREE.Line(geometry,material);scene.add(trace);traces.push({line:trace,life:.075});}
function shoot(){
  const inv=inventory[weapon],w=WEAPONS[weapon];if(reload>0||shotTimer>0||interact)return;if(inv.ammo<=0){startReload();shotTimer=.25;return;}
  inv.ammo--;shotTimer=w.rate;gun.userData.flash.visible=true;tone(weapon?160:95,.085,'sawtooth',.035);
  camera.updateMatrixWorld();camera.getWorldPosition(origin);camera.getWorldDirection(direction);const spread=w.spread*(aim?.28:1);direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.normalize();
  ray.set(origin,direction);ray.far=90;const targetMeshes=enemies.filter(e=>e.hp>0).map(e=>e.model);const hits=ray.intersectObjects([...world.obstacles,...targetMeshes],true);const end=hits.length?hits[0].point:origin.clone().addScaledVector(direction,70);
  const muzzle=new THREE.Vector3(.24,-.21,-1.2).applyMatrix4(camera.matrixWorld);line(muzzle,end,0x81edff);
  if(hits.length&&hits[0].object.userData.enemyIndex!==undefined){const e=enemies[hits[0].object.userData.enemyIndex],head=hits[0].point.y>1.93;e.hp-=w.damage*(head?2.1:1);e.alert=8;e.lastSeen={...player};hitFx=.16;tone(head?1200:740,.045,'sine',.03);if(e.hp<=0){e.model.rotation.z=Math.PI/2;e.model.position.y=.45;roundKills++;kills++;notify(head?'精準命中 · 守衛已壓制':'守衛已壓制',1.3);if(enemies.every(bot=>bot.hp<=0)){inventory.forEach((i,n)=>i.reserve=Math.max(i.reserve,WEAPONS[n].mag));$('objective-detail').textContent='區域安全，前往 B 區按住 E 拆除';notify('區域已清空 · 完成 B 區拆除即可過關',3);}}}
  pitch=Math.max(-1.35,pitch-(aim?.004:.008));updateHUD();
}
function canSee(from,to){const dir=to.clone().sub(from);const distance=dir.length();ray.set(from,dir.normalize());ray.far=distance;return ray.intersectObjects(world.obstacles,false).length===0;}
function updateBots(dt){
  const eye=new THREE.Vector3(player.x,2.22,player.z);
  for(const e of enemies){if(e.hp<=0)continue;e.phase+=dt;e.fire-=dt;const p=e.model.position,dist=Math.hypot(player.x-p.x,player.z-p.z),head=new THREE.Vector3(p.x,2.3,p.z);
    const visible=dist<29&&canSee(head,eye);if(visible){e.alert=5;e.lastSeen={...player};}else e.alert=Math.max(0,e.alert-dt);
    let tx,tz,speed;
    if(e.alert>0){tx=e.lastSeen.x;tz=e.lastSeen.z;speed=visible?(dist>10?1.35:0):1.7;}else{tx=e.patrol.x+Math.sin(e.phase*.4)*3;tz=e.patrol.z+Math.cos(e.phase*.4)*2;speed=.8;}
    const dx=tx-p.x,dz=tz-p.z,len=Math.hypot(dx,dz)||1;const ox=p.x,oz=p.z;
    if(len>1){moveActor(p,dx/len*speed*dt,dz/len*speed*dt,.55);if(visible&&dist<15)moveActor(p,Math.cos(e.phase)*dt*.6,Math.sin(e.phase)*dt*.6,.55);}
    if(speed>0&&Math.hypot(p.x-ox,p.z-oz)<dt*.2){e.stuck+=dt;moveActor(p,Math.cos(e.phase)*dt*1.5,Math.sin(e.phase)*dt*1.5,.55);}else e.stuck=0;
    e.model.rotation.y=Math.atan2(dx,dz);e.model.position.y=Math.sin(e.phase*6)*.025;
    if(visible&&e.fire<=0){e.fire=difficulty.interval+Math.random()*.45;const miss=Math.random()>difficulty.aim;const target=eye.clone();if(miss)target.x+=1.3;line(head.clone().add(new THREE.Vector3(0,-.7,.3)),target,0xff6679);tone(65,.055,'sawtooth',.012);if(!miss){hp=Math.max(0,hp-difficulty.damage);damageFx=.55;if(hp<=0){endRound(false,'特工已撤離。嘗試短點射、精準瞄準，並利用貨櫃阻斷守衛視線。');return;}}}
  }
}
function drawRadar(){const ctx=$('radar').getContext('2d'),s=3.25;ctx.clearRect(0,0,160,160);ctx.save();ctx.translate(80,80);ctx.strokeStyle='#526e7f55';ctx.beginPath();ctx.arc(0,0,55,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#405568';for(const b of BOXES)ctx.fillRect((b.x-b.w/2)*s,(b.z-b.d/2)*s,b.w*s,b.d*s);ctx.fillStyle='#e8c777';ctx.fillRect(7*s-4,-17*s-4,8,8);for(const e of enemies){if(e.hp<=0||e.alert<=0)continue;ctx.fillStyle='#fa6e7c';ctx.beginPath();ctx.arc(e.model.position.x*s,e.model.position.z*s,3,0,Math.PI*2);ctx.fill();}ctx.translate(player.x*s,player.z*s);ctx.rotate(-yaw);ctx.fillStyle='#8df2ed';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-4,4);ctx.lineTo(4,4);ctx.closePath();ctx.fill();ctx.restore();}
function update(dt){
  elapsed+=dt;time=Math.max(0,time-dt);shotTimer=Math.max(0,shotTimer-dt);
  if(reload>0){reload=Math.max(0,reload-dt);if(reload===0){Object.assign(inventory[weapon],reloadAmmo(inventory[weapon].ammo,inventory[weapon].reserve,WEAPONS[weapon].mag));tone(430,.06,'triangle');}}
  let mx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joy.x;
  let mz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+joy.y;
  const norm=Math.max(1,Math.hypot(mx,mz));mx/=norm;mz/=norm;const moving=Math.hypot(mx,mz)>.1;
  const speed=interact?0:(keys.has('ShiftLeft')&&!aim?7:aim?2.8:4.8);moveActor(player,(mx*Math.cos(yaw)+mz*Math.sin(yaw))*speed*dt,(-mx*Math.sin(yaw)+mz*Math.cos(yaw))*speed*dt);
  if(moving)walkTime+=dt*speed*1.8;camera.position.set(player.x,2.25+(moving?Math.sin(walkTime)*.035:0),player.z);camera.rotation.set(pitch,yaw,0);camera.fov=THREE.MathUtils.lerp(camera.fov,aim?53:76,Math.min(1,dt*12));camera.updateProjectionMatrix();
  gun.position.set(aim?-.18:0,(moving?Math.sin(walkTime)*.012:0)-(reload>0?.16:0),shotTimer>WEAPONS[weapon].rate*.5?.05:0);gun.rotation.x=reload>0?-.4:0;gun.rotation.z=reload>0?-.35:0;gun.userData.flash.visible=shotTimer>WEAPONS[weapon].rate-.035;
  if(firing)shoot();updateBots(dt);if(mode!=='playing')return;
  const near=Math.hypot(player.x-7,player.z+17)<3.2;$('interaction').hidden=!near;$('interaction').querySelector('b').textContent=coarse?'按住「拆除」直到進度完成':'按住 E 拆除裝置';defuse=advanceDefuse(defuse,interact,near,dt);$('defuse-progress').style.width=`${defuse/5*100}%`;world.beacon.intensity=9+Math.sin(elapsed*5)*4;
  if(defuse>=5){endRound(true,round===3?'三個回合全部完成。干擾訊號已解除，夜港居民可以安心回家。':'干擾訊號已解除。下一回合將增加守衛，生命值與彈藥會重新補滿。');return;}
  if(time<=0){endRound(false,'干擾裝置啟動，任務已中止。下一次提早接近 B 區，保留至少五秒拆除時間。');return;}
  damageFx=Math.max(0,damageFx-dt);hitFx=Math.max(0,hitFx-dt);noticeTime=Math.max(0,noticeTime-dt);$('damage').style.opacity=damageFx;$('hitmarker').style.opacity=hitFx>0?1:0;if(!noticeTime)$('notice').textContent='';
  for(let i=traces.length-1;i>=0;i--){traces[i].life-=dt;if(traces[i].life<=0){removeTrace(traces[i]);traces.splice(i,1);}}
  updateHUD();drawRadar();
}
$('start').addEventListener('click',startGame);$('pause').addEventListener('click',pause);$('back-menu').addEventListener('click',goMenu);
$('continue').addEventListener('click',()=>{initAudio();if(mode==='paused'){mode='playing';$('overlay').hidden=true;clearInput();lockMouse();}else if(mode==='won'){if(round===3){round=1;score=totalKills=0;}else round++;beginRound();}else if(mode==='lost')beginRound();});
$('guide').addEventListener('click',()=>$('help').showModal());$('close-help').addEventListener('click',()=>$('help').close());
$('sound').addEventListener('click',()=>{audioEnabled=!audioEnabled;$('sound').textContent=`音效：${audioEnabled?'開啟':'關閉'}`;$('sound').setAttribute('aria-pressed',String(audioEnabled));});
document.addEventListener('keydown',e=>{if(mode!=='playing')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='KeyR')startReload();if(e.code==='Digit1')switchWeapon(0);if(e.code==='Digit2')switchWeapon(1);if(e.code==='KeyE')interact=true;if(e.code==='KeyP'||e.code==='Escape')pause();});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyE')interact=false;});
document.addEventListener('mousemove',e=>{if(mode==='playing'&&document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.002;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.002,-1.35,1.35);}});
renderer.domElement.addEventListener('mousedown',e=>{if(mode!=='playing'||coarse)return;if(document.pointerLockElement!==renderer.domElement){lockMouse();return;}if(e.button===0)firing=true;if(e.button===2)aim=true;});
document.addEventListener('mouseup',e=>{if(e.button===0)firing=false;if(e.button===2)aim=false;});renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockchange',()=>{if(!coarse&&!document.pointerLockElement&&mode==='playing')pause();});
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
const joystick=$('joystick');joystick.addEventListener('pointerdown',e=>{if(mode!=='playing')return;e.preventDefault();joystick.setPointerCapture(e.pointerId);touches.joy=e.pointerId;const rect=joystick.getBoundingClientRect();touchStart.x=rect.left+rect.width/2;touchStart.y=rect.top+rect.height/2;});
joystick.addEventListener('pointermove',e=>{if(e.pointerId!==touches.joy)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y,len=Math.max(38,Math.hypot(dx,dy));joy.x=dx/len;joy.y=dy/len;joystick.firstElementChild.style.transform=`translate(${joy.x*32}px,${joy.y*32}px)`;});
function resetJoy(){touches.joy=null;joy.x=joy.y=0;joystick.firstElementChild.style.transform='';}joystick.addEventListener('pointerup',resetJoy);joystick.addEventListener('pointercancel',resetJoy);joystick.addEventListener('lostpointercapture',resetJoy);
renderer.domElement.addEventListener('pointerdown',e=>{if(!coarse||mode!=='playing')return;touches.look={id:e.pointerId,x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{const t=touches.look;if(!t||t.id!==e.pointerId||mode!=='playing')return;yaw-=(e.clientX-t.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-t.y)*.004,-1.35,1.35);t.x=e.clientX;t.y=e.clientY;});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(ev,e=>{if(touches.look?.id===e.pointerId)touches.look=null;});
function holdButton(id,on,off){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();if(mode!=='playing')return;b.setPointerCapture(e.pointerId);on();});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,off);}
holdButton('touch-fire',()=>firing=true,()=>firing=false);holdButton('touch-defuse',()=>interact=true,()=>interact=false);$('touch-reload').addEventListener('click',startReload);$('touch-switch').addEventListener('click',()=>switchWeapon(1-weapon));
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=menuCamera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();menuCamera.updateProjectionMatrix();if(innerWidth<760){hero.position.x=.8;menuCamera.position.set(0,3,11.5);menuCamera.lookAt(0,2,0);}else{hero.position.x=1.55;menuCamera.position.set(0,2.7,9);menuCamera.lookAt(0,1.95,0);}}window.addEventListener('resize',resize);resize();
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('fatal').hidden=false;$('fatal').innerHTML='<h2>3D 顯示已中斷</h2><p>請重新整理頁面以恢復遊戲。</p>';});
let last=performance.now();renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.05);last=now;if(mode==='menu'){hero.rotation.y=-.32+Math.sin(now*.00025)*.14;hero.position.y=.12+Math.sin(now*.0014)*.018;renderer.render(menuScene,menuCamera);}else{if(mode==='playing')update(dt);const rain=world.rain.geometry.attributes.position;for(let i=1;i<rain.array.length;i+=3){rain.array[i]-=dt*10;if(rain.array[i]<0)rain.array[i]=22;}rain.needsUpdate=true;renderer.render(scene,camera);}});

