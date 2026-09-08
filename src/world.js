import * as THREE from 'three';
import {BOXES} from './rules.js';
import {applyPlushHands} from './character.js';
const geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(1,24,18),cylinder:new THREE.CylinderGeometry(1,1,1,24),torus:new THREE.TorusGeometry(1,.08,8,32)};
const materials=new Map();
export function mat(color,metal=0,rough=.6,emissive=false){const key=[color,metal,rough,emissive].join();if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough,emissive:emissive?color:0,emissiveIntensity:emissive?2:0}));return materials.get(key);}
export function mesh(parent,type,color,pos,scale,metal=0,rough=.6,emissive=false){const m=new THREE.Mesh(geo[type],mat(color,metal,rough,emissive));m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function label(parent,text,pos,width,color='#77e8ff',bg='#0b202d'){
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(5,5,502,118);ctx.font='bold 58px sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,68);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshBasicMaterial({map:texture}));m.position.set(...pos);parent.add(m);return m;
}
export {createDuck as duck} from './character.js';
export function weaponModel(){const g=new THREE.Group();
  mesh(g,'box',0x14232e,[.24,-.23,-.63],[.16,.18,.65],.65,.32);mesh(g,'box',0x283b4a,[.24,-.14,-.65],[.12,.05,.63],.65,.3);mesh(g,'box',0x080f17,[.24,-.21,-1.09],[.065,.065,.36],.7,.3);
  mesh(g,'box',0x0d1822,[.24,-.4,-.63],[.11,.3,.18],.4,.5);mesh(g,'box',0x213440,[.24,-.31,-.37],[.1,.26,.12],.4,.45);mesh(g,'box',0x53dfff,[.325,-.2,-.69],[.009,.035,.23],.3,.3,true);
  mesh(g,'box',0x121d28,[.24,-.07,-.57],[.075,.09,.075],.5,.4);mesh(g,'box',0x65f5ee,[.24,-.025,-.585],[.01,.014,.025],0,.2,true);
  mesh(g,'sphere',0xeee5d4,[.18,-.4,-.38],[.15,.17,.23],0,.95);mesh(g,'sphere',0xeee5d4,[.12,-.34,-.84],[.13,.12,.2],0,.95);
  mesh(g,'sphere',0x111f2e,[.12,-.52,-.16],[.17,.23,.3],.2,.6);mesh(g,'sphere',0x111f2e,[-.08,-.49,-.67],[.19,.14,.33],.2,.6);
  const flash=mesh(g,'sphere',0x9df6ff,[.24,-.21,-1.3],[.08,.08,.18],0,.3,true);flash.visible=false;g.userData.flash=flash;applyPlushHands(g);return g;
}
export function createWorld(scene){
  scene.background=new THREE.Color(0x081420);scene.fog=new THREE.FogExp2(0x081420,.022);
  scene.add(new THREE.HemisphereLight(0x9ecbdf,0x17212c,2.1));
  const moon=new THREE.DirectionalLight(0x8ec6ef,2.2);moon.position.set(-15,35,8);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);Object.assign(moon.shadow.camera,{left:-28,right:28,top:28,bottom:-28,far:90});moon.shadow.bias=-.001;scene.add(moon);
  const ground=mesh(scene,'box',0x142330,[0,-.25,0],[46,.5,46],.55,.36);
  const obstacles=[];
  for(const b of BOXES){const m=mesh(scene,'box',0x213748,[b.x,b.h/2,b.z],[b.w,b.h,b.d],.55,.5);obstacles.push(m);mesh(scene,'box',0x48b9ce,[b.x,b.h+.015,b.z],[b.w,.025,b.d],.6,.4);for(let i=0;i<Math.floor(b.w);i++)mesh(scene,'box',0x132531,[b.x-b.w/2+.5+i,b.h/2,b.z+b.d/2+.018],[.035,b.h*.88,.04],.5,.6);label(scene,'NHPD',[b.x,b.h*.6,b.z+b.d/2+.025],Math.min(1.8,b.w*.7),'#a0b4bc','#213748');}
  for(let i=0;i<4;i++){const m=mesh(scene,'box',0x172b3b,[i<2?(i?22:-22):0,3.2,i>=2?(i===2?22:-22):0],[i<2?1:45,6.4,i<2?45:1],.3,.55);obstacles.push(m);}
  for(let x=-18;x<=18;x+=6){mesh(scene,'box',0x728a92,[x,.015,17],[2.4,.028,.14],.1,.7);mesh(scene,'box',0x354b5b,[x,.012,0],[.04,.025,42]);}
  for(let z=-18;z<=18;z+=6)mesh(scene,'box',0x354b5b,[0,.012,z],[42,.025,.04]);
  for(const side of [-1,1])for(let i=0;i<9;i++){const height=8+(Math.sin(i*72+side)*.5+.5)*16,x=side*(26+(i%2)*4),z=-29+i*7;mesh(scene,'box',i%2?0x102332:0x132b3d,[x,height/2,z],[7,height,6],.4,.48);for(let floor=3;floor<height;floor+=2.2)for(let col=0;col<3;col++)mesh(scene,'box',(floor+col)%3>.7?0x2e667d:0x559fb0,[x-side*3.52,floor,z-2+col*1.8],[.03,.65,.65],.1,.5,true);}
  for(let i=0;i<7;i++){const h=12+(i%3)*5;mesh(scene,'box',0x102635,[-25+i*8,h/2,-29],[6,h,7],.4,.5);for(let y=3;y<h;y+=2)mesh(scene,'box',0x387188,[-25+i*8,y,-25.48],[4.5,.1,.03],.2,.4,true);}
  const signs=[['夜港 NIGHT HARBOR',[-10,6.1,-21.42],9,'#74e7ff'],['警戒封鎖',[13,4.5,-21.42],5,'#ff7887'],['SECTOR 07',[-15,4.4,21.4],6,'#7fe3fa']];for(const [t,p,w,c] of signs){const s=label(scene,t,p,w,c);if(p[2]>0)s.rotation.y=Math.PI;}
  for(const x of [-18,18])for(const z of [-17,1,17]){mesh(scene,'cylinder',0x364e5c,[x,3,z],[.08,6,.08],.65,.3);mesh(scene,'box',0x78e5ff,[x,6,z],[1.4,.08,.4],.4,.4,true);const l=new THREE.PointLight(x<0?0x36c6ff:0xff526d,22,12,2);l.position.set(x,4,z);scene.add(l);}
  const site=new THREE.Group();site.position.set(7,0,-17);scene.add(site);
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.7,2.82,64),new THREE.MeshBasicMaterial({color:0xe8c777,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;site.add(ring);
  mesh(site,'box',0x162631,[0,.4,0],[1.1,.8,.7],.7,.4);mesh(site,'box',0xe5c777,[0,.82,0],[.8,.04,.45],.3,.4,true);label(site,'B / SIGNAL',[0,2.7,0],2.5,'#f1cb72');const beacon=new THREE.PointLight(0xffc669,12,7);beacon.position.set(0,1.5,0);site.add(beacon);
  // Mark the objective from either approach.
  const back=label(site,'B',[0,2.7,-.04],1.4,'#f1cb72');back.rotation.y=Math.PI;
  const rainGeo=new THREE.BufferGeometry();const points=new Float32Array(1800);for(let i=0;i<points.length;i+=3){points[i]=(Math.random()-.5)*50;points[i+1]=Math.random()*22;points[i+2]=(Math.random()-.5)*50;}rainGeo.setAttribute('position',new THREE.BufferAttribute(points,3));const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0x98c1d2,size:.045,transparent:true,opacity:.42}));scene.add(rain);
  return {ground,obstacles,site,rain,beacon};
}
