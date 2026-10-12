import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';

await mkdir('evidence', { recursive:true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { stdio:'ignore', windowsHide:true });
let browser;
try {
  for (let i=0;i<100;i++) {
    try { if ((await fetch('http://127.0.0.1:4175')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  browser = await chromium.launch({ args:['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport:{width:1440,height:1000},
    recordVideo:{dir:'evidence/raw',size:{width:1440,height:1000}} });
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4175/?test');
  await page.waitForFunction(()=>window.aquaswarmSnapshot?.().time>0);
  await page.evaluate(()=>{
    window.frameSamples=[];let previous=performance.now();
    function sample(now){window.frameSamples.push(now-previous);previous=now;requestAnimationFrame(sample);}requestAnimationFrame(sample);
    const caption=document.createElement('div');caption.id='demo-caption';
    Object.assign(caption.style,{position:'absolute',top:'205px',left:'38px',padding:'10px 15px',background:'#f9faf6',borderLeft:'3px solid #174c40',fontSize:'13px',color:'#183e38',zIndex:'3',maxWidth:'500px'});
    document.querySelector('.observation').append(caption);
  });
  const chapters=[];
  const start=Date.now();
  async function caption(text){chapters.push({seconds:(Date.now()-start)/1000,text});await page.locator('#demo-caption').evaluate((el,text)=>el.textContent=text,text);}
  await caption('01 / Default school · all three local rules active');
  await page.waitForTimeout(7000);
  await page.locator('#demo-caption').evaluate(el=>el.style.visibility='hidden');
  await page.screenshot({path:'evidence/desktop.png',fullPage:true});
  await page.locator('#demo-caption').evaluate(el=>el.style.visibility='visible');
  await caption('02 / Separation off · neighbors can crowd together');
  await page.locator('#separation-enabled').uncheck(); await page.waitForTimeout(7000);
  await page.locator('#reset').click();
  await caption('03 / Same seed · alignment off, less heading coordination');
  await page.locator('#alignment-enabled').uncheck(); await page.waitForTimeout(7000);
  await page.locator('#reset').click();
  await caption('04 / Same seed · cohesion off, local groups can spread');
  await page.locator('#cohesion-enabled').uncheck(); await page.waitForTimeout(7000);
  await page.locator('#reset').click();
  await caption('05 / Increase separation · watch the spacing change');
  await page.locator('#separation-weight').focus();await page.keyboard.press('End');await page.waitForTimeout(6000);
  await page.locator('#top').click();
  await caption('06 / Top view · pause freezes the school');
  await page.locator('#pause').click();await page.waitForTimeout(3000);
  await page.locator('#pause').click();await page.waitForTimeout(3000);
  await page.locator('#reset').click();
  await caption('07 / Reset · original rules, seed and camera restored');await page.waitForTimeout(5000);
  const measurement=await page.evaluate(()=>{
    const intervals=window.frameSamples.slice(5).filter(n=>n>0);
    const sorted=[...intervals].sort((a,b)=>a-b);
    return {snapshot:window.aquaswarmSnapshot(),samples:intervals.length,
      measuredSeconds:intervals.reduce((a,b)=>a+b,0)/1000,
      meanFps:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),
      medianFps:1000/sorted[Math.floor(sorted.length*.5)],p95FrameMs:sorted[Math.floor(sorted.length*.95)]};
  });
  await writeFile('evidence/browser-measurement.json',JSON.stringify({date:new Date().toISOString(),browser:browser.version(),
    os:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0].model,viewport:'1440 × 1000',
    environment:'Headless Chromium with video capture; software WebGL fallback allowed. Not a hardware display-computer benchmark.',
    errors,chapters,...measurement},null,2));
  const video=page.video();await context.close();
  await copyFile(await video.path(),'evidence/assignment-2-demo.webm');
  console.log(JSON.stringify({seconds:(Date.now()-start)/1000,errors,meanFps:measurement.meanFps,video:'evidence/assignment-2-demo.webm'}));
} finally { if(browser)await browser.close();server.kill(); }
