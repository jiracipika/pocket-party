const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
(async()=>{
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true});
 const report={base,at:new Date().toISOString(),checks:[],errors:[]};
 async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name)}
 const state=p=>p.evaluate(()=>window.__gameTest.getState());
 const phase=s=>s.state||s.phase;
 const timer=s=>s.roundTimeLeft??s.timeLeft??s.time;
 async function pageFor(slug,width=390,height=844){const p=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:2});p.setDefaultTimeout(5000);p.on('pageerror',e=>report.errors.push(slug+': '+e.message));p.on('response',r=>{if(r.status()>=400)report.errors.push(slug+': HTTP '+r.status()+' '+r.url())});await p.goto(base+'/games/'+slug+'/?qa=1');await p.waitForFunction(()=>!!window.__gameTest);return p;}
 const games=[['snack-catch','#btnStart','#btnPause','#btnResume','#btnReplay','#btnMute'],['donut-dash','#btnStart','#btnPause','#btnResume','#btnReplay','#btnMute'],['stack-rush','#btn-start','#btn-pause','#btn-resume','#btn-replay','#btn-sound'],['color-panic','#startBtn','#pauseBtn','#resumeBtn','#replayBtn','#muteBtn']];
 try{
 for(const size of [{width:360,height:640},{width:390,height:844},{width:768,height:1024},{width:1280,height:720}]){
  const p=await browser.newPage({viewport:size});await p.goto(base);
  await check('landing responsive '+size.width,async()=>{assert.equal(await p.locator('.game').count(),4);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));for(const game of await p.locator('.game').all()){const b=await game.boundingBox();assert.ok(b.width>44&&b.x>=0&&b.x+b.width<=size.width+1)}});
  await p.screenshot({path:'artifacts/landing-'+size.width+'.png',fullPage:true});await p.close();
 }
 await check('share fallback is honest',async()=>{const p=await browser.newPage();await p.addInitScript(()=>{Object.defineProperty(navigator,'share',{value:undefined});Object.defineProperty(navigator,'clipboard',{value:undefined})});await p.goto(base);await p.locator('#share-party').click();assert.match(await p.locator('#share-status').innerText(),/Copy this link:/);await p.close()});
 for(const [slug,start,pause,resume,replay,mute] of games){
  const p=await pageFor(slug);await p.clock.install();
  await check(slug+' starts only on action',async()=>{assert.ok(['ready','idle'].includes(phase(await state(p))));await p.locator(start).tap();assert.equal(phase(await state(p)),'playing')});
  await p.clock.runFor(400);
  await check(slug+' touch pause freezes and resume advances',async()=>{await p.locator(pause).tap();assert.equal(phase(await state(p)),'paused');const before=timer(await state(p));await p.clock.runFor(700);assert.equal(timer(await state(p)),before);await p.locator(resume).tap();assert.equal(phase(await state(p)),'playing');await p.clock.runFor(400);assert.notEqual(timer(await state(p)),before)});
  await check(slug+' mute does not change score or drop',async()=>{const runningSim=slug==='donut-dash';if(runningSim)await p.locator(pause).tap();const before=(await state(p)).score;await p.locator(mute).tap();assert.equal((await state(p)).score,before);if(runningSim)await p.locator(resume).tap();});
  await check(slug+' visibility pause',async()=>{await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});assert.equal(phase(await state(p)),'paused');await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});assert.equal(phase(await state(p)),'paused');await p.locator(resume).tap()});
  if(slug==='snack-catch'){
   await check('Snack Catch touch and keyboard move basket',async()=>{const c=await p.locator('canvas').boundingBox();await p.touchscreen.tap(c.x+c.width*.8,c.y+c.height*.8);assert.ok((await state(p)).basketX>240);const x=(await state(p)).basketX;await p.keyboard.down('ArrowLeft');await p.clock.runFor(300);await p.keyboard.up('ArrowLeft');assert.ok((await state(p)).basketX<x)});
   await check('Snack Catch real catches, expiration and replay',async()=>{for(let i=0;i<80&&phase(await state(p))==='playing';i++){const target=await p.evaluate(()=>{const g=window.__gameTest.game;const it=[...g.items].sort((a,b)=>b.y-a.y)[0];return it?(it.kind==='bomb'?(it.x<180?320:40):it.x):180});const c=await p.locator('canvas').boundingBox();await p.touchscreen.tap(c.x+target/360*c.width,c.y+c.height*.84);await p.clock.runFor(400)}assert.equal(phase(await state(p)),'over');assert.ok((await state(p)).score>0,'caught actual snacks');assert.ok(await p.locator(replay).isVisible());await p.screenshot({path:'artifacts/'+slug+'-over.png'});await p.locator(replay).tap();assert.equal((await state(p)).score,0);assert.equal(phase(await state(p)),'playing')});
  }else if(slug==='stack-rush'){
   await check('Stack Rush touch/keyboard score, failure and replay',async()=>{await p.evaluate(()=>document.activeElement.blur());await p.keyboard.press('Space');assert.ok((await state(p)).score>=1);const c=await p.locator('canvas').boundingBox();for(let i=0;i<25&&phase(await state(p))==='playing';i++){await p.touchscreen.tap(c.x+c.width/2,c.y+c.height/2);await p.clock.runFor(25)}assert.equal(phase(await state(p)),'over');await p.clock.runFor(800);assert.ok(await p.locator(replay).isVisible());await p.screenshot({path:'artifacts/'+slug+'-over.png'});await p.locator(replay).tap();assert.equal((await state(p)).score,0);assert.equal(phase(await state(p)),'playing')});
  }else if(slug==='donut-dash'){
   await check('Donut Dash jump input, crash game over and replay',async()=>{await p.evaluate(()=>document.activeElement.blur());const s0=await state(p);assert.equal(s0.hearts,3);await p.keyboard.press('Space');assert.ok((await state(p)).jumpsUsed>=1,'space jumps');await p.clock.runFor(700);assert.ok((await state(p)).onGround,'lands again');for(let i=0;i<80&&phase(await state(p))==='playing';i++)await p.clock.runFor(500);assert.equal(phase(await state(p)),'over','three crashes end the run');assert.ok((await state(p)).score>0,'distance scored');assert.ok(await p.locator(replay).isVisible());await p.screenshot({path:'artifacts/'+slug+'-over.png'});await p.locator(replay).tap();assert.equal((await state(p)).score,0);assert.equal(phase(await state(p)),'playing')});
  }else{
   await check('Color Panic touch hitbox, keyboard and timer game over',async()=>{let s=await state(p);const c=await p.locator('canvas').boundingBox();const slot=s.targetIndex;const pad=14,bw=(c.width-pad*3)/2,bh=(c.height*.42-pad*2)/2;const x=c.x+pad+(slot%2)*(bw+pad)+bw/2;const y=c.y+c.height-pad-bh/2-(slot>=2?bh+pad:0);await p.touchscreen.tap(x,y);assert.ok((await state(p)).score>0);await p.clock.runFor(220);s=await state(p);const before=s.score;await p.keyboard.press(String(s.targetIndex+1));assert.ok((await state(p)).score>before);await p.clock.runFor(9000);assert.equal(phase(await state(p)),'over');assert.ok(await p.locator(replay).isVisible(),'timer expiry must show recap');await p.screenshot({path:'artifacts/'+slug+'-over.png'});await p.locator(replay).tap();assert.equal((await state(p)).score,0);assert.equal(phase(await state(p)),'playing')});
  }
  await p.screenshot({path:'artifacts/'+slug+'-playing.png'});
  await check(slug+' local best persists',async()=>{const before=await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('best'))));assert.ok(Object.values(before).some(v=>Number(v)>0));await p.reload();const after=await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('best'))));assert.deepEqual(after,before)});await p.close();
  for(const [w,h] of [[360,640],[1280,720]]){const q=await pageFor(slug,w,h);await q.locator(start).click();await check(slug+' playable viewport '+w+'x'+h,async()=>{assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const c=await q.locator('canvas').boundingBox();assert.ok(c.y>=0&&c.y+c.height<=h+2,'canvas within viewport: '+JSON.stringify(c));const b=await q.locator(pause).boundingBox();assert.ok(b.height>=43&&b.width>=43)});await q.screenshot({path:'artifacts/'+slug+'-'+w+'.png'});await q.close();}
  await check(slug+' QA hook absent in normal mode',async()=>{const q=await browser.newPage();await q.goto(base+'/games/'+slug+'/');assert.equal(await q.evaluate(()=>window.__gameTest),undefined,'QA absent in normal mode');await q.close()});
 }
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));
 }finally{fs.writeFileSync('artifacts/browser-report.json',JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
