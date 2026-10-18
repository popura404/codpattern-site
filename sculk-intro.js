'use strict';

// This is an entrance sequence, not a claim about downloaded bytes. Its clock is bounded.
(() => {
  const root=document.documentElement;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let resolveReady,resolveReveal;
  const gate=window.codpatternIntro={active:false,
    ready:new Promise(resolve=>{resolveReady=resolve;}),
    revealed:new Promise(resolve=>{resolveReveal=resolve;}),
  };
  const navigation=performance.getEntriesByType('navigation')[0];
  if(motion.matches || location.hash || navigation?.type==='back_forward') {resolveReveal();resolveReady();return;}

  const duration=4780,exitDuration=520;
  // Three brief holds, followed by catch-up bursts. Souls keep breathing while growth waits.
  const progressBeats=[
    [0,0],[280,.04],[680,.18],[1050,.34],[1530,.34],
    [1970,.58],[2380,.72],[2920,.72],[3530,.91],[4000,.91],
    [4300,.96],[duration,1],
  ];
  const shades=['#04171d','#051e25','#07252c','#092c33','#0b343b'];
  let overlay,canvas,ctx,count,status,stages,previousFocus;
  let width=0,height=0,size=12,cells=[],tiles=[];
  let raf=0,started=0,lastPaint=0,exitingAt=0,done=false,lastStage=-1;
  let resizeObserver;
  gate.active=true;
  root.classList.add('sculk-loading');
  // Installed before touching the DOM or canvas, so errors cannot strand the visitor.
  const watchdog=setTimeout(finish,duration+exitDuration+1500);

  function finish() {
    if(done)return;
    done=true;
    cancelAnimationFrame(raf);
    clearTimeout(watchdog);
    resizeObserver?.disconnect();
    window.removeEventListener('resize',onResize);
    window.removeEventListener('pagehide',finish);
    document.removeEventListener('visibilitychange',onVisibility);
    motion.removeEventListener('change',onMotion);
    const hadFocus=overlay?.contains(document.activeElement);
    if(overlay?.open)overlay.close();
    overlay?.remove();
    root.classList.remove('sculk-loading','sculk-intro-revealing');
    gate.active=false;
    resolveReveal();
    resolveReady();
    // Restore a real prior focus target; a page-load dialog has no trigger to focus.
    if(hadFocus && previousFocus?.isConnected && previousFocus!==document.body) {
      previousFocus.focus({preventScroll:true});
    }
  }

  function random(seed) {
    return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  }

  function progressAt(elapsed) {
    if(elapsed>=duration)return 1;
    for(let i=1;i<progressBeats.length;i++) {
      const [end,to]=progressBeats[i];
      if(elapsed>end)continue;
      const [start,from]=progressBeats[i-1];
      const t=Math.max(0,(elapsed-start)/(end-start));
      return from+(to-from)*(1-(1-t)*(1-t));
    }
    return 1;
  }

  function buildField() {
    width=overlay.clientWidth;height=overlay.clientHeight;
    const dpr=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
    size=Math.max(width<600?9:12,Math.ceil(width/160));
    const cols=Math.ceil(width/size),rows=Math.ceil(height/size),rand=random(404);
    const length=cols*rows,allowed=new Uint8Array(length);
    const distance=new Int16Array(length).fill(-1),parent=new Int32Array(length).fill(-1);
    const vein=new Uint8Array(length),roots=[(rows-1)*cols,cols-1],queue=[...roots];
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
      const nx=x/cols,ny=y/rows;
      // Uneven banks keep a quiet clearing around the title; every visible cell has a parent.
      const lower=.73+.065*Math.sin(x*.16)+.035*Math.sin(x*.49);
      const upper=.17+.06*Math.sin(x*.13+2)+.025*Math.sin(x*.43);
      const left=.10+.045*Math.sin(y*.22),right=.90+.04*Math.sin(y*.19+1);
      if(ny>lower || ny<upper || nx<left || nx>right)allowed[y*cols+x]=1;
    }
    roots.forEach(id=>{allowed[id]=1;distance[id]=0;});
    let farthest=1;
    for(let head=0;head<queue.length;head++) {
      const id=queue[head],x=id%cols,y=Math.floor(id/cols),next=[];
      if(x>0)next.push(id-1);if(x<cols-1)next.push(id+1);
      if(y>0)next.push(id-cols);if(y<rows-1)next.push(id+cols);
      for(let i=next.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[next[i],next[j]]=[next[j],next[i]];}
      for(const neighbour of next) {
        if(!allowed[neighbour] || distance[neighbour]>=0)continue;
        distance[neighbour]=distance[id]+1;parent[neighbour]=id;
        farthest=Math.max(farthest,distance[neighbour]);queue.push(neighbour);
      }
    }
    const tips=new Set();
    // Trace forked paths back to the two seeds, rather than scattering unrelated particles.
    for(let i=0;i<Math.min(90,Math.floor(queue.length/28));i++) {
      let id=queue[Math.floor((.18+rand()*.82)*(queue.length-1))];tips.add(id);
      while(id>=0 && !vein[id]){vein[id]=1;id=parent[id];}
    }
    cells=queue.map(id=>({x:(id%cols)*size,y:Math.floor(id/cols)*size,
      birth:distance[id]/farthest,shade:Math.floor(rand()*shades.length),vein:vein[id],
      soul:tips.has(id),seed:rand()}));
    const tileSize=Math.max(18,Math.ceil(width/90));
    tiles=[];
    for(let y=0;y<height;y+=tileSize)for(let x=0;x<width;x+=tileSize) {
      const travel=Math.hypot((x-width*.5)/width,(y-height*.48)/height)/.73;
      tiles.push({x,y,size:tileSize,birth:travel*.74+rand()*.18,cleared:false});
    }
  }

  function paint(progress,time) {
    ctx.globalAlpha=1;ctx.fillStyle='#050a12';ctx.fillRect(0,0,width,height);
    const level=Math.min(1,progress*1.14);
    for(const cell of cells) {
      if(cell.birth>level)continue;
      const age=level-cell.birth;
      ctx.globalAlpha=Math.min(1,age*16);
      ctx.fillStyle=shades[cell.shade];ctx.fillRect(cell.x,cell.y,size,size);
      if(cell.vein) {
        const front=Math.max(0,1-age/.065);
        ctx.globalAlpha=.17+front*.58;ctx.fillStyle='#2ad4c6';
        ctx.fillRect(cell.x,cell.y,size,size);
      }
      if(cell.soul) {
        const glow=.48+Math.sin(time*.002+cell.seed*7)*.18;
        ctx.globalAlpha=glow;ctx.fillStyle='#81ead4';
        ctx.fillRect(cell.x+size*.25,cell.y+size*.25,size*.5,size*.5);
        ctx.globalAlpha=glow*.09;ctx.fillStyle='#2ad4c6';
        ctx.fillRect(cell.x-size,cell.y-size,size*3,size*3);
      }
    }
    ctx.globalAlpha=1;
  }

  function updateReadout(progress) {
    const value=Math.min(100,Math.floor(progress*100));
    count.firstChild.nodeValue=String(value).padStart(2,'0');
    const stage=progress<.26?0:progress<.82?1:2;
    if(stage===lastStage)return;
    lastStage=stage;
    status.textContent=['微光未眠','深处有回声','归途将启'][stage];
    stages.forEach((item,index)=>item.classList.toggle('is-current',index<=stage));
  }

  function frame(time) {
    if(done)return;
    try {
      if(document.hidden){finish();return;}
      if(time-lastPaint<32){raf=requestAnimationFrame(frame);return;}
      lastPaint=time;
      if(!started)started=time;
      if(exitingAt) {
        const exit=(time-exitingAt)/exitDuration;
        // The dark surface opens from its clearing, leaving a jagged pixel edge behind.
        for(const tile of tiles)if(!tile.cleared && tile.birth<exit) {
          ctx.clearRect(tile.x,tile.y,tile.size+.5,tile.size+.5);tile.cleared=true;
        }
        if(exit>=1){finish();return;}
      } else {
        const progress=progressAt(time-started);
        paint(progress,time);updateReadout(progress);
        if(progress>=1) {
          exitingAt=time;
          overlay.classList.add('is-leaving');
          root.classList.add('sculk-intro-revealing');
          resolveReveal();
        }
      }
      raf=requestAnimationFrame(frame);
    } catch {finish();}
  }

  function onVisibility(){if(document.hidden)finish();}
  function onMotion(){if(motion.matches)finish();}
  function onResize() {
    if(done)return;
    if(exitingAt){finish();return;}
    try{buildField();paint(started?progressAt(performance.now()-started):0,performance.now());}
    catch{finish();}
  }
  function start() {
    if(done)return;
    if(document.hidden || motion.matches){finish();return;}
    try {
      overlay=document.getElementById('sculk-intro');
      if(!overlay?.showModal || getComputedStyle(overlay).position!=='fixed'){finish();return;}
      canvas=overlay.querySelector('canvas');ctx=canvas.getContext('2d');
      if(!ctx){finish();return;}
      count=overlay.querySelector('.sculk-intro-count');
      status=overlay.querySelector('.sculk-intro-status');stages=[...overlay.querySelectorAll('.sculk-intro-stages>span')];
      previousFocus=document.activeElement;
      overlay.addEventListener('cancel',event=>{event.preventDefault();finish();});
      overlay.showModal();buildField();paint(0,0);
      if('ResizeObserver' in window){resizeObserver=new ResizeObserver(onResize);resizeObserver.observe(overlay);}
      else window.addEventListener('resize',onResize,{passive:true});
      raf=requestAnimationFrame(frame);
    } catch {finish();}
  }
  document.addEventListener('visibilitychange',onVisibility);
  motion.addEventListener('change',onMotion);
  window.addEventListener('pagehide',finish,{once:true});
  document.addEventListener('DOMContentLoaded',start,{once:true});
})();
