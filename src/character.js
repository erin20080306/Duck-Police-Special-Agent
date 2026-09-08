import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// The actor remains in the original 3.1-unit combat envelope so hit detection
// and cover heights continue to agree with the level.
const sphere = new THREE.SphereGeometry(1,40,28);
const roundBox = new RoundedBoxGeometry(1,1,1,3,.12);
const ellipsoid = (parent, material, position, scale) => add(parent,sphere,material,position,scale);
function add(parent,geometry,material,position=[0,0,0],scale=[1,1,1]) {
  const o=new THREE.Mesh(geometry,material);o.position.set(...position);o.scale.set(...scale);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function box(parent,material,p,s){return add(parent,roundBox,material,p,s);}
function tube(parent,material,points,r=.006){return add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),32,r,6,false),material);}
function panel(parent,material,points,depth=.025){
  const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  return add(parent,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.008,bevelThickness:.006}),material);
}
function noiseTexture(seed,repeat=1){
  const size=128,data=new Uint8Array(size*size*4);let s=seed;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){s=(Math.imul(s,1664525)+1013904223)>>>0;const n=96+(s>>>26)+(x%3===0?20:0)+(y%4===0?15:0),i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=n;data[i+3]=255;}
  const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);t.needsUpdate=true;return t;
}
const leatherGrain=noiseTexture(17,5),clothGrain=noiseTexture(51,8),plushGrain=noiseTexture(91,7);
const palettes=new Map();
function palette(enemy){
  if(palettes.has(enemy))return palettes.get(enemy);
  const p={
    ivory:new THREE.MeshPhysicalMaterial({color:0xeee9dd,roughness:1,sheen:1,sheenColor:new THREE.Color(0xfff9e9),sheenRoughness:.95,bumpMap:plushGrain,bumpScale:.018}),
    down:new THREE.MeshStandardMaterial({color:0xefeadd,roughness:1}),
    leather:new THREE.MeshPhysicalMaterial({color:enemy?0x241d27:0x101824,roughness:.48,metalness:.13,clearcoat:.38,clearcoatRoughness:.43,bumpMap:leatherGrain,bumpScale:.014}),
    trim:new THREE.MeshStandardMaterial({color:0x263243,roughness:.5,metalness:.3}),
    cloth:new THREE.MeshStandardMaterial({color:0x111923,roughness:.94,bumpMap:clothGrain,bumpScale:.009}),
    black:new THREE.MeshPhysicalMaterial({color:0x030507,roughness:.17,clearcoat:1,metalness:.12}),
    bill:new THREE.MeshPhysicalMaterial({color:0xe4b32f,roughness:.57,bumpMap:plushGrain,bumpScale:.004}),
    seam:new THREE.MeshStandardMaterial({color:0x896224,roughness:.85}),
    gold:new THREE.MeshStandardMaterial({color:0xbb924a,metalness:.82,roughness:.28}),
    goldLight:new THREE.MeshStandardMaterial({color:0xe5c578,metalness:.7,roughness:.3}),
    stitch:new THREE.MeshStandardMaterial({color:0x74736a,roughness:.9}),
    white:new THREE.MeshStandardMaterial({color:0xe9e8e1,roughness:.87}),
    cyan:new THREE.MeshStandardMaterial({color:enemy?0xff5367:0x65d8ff,emissive:enemy?0xff264c:0x2daaff,emissiveIntensity:2.1,roughness:.35}),
  };palettes.set(enemy,p);return p;
}
function fleece(parent,material,center,radii,count=950){
  // Thousands of small flattened curls, one draw call. No bead-like silhouette.
  const geometry=new THREE.SphereGeometry(1,5,4),o=new THREE.InstancedMesh(geometry,material,count),dummy=new THREE.Object3D();
  for(let i=0;i<count;i++){
    const y=1-2*(i+.5)/count,a=i*2.39996323,rr=Math.sqrt(1-y*y),v=new THREE.Vector3(rr*Math.cos(a),y,rr*Math.sin(a));
    const size=.013+(Math.sin(i*38.73)*.5+.5)*.009;
    dummy.position.set(center[0]+v.x*radii[0],center[1]+v.y*radii[1],center[2]+v.z*radii[2]);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),v);dummy.scale.set(size,size*.76,size*.43);dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);
  }
  o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function crest(parent,p,x,y,z,size){
  const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(size);parent.add(g);
  // Shield outline, raised perimeter, concentric seal and engraved bars.
  const outline=[[-.48,.48],[-.28,.55],[0,.72],[.28,.55],[.48,.48],[.42,-.22],[.2,-.52],[0,-.66],[-.2,-.52],[-.42,-.22]];
  const shield=panel(g,p.gold,outline,.09);shield.position.z=0;
  const inner=panel(g,p.black,outline.map(([a,b])=>[a*.76,b*.76]),.04);inner.position.z=.1;
  const seal=add(g,new THREE.TorusGeometry(.235,.042,8,28),p.goldLight,[0,.04,.17]);seal.scale.y=1.2;
  add(g,new THREE.CylinderGeometry(.145,.145,.025,24),p.gold,[0,.04,.18]).rotation.x=Math.PI/2;
  box(g,p.goldLight,[0,.045,.215],[.06,.2,.02]);box(g,p.goldLight,[0,-.35,.14],[.28,.045,.025]);
  for(const s of [-1,1])for(let i=0;i<4;i++){const leaf=ellipsoid(g,p.goldLight,[s*(.32-i*.025),.28-i*.15,.14],[.045,.078,.02]);leaf.rotation.z=s*.5;}
  return g;
}
function pistol(parent,p){
  const g=new THREE.Group();parent.add(g);
  box(g,p.trim,[0,0,.16],[.145,.15,.46]);box(g,p.black,[0,-.07,.1],[.12,.085,.4]);
  const grip=box(g,p.black,[0,-.18,.01],[.105,.24,.14]);grip.rotation.x=-.15;
  const muzzle=add(g,new THREE.CylinderGeometry(.048,.048,.035,20),p.gold,[0,.01,.399]);muzzle.rotation.x=Math.PI/2;
  const hole=add(g,new THREE.CylinderGeometry(.031,.031,.038,20),p.black,[0,.01,.419]);hole.rotation.x=Math.PI/2;
  box(g,p.cyan,[.074,.008,.15],[.008,.026,.2]);
  for(let i=0;i<5;i++)box(g,p.black,[.074,.025,-.015+i*.023],[.008,.08,.009]);
  const guard=add(g,new THREE.TorusGeometry(.072,.012,6,16),p.trim,[0,-.105,.17]);guard.rotation.y=Math.PI/2;guard.scale.y=.8;
  box(g,p.black,[0,.102,.32],[.025,.05,.032]);return g;
}
export function createDuck({enemy=false,hero=false}={}){
  const p=palette(enemy),g=new THREE.Group();g.name=hero?'Duck 007 — reference-inspired detailed hero':'Duck tactical guard';
  // Longer legs and a tailored coat replace the former round toy torso.
  for(const side of [-1,1]){
    ellipsoid(g,p.cloth,[side*.21,.59,-.015],[.18,.51,.205]);
    box(g,p.leather,[side*.21,.49,.15],[.235,.25,.07]);
    box(g,p.black,[side*.22,.145,.035],[.33,.26,.53]);
    ellipsoid(g,p.black,[side*.22,.13,.23],[.185,.12,.22]);
    box(g,p.trim,[side*.22,.055,.075],[.35,.065,.57]);
    for(let i=0;i<4;i++)tube(g,p.trim,[[side*.22-.08,.25+i*.036,.225],[side*.22+.08,.25+i*.036,.225]],.006);
  }
  ellipsoid(g,p.cloth,[0,1.31,0],[.43,.57,.3]);
  // White shirt and black tie stay visible between the split leather lapels.
  box(g,p.white,[0,1.71,.254],[.37,.38,.055]);
  const tie=panel(g,p.black,[[-.055,1.81],[.055,1.81],[.084,1.42],[0,1.35],[-.084,1.42]],.015);tie.position.z=.302;
  for(const side of [-1,1]){
    const skirt=panel(g,p.leather,[[side*.055,1.8],[side*.43,1.77],[side*.49,1.07],[side*.66,.3],[side*.12,.4],[side*.06,1.05]],.07);skirt.position.z=.21;
    const back=ellipsoid(g,p.leather,[side*.25,.91,-.2],[.29,.72,.12]);back.rotation.z=-side*.13;
    const lapel=panel(g,p.leather,[[side*.15,1.94],[side*.48,1.85],[side*.32,1.57],[side*.4,1.46],[side*.07,1.17],[side*.19,1.65]],.025);lapel.position.z=.323;
    tube(g,p.stitch,[[side*.14,1.89,.368],[side*.42,1.83,.368],[side*.27,1.56,.368],[side*.35,1.46,.368],[side*.095,1.2,.368]],.0027);
    tube(g,p.stitch,[[side*.47,1.06,.298],[side*.62,.34,.299],[side*.16,.42,.299]],.0028);
    for(let j=0;j<6;j++)box(g,p.trim,[side*.3,1.28-j*.031,.345],[.2,.011,.02]);
    box(g,p.leather,[side*.28,1.05,.36],[.235,.24,.09]);box(g,p.trim,[side*.28,1.15,.42],[.235,.055,.03]);
    add(g,new THREE.SphereGeometry(.013,8,6),p.gold,[side*.29,1.16,.443]);
    const strap=box(g,p.leather,[side*.42,1.86,.02],[.28,.065,.42]);strap.rotation.z=-side*.16;
    box(g,p.gold,[side*.42,1.9,.13],[.07,.018,.055]);
  }
  const belt=add(g,new THREE.CylinderGeometry(.45,.45,.13,48),p.black,[0,.99,0],[1,1,.79]);
  box(g,p.gold,[0,.99,.387],[.2,.145,.04]);box(g,p.black,[0,.99,.412],[.14,.092,.02]);box(g,p.goldLight,[.02,.99,.427],[.025,.095,.018]);
  for(const side of [-1,1])box(g,p.leather,[side*.43,.93,.19],[.13,.23,.16]);
  // Curled ivory neck and a slightly elongated head, like the poster's duck.
  ellipsoid(g,p.ivory,[0,1.96,0],[.25,.26,.25]);
  const headCenter=[0,2.4,0],headRadii=[.49,.565,.438];
  ellipsoid(g,p.ivory,headCenter,headRadii);fleece(g,p.down,headCenter,headRadii,hero?2900:1100);
  // Broad duck bill: shaped upper shell rather than a spherical yellow nose.
  const billGeometry=new THREE.SphereGeometry(1,48,24),pos=billGeometry.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    pos.setXYZ(i,x*.335*(1+.1*z),2.247+y*.112+Math.abs(x)*.027,.463+z*.255);
  }
  billGeometry.computeVertexNormals();add(g,billGeometry,p.bill);
  ellipsoid(g,p.bill,[0,2.171,.475],[.286,.097,.23]);
  tube(g,p.seam,[[-.298,2.235,.558],[-.205,2.198,.655],[0,2.187,.712],[.205,2.198,.655],[.298,2.235,.558]],.005);
  for(const side of [-1,1]){
    ellipsoid(g,p.seam,[side*.106,2.337,.634],[.017,.012,.009]);
    const eye=ellipsoid(g,p.black,[side*.247,2.493,.371],[.071,.096,.05]);eye.rotation.y=side*.2;
    ellipsoid(g,p.white,[side*.247-.018,2.53,.414],[.016,.023,.008]);
  }
  // Peaked service cap: fabric crown, leather band, curved projecting visor.
  ellipsoid(g,p.cloth,[0,2.956,-.035],[.572,.209,.484]);
  const band=add(g,new THREE.CylinderGeometry(.502,.484,.13,64),p.black,[0,2.827,0],[1,1,.91]);
  const piping=add(g,new THREE.TorusGeometry(.5,.009,6,64),p.trim,[0,2.897,0],[1,.91,1]);piping.rotation.x=Math.PI/2;
  const visorGeo=new THREE.SphereGeometry(1,48,20);const visor=add(g,visorGeo,p.black,[0,2.775,.34],[.505,.037,.37]);visor.rotation.x=.065;
  tube(g,p.gold,[[ -.43,2.813,.26],[-.31,2.807,.386],[0,2.805,.47],[.31,2.807,.386],[.43,2.813,.26]],.008);
  crest(g,p,0,2.98,.457,.19);
  for(const side of [-1,1])ellipsoid(g,p.gold,[side*.445,2.83,.254],[.024,.023,.013]);
  crest(g,p,.284,1.63,.421,.125);
  // Gold chain hangs naturally across the shirt.
  for(let i=0;i<25;i++){
    const t=i/24,a=(t-.5)*Math.PI;
    const link=add(g,new THREE.TorusGeometry(.023,.007,6,12),p.gold,[Math.sin(a)*.215,1.88-Math.cos(a)*.22,.364]);link.scale.y=1.27;link.rotation.y=i%2?.85:0;
  }
  box(g,p.trim,[-.28,1.61,.43],[.255,.083,.04]);box(g,p.cyan,[-.28,1.612,.455],[.184,.024,.012]);
  box(g,p.black,[.1,1.21,.384],[.105,.2,.064]);box(g,p.cyan,[.1,1.25,.422],[.052,.05,.012]);
  // One outstretched shooting arm, one relaxed arm, matching the lead officer.
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.48,1.7,0);g.add(arm);
    arm.rotation.z=side===-1?-.32:.17;arm.rotation.x=side===-1?-1.22:-.12;
    ellipsoid(arm,p.leather,[0,-.24,0],[.192,.33,.21]);ellipsoid(arm,p.leather,[0,-.61,.015],[.167,.27,.18]);
    for(let j=0;j<6;j++){const fold=add(arm,new THREE.TorusGeometry(.172,.01,5,20),p.trim,[0,-.33-j*.043,0],[1,1,.94]);fold.rotation.x=Math.PI/2;}
    box(arm,p.trim,[0,-.24,.199],[.25,.18,.028]);box(arm,p.cyan,[0,-.24,.218],[.135,.032,.015]);
    const cuff=add(arm,new THREE.CylinderGeometry(.174,.168,.14,32),p.leather,[0,-.79,.015]);
    ellipsoid(arm,p.ivory,[0,-.927,.01],[.155,.185,.155]);fleece(arm,p.down,[0,-.927,.01],[.155,.185,.155],hero?430:150);
    ellipsoid(arm,p.ivory,[.132,-.89,.063],[.068,.092,.074]);
    const watch=add(arm,new THREE.CylinderGeometry(.079,.079,.035,24),p.trim,[0,-.77,.18]);watch.rotation.x=Math.PI/2;
    const face=add(arm,new THREE.CylinderGeometry(.059,.059,.037,24),p.cyan,[0,-.77,.197]);face.rotation.x=Math.PI/2;
    if(side===-1){const gun=pistol(arm,p);gun.position.set(0,-.99,.12);gun.rotation.x=1.22;gun.rotation.z=.12;}
  }
  g.userData.characterRevision=2;return g;
}

export function applyPlushHands(weapon){
  const p=palette(false),hands=[];
  weapon.children.forEach(o=>{if(o.isMesh&&o.material.color?.getHex()===0xeee5d4){o.material=p.ivory;hands.push(o);}});
  for(const hand of hands)fleece(weapon,p.down,hand.position.toArray(),hand.scale.toArray(),380);
}
