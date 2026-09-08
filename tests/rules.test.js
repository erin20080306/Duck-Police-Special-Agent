import test from 'node:test';
import assert from 'node:assert/strict';
import {moveCircle,rayCircle,waveSize} from '../src/rules.js';
test('cover blocks direct and vertical shots but not shots beside cover',()=>{const o={x:0,z:0,w:1,d:2};assert.equal(rayCircle(-5,0,5,0,o),true);assert.equal(rayCircle(0,-8,0,8,o),true);assert.equal(rayCircle(-5,4,5,4,o),false);assert.equal(rayCircle(4,-8,4,8,o),false);assert.equal(rayCircle(-5,0,-3,0,o),false);});
test('movement slides along cover without entering it',()=>{const p={x:-2,z:0};moveCircle(p,1,.5,[{x:0,z:0,w:1,d:2}],.4);assert.deepEqual(p,{x:-2,z:.5});});
test('three waves escalate on each difficulty',()=>{assert.deepEqual([1,2,3].map(w=>waveSize(w,'normal')),[3,4,5]);assert.deepEqual([1,2,3].map(w=>waveSize(w,'hard')),[5,6,7]);});
