/* Live playability probe: FPS, input latency, bot playthroughs.
 * Usage: node scripts/playability-live.cjs   (expects the site on :4173)
 * Writes artifacts/playability-baseline.json + screenshots. Dev tool, not CI. */
const {chromium}=require('playwright');
const fs=require('node:fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
function fpsStats(d){if(!d||!d.length)return null;d.sort((a,b)=>a-b);const n=d.length;const avg=d.reduce((s,x)=>s+x,0)/n;
 return {avgMs:+avg.toFixed(1),p95Ms:+d[Math.floor(n*0.95)].toFixed(1),maxMs:d[n-1],fps:+(1000/avg).toFixed(0),framesOver34:d.filter(x=>x>34).length};}
async function sampleFps(p,durMs){
 return await p.evaluate(durMs=>new Promise(res=>{
  const d=[];let last=performance.now();const t0=last;
  function f(t){d.push(t-last);last=t;if((t-t0)<durMs)requestAnimationFrame(f);else res(d);}
  requestAnimationFrame(f);
 }),durMs);
}
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true});
 const out={base,at:new Date().toISOString(),games:{}};
 async function page(slug){
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  await p.goto(base+'/games/'+slug+'/?qa=1');
  await p.waitForFunction(()=>!!window.__gameTest);
  return p;
 }
 // ---------- SNACK CATCH ----------
 try{
  const p=await page('snack-catch');
  await p.evaluate(()=>window.__gameTest.start());
  const lat=await p.evaluate(()=>new Promise(res=>{
   const g=window.__gameTest;const x0=g.getState().basketX;const t0=performance.now();
   document.getElementById('game').dispatchEvent(new PointerEvent('pointerdown',{clientX:300,clientY:600,bubbles:true,pointerId:1}));
   const iv=setInterval(()=>{const s=g.getState();if(Math.abs(s.basketX-x0)>2){clearInterval(iv);res(+(performance.now()-t0).toFixed(1));}else if(performance.now()-t0>2000){clearInterval(iv);res(-1);}},8);
  }));
  const fps=fpsStats(await sampleFps(p,4000));
  let bot={};
  try{bot=await p.evaluate(()=>new Promise(res=>{
   const g=window.__gameTest;const cv=document.getElementById('game').getBoundingClientRect();
   const t0=Date.now();
   const iv=setInterval(()=>{
    const s=g.getState();const phase=s.phase||s.state;
    if(phase!=='playing'||Date.now()-t0>33000){clearInterval(iv);res({phase,score:s.score,hearts:s.hearts});return;}
    const items=[...(s.items||g.game.items||[])].sort((a,b)=>b.y-a.y);
    const it=items[0];
    const target=it?(it.kind==='bomb'?(it.x<180?320:40):it.x):180;
    document.getElementById('cv').dispatchEvent(new PointerEvent('pointerdown',{clientX:cv.x+target/360*cv.width,clientY:cv.y+cv.height*0.84,bubbles:true,pointerId:1}));
   },130);
  }));}catch(e){bot={error:e.message}}
  out.games['snack-catch']={inputLatencyMs:lat,fps,bot};
  await p.screenshot({path:'artifacts/playability-snack.png'});
  await p.close();
 }catch(e){out.games['snack-catch']={error:e.message}}
 // ---------- STACK RUSH ----------
 try{
  const p=await page('stack-rush');
  await p.evaluate(()=>window.__gameTest.start());
  const lat=await p.evaluate(()=>new Promise(res=>{
   const g=window.__gameTest;const t0=performance.now();
   document.getElementById('game').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1}));
   const iv=setInterval(()=>{const s=g.getState();if(s.lastEvent){clearInterval(iv);res(+(performance.now()-t0).toFixed(1));}else if(performance.now()-t0>2000){clearInterval(iv);res(-1);}},8);
  }));
  const fps=fpsStats(await sampleFps(p,4000));
  let bot={};
  try{bot=await p.evaluate(()=>new Promise(res=>{
   const g=window.__gameTest;let guard=0;
   const iv=setInterval(()=>{
    guard++;const s=g.getState();const phase=s.phase||s.state;
    if(phase==='over'||guard>6000){clearInterval(iv);res({phase,layers:s.layers.length,score:s.score});return;}
    const top=s.layers[s.layers.length-1];
    if(top&&s.moving){const diff=(s.moving.x+s.moving.w/2)-(top.x+top.w/2);
     if(Math.abs(diff)<7)g.drop();}
   },12);
  }));}catch(e){bot={error:e.message}}
  out.games['stack-rush']={inputLatencyMs:lat,fps,bot};
  await p.close();
 }catch(e){out.games['stack-rush']={error:e.message}}
 // ---------- COLOR PANIC ----------
 try{
  const p=await page('color-panic');
  await p.evaluate(()=>window.__gameTest.start());
  await sleep(300);
  const lat=await p.evaluate(()=>new Promise(res=>{
   const g=window.__gameTest;const s0=g.getState();const sc0=s0.score;const t0=performance.now();
   const slot=s0.targetIndex;
   const c=document.getElementById('game').getBoundingClientRect();
   const pad=14,bw=(c.width-pad*3)/2,bh=(c.height*0.42-pad*2)/2;
   const x=c.x+pad+(slot%2)*(bw+pad)+bw/2,y=c.y+c.height-pad-bh/2-(slot>=2?bh+pad:0);
   document.getElementById('game').dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,bubbles:true,pointerId:1}));
   const iv=setInterval(()=>{const s=g.getState();if(s.score>sc0){clearInterval(iv);res(+(performance.now()-t0).toFixed(1));}else if(performance.now()-t0>2000){clearInterval(iv);res(-1);}},8);
  }));
  const fps=fpsStats(await sampleFps(p,4000));
  let bot={};
  try{bot=await p.evaluate(()=>new Promise(res=>{
   const g=window.__gameTest;const c=document.getElementById('game').getBoundingClientRect();
   const pad=14,bw=(c.width-pad*3)/2,bh=(c.height*0.42-pad*2)/2;
   let lastSlot=-1;const t0=Date.now();
   const iv=setInterval(()=>{
    const s=g.getState();const phase=s.phase||s.state;
    if(phase!=='playing'||Date.now()-t0>34000){clearInterval(iv);res({phase,score:s.score,hearts:s.hearts});return;}
    if(s.targetIndex!==lastSlot){lastSlot=s.targetIndex;
     const slot=s.targetIndex;
     const x=c.x+pad+(slot%2)*(bw+pad)+bw/2,y=c.y+c.height-pad-bh/2-(slot>=2?bh+pad:0);
     setTimeout(()=>document.getElementById('game').dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,bubbles:true,pointerId:1})),260);}
   },40);
  }));}catch(e){bot={error:e.message}}
  out.games['color-panic']={inputLatencyMs:lat,fps,bot};
  await p.screenshot({path:'artifacts/playability-color.png'});
  await p.close();
 }catch(e){out.games['color-panic']={error:e.message}}
 fs.writeFileSync('artifacts/playability-baseline.json',JSON.stringify(out,null,1));
 console.log(JSON.stringify(out,null,1));
 await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
