'use strict';

// focus is the subject of each artwork (fractions of the image); zoom mirrors --zoom in styles.css.
const MODES = [
  { id:'frontline', code:'FTL', display:'FRONTLINE', title:'冲锋团队竞技', image:'assets/frontline_preview.webp', original:'assets/frontline_preview_full.webp', type:'PVP', source:'REGRESSION / FTL', tagline:'守住阵线。向前推进。', brief:'从各自基地重返战场，与队友协同推进。击杀对手积累团队分数；阵亡后在己方基地复活，再次投入交锋。', combat:'团队对抗', mechanic:'固定基地', mechanicLabel:'复活', goal:'击杀得分', coords:'X 064 / Y -052 / Z 128', focus:[.67,.37], zoom:1 },
  { id:'teamdeathmatch', code:'TDM', display:'TEAM DEATHMATCH', title:'战术团队竞技', image:'assets/team_death_match_preview.webp', original:'assets/team_death_match_preview_full.webp', type:'PVP', source:'REGRESSION / TDM', tagline:'观察局势。变换攻势。', brief:'复活位置随战场局势动态选择。灵活转移、协同交锋，以击杀积累团队分数，在不断变化的战况中争取优势。', combat:'团队对抗', mechanic:'动态选点', mechanicLabel:'复活', goal:'击杀得分', coords:'X -211 / Y -048 / Z 077', focus:[.6,.4], zoom:1 },
  { id:'zombies', code:'ZMB', display:'ZOMBIES', title:'僵尸模式', image:'assets/zombies_preview.webp', original:'assets/zombies_preview_full.webp', type:'PVE', source:'REGRESSION / ZMB', tagline:'黑暗之中，彼此就是防线。', brief:'击杀与助攻积攒点数，补充火力。利用地图设施开启通路、恢复供电，和队友合力撑过下一波。', combat:'合作生存', mechanic:'波次推进', mechanicLabel:'机制', goal:'抵御尸潮', coords:'X 302 / Y -057 / Z -019', focus:[.46,.36], zoom:1.15 },
];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const hero = $('.hero');
const media = $('.hero-media');
const ring = $('.lab-ring');
const dialog = $('#visual-dialog');
const frames = $$('.hero-frame');
const selectors = $$('[data-select-mode]');
const bars = $$('.mode-progress i');
const modeOptions = $('.mode-options');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer:fine)');
// Start with the title's post-flicker recolor, then linearly ramp both pulse clocks over 1.3s.
const pulseTempo = (() => {
  const duration=1300;
  let from=1,to=1,started=0,raf=0;
  const at=(time=performance.now()) => from+(to-from)*Math.max(0,Math.min(1,(time-started)/duration));
  function sync(time=performance.now()) {
    if(reduced.matches){from=to;if(raf)cancelAnimationFrame(raf);raf=0;}
    const animation=$('.header-status .led')?.getAnimations().find(item=>item.animationName==='led-pulse');
    // Updating playback rate keeps the LED's current phase; changing duration would jump it.
    if(animation)animation.updatePlaybackRate(at(time));
  }
  function frame(time) {
    raf=0;sync(time);
    if(!reduced.matches&&time<started+duration)raf=requestAnimationFrame(frame);
  }
  return {
    at,sync,
    set(infected) {
      const target=infected?2.5:1;
      if(target===to)return;
      const time=performance.now();from=at(time);to=target;started=time;
      if(raf)cancelAnimationFrame(raf);raf=0;
      sync(time);
      if(!reduced.matches&&from!==to)raf=requestAnimationFrame(frame);
    },
  };
})();
const cycleDuration = 8000;
let current = 0;
let paused = reduced.matches;
let inView = true;
let focused = false;
let changing = false;
let requestId = 0;
let clockAnimation = null;
let wordToken = 0;
let recordTimer;
let touchStart;
const loading = new Map();

