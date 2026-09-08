export const weapons={list:[{name:'脈衝手槍',capacity:12,damage:40,delay:.24,reload:1.1},{name:'巡防衝鋒槍',capacity:30,damage:23,delay:.095,reload:1.65}],difficulty:{easy:{hp:65,damage:5,interval:2.2},normal:{hp:90,damage:8,interval:1.7},hard:{hp:115,damage:12,interval:1.3}}};
export function waveSize(wave,difficulty){return 2+wave+(difficulty==='hard'?2:0);}
export function moveCircle(p,dx,dz,obstacles,r){const blocked=(x,z)=>obstacles.some(o=>Math.abs(x-o.x)<o.w+r&&Math.abs(z-o.z)<o.d+r);if(!blocked(p.x+dx,p.z))p.x+=dx;if(!blocked(p.x,p.z+dz))p.z+=dz;}
// Segment / expanded axis-aligned rectangle intersection for bot line of sight.
export function rayCircle(ax,az,bx,bz,o,r=0){let lo=0,hi=1;for(const [a,b,c,h]of [[ax,bx,o.x,o.w+r],[az,bz,o.z,o.d+r]]){const d=b-a;if(Math.abs(d)<1e-8){if(a<c-h||a>c+h)return false;continue;}let t0=(c-h-a)/d,t1=(c+h-a)/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;}return true;}
