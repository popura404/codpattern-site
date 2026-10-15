'use strict';

// Decoration follows aria-pressed, so pointer, keyboard and autoplay share one state.
(() => {
  const buttons = [...document.querySelectorAll('[data-select-mode]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const shades = ['#04191e','#062329','#082d32','#0b383b','#104449'];
  const states = [];
  let frameId = 0;

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
    return {cols,rows,farthest,cells:queue.map(id => ({
      x:(id%cols)*size,y:Math.floor(id/cols)*size,
      birth:distance[id]/farthest,shade:Math.floor(rand()*shades.length),
      vein:vein[id],node:nodes.has(id),seed:rand(),
    }))};
  }

  function levelAt(state,time) {
    const t = Math.max(0,Math.min(1,(time-state.started)/state.duration));
    return state.from+(state.target-state.from)*(1-Math.pow(1-t,2));
  }

  function paint(state,time,still=false) {
    const {ctx,width,height,size,growth} = state;
    if(!ctx || !growth) return;
    ctx.clearRect(0,0,width,height);
    const level = still ? state.target : levelAt(state,time);
    const advancing = !still && state.target>state.from && time<state.started+state.duration;
    const wave = still ? 2 : (time-state.started)/850;
    for(const cell of growth.cells) {
      if(cell.birth>level) continue;
      const edge = Math.min(cell.x,width-cell.x-size);
      ctx.globalAlpha=.82;
      ctx.fillStyle=shades[cell.shade];
      ctx.fillRect(cell.x,cell.y,size,size);
      if(cell.vein) {
        ctx.globalAlpha=state.active ? .24 : .14;
        ctx.fillStyle='rgb('+state.rgb+')';
        ctx.fillRect(cell.x,cell.y,size,size);
      }
      // Bright tips stay at the outer seam; text and the timer have their own upper layer.
      if(cell.node && (edge<size*2 || cell.y>height-size*2)) {
        const echo = Math.max(0,1-Math.abs(wave-cell.birth)*4);
        ctx.globalAlpha=(state.active ? .42 : .2)+(still ? 0 : echo*.4);
        ctx.fillStyle='rgb('+state.rgb+')';
        ctx.fillRect(cell.x,cell.y,size,size);
      } else if(advancing && level-cell.birth<.045 && cell.vein) {
        ctx.globalAlpha=.55;
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
      if(time-state.lastPaint>=32 || time>=state.started+state.duration) {
        paint(state,time,time>=state.started+state.duration+850);
        state.lastPaint=time;
      }
      if(time<state.started+state.duration+850) moving=true;
    }
    if(moving) frameId=requestAnimationFrame(frame);
  }

  function requestFrame() {
    if(!frameId && !document.hidden && !reduced.matches) frameId=requestAnimationFrame(frame);
  }

  function update(state) {
    state.active=state.button.getAttribute('aria-pressed')==='true';
    const target=state.active ? 1 : (state.hovered || state.focused ? .42 : .065);
    if(target===state.target) return;
    const time=performance.now();
    state.from=levelAt(state,time);state.target=target;state.started=time;
    state.duration=target>state.from?620:340;
    if(reduced.matches || !state.visible || document.hidden) {
      state.from=target;paint(state,time,true);
    } else requestFrame();
  }

  function resize(state) {
    const width=state.button.clientWidth,height=state.button.clientHeight;
    if(!width || !height || width===state.width && height===state.height) return;
    state.width=width;state.height=height;
    const dpr=Math.min(devicePixelRatio||1,2);
    state.canvas.width=Math.round(width*dpr);state.canvas.height=Math.round(height*dpr);
    state.ctx.setTransform(dpr,0,0,dpr,0,0);
    state.growth=makeGrowth(width,height,state.size,1937+state.index*911,state.compact);
    paint(state,performance.now(),reduced.matches || !state.visible || document.hidden);
    requestFrame();
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
      from:active?1:.065,target:active?1:.065,started:performance.now(),duration:620,lastPaint:0};
    states.push(state);resize(state);
    button.addEventListener('pointerenter',event=>{if(event.pointerType!=='mouse')return;state.hovered=true;update(state);});
    button.addEventListener('pointerleave',()=>{state.hovered=false;update(state);});
    button.addEventListener('pointercancel',()=>{state.hovered=false;update(state);});
    button.addEventListener('focus',()=>{state.focused=true;update(state);});
    button.addEventListener('blur',()=>{state.focused=false;update(state);});
  }

  const selectionObserver=new MutationObserver(()=>states.forEach(update));
  states.forEach(state=>selectionObserver.observe(state.button,{attributes:true,attributeFilter:['aria-pressed']}));
  if('ResizeObserver' in window) {
    const resizer=new ResizeObserver(entries=>entries.forEach(entry=>resize(states.find(state=>state.button===entry.target))));
    states.forEach(state=>resizer.observe(state.button));
  } else window.addEventListener('resize',()=>states.forEach(resize),{passive:true});
  if('IntersectionObserver' in window) {
    const visibility=new IntersectionObserver(entries=>{
      for(const entry of entries) {
        const state=states.find(item=>item.button===entry.target);
        state.visible=entry.isIntersecting;state.from=state.target;
        state.started=performance.now()-state.duration-850;
        if(state.visible) paint(state,performance.now(),true);
      }
    });
    states.forEach(state=>visibility.observe(state.button));
  } else states.forEach(state=>{state.visible=true;});

  function settle() {
    if(frameId) cancelAnimationFrame(frameId);
    frameId=0;
    for(const state of states) {
      state.from=state.target;state.started=performance.now()-state.duration-850;
      if(state.visible && !document.hidden) paint(state,performance.now(),true);
    }
  }
  reduced.addEventListener('change',settle);
  document.addEventListener('visibilitychange',settle);
})();