function loadFrame(index) {
  if(loading.has(index)) return loading.get(index);
  const img = frames[index].querySelector('img');
  if(!img.src) img.src = img.dataset.src;
  const result = img.decode ? img.decode() : new Promise((resolve,reject) => {
    if(img.complete && img.naturalWidth) resolve(); else {img.onload=resolve;img.onerror=reject;}
  });
  loading.set(index,result);
  result.catch(() => loading.delete(index));
  return result;
}
function playAllowed() { return !paused && inView && !document.hidden && !focused && !dialog.open && !changing; }
function syncClock() {
  if(!clockAnimation) return;
  if(playAllowed()) clockAnimation.play();
  else clockAnimation.pause();
}
function resetClock() {
  clockAnimation?.cancel();clockAnimation=null;
  bars.forEach((bar,i) => {bar.style.transform = 'scaleX(' + (i === current && paused ? 1 : 0) + ')';});
  if(paused) return;
  const animation = bars[current].animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:cycleDuration,fill:'forwards',easing:'linear'});
  clockAnimation=animation;
  animation.onfinish = () => {if(clockAnimation === animation && !paused) selectMode((current+1)%MODES.length);};
  syncClock();
}
// Headlines sputter on like a sculk sensor catching a signal, then the soul glow decays.
const glow = (alpha) => '0 0 26px rgba(42,212,198,' + alpha + '),0 0 3px rgba(42,212,198,' + alpha + ')';
const FLICKER_IN = [
  {opacity:0,filter:'blur(5px)',textShadow:glow(0)},
  {opacity:.8,filter:'blur(1.5px)',textShadow:glow(.9),offset:.06},
  {opacity:.06,offset:.12},
  {opacity:.6,offset:.18},
  {opacity:.12,offset:.24},
  {opacity:1,filter:'blur(0px)',textShadow:glow(.85),offset:.34},
  {opacity:.4,offset:.41},
  {opacity:1,textShadow:glow(.6),offset:.48},
  {opacity:1,filter:'blur(0px)',textShadow:glow(0)},
];
const FLICKER_OUT = [{opacity:1},{opacity:.15,offset:.3},{opacity:.7,offset:.5},{opacity:0}];
function flicker(element,options={}) {
  return element.animate(FLICKER_IN,{duration:850,easing:'linear',fill:'backwards',...options});
}
// After the flicker settles, Zombies turns the word and the sculk glow to the mode's dark red.
function settleGlow() {
  const infected=MODES[current].id==='zombies';
  document.body.classList.toggle('infected',infected);
  sculk.tint(infected);floor.tint(infected);
}
function showWord(text) {
  const element = $('#mode-display');
  const token = ++wordToken;
  element.getAnimations().forEach((animation) => animation.cancel());
  const swap = () => {
    // Drop any red instantly so the new word flickers in white; sculk eases back to cyan meanwhile.
    element.style.transition='none';document.body.classList.remove('infected');element.getBoundingClientRect();element.style.transition='';
    sculk.tint(false);floor.tint(false);
    element.textContent=text;element.classList.toggle('is-long',text.length>12);
    if(reduced.matches) {settleGlow();return;}
    flicker(element).onfinish = () => {if(token===wordToken)settleGlow();};
  };
  if(reduced.matches) {swap();return;}
  const out = element.animate(FLICKER_OUT,{duration:200,easing:'linear',fill:'forwards'});
  out.onfinish = () => {if(token!==wordToken)return;swap();out.cancel();};
}
// Crop each artwork (object-fit:cover) so its subject lands at the same spot of the media area,
// then map that subject through the crop and zoom to hero coordinates for the ring.
function coverSize() {
  const width=media.clientWidth,height=media.clientHeight;
  const imageWidth=Math.max(width,height*16/9);
  return {width,height,imageWidth,imageHeight:imageWidth*9/16};
}
function fitFrames() {
  const {width,height,imageWidth,imageHeight}=coverSize();
  if(!width||!height) return;
  const goal=hero.clientWidth<=680?[.6,.4]:[.6,.44];
  const fit=(size,image,target,focus) => size===image?.5:Math.max(0,Math.min(1,(target*size-focus*image)/(size-image)));
  MODES.forEach((mode,i) => {
    mode.position=[fit(width,imageWidth,goal[0],mode.focus[0]),fit(height,imageHeight,goal[1],mode.focus[1])];
    frames[i].querySelector('img').style.objectPosition=mode.position.map((value) => (value*100).toFixed(2)+'%').join(' ');
  });
}
function placeRing() {
  const mode=MODES[current];
  const {width,height,imageWidth,imageHeight}=coverSize();
  if(!width||!height||!mode.position) return null;
  let x=(width-imageWidth)*mode.position[0]+imageWidth*mode.focus[0];
  let y=(height-imageHeight)*mode.position[1]+imageHeight*mode.focus[1];
  x=width/2+(x-width/2)*mode.zoom+media.offsetLeft;
  y=height/2+(y-height/2)*mode.zoom+media.offsetTop;
  if(hero.clientWidth>680) {
    // Keep the ring and its side label clear of the headline column.
    const heroLeft=hero.getBoundingClientRect().left;
    const copyRight=Math.max(...$$('.hero h1,.hero-lede,.hero-actions>*').map((element) => element.getBoundingClientRect().right))-heroLeft;
    const labelWidth=$('.ring-label').offsetWidth,radius=ring.offsetWidth/2;
    x=Math.max(x,labelWidth?copyRight+labelWidth+58+radius:copyRight+24+radius*.5);
  }
  hero.style.setProperty('--ring-x',Math.round(x)+'px');
  hero.style.setProperty('--ring-y',Math.round(y)+'px');
  return {x,y};
}
function updateRecord(mode) {
  const specs = $('.record-specs');
  specs?.classList.add('is-refreshing');
  $('#record-image').src=mode.image;
  $('#record-image').alt=mode.title+'完整画面';
  $('#record-image').style.opacity='1';
  $('#record-count').textContent='0'+(current+1);
  $('#record-type').textContent=mode.type;
  $('#record-source').textContent=mode.source;
  $('#record-title').textContent=mode.title;
  $('#record-tagline').textContent=mode.tagline;
  $('#record-brief').textContent=mode.brief;
  $('#record-combat').textContent=mode.combat;
  $('#record-mechanic').textContent=mode.mechanic;
  $('#mechanic-label').textContent=mode.mechanicLabel;
  $('#record-goal').textContent=mode.goal;
  setTimeout(() => specs?.classList.remove('is-refreshing'), 200);
}
async function selectMode(index, manual=false) {
  if(index<0 || index>=MODES.length) return;
  if(manual) {paused=true;syncClock();}
  const token=++requestId;
  if(index===current) {changing=false;resetClock();return;}
  changing=true;syncClock();
  try {await loadFrame(index);} catch {
    if(token!==requestId) return;
    changing=false;$('#mode-announcement').textContent='图片暂时无法加载，请重试。';resetClock();return;
  }
  if(token!==requestId) return;
  current=index;changing=false;
  const mode=MODES[index];
  document.body.dataset.mode=mode.id;
  frames.forEach((frame,i) => {frame.classList.toggle('is-active',i===index);frame.setAttribute('aria-hidden',String(i!==index));});
  selectors.forEach((button) => {
    const selected=Number(button.dataset.selectMode)===index;
    button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));
  });
  $('#visual-id').textContent=mode.code;
  $('#ring-coords').textContent=mode.coords;
  modeOptions.style.setProperty('--index',index);
  showWord(mode.display);
  const target=placeRing();
  if(!reduced.matches&&target) {
    sculk.vibrate(target.x,target.y,900);
    setTimeout(() => sculk.vibrate(target.x+15,target.y+10,0), 120);
  }
  const recordVisual = $('.record-visual');
  if(recordVisual && !reduced.matches) {
    recordVisual.classList.add('is-scanning');
    setTimeout(() => recordVisual.classList.remove('is-scanning'), 1800);
  }
  clearTimeout(recordTimer);
  $('#record-image').style.opacity='.3';
  recordTimer=setTimeout(() => updateRecord(mode),reduced.matches ? 0 : 200);
  if(manual) $('#mode-announcement').textContent='已选择'+mode.title;
  resetClock();
}
selectors.forEach((button) => button.addEventListener('click',() => selectMode(Number(button.dataset.selectMode),true)));
modeOptions.addEventListener('keydown',(event) => {
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const target=event.key==='Home'?0:event.key==='End'?2:(current+(event.key==='ArrowRight'?1:2))%3;
  selectMode(target,true);$('.mode-option[data-select-mode="'+target+'"]').focus();
});
for(const region of [hero,modeOptions]) {
  region.addEventListener('focusin',() => {focused=true;syncClock();});
  region.addEventListener('focusout',(event) => {if(!region.contains(event.relatedTarget)){focused=false;syncClock();}});
}
hero.addEventListener('pointerdown',(event) => {if(event.pointerType==='touch'&&!event.target.closest('a,button'))touchStart={x:event.clientX,y:event.clientY};});
hero.addEventListener('pointerup',(event) => {
  if(!touchStart)return;
  const dx=event.clientX-touchStart.x,dy=event.clientY-touchStart.y;touchStart=null;
  if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)selectMode((current+(dx<0?1:2))%3,true);
});
hero.addEventListener('pointercancel',() => {touchStart=null;});
hero.addEventListener('click',(event) => {
  if(event.target.closest('a,button')||reduced.matches)return;
  const rect=hero.getBoundingClientRect();
  sculk.vibrate(event.clientX-rect.left,event.clientY-rect.top);
});

