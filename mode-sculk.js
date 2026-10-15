'use strict';

// Decoration follows aria-pressed, so pointer, keyboard and autoplay share one state.
(() => {
  const buttons = [...document.querySelectorAll('[data-select-mode]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const shades = ['#04191e','#062329','#082d32','#0b383b','#104449'];
  const states = [];
  const idleLevel=.065,hoverLevel=.42,confirmDuration=620,retreatDuration=340;
  let frameId = 0;
  let cycle = {index:-1,candidateIndex:-1,remaining:0,duration:8000,running:false,enabled:false,at:0};

  function remainingAt(time) {
    return Math.max(0,cycle.remaining-(cycle.running?Math.max(0,time-cycle.at):0));
  }

  function isCandidate(state) {
    return !reduced.matches && cycle.enabled && !state.active && state.index===cycle.candidateIndex;
  }

  function targetAt(state,time) {
    if(state.active) return 1;
    if(reduced.matches) return idleLevel;
    if(isCandidate(state)) {
      const progress=Math.max(0,Math.min(1,1-remainingAt(time)/cycle.duration));
      const checkpoint=state.growth?.checkpoint?.birth ?? hoverLevel;
      return idleLevel+(checkpoint-idleLevel)*progress;
    }
    return state.hovered || state.focused ? hoverLevel : idleLevel;
  }

  function random(seed) {
    return () => {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function makeGrowth(width,height,size,seed,compact) {
    const cols = Math.ceil(width/size), rows = Math.ceil(height/size);
    const length = cols*rows, rand = random(seed);
    const allowed = new Uint8Array(length), distance = new Int16Array(length).fill(-1);
    const parent = new Int32Array(length).fill(-1), vein = new Uint8Array(length);
    const roots = [(rows-1)*cols,(rows-1)*cols+cols-1];
    // A broad, uneven lower seam connects the two thinner side seams.
    for(let x=0;x<cols;x++) {
      const floor = compact ? 2+Math.round(rand()) : 3+Math.round((Math.sin(x*.37+seed)+1)*1.6+rand());
      for(let y=0;y<rows;y++) {
        const side = Math.min(x,cols-1-x);
        const edge = compact ? 1+Math.round(rand()) : 2+Math.round((Math.sin(y*.51+seed)+1)*.8);
        const corner = y<2 && (x<cols*.18 || x>cols*.82);
        if(rows-1-y<floor || side<edge || corner) allowed[y*cols+x] = 1;
      }
    }
    const queue = [...roots];
    roots.forEach(id => {allowed[id]=1;distance[id]=0;});
    let farthest = 1;
    // Every new pixel has a connected parent. Random neighbour order gives the veins forks.
    for(let head=0;head<queue.length;head++) {
      const id = queue[head], x = id%cols, y = Math.floor(id/cols);
      const neighbours = [];
      if(x>0) neighbours.push(id-1);
      if(x<cols-1) neighbours.push(id+1);
      if(y>0) neighbours.push(id-cols);
      if(y<rows-1) neighbours.push(id+cols);
      for(let i=neighbours.length-1;i>0;i--) {
        const j = Math.floor(rand()*(i+1));
        [neighbours[i],neighbours[j]] = [neighbours[j],neighbours[i]];
      }
      for(const next of neighbours) {
        if(!allowed[next] || distance[next]>=0) continue;
        distance[next]=distance[id]+1;parent[next]=id;
        farthest=Math.max(farthest,distance[next]);queue.push(next);
      }
    }
    const fringe = queue.filter(id => distance[id]>3 && (id%cols<4 || id%cols>=cols-4 || rand()<.2));
    const tips = [];
    const count = compact ? 6 : 18;
    for(let i=0;i<count && fringe.length;i++) {
      let id = fringe[Math.floor((i+.25+rand()*.5)/count*fringe.length)];
      tips.push(id);
      while(id>=0 && !vein[id]) {vein[id]=1;id=parent[id];}
    }
    const nodes = new Set(tips);
    const cells=queue.map(id => ({
      x:(id%cols)*size,y:Math.floor(id/cols)*size,
      birth:distance[id]/farthest,shade:Math.floor(rand()*shades.length),
      vein:vein[id],node:nodes.has(id),seed:rand(),
    }));
    let edgeNodes=cells.filter(cell=>cell.node &&
      (Math.min(cell.x,width-cell.x-size)<size*2 || cell.y>=height-size*2));
    if(!edgeNodes.length) edgeNodes=cells.filter(cell=>cell.node);
    // The candidate reaches one existing edge tip exactly when its real clock expires.
    const checkpoint=edgeNodes.reduce((best,cell)=>!best ||
      Math.abs(cell.birth-hoverLevel)<Math.abs(best.birth-hoverLevel)?cell:best,null);
    return {cols,rows,farthest,cells,checkpoint};
  }

  function levelAt(state,time) {
    const target=targetAt(state,time);
    if(reduced.matches || !state.duration) return target;
    const t = Math.max(0,Math.min(1,(time-state.started)/state.duration));
    return state.from+(target-state.from)*(1-Math.pow(1-t,2));
  }

  function movingAt(state,time) {
    if(reduced.matches) return false;
    return (state.duration>0 && time<state.started+state.duration+850) ||
      (isCandidate(state) && cycle.running && remainingAt(time)>0);
  }

  function paint(state,time) {
    const {ctx,width,height,size,growth} = state;
    if(!ctx || !growth) return;
    ctx.clearRect(0,0,width,height);
    const level=levelAt(state,time),candidate=isCandidate(state);
    const advancing=!reduced.matches && time<state.started+state.duration && targetAt(state,time)>state.from;
    const wave=reduced.matches || !state.duration ? 2 : (time-state.started)/850;
    const interaction=state.hovered || state.focused ? .08 : 0;
    const confirming=state.active && time<state.confirmUntil;
    for(const cell of growth.cells) {
      if(cell.birth>level) continue;
      const edge = Math.min(cell.x,width-cell.x-size);
      ctx.globalAlpha=.82;
      ctx.fillStyle=shades[cell.shade];
      ctx.fillRect(cell.x,cell.y,size,size);
      if(cell.vein) {
        ctx.globalAlpha=(state.active ? .36 : candidate ? .2 : .14)+interaction;
        ctx.fillStyle='rgb('+state.rgb+')';
        ctx.fillRect(cell.x,cell.y,size,size);
      }
      // Bright tips stay at the outer seam, below the labels.
      if(cell.node && (edge<size*2 || cell.y>height-size*2)) {
        const echo = Math.max(0,1-Math.abs(wave-cell.birth)*4);
        ctx.globalAlpha=Math.min(1,(state.active ? .58 : .2)+echo*.28+interaction+(confirming ? .1 : 0));
        ctx.fillStyle='rgb('+state.rgb+')';
        ctx.fillRect(cell.x,cell.y,size,size);
      } else if((candidate || advancing) && level-cell.birth<(candidate ? .025 : .045) && cell.vein) {
        ctx.globalAlpha=(state.active ? .62 : .34)+interaction;
        ctx.fillStyle='rgb('+state.rgb+')';
        ctx.fillRect(cell.x,cell.y,size,size);
      }
    }
    ctx.globalAlpha=1;
  }

  function frame(time) {
    frameId=0;
    if(document.hidden || reduced.matches) return;
    let moving=false;
    for(const state of states) {
      if(!state.visible) continue;
      const animating=movingAt(state,time);
      const growing=state.duration>0 && time<state.started+state.duration;
      if(time-state.lastPaint>=32 || state.wasMoving && !animating || state.wasGrowing && !growing) {
        paint(state,time);
        state.lastPaint=time;
      }
      state.wasMoving=animating;state.wasGrowing=growing;
      if(animating) moving=true;
    }
    if(moving) frameId=requestAnimationFrame(frame);
  }

  function requestFrame() {
    if(!frameId && !document.hidden && !reduced.matches) frameId=requestAnimationFrame(frame);
  }

  function refresh() {
    const time=performance.now();
    let moving=false;
    for(const state of states) {
      if(!state.visible || document.hidden) continue;
      paint(state,time);state.lastPaint=time;state.wasMoving=movingAt(state,time);
      state.wasGrowing=state.duration>0 && time<state.started+state.duration;
      if(state.wasMoving) moving=true;
    }
    if(moving) requestFrame();
    else if(frameId) {cancelAnimationFrame(frameId);frameId=0;}
  }

  function clearConfirmation(state) {
    clearTimeout(state.confirmTimer);state.confirmUntil=0;
    state.button.classList.remove('is-sculk-confirming');
  }

  function beginTransition(state,from,time,duration,confirm=false) {
    state.from=from;state.started=time;state.duration=reduced.matches?0:duration;
    if(confirm && !reduced.matches) {
      clearConfirmation(state);
      state.confirmUntil=time+confirmDuration;
      state.button.classList.add('is-sculk-confirming');
      state.confirmTimer=setTimeout(()=>{
        state.confirmUntil=0;state.button.classList.remove('is-sculk-confirming');
      },confirmDuration);
    }
  }

  function capture(time) {
    return states.map(state=>({level:levelAt(state,time),active:state.active,candidate:isCandidate(state)}));
  }

  function reconcile(time,before,firstCycle=false) {
    states.forEach((state,index)=>{
      const previous=before[index];
      state.active=state.button.getAttribute('aria-pressed')==='true';
      if(!state.active) clearConfirmation(state);
      if(state.active!==previous.active) {
        beginTransition(state,previous.level,time,state.active?confirmDuration:retreatDuration,state.active);
      } else if(previous.candidate!==isCandidate(state)) {
        const target=targetAt(state,time);
        if(firstCycle || Math.abs(previous.level-target)<.0001) {
          state.from=target;state.started=time;state.duration=0;
        } else beginTransition(state,previous.level,time,target>previous.level?confirmDuration:retreatDuration);
      }
    });
    refresh();
  }

  function interact(state,key,value) {
    const time=performance.now(),from=levelAt(state,time),previous=targetAt(state,time);
    state[key]=value;
    const target=targetAt(state,time);
    // Hover on the real candidate only brightens its current frontier.
    if(Math.abs(target-previous)>.0001) {
      beginTransition(state,from,time,target>from?confirmDuration:retreatDuration);
    }
    refresh();
  }

  function resize(state) {
    const width=state.button.clientWidth,height=state.button.clientHeight;
    if(!width || !height || width===state.width && height===state.height) return;
    state.width=width;state.height=height;
    const dpr=Math.min(devicePixelRatio||1,2);
    state.canvas.width=Math.round(width*dpr);state.canvas.height=Math.round(height*dpr);
    state.ctx.setTransform(dpr,0,0,dpr,0,0);
    state.growth=makeGrowth(width,height,state.size,1937+state.index*911,state.compact);
    refresh();
  }

  for(const button of buttons) {
    const compact=!button.classList.contains('mode-option');
    const index=Number(button.dataset.selectMode);
    const color=document.querySelector('.mode-option[data-select-mode="'+index+'"]').style.getPropertyValue('--mode-color');
    const hex=color.trim().slice(1);
    const rgb=[0,2,4].map(offset=>parseInt(hex.slice(offset,offset+2),16)).join(',');
    const canvas=document.createElement('canvas');
    canvas.className='mode-sculk';canvas.setAttribute('aria-hidden','true');
    button.prepend(canvas);
    const active=button.getAttribute('aria-pressed')==='true';
    const state={button,canvas,ctx:canvas.getContext('2d'),compact,index,rgb,
      size:compact?2:4,width:0,height:0,visible:false,active,hovered:false,focused:false,
      from:active?1:idleLevel,started:0,duration:0,lastPaint:0,wasMoving:false,wasGrowing:false,
      confirmUntil:0,confirmTimer:null};
    states.push(state);resize(state);
    button.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')interact(state,'hovered',true);});
    button.addEventListener('pointerleave',()=>interact(state,'hovered',false));
    button.addEventListener('pointercancel',()=>interact(state,'hovered',false));
    button.addEventListener('focus',()=>interact(state,'focused',true));
    button.addEventListener('blur',()=>interact(state,'focused',false));
  }

  const selectionObserver=new MutationObserver(()=>{
    const time=performance.now();reconcile(time,capture(time));
  });
  states.forEach(state=>selectionObserver.observe(state.button,{attributes:true,attributeFilter:['aria-pressed']}));
  if('ResizeObserver' in window) {
    const resizer=new ResizeObserver(entries=>entries.forEach(entry=>resize(states.find(state=>state.button===entry.target))));
    states.forEach(state=>resizer.observe(state.button));
  } else window.addEventListener('resize',()=>states.forEach(resize),{passive:true});
  if('IntersectionObserver' in window) {
    const visibility=new IntersectionObserver(entries=>{
      for(const entry of entries) {
        const state=states.find(item=>item.button===entry.target);
        state.visible=entry.isIntersecting;
      }
      document.dispatchEvent(new Event('codpattern:cycle-request'));
      refresh();
    });
    states.forEach(state=>visibility.observe(state.button));
  } else states.forEach(state=>{state.visible=true;});

  function visibilityChanged() {
    if(frameId) cancelAnimationFrame(frameId);
    frameId=0;
    if(!document.hidden) document.dispatchEvent(new Event('codpattern:cycle-request'));
    refresh();
  }
  document.addEventListener('codpattern:cycle',event=>{
    const detail=event.detail;
    if(!detail) return;
    const time=performance.now(),before=capture(time),firstCycle=cycle.index<0;
    // Capture before replacing the old clock: its candidate may now be the active button.
    const index=Number(detail.index);
    cycle={
      index,candidateIndex:Number.isFinite(detail.candidateIndex)?detail.candidateIndex:(index+1)%3,
      remaining:Math.max(0,Number(detail.remaining)||0),
      duration:Math.max(1,Number(detail.duration)||8000),running:Boolean(detail.running),enabled:Boolean(detail.enabled),
      at:Number.isFinite(detail.at)?detail.at:performance.now(),
    };
    reconcile(time,before,firstCycle);
  });
  reduced.addEventListener('change',()=>{
    const time=performance.now();
    if(reduced.matches) states.forEach(state=>{
      clearConfirmation(state);state.from=targetAt(state,time);state.started=time;state.duration=0;
    });
    visibilityChanged();
  });
  document.addEventListener('visibilitychange',visibilityChanged);
  document.dispatchEvent(new Event('codpattern:cycle-request'));
  refresh();
})();
