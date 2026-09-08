import test from 'node:test';
import assert from 'node:assert/strict';
import {createLevel} from '../src/world.js';
import {createDuck,createWeapon} from '../src/models.js';
import {blocked,routeTo} from '../src/rules.js';
// Minimal label-canvas stub: validates scene construction without claiming browser rendering.
globalThis.document={createElement:()=>({width:512,height:128,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
for(const kind of ['foundry','temple'])test(`${kind}: geometry, spawn points and guard routes are valid`,()=>{const level=createLevel(kind,true);assert.ok(level.rayTargets.length<35,'static batches must remain bounded');assert.equal(blocked(level.spawn.x,level.spawn.z,level.boxes,.5),false);for(const p of level.spawnPoints){assert.equal(blocked(p.x,p.z,level.boxes,.5),false,JSON.stringify(p));assert.ok(routeTo(p,level.spawn,level.boxes).length>0,JSON.stringify(p));}level.root.traverse(o=>{if(o.isMesh){assert.ok(o.geometry,'geometry exists');const pos=o.geometry.attributes.position;assert.ok(pos.count>0);for(let i=0;i<pos.array.length;i++)assert.ok(Number.isFinite(pos.array[i]));}});level.dispose();});
test('duck geometry batches and first-person weapon animation anchors exist',()=>{const duck=createDuck({low:true});let count=0;duck.traverse(o=>{if(o.isMesh){count++;assert.ok(o.geometry);}});assert.ok(count<40);assert.equal(duck.userData.legs.length,2);for(const index of [0,1]){const gun=createWeapon(index);assert.ok(gun.userData.muzzle);assert.ok(gun.userData.flash);assert.ok(gun.userData.leftHand);assert.ok(gun.userData.sightHeight>0);}});
