import test from 'node:test';
import assert from 'node:assert/strict';
import {blocked,moveActor,lineBlocked,reloadAmmo,formatTime,waveSize,routeTo} from '../src/rules.js';
const box={x:0,z:0,w:1,d:2,h:1.2};
test('standing line of sight clears low cover but crouching is concealed',()=>{assert.equal(lineBlocked(-4,0,4,0,[box],1.7),false);assert.equal(lineBlocked(-4,0,4,0,[box],1.0),true);assert.equal(lineBlocked(-4,3,4,3,[box],1),false);assert.equal(lineBlocked(0,-5,0,5,[box],1),true);});
test('fast movement cannot tunnel through cover and slides along it',()=>{const p={x:-3,z:0};moveActor(p,8,1,[box]);assert.ok(p.x<=-1.4);assert.ok(Math.abs(p.z-1)<1e-6);assert.equal(blocked(p.x,p.z,[box]),false);});
test('ammo transfer conserves total rounds and never invents ammunition',()=>{assert.deepEqual(reloadAmmo(8,4,30),{ammo:12,reserve:0});assert.deepEqual(reloadAmmo(8,100,30),{ammo:30,reserve:78});assert.deepEqual(reloadAmmo(30,100,30),{ammo:30,reserve:100});});
test('timer and waves handle boundaries',()=>{assert.equal(formatTime(60),'01:00');assert.equal(formatTime(-2),'00:00');assert.deepEqual([1,2,3].map(w=>waveSize(w,'normal')),[4,5,6]);});
test('guard path routes around a wall instead of entering it',()=>{const wall={x:0,z:0,w:1,d:4,h:3},path=routeTo({x:-4.5,z:0},{x:4.5,z:0},[wall]);assert.ok(path.length>6);assert.deepEqual(path.at(-1),{x:4.5,z:0});assert.ok(path.every(p=>!blocked(p.x,p.z,[wall],.55)));});
