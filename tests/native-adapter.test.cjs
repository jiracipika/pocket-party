// These are event-adapter contract tests with test doubles, NOT Lens runtime tests.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function transform(){return {anchors:{},offsets:{},containsScreenPoint:p=>p.x>=.05&&p.x<=.95&&p.y>=.15&&p.y<=.85,screenPointToLocalPoint:p=>({x:(p.x-.05)/.9*2-1,y:1-(p.y-.15)/.7*2})};}
function text(){return {text:'',textFill:{color:null}};}
function obj(){const t=transform(),label=text();return {enabled:true,getComponent:n=>n==='Component.ScreenTransform'?t:n==='Component.Text'?label:null,t,label};}
for(const slug of ['snack-catch','stack-rush','color-panic','donut-dash']){
 test(slug+': native bundle embeds exact core source',()=>{const output=fs.readFileSync('games/'+slug+'/lens/GameController.js','utf8'),core=fs.readFileSync('games/'+slug+'/core.js','utf8');assert.equal(output.split('// CORE-BEGIN\n')[1].split('\n// CORE-END')[0],core);});
 test(slug+': native adapter test-double start/update/pause/resume',()=>{
  const events={},script={api:{},playArea:transform(),pauseButton:{containsScreenPoint:()=>false},scoreText:text(),timeText:text(),messageText:text(),startPanel:obj(),overPanel:obj(),pausePanel:obj(),basket:obj(),itemPool:Array.from({length:24},obj),movingBlock:obj(),layerPool:Array.from({length:24},obj),targetText:text(),targetSymbol:text(),choiceTransforms:[],choiceLabels:Array.from({length:4},text),createEvent:n=>({bind:f=>events[n]=f})};
  const stored={};const sandbox={script,global:{touchSystem:{},persistentStorageSystem:{store:{getInt:k=>stored[k]||0,putInt:(k,v)=>stored[k]=v}}},vec4:function(r,g,b,a){Object.assign(this,{r,g,b,a})},getDeltaTime:()=>1/60,Math};
  vm.runInNewContext(fs.readFileSync('games/'+slug+'/lens/GameController.js','utf8'),sandbox);
  events.OnStartEvent();assert.equal(sandbox.global.touchSystem.touchBlocking,true);
  events.TouchStartEvent({getTouchPosition:()=>({x:.5,y:.5})});let s=script.api.getState();assert.equal(s.phase||s.state,'playing');
  for(let i=0;i<60;i++)events.UpdateEvent();
  assert.match(script.scoreText.text,/Score/);assert.equal(script.startPanel.enabled,false);
  script.api.pause();s=script.api.getState();const before=s.roundTimeLeft??s.timeLeft??s.time;for(let i=0;i<60;i++)events.UpdateEvent();s=script.api.getState();assert.equal(s.roundTimeLeft??s.timeLeft??s.time,before);assert.equal(script.pausePanel.enabled,true);
  script.api.resume();assert.equal(script.api.getState().phase||script.api.getState().state,'playing');events.OnDisableEvent();assert.equal(script.api.getState().phase||script.api.getState().state,'paused');
  if(slug==='snack-catch'){script.api.resume();events.TouchStartEvent({getTouchPosition:()=>({x:.75,y:.5})});assert.ok(script.api.getState().basket.x>180);assert.ok(script.basket.t.anchors.left>=-1);}
 });
}
