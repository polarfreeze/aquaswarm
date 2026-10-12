import { Simulation, CONFIG, RULES } from '../src/simulation.js';
import { mkdir, writeFile } from 'node:fs/promises';

function localAgreement(sim) {
  let sum=0,count=0;
  for(const f of sim.fish) for(const g of sim.fish) {
    if(f.id>=g.id||Math.hypot(f.x-g.x,f.y-g.y,f.z-g.z)>CONFIG.perception)continue;
    sum+=(f.vx*g.vx+f.vy*g.vy+f.vz*g.vz)/(Math.hypot(f.vx,f.vy,f.vz)*Math.hypot(g.vx,g.vy,g.vz));count++;
  }
  return count?sum/count:0;
}
const results=[];
for(const disabled of [null,...RULES]) {
  const sim=new Simulation();if(disabled)sim.setEnabled(disabled,false);
  let spacing=0,alignment=0,radius=0,samples=0;
  for(let frame=0;frame<1800;frame++) {
    sim.step();
    if(frame>=600&&frame%60===0) {
      const metrics=sim.metrics();spacing+=metrics.spacing;alignment+=localAgreement(sim);
      const x=sim.fish.reduce((a,f)=>a+f.x,0)/100,z=sim.fish.reduce((a,f)=>a+f.z,0)/100;
      const y=sim.fish.reduce((a,f)=>a+f.y,0)/sim.count;
      radius+=Math.sqrt(sim.fish.reduce((a,f)=>a+(f.x-x)**2+(f.y-y)**2+(f.z-z)**2,0)/100);samples++;
    }
  }
  results.push({disabled:disabled??'none',meanNearestSpacing:spacing/samples,meanLocalHeadingCosine:alignment/samples,rmsSchoolRadius:radius/samples});
}
await mkdir('evidence',{recursive:true});
await writeFile('evidence/rule-comparison-a3.json',JSON.stringify({seed:CONFIG.seed,seconds:30,sampling:'One sample per second from 10 to 29 seconds. Same seed and all other weights fixed.',
  caveat:'Descriptive results for this seed and tank, not universal guarantees or a scientific study. Assignment 3 version (adds cruise speed control); the Assignment 2 data is in rule-comparison-3d.json.',results},null,2));
console.table(results);
