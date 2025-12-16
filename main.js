(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;

  // ===== Countdown (7 Jan 2026 06:00 CET = 05:00 UTC) =====
  const countdownEl = $("countdownValue");
  const TARGET_UTC_MS = Date.UTC(2026,0,7,5,0,0);
  const pad2=(n)=>String(n).padStart(2,"0");
  function tickCountdown(){
    if(!countdownEl) return;
    const diff = TARGET_UTC_MS - Date.now();
    if(diff<=0){ countdownEl.textContent="NU. ☕"; return; }
    const total = Math.floor(diff/1000);
    const d = Math.floor(total/86400);
    const h = Math.floor((total%86400)/3600);
    const m = Math.floor((total%3600)/60);
    const s = total%60;
    countdownEl.textContent = `${d}d ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  setInterval(tickCountdown, 1000);
  tickCountdown();

  // ===== UI =====
  const canvas = $("game");
  const toastEl = $("toast");
  const bubbleEl = $("bubble");
  const kickBtn = $("kickBtn");
  const sitBtn  = $("sitBtn");

  const soundBtn = $("soundBtn");
  const helpBtn = $("helpBtn");
  const helpModal = $("helpModal");
  const closeHelpBtn = $("closeHelpBtn");

  const wonder = $("wonder");
  const closeWonderBtn = $("closeWonderBtn");
  const wonderImg = $("wonderImg");
  const wonderFallback = $("wonderFallback");

  function toast(msg, ms=1200){
    if(!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>toastEl.classList.add("hidden"), ms);
  }
  function bubble(msg, ms=1500){
    if(!bubbleEl) return;
    bubbleEl.textContent = msg;
    bubbleEl.classList.remove("hidden");
    clearTimeout(bubble._t);
    bubble._t = setTimeout(()=>bubbleEl.classList.add("hidden"), ms);
  }

  helpBtn?.addEventListener("click", ()=>helpModal?.classList.remove("hidden"));
  closeHelpBtn?.addEventListener("click", ()=>helpModal?.classList.add("hidden"));

  closeWonderBtn?.addEventListener("click", ()=>{
    wonder?.classList.add("hidden");
    bubble("Tillbaka i rummet. Självklart.", 1400);
  });

  if(wonderImg){
    wonderImg.addEventListener("error", ()=>{
      wonderImg.classList.add("hidden");
      wonderFallback?.classList.remove("hidden");
    });
  }

  // ===== Audio (WebAudio only, iOS safe) =====
  let audioEnabled=false, audioCtx=null;
  function ensureAudio(){
    if(audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function grunt(intensity=1){
    if(!audioEnabled) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(140 + Math.random()*90, now);
    o.frequency.exponentialRampToValueAtTime(92, now+0.14);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.085*intensity, now+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.20);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now+0.22);
  }
  function jingle(){
    if(!audioEnabled) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const notes=[523.25,659.25,783.99,659.25,523.25,587.33,659.25,523.25];
    notes.forEach((f,i)=>{
      const t = now + i*0.095;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type="triangle"; o.frequency.value=f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.09);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t+0.10);
    });
  }
  soundBtn?.addEventListener("click", async ()=>{
    audioEnabled = !audioEnabled;
    soundBtn.textContent = audioEnabled ? "🔊 LJUD: PÅ" : "🔊 LJUD: AV";
    if(audioEnabled){
      ensureAudio();
      if(audioCtx.state==="suspended") await audioCtx.resume();
      toast("Ljud på. Jesper är… närvarande.");
      grunt(1.0);
    }else toast("Ljud av.");
  });

  // ===== Canvas =====
  if(!canvas){ console.warn("Canvas #game saknas."); return; }
  const ctx = canvas.getContext("2d", {alpha:false});

  // Portrait-ish world so it uses more height on phones
  const WORLD = { w: 520, h: 520 };
  const view = { s:1, ox:0, oy:0, cssW:0, cssH:0 };

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.width = Math.max(1, Math.round(rect.width*dpr));
    canvas.height= Math.max(1, Math.round(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    view.cssW = rect.width;
    view.cssH = rect.height;

    // fill width (phones), keep centered; WORLD is square to reduce vertical empty space
    view.s = rect.width / WORLD.w;
    const usedH = WORLD.h * view.s;
    view.ox = (rect.width - WORLD.w*view.s)/2;
    view.oy = (rect.height - usedH)/2;
  }
  window.addEventListener("resize", resize, {passive:true});
  resize();

  function toWorld(px,py){ return { x:(px-view.ox)/view.s, y:(py-view.oy)/view.s }; }

  // ===== round-rect path (no ctx.roundRect) =====
  function rrPath(x,y,w,h,r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y, x+w,y+h, rr);
    ctx.arcTo(x+w,y+h, x,y+h, rr);
    ctx.arcTo(x,y+h, x,y, rr);
    ctx.arcTo(x,y, x+w,y, rr);
    ctx.closePath();
  }

  // ===== Room layout (fills almost whole world) =====
  const ROOM = { x: 16, y: 14, w: WORLD.w-32, h: WORLD.h-28 };
  const WALL_TOP = ROOM.y + 8;

  // Floor trapezoid points
  const F = {
    TL:{x: ROOM.x + 132, y: ROOM.y + 150},
    TR:{x: ROOM.x + ROOM.w - 132, y: ROOM.y + 150},
    BR:{x: ROOM.x + ROOM.w - 26, y: ROOM.y + ROOM.h - 26},
    BL:{x: ROOM.x + 26, y: ROOM.y + ROOM.h - 26}
  };

  function floorToScreen(u,v){
    const topX = lerp(F.TL.x, F.TR.x, u);
    const topY = lerp(F.TL.y, F.TR.y, u);
    const botX = lerp(F.BL.x, F.BR.x, u);
    const botY = lerp(F.BL.y, F.BR.y, u);
    return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) };
  }

  function dragToRoomVec(dx,dy){
    const du = clamp(dx/240, -1, 1);
    const dv = clamp(dy/210, -1, 1);
    return {du,dv};
  }

  // Inverse mapping for dragging ornaments
  function screenToFloorUV(wx,wy){
    let bestU=0.5, bestV=0.7, bestD=1e18;
    for(let vi=0;vi<=24;vi++){
      const v=vi/24;
      for(let ui=0;ui<=24;ui++){
        const u=ui/24;
        const p=floorToScreen(u,v);
        const dx=wx-p.x, dy=wy-p.y;
        const d=dx*dx+dy*dy;
        if(d<bestD){bestD=d; bestU=u; bestV=v;}
      }
    }
    const u0=bestU, v0=bestV;
    bestD=1e18;
    for(let vi=-14;vi<=14;vi++){
      const v=clamp(v0+vi/280,0,1);
      for(let ui=-14;ui<=14;ui++){
        const u=clamp(u0+ui/280,0,1);
        const p=floorToScreen(u,v);
        const dx=wx-p.x, dy=wy-p.y;
        const d=dx*dx+dy*dy;
        if(d<bestD){bestD=d; bestU=u; bestV=v;}
      }
    }
    return {u:bestU,v:bestV};
  }

  // ===== Tavla JPG =====
  const tavla = new Image();
  let tavlaLoaded=false;
  tavla.onload=()=>{tavlaLoaded=true;};
  tavla.onerror=()=>{tavlaLoaded=false;};
  tavla.src="assets/tavla.jpg?v=1";

  // ===== Props in room-space (u,v) =====
  const props = {
    table:{ u:0.22, v:0.58, w:0.28, h:0.16 },
    chair:{ u:0.56, v:0.62, w:0.15, h:0.15 },
    tree: { u:0.86, v:0.56, w:0.15, h:0.25 },
    frame:{ x: ROOM.x + 56, y: WALL_TOP + 34, w: 120, h: 82 }
  };

  const state = {
    joy:{active:false, sx:0, sy:0, dx:0, dy:0},
    dragging:null,
    secret:{step:0, unlocked:false},
    sitting:false,
    kickT:0,
    nextTalk: performance.now() + 1100 + Math.random()*1600,
    puffs:[]
  };

  const jesper = { u:0.18, v:0.78, du:0, dv:0, speed:0.48, r:0.05 };

  const ornaments = [
    {id:"clock", label:"⏰", u:0.44, v:0.82, du:0, dv:0, r:0.040, base:"#fde047"},
    {id:"candy", label:"🍬", u:0.56, v:0.82, du:0, dv:0, r:0.040, base:"#fb7185"},
    {id:"star",  label:"⭐", u:0.68, v:0.82, du:0, dv:0, r:0.040, base:"#60a5fa"},
  ];

  // ===== Collisions =====
  function resolveCircleVsRect(obj, rect, margin){
    const x0=rect.u-rect.w/2-margin, x1=rect.u+rect.w/2+margin;
    const y0=rect.v-rect.h/2-margin, y1=rect.v+rect.h/2+margin;
    if(!(obj.u>x0 && obj.u<x1 && obj.v>y0 && obj.v<y1)) return;
    const dl=obj.u-x0, dr=x1-obj.u, dt=obj.v-y0, db=y1-obj.v;
    const m=Math.min(dl,dr,dt,db);
    if(m===dl) obj.u=x0;
    else if(m===dr) obj.u=x1;
    else if(m===dt) obj.v=y0;
    else obj.v=y1;
  }
  function resolveBoundsAndBlocks(obj){
    obj.u = clamp(obj.u, 0.06, 0.94);
    obj.v = clamp(obj.v, 0.42, 0.94);
    resolveCircleVsRect(obj, props.table, 0.070);
    resolveCircleVsRect(obj, props.chair, 0.060);
    resolveCircleVsRect(obj, props.tree,  0.080);
  }

  // ===== Secret =====
  function advanceSecret(id){
    if(state.secret.unlocked) return;
    const stepId = state.secret.step===0?"clock":state.secret.step===1?"candy":state.secret.step===2?"star":null;
    if(id===stepId){
      state.secret.step++;
      toast(`Hemligheten: ${state.secret.step}/3`);
      if(state.secret.step===3) bubble("SITT på stolen. Nu.", 1400);
      grunt(1.0);
      return;
    }
    state.secret.step=0;
    toast("Fel ordning. Julen nekade.");
    grunt(0.9);
  }
  function unlockWonder(){
    if(state.secret.unlocked) return;
    state.secret.unlocked=true;
    jingle();
    bubble("…okej. Det där var faktiskt mysigt.", 1600);
    wonder?.classList.remove("hidden");
  }

  // ===== Actions =====
  function nearestOrnament(){
    let best=null, bestD=1e18;
    for(const o of ornaments){
      const dx=jesper.u-o.u, dy=jesper.v-o.v;
      const d=dx*dx+dy*dy;
      if(d<bestD){bestD=d; best=o;}
    }
    return {o:best, d:Math.sqrt(bestD)};
  }
  function doKnuff(){
    if(wonder && !wonder.classList.contains("hidden")) return;
    state.kickT=0.25;

    const {o,d}=nearestOrnament();
    if(!o || d>0.19){
      bubble("Knuffade luft. KPI: oklart.", 1400);
      grunt(0.7);
      return;
    }
    let vx=o.u-jesper.u, vy=o.v-jesper.v;
    const L=Math.hypot(vx,vy)||1;
    vx/=L; vy/=L;
    o.du += vx*(1.35 + Math.random()*0.35);
    o.dv += vy*(1.15 + Math.random()*0.35);
    addPuff(o.u,o.v,1.0);
    bubble(`KNUFF! (${o.label})`, 900);
    grunt(1.05);
    advanceSecret(o.id);
  }
  function doSit(){
    if(wonder && !wonder.classList.contains("hidden")) return;
    const du=jesper.u-props.chair.u, dv=jesper.v-props.chair.v;
    const near=Math.hypot(du,dv)<0.20;
    if(!near){
      bubble("Satt… i själen. Inte på stolen.", 1500);
      grunt(0.65);
      return;
    }
    state.sitting=true;
    bubble("🪑 “Jag är bara… en gubbe i ett rum.”", 1600);
    grunt(0.85);
    setTimeout(()=>state.sitting=false, 900);

    if(state.secret.step===3 && !state.secret.unlocked){
      toast("Kombination fullbordad!");
      unlockWonder();
    } else if(!state.secret.unlocked){
      toast("Du satt. Hemligheten: avvaktande.");
    }
  }
  kickBtn?.addEventListener("click", doKnuff);
  sitBtn?.addEventListener("click", doSit);

  // ===== Particles =====
  function addPuff(u,v,str){
    state.puffs.push({u,v,a:1,r:0.012+Math.random()*0.014*str, du:(Math.random()*2-1)*0.16, dv:(Math.random()*2-1)*0.16});
    if(state.puffs.length>28) state.puffs.shift();
  }

  // ===== Input =====
  function pointerPos(e){
    const r = canvas.getBoundingClientRect();
    return {x:e.clientX-r.left, y:e.clientY-r.top};
  }
  function hitTestOrnamentScreen(wx,wy){
    for(const o of ornaments){
      const p=floorToScreen(o.u,o.v);
      const dx=wx-p.x, dy=wy-p.y;
      if(dx*dx+dy*dy < (26*26)) return o;
    }
    return null;
  }
  canvas.addEventListener("pointerdown",(e)=>{
    e.preventDefault();
    const p=pointerPos(e);
    const w=toWorld(p.x,p.y);

    const hit=hitTestOrnamentScreen(w.x,w.y);
    if(hit){
      state.dragging=hit;
      hit.du=0; hit.dv=0;
      canvas.setPointerCapture(e.pointerId);
      toast("Flyttar pynt.");
      grunt(0.7);
      return;
    }
    state.joy.active=true;
    state.joy.sx=p.x; state.joy.sy=p.y;
    state.joy.dx=0; state.joy.dy=0;
    canvas.setPointerCapture(e.pointerId);
  }, {passive:false});

  canvas.addEventListener("pointermove",(e)=>{
    e.preventDefault();
    const p=pointerPos(e);
    const w=toWorld(p.x,p.y);

    if(state.dragging){
      const uv=screenToFloorUV(w.x,w.y);
      state.dragging.u=uv.u; state.dragging.v=uv.v;
      resolveBoundsAndBlocks(state.dragging);
      return;
    }
    if(state.joy.active){
      state.joy.dx = clamp(p.x-state.joy.sx, -150, 150);
      state.joy.dy = clamp(p.y-state.joy.sy, -150, 150);
    }
  }, {passive:false});

  function endPointer(){
    state.dragging=null;
    state.joy.active=false;
    state.joy.dx=0; state.joy.dy=0;
  }
  canvas.addEventListener("pointerup", endPointer, {passive:false});
  canvas.addEventListener("pointercancel", endPointer, {passive:false});

  // ===== Drawing =====
  function drawWall(){
    // back wall
    const g = ctx.createLinearGradient(0, WALL_TOP, 0, F.TL.y);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#f1f5ff");
    ctx.fillStyle = g;
    ctx.fillRect(ROOM.x, WALL_TOP, ROOM.w, F.TL.y - WALL_TOP);

    // side walls
    ctx.fillStyle="#f8fafc";
    ctx.beginPath();
    ctx.moveTo(ROOM.x, WALL_TOP);
    ctx.lineTo(F.TL.x, F.TL.y);
    ctx.lineTo(F.BL.x, F.BL.y);
    ctx.lineTo(ROOM.x, ROOM.y + ROOM.h);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(ROOM.x+ROOM.w, WALL_TOP);
    ctx.lineTo(F.TR.x, F.TR.y);
    ctx.lineTo(F.BR.x, F.BR.y);
    ctx.lineTo(ROOM.x+ROOM.w, ROOM.y + ROOM.h);
    ctx.closePath();
    ctx.fill();

    // cold glow
    ctx.save();
    ctx.globalAlpha=0.10;
    ctx.fillStyle="#60a5fa";
    ctx.beginPath();
    ctx.ellipse(ROOM.x+ROOM.w*0.48, WALL_TOP+72, 150, 70, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawFrame(){
    const f=props.frame;
    ctx.fillStyle="#ffffff";
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    rrPath(f.x,f.y,f.w,f.h,14); ctx.fill(); ctx.stroke();

    const ix=f.x+7, iy=f.y+7, iw=f.w-14, ih=f.h-14;
    if(tavlaLoaded && tavla.naturalWidth>0){
      ctx.save();
      rrPath(ix,iy,iw,ih,10);
      ctx.clip();

      const imgAR=tavla.naturalWidth/tavla.naturalHeight;
      const boxAR=iw/ih;
      let dx=ix, dy=iy, dw=iw, dh=ih;
      if(imgAR>boxAR){
        dh=ih; dw=ih*imgAR; dx=ix-(dw-iw)/2;
      }else{
        dw=iw; dh=iw/imgAR; dy=iy-(dh-ih)/2;
      }
      ctx.drawImage(tavla, dx, dy, dw, dh);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha=0.10;
      ctx.fillStyle="#60a5fa";
      rrPath(ix,iy,iw,ih,10); ctx.fill();
      ctx.restore();
    }else{
      ctx.fillStyle="#f3f4f6";
      rrPath(ix,iy,iw,ih,10); ctx.fill();

      ctx.strokeStyle="rgba(17,24,39,0.18)";
      ctx.setLineDash([6,6]);
      ctx.strokeRect(ix+4, iy+4, iw-8, ih-8);
      ctx.setLineDash([]);

      ctx.fillStyle="rgba(17,24,39,0.45)";
      ctx.font="900 11px ui-monospace, monospace";
      ctx.fillText("TAVLA", f.x+22, f.y+30);
      ctx.fillStyle="rgba(17,24,39,0.26)";
      ctx.font="900 10px ui-monospace, monospace";
      ctx.fillText("(lägg tavla.jpg)", f.x+10, f.y+50);
    }
  }

  function drawFloor(){
    ctx.fillStyle="#eef2ff";
    ctx.beginPath();
    ctx.moveTo(F.TL.x,F.TL.y);
    ctx.lineTo(F.TR.x,F.TR.y);
    ctx.lineTo(F.BR.x,F.BR.y);
    ctx.lineTo(F.BL.x,F.BL.y);
    ctx.closePath();
    ctx.fill();

    // tiles
    ctx.strokeStyle="rgba(17,24,39,0.10)";
    ctx.lineWidth=2;
    for(let i=0;i<=9;i++){
      const u=i/9;
      const p0=floorToScreen(u,0), p1=floorToScreen(u,1);
      ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
    }
    for(let i=0;i<=7;i++){
      const v=i/7;
      const p0=floorToScreen(0,v), p1=floorToScreen(1,v);
      ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
    }

    // caption
    ctx.fillStyle="rgba(17,24,39,0.22)";
    ctx.font="900 12px ui-monospace, monospace";
    ctx.fillText("RUM 01 — KALT / TYDLIGT / JUL", ROOM.x+22, ROOM.y+ROOM.h-14);
  }

  function shadowAt(u,v,rx,ry,a){
    const p=floorToScreen(u,v);
    ctx.save();
    ctx.globalAlpha=a;
    ctx.fillStyle="#111827";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y+10, rx, ry, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawIsoBox(u,v,w,h,topCol,sideCol){
    const p=floorToScreen(u,v);
    const s=1 - v*0.10;
    const W=200*w*s;
    const H=125*h*s;
    const skew=W*0.22;
    shadowAt(u,v, W*0.30, 8*s, 0.10);

    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;

    // top
    ctx.fillStyle=topCol;
    ctx.beginPath();
    ctx.moveTo(p.x - W*0.55, p.y - H*0.72);
    ctx.lineTo(p.x + W*0.55, p.y - H*0.72);
    ctx.lineTo(p.x + W*0.55 + skew, p.y - H*0.42);
    ctx.lineTo(p.x - W*0.55 + skew, p.y - H*0.42);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // front
    ctx.fillStyle=sideCol;
    ctx.beginPath();
    ctx.moveTo(p.x - W*0.55 + skew, p.y - H*0.42);
    ctx.lineTo(p.x + W*0.55 + skew, p.y - H*0.42);
    ctx.lineTo(p.x + W*0.55 + skew, p.y + H*0.22);
    ctx.lineTo(p.x - W*0.55 + skew, p.y + H*0.22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  function drawTable(){
    const t=props.table;
    drawIsoBox(t.u,t.v,t.w,t.h,"#ffffff","#e5e7eb");
    const p=floorToScreen(t.u,t.v);
    const s=1 - t.v*0.10;

    ctx.fillStyle="#e5e7eb";
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;

    const legH=48*s;
    rrPath(p.x-70*s, p.y-6*s, 22*s, legH, 10*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+48*s, p.y-6*s, 22*s, legH, 10*s); ctx.fill(); ctx.stroke();

    // mug
    ctx.fillStyle="#dbeafe";
    ctx.lineWidth=3.5;
    rrPath(p.x+52*s, p.y-62*s, 18*s, 14*s, 6*s); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x+71*s, p.y-55*s, 6*s, -0.6, 0.6);
    ctx.stroke();
  }

  function drawChair(){
    const c=props.chair;
    drawIsoBox(c.u,c.v,c.w,c.h,"#ffffff","#e5e7eb");
    const p=floorToScreen(c.u,c.v);
    const s=1 - c.v*0.10;

    ctx.fillStyle="#ffffff";
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    rrPath(p.x-38*s, p.y-118*s, 76*s, 54*s, 18*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle="rgba(17,24,39,0.28)";
    ctx.font=`900 ${11*s}px ui-monospace, monospace`;
    ctx.fillText("STOL", p.x-20*s, p.y-84*s);
  }

  function drawTree(tMs){
    const tr=props.tree;
    const p=floorToScreen(tr.u,tr.v);
    const s=1 - tr.v*0.10;

    shadowAt(tr.u,tr.v, 30*s, 7*s, 0.12);

    // trunk
    ctx.fillStyle="#d1d5db";
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    rrPath(p.x-8*s, p.y-20*s, 16*s, 34*s, 8*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle="#dcfce7";
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    const tri=(cx,cy,w,h)=>{
      ctx.beginPath();
      ctx.moveTo(cx, cy-h);
      ctx.lineTo(cx-w, cy+h*0.60);
      ctx.lineTo(cx+w, cy+h*0.60);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    };
    tri(p.x, p.y-96*s, 42*s, 56*s);
    tri(p.x, p.y-58*s, 56*s, 70*s);

    ctx.font=`${22*s}px system-ui`;
    ctx.fillText("⭐", p.x-10*s, p.y-120*s);
    ctx.font=`${18*s}px system-ui`;
    ctx.fillText("🔴", p.x-44*s, p.y-82*s);
    ctx.fillText("🔴", p.x+28*s, p.y-72*s);
    ctx.fillText("🔴", p.x-8*s,  p.y-46*s);

    const pulse=0.65+0.35*Math.sin(tMs/230);
    ctx.save();
    ctx.globalAlpha=0.14*pulse;
    ctx.fillStyle="#60a5fa";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y-62*s, 64*s, 82*s, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawOrnament(o){
    shadowAt(o.u,o.v, 16, 5, 0.10);
    const p=floorToScreen(o.u,o.v);

    ctx.fillStyle=o.base;
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 19, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();

    ctx.font="24px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillStyle="#111827";
    ctx.fillText(o.label, p.x, p.y+1);
    ctx.textAlign="start";
    ctx.textBaseline="alphabetic";
  }

  function drawJesper(tMs){
    const p=floorToScreen(jesper.u, jesper.v);
    const s=(1 - jesper.v*0.12) * 1.22;

    shadowAt(jesper.u, jesper.v, 24*s, 6*s, 0.14);

    const moving = Math.hypot(jesper.du, jesper.dv) > 0.02 && !state.sitting;
    const phase = moving ? (tMs/120) : 0;
    const swing = moving ? Math.sin(phase) : 0;
    const bob   = moving ? Math.sin(phase*2)*1.6 : 0;

    const OUT="#111827", SKIN="#f6d7b5";
    const HAIR="#7a3b19", HAIR2="#c46a35";
    const HOOD="#111827", PANTS="#9ca3af", SHOE="#7a4a24";
    const GL1="#1f1f1f", GL2="#784a24";

    ctx.strokeStyle=OUT;
    ctx.lineWidth=4;

    // legs
    ctx.fillStyle=PANTS;
    rrPath(p.x-10*s + swing*2, p.y-8*s, 10*s, 18*s, 6*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+ 0*s - swing*2, p.y-8*s, 10*s, 18*s, 6*s); ctx.fill(); ctx.stroke();

    // shoes
    ctx.fillStyle=SHOE;
    rrPath(p.x-14*s + swing*2, p.y+6*s, 14*s, 8*s, 6*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+ 0*s - swing*2, p.y+6*s, 14*s, 8*s, 6*s); ctx.fill(); ctx.stroke();

    // hoodie
    ctx.fillStyle=HOOD;
    rrPath(p.x-18*s, p.y-30*s + bob*0.5, 36*s, 28*s, 14*s); ctx.fill(); ctx.stroke();

    // arms
    rrPath(p.x-30*s, p.y-28*s + bob*0.5 + swing*1.2, 14*s, 10*s, 10*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+16*s,  p.y-28*s + bob*0.5 - swing*1.2, 14*s, 10*s, 10*s); ctx.fill(); ctx.stroke();

    // hands
    ctx.fillStyle=SKIN;
    rrPath(p.x-30*s, p.y-20*s + bob*0.5 + swing*1.2, 10*s, 8*s, 6*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+20*s,  p.y-20*s + bob*0.5 - swing*1.2, 10*s, 8*s, 6*s); ctx.fill(); ctx.stroke();

    // head
    ctx.fillStyle=SKIN;
    ctx.beginPath();
    ctx.arc(p.x, p.y-48*s + bob, 16*s, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();

    // curly hair
    ctx.fillStyle=HAIR;
    ctx.beginPath();
    ctx.arc(p.x-8*s, p.y-60*s + bob, 7*s, 0, Math.PI*2);
    ctx.arc(p.x,     p.y-62*s + bob, 8*s, 0, Math.PI*2);
    ctx.arc(p.x+9*s, p.y-59*s + bob, 7*s, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle=HAIR2;
    ctx.beginPath();
    ctx.arc(p.x-4*s, p.y-61*s + bob, 4*s, 0, Math.PI*2);
    ctx.arc(p.x+6*s, p.y-61*s + bob, 4*s, 0, Math.PI*2);
    ctx.fill();

    // glasses
    ctx.fillStyle=GL2;
    rrPath(p.x-14*s, p.y-52*s + bob, 12*s, 10*s, 5*s); ctx.fill(); ctx.stroke();
    ctx.fillStyle=GL1;
    rrPath(p.x+2*s,  p.y-52*s + bob, 12*s, 10*s, 5*s); ctx.fill(); ctx.stroke();

    ctx.strokeStyle=GL2;
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(p.x-2*s, p.y-47*s + bob); ctx.lineTo(p.x+2*s, p.y-47*s + bob); ctx.stroke();

    // face
    ctx.strokeStyle=OUT;
    ctx.lineWidth=4;
    ctx.fillStyle=OUT;
    const blink = (!moving && Math.random()<0.02);
    if(blink || state.sitting){
      ctx.fillRect(p.x-6*s, p.y-46*s + bob, 5*s, 2*s);
      ctx.fillRect(p.x+2*s, p.y-46*s + bob, 5*s, 2*s);
    } else {
      ctx.beginPath(); ctx.arc(p.x-4*s, p.y-46*s + bob, 2*s, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x+6*s, p.y-46*s + bob, 2*s, 0, Math.PI*2); ctx.fill();
    }
    ctx.beginPath();
    if(state.kickT>0) ctx.arc(p.x+1*s, p.y-38*s + bob, 4*s, Math.PI, 0);
    else ctx.arc(p.x+1*s, p.y-38*s + bob, 4*s, 0, Math.PI);
    ctx.stroke();
  }

  function pinBubble(){
    if(!bubbleEl || bubbleEl.classList.contains("hidden")) return;
    // keep it above Jesper and not covering him
    const p = floorToScreen(jesper.u, jesper.v);
    const cx = view.ox + p.x*view.s;
    const cy = view.oy + p.y*view.s;

    bubbleEl.style.maxWidth = "92%";
    bubbleEl.style.left = `${Math.max(10, Math.min(view.cssW-260, cx-140))}px`;

    // place higher than Jesper (more “RPG dialogue”)
    const wantedBottom = (view.cssH - cy) + 140;
    bubbleEl.style.bottom = `${clamp(wantedBottom, 110, view.cssH-80)}px`;
  }

  // ===== Update/Draw loop =====
  function update(dt){
    if(wonder && !wonder.classList.contains("hidden")) return;

    const now = performance.now();
    if(now > state.nextTalk){
      const lines=[
        "Det här känns som ett möte utan agenda.",
        "Jag gick hit för kaffe. Jag fann… vägg.",
        "Tre pynt. Noll mening. Perfekt.",
        "Jag vill ha en ticket: Fönster i rummet.",
        "Jag är en gubbe i ett rum. Det är allt."
      ];
      if(Math.random()<0.55) bubble(lines[(Math.random()*lines.length)|0], 1700);
      state.nextTalk = now + 2300 + Math.random()*2400;
    }

    state.kickT = Math.max(0, state.kickT - dt);

    if(state.sitting){
      jesper.du=0; jesper.dv=0;
    } else if(state.joy.active){
      const v=dragToRoomVec(state.joy.dx, state.joy.dy);
      const L=Math.hypot(v.du,v.dv)||1;
      jesper.du=(v.du/L)*jesper.speed;
      jesper.dv=(v.dv/L)*jesper.speed;
    } else {
      jesper.du *= Math.pow(0.02, dt);
      jesper.dv *= Math.pow(0.02, dt);
      if(Math.abs(jesper.du)<0.001) jesper.du=0;
      if(Math.abs(jesper.dv)<0.001) jesper.dv=0;
    }

    jesper.u += jesper.du*dt;
    jesper.v += jesper.dv*dt;
    resolveBoundsAndBlocks(jesper);

    const fr=Math.pow(0.02, dt);
    for(const o of ornaments){
      if(state.dragging===o) continue;
      o.u += o.du*dt; o.v += o.dv*dt;
      o.du *= fr; o.dv *= fr;
      if(Math.abs(o.du)<0.002) o.du=0;
      if(Math.abs(o.dv)<0.002) o.dv=0;
      resolveBoundsAndBlocks(o);
    }

    for(let i=0;i<ornaments.length;i++){
      for(let j=i+1;j<ornaments.length;j++){
        const a=ornaments[i], b=ornaments[j];
        const dx=b.u-a.u, dy=b.v-a.v;
        const d=Math.hypot(dx,dy);
        const minD=a.r+b.r+0.02;
        if(d>0 && d<minD){
          const push=(minD-d)/2;
          const nx=dx/d, ny=dy/d;
          a.u -= nx*push; a.v -= ny*push;
          b.u += nx*push; b.v += ny*push;
          const tDu=a.du, tDv=a.dv;
          a.du=b.du; a.dv=b.dv;
          b.du=tDu; b.dv=tDv;
        }
      }
    }

    for(const p of state.puffs){
      p.u += p.du*dt; p.v += p.dv*dt;
      p.a -= 1.6*dt;
    }
    state.puffs = state.puffs.filter(p=>p.a>0);

    pinBubble();
  }

  function draw(tMs){
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,view.cssW,view.cssH);

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    // room background
    ctx.fillStyle="#f4f6ff";
    rrPath(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 20);
    ctx.fill();

    drawWall();
    drawFrame();
    drawFloor();

    // puffs behind
    for(const p of state.puffs){
      const pp=floorToScreen(p.u,p.v);
      ctx.save();
      ctx.globalAlpha=Math.max(0,p.a)*0.22;
      ctx.fillStyle="#111827";
      ctx.beginPath(); ctx.arc(pp.x, pp.y-6, 12, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // depth sort (by v)
    const drawables=[
      {v:props.table.v, kind:"table"},
      {v:props.chair.v, kind:"chair"},
      {v:props.tree.v,  kind:"tree"},
      ...ornaments.map(o=>({v:o.v, kind:"orn", o})),
      {v:jesper.v, kind:"jesper"},
    ];
    drawables.sort((a,b)=>a.v-b.v);

    for(const d of drawables){
      if(d.kind==="table") drawTable();
      else if(d.kind==="chair") drawChair();
      else if(d.kind==="tree") drawTree(tMs);
      else if(d.kind==="orn") drawOrnament(d.o);
      else drawJesper(tMs);
    }

    // room outline
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    rrPath(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 20);
    ctx.stroke();

    ctx.restore();
  }

  let last=performance.now();
  function loop(t){
    const dt=Math.min(0.033, (t-last)/1000);
    last=t;
    update(dt);
    draw(t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  setTimeout(()=>toast("Tips: KNUFF ⏰ → 🍬 → ⭐ och SITT på stolen."), 900);

})();
