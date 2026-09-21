// Generated with the matching tested core. See native/README.md.
//@input Component.ScreenTransform playArea
//@input Component.ScreenTransform pauseButton
//@input Component.Text scoreText
//@input Component.Text timeText
//@input Component.Text messageText
//@input SceneObject startPanel
//@input SceneObject overPanel
//@input SceneObject pausePanel
//@input SceneObject basket
//@input SceneObject[] itemPool
//@input SceneObject movingBlock
//@input SceneObject[] layerPool
//@input Component.Text targetText
//@input Component.Text targetSymbol
//@input Component.ScreenTransform[] choiceTransforms
//@input Component.Text[] choiceLabels

(function () {
 'use strict';
 var game=PocketCore.createGame(GAME_ID==='color-panic'?{random:Math.random}:{rng:Math.random});
 var best=0,store=null,acc=0,dragging=false,previousPhase='ready';
 var key='pocket-party-'+GAME_ID+'-best';
 try {store=global.persistentStorageSystem.store;best=Math.max(0,store.getInt(key)||0);}catch(e){}
 function state(){return GAME_ID==='snack-catch'?game:game.getState();}
 function phase(){var s=state();return s.phase||s.state;}
 function component(so,name){return so?so.getComponent('Component.'+name):null;}
 function enable(so,on){if(so)so.enabled=on;}
 function text(t,s){if(t)t.text=String(s);}
 function rect(so,x,y,w,h){var st=component(so,'ScreenTransform');if(!st)return;var a=st.anchors;a.left=x/180-1;a.right=(x+w)/180-1;a.top=1-y/320;a.bottom=1-(y+h)/320;st.offsets.left=st.offsets.right=st.offsets.top=st.offsets.bottom=0;}
 function start(){game.start();acc=0;dragging=false;render();}
 function pause(){game.pause();dragging=false;render();}
 function resume(){game.resume();acc=0;render();}
 function inside(st,p){return st&&st.containsScreenPoint(p);}
 function local(p){return script.playArea?script.playArea.screenPointToLocalPoint(p):null;}
 function setBasket(p){var v=local(p);if(v)game.setInput((v.x+1)*180);}
 function color(textComponent,hex){if(!textComponent)return;var n=parseInt(hex.slice(1),16);textComponent.textFill.color=new vec4(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,1);}
 var symbols=['▲','●','■','◆'];
 function render(){
  var s=state(),p=phase();
  if(p==='over'&&previousPhase!=='over'&&s.score>best){best=s.score;try{if(store)store.putInt(key,best);}catch(e){}}
  previousPhase=p;
  text(script.scoreText,'Score '+s.score+'  •  Best '+best);
  enable(script.startPanel,p==='ready'||p==='idle');enable(script.overPanel,p==='over');enable(script.pausePanel,p==='paused');
  var msg=p==='over'?'Score '+s.score+' — tap to retry':p==='paused'?'Paused — tap to resume':p==='ready'||p==='idle'?'Tap to start':'';
  if(GAME_ID==='snack-catch'){
   text(script.timeText,Math.ceil(s.timeLeft/1000)+'s  '+s.hearts+' hearts  ×'+s.multiplier);
   rect(script.basket,s.basket.x-s.basket.w/2,s.basket.y-s.basket.h/2,s.basket.w,s.basket.h);
   var pool=script.itemPool||[];
   for(var i=0;i<pool.length;i++){var it=s.items[i];enable(pool[i],!!it);if(it){rect(pool[i],it.x-15,it.y-15,30,30);var t=component(pool[i],'Text');text(t,it.kind==='bomb'?'✹':'●');color(t,it.kind==='bomb'?'#ff5d5d':'#7dffb2');}}
  }else if(GAME_ID==='stack-rush'){
   text(script.timeText,s.layers.length+' layers  •  combo '+s.streak);
   var layers=script.layerPool||[],visible=[];
   for(var j=0;j<s.layers.length;j++){var r=game.toScreen(s.layers[j]);if(r.y+r.h>=0&&r.y<=640)visible.push(r);}
   for(var k=0;k<layers.length;k++){var l=visible[k];enable(layers[k],!!l);if(l)rect(layers[k],l.x,l.y,l.w,l.h);}
   enable(script.movingBlock,!!s.moving);if(s.moving){var m=game.toScreen(s.moving);rect(script.movingBlock,m.x,m.y,m.w,m.h);}
  }else{
   text(script.timeText,Math.ceil(s.roundTimeLeft)+'s  '+s.hearts+' hearts  •  '+s.targetTimeLeft.toFixed(1)+'s to match');
   if(s.targetIndex>=0){text(script.targetText,PocketCore.COLORS[s.targetWord].name);color(script.targetText,PocketCore.COLORS[s.targetIndex].hex);text(script.targetSymbol,symbols[s.targetIndex]);color(script.targetSymbol,PocketCore.COLORS[s.targetIndex].hex);}
   var labels=script.choiceLabels||[];for(var n=0;n<labels.length&&n<4;n++){text(labels[n],symbols[n]+' '+PocketCore.COLORS[n].name);color(labels[n],PocketCore.COLORS[n].hex);}
  }
  text(script.messageText,msg);
 }
 script.createEvent('TouchStartEvent').bind(function(e){
  var p=e.getTouchPosition();
  if(inside(script.pauseButton,p)){if(phase()==='playing')pause();else if(phase()==='paused')resume();return;}
  if(!inside(script.playArea,p))return;
  if(phase()==='ready'||phase()==='idle'||phase()==='over'){start();return;}
  if(phase()==='paused'){resume();return;}
  if(GAME_ID==='snack-catch'){dragging=true;setBasket(p);}
  else if(GAME_ID==='stack-rush')game.drop();
  else {var choices=script.choiceTransforms||[];for(var i=0;i<choices.length&&i<4;i++){if(inside(choices[i],p)){game.pressSlot(i);break;}}}
  render();
 });
 script.createEvent('TouchMoveEvent').bind(function(e){if(GAME_ID==='snack-catch'&&dragging&&phase()==='playing')setBasket(e.getTouchPosition());});
 script.createEvent('TouchEndEvent').bind(function(){dragging=false;});
 script.createEvent('UpdateEvent').bind(function(){
  var dt=Math.max(0,Math.min(getDeltaTime(),.1));acc+=dt;
  while(acc>=1/60){game.update(GAME_ID==='snack-catch'?1000/60:1/60);acc-=1/60;}
  if(typeof game.takeEvents==='function')game.takeEvents();if(typeof game.events==='function')game.events();render();
 });
 script.createEvent('OnStartEvent').bind(function(){global.touchSystem.touchBlocking=true;render();});
 script.createEvent('OnDisableEvent').bind(function(){if(phase()==='playing')pause();});
 script.api.start=start;script.api.pause=pause;script.api.resume=resume;script.api.getState=state;
 render();
})();