function openVisual() {
  const mode=MODES[current];
  $('#full-visual').src=mode.original;$('#full-visual').alt=mode.title+'完整宣传原画';
  $('#visual-dialog-title').textContent=mode.title+' / 原画';
  dialog.showModal();document.body.classList.add('dialog-open');syncClock();
  if(!reduced.matches)dialog.animate([{opacity:0,transform:'translateY(30px) scale(.94)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:550,easing:'cubic-bezier(.2,1.25,.35,1)'});
}
$('.record-open').addEventListener('click',openVisual);
$('#close-visual').addEventListener('click',() => dialog.close());
dialog.addEventListener('click',(event) => {if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',() => {document.body.classList.remove('dialog-open');syncClock();});
$('#copy-environment').addEventListener('click',async() => {
  const btn = $('#copy-environment');
  btn.classList.add('copied');
  setTimeout(() => btn.classList.remove('copied'), 600);
  const content='COD Pattern 作战环境\nMinecraft 1.20.1\nJava 17\nForge 47+（项目构建版本 47.4.0）\nTaCZ 1.1.6+\nCOD Pattern 主模组\n可选：COD Pattern Zombies 独立附属\n客户端与服务端保持对应模组一致。';
  const legacyCopy=() => {const input=document.createElement('textarea');input.value=content;input.style.cssText='position:fixed;opacity:0';document.body.append(input);input.select();const success=document.execCommand('copy');input.remove();if(!success)throw new Error('Clipboard unavailable');};
  try {
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(content).catch(legacyCopy);
    else legacyCopy();
    $('#copy-status').textContent='已复制，准备出发。';
  }catch{$('#copy-status').textContent='复制不可用，请选取上方环境信息。';}
});

// Sculk: a pixel band grown from a seeded height field. Souls pulse, react to the pointer,
// and light up as vibration waves pass. Drawn at 30fps (20 on small screens), only while visible.
const CYAN=[42,212,198],RED=[178,52,48];
let infectedGlow=false;
const SHADES=['#04171d','#051e25','#07252c','#092c33','#0b343b'];
function seeded(seed) {
  return () => {seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
function growBand(width,rows,size,seed) {
  const rand=seeded(seed),cols=Math.ceil(width/size)+1,phase=[rand()*6.3,rand()*6.3,rand()*6.3];
  const cells=[],souls=[],heights=[];
  for(let c=0;c<cols;c++) {
    const wave=.42+Math.sin(c*.07+phase[0])*.2+Math.sin(c*.19+phase[1])*.12+Math.sin(c*.47+phase[2])*.06;
    let height=Math.max(1,Math.round(rows*wave+(rand()-.5)*1.6));
    if(rand()<.06) height+=Math.round(2+rand()*rows*.4);
    heights.push(height);
    for(let r=0;r<height;r++) {
      const top=r===height-1;
      cells.push([c,r,top&&rand()<.55?'#0e434a':SHADES[Math.min(4,Math.floor(rand()*2.6+r/height*2.2))]]);
      if(!top&&rand()<.05) souls.push({c,r,phase:rand()*6.3,speed:.0008+rand()*.0016,seed:rand()});
    }
    if(height>rows*.75&&rand()<.45) souls.push({c,r:height-1,phase:rand()*6.3,speed:.0018+rand()*.002,seed:rand()});
  }
  const maxRows=Math.max(...heights);
  return {cols,cells,souls,heights,size,maxRows,height:maxRows*size};
}
function paintCells(context,band,baseY) {
  for(const [c,r,color] of band.cells) {context.fillStyle=color;context.fillRect(c*band.size,baseY-(r+1)*band.size,band.size,band.size);}
}
function paintSoul(context,x,y,size,glow,rgb) {
  context.fillStyle='rgba('+rgb+','+(.16+glow*.84).toFixed(3)+')';
  context.fillRect(x,y,size,size);
  if(glow>.35) {context.fillStyle='rgba('+rgb+','+((glow-.35)*.22).toFixed(3)+')';context.fillRect(x-size,y-size,size*3,size*3);}
}
function prepareCanvas(element,width,height) {
  const dpr=Math.min(devicePixelRatio||1,width<700?1.5:2);
  element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);
  const context=element.getContext('2d');context.setTransform(dpr,0,0,dpr,0,0);
  return {context,dpr};
}

const sculk = (() => {
  const canvas=$('#sculk-field');
  let ctx=null,width=0,height=0,band=null,layer=null,motes=[],waves=[],growStart=0,raf=0,lastFrame=0,lastDraw=0;
  let soul=CYAN.slice(),soulGoal=CYAN,tintFrom=CYAN.slice(),tintStart=0;
  let soulClock=performance.now();
  let mouseX=-1e4,mouseY=-1e4,targetX=0,targetY=0,springX=0,springY=0,velocityX=0,velocityY=0;
  // The radar has its own mass: delayed input, with velocity retained when the pointer changes direction.
  const radarLag=180,radarInputs=[];
  let radarX=0,radarY=0,radarVelocityX=0,radarVelocityY=0,radarTargetX=0,radarTargetY=0;
  function resetParallax() {
    targetX=targetY=springX=springY=velocityX=velocityY=0;
    radarX=radarY=radarVelocityX=radarVelocityY=radarTargetX=radarTargetY=0;
    radarInputs.length=0;media.style.transform='';ring.style.transform='';
  }
  function moveRadar(time,dt) {
    const pending=radarInputs[radarInputs.length-1];
    if(targetX!==(pending?.x??radarTargetX)||targetY!==(pending?.y??radarTargetY)) {
      radarInputs.push({time,x:targetX,y:targetY});
    }
    while(radarInputs.length&&radarInputs[0].time<=time-radarLag) {
      const input=radarInputs.shift();radarTargetX=input.x;radarTargetY=input.y;
    }
    const moving=Math.abs(radarTargetX-radarX)+Math.abs(radarTargetY-radarY)+Math.abs(radarVelocityX)+Math.abs(radarVelocityY)>.0005;
    if(!moving)return;
    radarVelocityX=(radarVelocityX+(radarTargetX-radarX)*.006*dt)*Math.pow(.91,dt);
    radarVelocityY=(radarVelocityY+(radarTargetY-radarY)*.006*dt)*Math.pow(.91,dt);
    radarX+=radarVelocityX*dt;radarY+=radarVelocityY*dt;
    ring.style.transform='translate3d('+(radarX*24).toFixed(2)+'px,'+(radarY*16).toFixed(2)+'px,0)';
  }
  function resize() {
    const w=hero.clientWidth,h=hero.clientHeight;
    if(!w||(w===width&&h===height))return;
    width=w;height=h;
    if(width<=680||!finePointer.matches||reduced.matches)resetParallax();
    pulseTempo.sync();
    let dpr;({context:ctx,dpr}=prepareCanvas(canvas,width,height));
    const size=width<700?5:6;
    band=growBand(width,width<700?9:12,size,1937);
    layer=document.createElement('canvas');layer.width=Math.round(width*dpr);layer.height=Math.round(band.height*dpr);
    const layerCtx=layer.getContext('2d');layerCtx.setTransform(dpr,0,0,dpr,0,0);
    paintCells(layerCtx,band,band.height);
    if(reduced.matches||!inView)draw(performance.now(),true);
  }
  function grown(time) {
    if(!growStart)return 0;
    const t=Math.min(1,(time-growStart)/1900);
    return 1-Math.pow(1-t,3);
  }
  function draw(time,still=false) {
    if(!ctx||!band)return;
    ctx.clearRect(0,0,width,height);
    // Soul colour moves to its goal over 2s: red accelerates in (ease-in cubic, same as the word in
    // styles.css), cyan eases back out.
    const tintProgress=Math.min(1,(time-tintStart)/2000),eased=infectedGlow?tintProgress**3:1-(1-tintProgress)**3;
    soul=still?soulGoal.slice():tintFrom.map((value,i) => value+(soulGoal[i]-value)*eased);
    const rgb=soul.map(Math.round).join(',');
    const top=height-band.height,size=band.size,progress=still?1:grown(time);
    const origin=parseFloat(hero.style.getPropertyValue('--ring-x'))||width*.75;
    const reach=Math.max(origin,width-origin)+260;
    const visible=(c,r) => progress>=1||r<Math.ceil(band.heights[c]*Math.max(0,Math.min(1,(progress*reach-Math.abs(c*size-origin))/260)));
    if(progress<1) {
      ctx.save();ctx.beginPath();
      band.heights.forEach((h,c) => {let rows=0;while(rows<h&&visible(c,rows))rows++;if(rows)ctx.rect(c*size,height-rows*size,size,rows*size);});
      ctx.clip();ctx.drawImage(layer,0,top,width,band.height);ctx.restore();
    } else ctx.drawImage(layer,0,top,width,band.height);
    waves=waves.filter((wave) => time-wave.t<1800);
    for(const soul of band.souls) {
      if(!visible(soul.c,soul.r))continue;
      const x=soul.c*size,y=height-(soul.r+1)*size;
      let glow=still?soul.seed*.5:Math.pow(Math.max(0,Math.sin(soulClock*soul.speed+soul.phase)),6)*.85;
      glow+=Math.max(0,1-Math.hypot(mouseX-x,mouseY-y)/160)*.8;
      for(const wave of waves) {
        const age=(time-wave.t)/1000;if(age<0)continue;
        glow+=Math.max(0,1-Math.abs(Math.abs(x-wave.x)-age*560)/70)*(1-age/1.8);
      }
      paintSoul(ctx,x,y,size,Math.min(1,glow),rgb);
      if(!still&&glow>.6&&motes.length<(width<700?10:22)&&Math.random()<.04)motes.push({x:x+size/2,y,born:time,drift:Math.random()*6.3});
    }
    if(still)return;
    for(const wave of waves) {
      for(let k=0;k<3;k++) {
        const age=(time-wave.t)/1000-k*.17;if(age<=0)continue;
        const radius=age*170,alpha=1-age/1.15;if(alpha<=0)continue;
        const dots=Math.max(16,Math.round(radius*1.05));
        ctx.fillStyle='rgba('+rgb+','+(alpha*.55).toFixed(3)+')';
        for(let i=0;i<dots;i++) {
          const angle=i/dots*Math.PI*2;
          ctx.fillRect(Math.round((wave.x+Math.cos(angle)*radius)/3)*3,Math.round((wave.y+Math.sin(angle)*radius*.86)/3)*3,3,3);
        }
      }
    }
    motes=motes.filter((mote) => time-mote.born<2600);
    for(const mote of motes) {
      const age=(time-mote.born)/2600;
      ctx.fillStyle='rgba('+rgb+','+((1-age)*.7).toFixed(3)+')';
      ctx.fillRect(Math.round(mote.x+Math.sin(age*5+mote.drift)*6),Math.round(mote.y-age*90),3,3);
    }
  }
  function frame(time) {
    raf=0;
    if(reduced.matches){resetParallax();draw(time,true);return;}
    if(!inView||document.hidden)return;
    const previous=lastFrame||time-16.667,elapsed=time-previous;
    const dt=Math.min(elapsed/16.667,2);lastFrame=time;
    // Advance the pulse phase continuously so changing tempo never jumps the lights.
    soulClock+=elapsed*(pulseTempo.at(previous)+pulseTempo.at(time))*.5;
    if(finePointer.matches&&width>680) {
      const moving=Math.abs(targetX-springX)+Math.abs(targetY-springY)+Math.abs(velocityX)+Math.abs(velocityY)>.0005;
      if(moving) {
        velocityX=(velocityX+(targetX-springX)*.06*dt)*Math.pow(.8,dt);
        velocityY=(velocityY+(targetY-springY)*.06*dt)*Math.pow(.8,dt);
        springX+=velocityX*dt;springY+=velocityY*dt;
        media.style.transform='translate3d('+(springX*-10).toFixed(2)+'px,'+(springY*-7).toFixed(2)+'px,0)';
      }
      moveRadar(time,dt);
    }
    if(time-lastDraw>(width<700?50:33)){draw(time);lastDraw=time;}
    raf=requestAnimationFrame(frame);
  }
  function sync() {
    if(raf)cancelAnimationFrame(raf);raf=0;lastFrame=0;
    if(inView&&!document.hidden&&!reduced.matches)raf=requestAnimationFrame(frame);
    else {
      radarInputs.length=0;radarTargetX=targetX;radarTargetY=targetY;
      if(reduced.matches){resetParallax();draw(performance.now(),true);}
    }
  }
  finePointer.addEventListener('change',() => {if(!finePointer.matches)resetParallax();});
  hero.addEventListener('pointermove',(event) => {
    if(event.pointerType!=='mouse'||reduced.matches)return;
    const rect=hero.getBoundingClientRect();mouseX=event.clientX-rect.left;mouseY=event.clientY-rect.top;
    targetX=Math.max(-1,Math.min(1,(mouseX/rect.width-.5)*2));targetY=Math.max(-1,Math.min(1,(mouseY/rect.height-.5)*2));
  },{passive:true});
  hero.addEventListener('pointerleave',() => {targetX=0;targetY=0;mouseX=-1e4;mouseY=-1e4;});
  return {
    resize,sync,
    grow() {growStart=performance.now();},
    vibrate(x,y,delay=0) {if(waves.length<6)waves.push({x,y,t:performance.now()+delay});},
    tint(infected) {
      if(infectedGlow!==infected) {pulseTempo.set(infected);infectedGlow=infected;soulGoal=infected?RED:CYAN;tintFrom=soul.slice();tintStart=performance.now();}
      if(reduced.matches||!inView)draw(performance.now(),true);
    },
  };
})();

// Bottom sculk: a still band whose souls follow the hero tint with the same 2s curves. If the tint
// changes while the band is off screen, the change waits until it scrolls into view.
const floor = (() => {
  const canvas=$('#sculk-floor');
  let ctx=null,band=null,layer=null,width=0,height=0,raf=0,start=0,pending=false;
  let visible=!('IntersectionObserver' in window),shown=CYAN.slice(),from=CYAN.slice(),goal=CYAN;
  function paint() {
    if(!ctx)return;
    ctx.clearRect(0,0,width,height);ctx.drawImage(layer,0,0,width,height);
    const rgb=shown.map(Math.round).join(',');
    for(const soul of band.souls)paintSoul(ctx,soul.c*band.size,height-(soul.r+1)*band.size,band.size,soul.seed*.75,rgb);
  }
  function step(time) {
    raf=0;
    const progress=Math.min(1,Math.max(0,(time-start)/2000)),eased=goal===RED?progress**3:1-(1-progress)**3;
    shown=from.map((value,i) => value+(goal[i]-value)*eased);
    paint();
    if(progress<1)raf=requestAnimationFrame(step);
  }
  function run() {
    pending=false;
    if(reduced.matches) {shown=goal.slice();paint();return;}
    from=shown.slice();start=performance.now();
    if(!raf)raf=requestAnimationFrame(step);
  }
  return {
    resize() {
      width=canvas.clientWidth;height=canvas.clientHeight;
      if(!width)return;
      let dpr;({context:ctx,dpr}=prepareCanvas(canvas,width,height));
      band=growBand(width,width<700?11:14,width<700?5:6,4242);
      layer=document.createElement('canvas');layer.width=Math.round(width*dpr);layer.height=Math.round(height*dpr);
      const layerCtx=layer.getContext('2d');layerCtx.setTransform(dpr,0,0,dpr,0,0);
      paintCells(layerCtx,band,height);
      paint();
    },
    tint(infected) {
      const next=infected?RED:CYAN;
      if(next===goal)return;
      goal=next;
      if(visible)run();else pending=true;
    },
    show(isVisible) {visible=isVisible;if(visible&&pending)run();},
  };
})();

function settleRing() {
  fitFrames();ring.style.transition='none';placeRing();ring.getBoundingClientRect();ring.style.transition='';
}
if('ResizeObserver' in window) {
  new ResizeObserver(() => {sculk.resize();settleRing();}).observe(hero);
  new ResizeObserver(() => floor.resize()).observe($('#sculk-floor'));
} else {
  window.addEventListener('resize',() => {sculk.resize();settleRing();floor.resize();},{passive:true});
}
if('IntersectionObserver' in window) {
  new IntersectionObserver((entries)=>{inView=entries[0].isIntersecting;syncClock();sculk.sync();},{threshold:0}).observe(hero);
  new IntersectionObserver((entries)=>floor.show(entries[0].isIntersecting),{threshold:.25}).observe($('#sculk-floor'));
}
document.addEventListener('visibilitychange',()=>{pulseTempo.sync();syncClock();sculk.sync();});
reduced.addEventListener('change',()=>{pulseTempo.sync();sculk.sync();if(reduced.matches){paused=true;resetClock();document.getAnimations().filter(a=>a!==clockAnimation&&a.effect?.getComputedTiming().endTime!==Infinity).forEach(a=>a.cancel());}});
settleRing();sculk.resize();floor.resize();resetClock();sculk.sync();

// Hold the hero copy until the intro runs, so the fallback font never flashes before the flicker.
if(!reduced.matches)document.documentElement.classList.add('intro-pending');
function intro() {
  settleRing();
  document.documentElement.classList.remove('intro-pending');
  if(reduced.matches)return;
  sculk.grow();
  const ease='cubic-bezier(.16,1,.3,1)';
  flicker($('.hero h1'),{delay:120});
  flicker($('#mode-display'),{delay:520});
  $$('.hero-kicker,.hero-lede,.hero-actions,.hero-env').forEach((element,i)=>element.animate([{opacity:0},{opacity:1}],{duration:900,delay:i===0?60:520+i*110,easing:'ease-out',fill:'backwards'}));
  $('.rl-main').animate([{strokeDashoffset:360},{strokeDashoffset:0}],{duration:1800,delay:150,easing:ease,fill:'backwards'});
  ring.animate([{opacity:0,scale:.86},{opacity:1,scale:1}],{duration:1600,delay:100,easing:ease,fill:'backwards'});
}
Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1800))]).then(intro);
const idle=window.requestIdleCallback||((callback)=>setTimeout(callback,800));
idle(()=>{loadFrame(1).catch(()=>{});loadFrame(2).catch(()=>{});},{timeout:1800});

// Tactical HUD scroll reveal
if('IntersectionObserver' in window && !reduced.matches) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if(entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  $$('.reveal-item').forEach((el) => revealObserver.observe(el));
} else {
  $$('.reveal-item').forEach((el) => el.classList.add('is-revealed'));
}

// Tactical subtle parallax tilt on artwork
const visualCard = $('.record-visual');
if(finePointer.matches && visualCard) {
  visualCard.addEventListener('pointermove', (e) => {
    if(reduced.matches) return;
    const rect = visualCard.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const img = visualCard.querySelector('img');
    if(img) img.style.transform = `scale(1.045) translate3d(${(x * 14).toFixed(1)}px, ${(y * 10).toFixed(1)}px, 0)`;
  });
  visualCard.addEventListener('pointerleave', () => {
    const img = visualCard.querySelector('img');
    if(img) img.style.transform = '';
  });
}
