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

  // ===== Audio (WebAudio only, iOS-safe) =====
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
    } else toast("Ljud av.");
  });

  // ===== Canvas =====
  if(!canvas){ console.warn("Canvas #game saknas."); return; }
  const ctx = canvas.getContext("2d", {alpha:false});

  const WORLD = { w: 540, h: 520 };
  const view = { s:1, ox:0, oy:0, cssW:0, cssH:0 };

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.width = Math.max(1, Math.round(rect.width*dpr));
    canvas.height= Math.max(1, Math.round(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    view.cssW = rect.width;
    view.cssH = rect.height;

    view.s = rect.width / WORLD.w;  // fill width
    view.ox = (rect.width - WORLD.w*view.s)/2;
    view.oy = 6;                    // top-align
  }
  window.addEventListener("resize", resize, {passive:true});
  resize();

  function toWorld(px,py){ return { x:(px-view.ox)/view.s, y:(py-view.oy)/view.s }; }

  // ===== RoundRect helper =====
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

  // ===== Room geometry (more “boxed room”) =====
  const ROOM = { x: 18, y: 14, w: WORLD.w-36, h: WORLD.h-30 };
  const WALL_TOP = ROOM.y + 10;

  // Floor trapezoid
  const F = {
    TL:{x: ROOM.x + 132, y: ROOM.y + 150},
    TR:{x: ROOM.x + ROOM.w - 132, y: ROOM.y + 150},
    BR:{x: ROOM.x + ROOM.w - 24, y: ROOM.y + ROOM.h - 22},
    BL:{x: ROOM.x + 24, y: ROOM.y + ROOM.h - 22}
  };

  function floorToScreen(u,v){
    const topX = lerp(F.TL.x, F.TR.x, u);
    const topY = lerp(F.TL.y, F.TR.y, u);
    const botX = lerp(F.BL.x, F.BR.x, u);
    const botY = lerp(F.BL.y, F.BR.y, u);
    return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) };
  }

  function dragToRoomVec(dx,dy){
    const du = clamp(dx/220, -1, 1);
    const dv = clamp(dy/210, -1, 1);
    return {du,dv};
  }

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

  // ===== Props =====
  const props = {
    table:{ u:0.26, v:0.66, w:0.34, h:0.16 }, // obstacle footprint
    chair:{ u:0.54, v:0.63, w:0.15, h:0.13 },
    tree: { u:0.83, v:0.62, w:0.18, h:0.18 },
    frame:{ x: ROOM.x + 56, y: WALL_TOP + 38, w: 132, h: 92 }
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

  const jesper = { u:0.20, v:0.83, du:0, dv:0, speed:0.55, r:0.050 };

  const ornaments = [
    {id:"clock", label:"⏰", u:0.18, v:0.86, du:0, dv:0, r:0.040, base:"#fde047"},
    {id:"candy", label:"🍬", u:0.38, v:0.86, du:0, dv:0, r:0.040, base:"#fb7185"},
    {id:"star",  label:"⭐", u:0.58, v:0.86, du:0, dv:0, r:0.040, base:"#60a5fa"},
  ];

  // ===== Obstacles + “no-stuck” movement =====
  const OBST = () => ([ props.table, props.chair, props.tree ]);

  function insideExpanded(u,v, rect, pad){
    const x0=rect.u-rect.w/2-pad, x1=rect.u+rect.w/2+pad;
    const y0=rect.v-rect.h/2-pad, y1=rect.v+rect.h/2+pad;
    return (u>x0 && u<x1 && v>y0 && v<y1);
  }

  function clampRoom(obj){
    obj.u = clamp(obj.u, 0.05, 0.95);
    obj.v = clamp(obj.v, 0.40, 0.95);
  }

  function collideAndSlide(obj, radius, tryU, tryV){
    const prevU=obj.u, prevV=obj.v;
    obj.u = tryU; obj.v = tryV;
    clampRoom(obj);

    let hit=false;
    const pad = radius + 0.008; // small -> not sticky
    for(const r of OBST()){
      if(insideExpanded(obj.u,obj.v,r,pad)){ hit=true; break; }
    }
    if(!hit) return;

    // slide U-only
    obj.u = tryU; obj.v = prevV;
    clampRoom(obj);
    hit=false;
    for(const r of OBST()){
      if(insideExpanded(obj.u,obj.v,r,pad)){ hit=true; break; }
    }
    if(!hit) return;

    // slide V-only
    obj.u = prevU; obj.v = tryV;
    clampRoom(obj);
    hit=false;
    for(const r of OBST()){
      if(insideExpanded(obj.u,obj.v,r,pad)){ hit=true; break; }
    }
    if(!hit) return;

    obj.u = prevU; obj.v = prevV; // blocked
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
  function addPuff(u,v,str){
    state.puffs.push({u,v,a:1,r:0.012+Math.random()*0.014*str, du:(Math.random()*2-1)*0.16, dv:(Math.random()*2-1)*0.16});
    if(state.puffs.length>28) state.puffs.shift();
  }

  function doKnuff(){
    if(wonder && !wonder.classList.contains("hidden")) return;
    state.kickT=0.25;
    const {o,d}=nearestOrnament();
    if(!o || d>0.22){
      bubble("Knuffade luft. KPI: oklart.", 1400);
      grunt(0.7);
      return;
    }
    let vx=o.u-jesper.u, vy=o.v-jesper.v;
    const L=Math.hypot(vx,vy)||1;
    vx/=L; vy/=L;
    o.du += vx*(1.45 + Math.random()*0.35);
    o.dv += vy*(1.20 + Math.random()*0.35);
    addPuff(o.u,o.v,1.0);
    bubble(`KNUFF! (${o.label})`, 900);
    grunt(1.05);
    advanceSecret(o.id);
  }
  function doSit(){
    if(wonder && !wonder.classList.contains("hidden")) return;
    const du=jesper.u-props.chair.u, dv=jesper.v-props.chair.v;
    const near=Math.hypot(du,dv)<0.22;
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

  // ===== Input =====
  function pointerPos(e){
    const r = canvas.getBoundingClientRect();
    return {x:e.clientX-r.left, y:e.clientY-r.top};
  }
  function hitTestOrnamentScreen(wx,wy){
    for(const o of ornaments){
      const p=floorToScreen(o.u,o.v);
      const dx=wx-p.x, dy=wy-p.y;
      if(dx*dx+dy*dy < (28*28)) return o;
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
      clampRoom(state.dragging);
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

  // ===== Drawing helpers =====
  function shadowAt(u,v,rx,ry,a){
    const p=floorToScreen(u,v);
    ctx.save();
    ctx.globalAlpha=a;
    ctx.fillStyle="#111827";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y+12, rx, ry, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawRoom(){
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,view.cssW,view.cssH);

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    // panel
    ctx.fillStyle="#f4f6ff";
    rrPath(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 24);
    ctx.fill();

    // back wall
    const g = ctx.createLinearGradient(0, WALL_TOP, 0, F.TL.y);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#f1f5ff");
    ctx.fillStyle=g;
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

    // floor gradient (not chessboard)
    const fg = ctx.createLinearGradient(0, F.TL.y, 0, F.BL.y);
    fg.addColorStop(0, "#eef2ff");
    fg.addColorStop(1, "#e9edff");
    ctx.fillStyle=fg;
    ctx.beginPath();
    ctx.moveTo(F.TL.x,F.TL.y);
    ctx.lineTo(F.TR.x,F.TR.y);
    ctx.lineTo(F.BR.x,F.BR.y);
    ctx.lineTo(F.BL.x,F.BL.y);
    ctx.closePath();
    ctx.fill();

    // subtle seams
    ctx.strokeStyle="rgba(17,24,39,0.06)";
    ctx.lineWidth=2;
    for(let i=1;i<=6;i++){
      const u=i/7;
      const p0=floorToScreen(u,0), p1=floorToScreen(u,1);
      ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
    }
    for(let i=1;i<=5;i++){
      const v=i/6;
      const p0=floorToScreen(0,v), p1=floorToScreen(1,v);
      ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke();
    }

    // baseboards and corner cue
    ctx.strokeStyle="rgba(17,24,39,0.24)";
    ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(F.TL.x, F.TL.y); ctx.lineTo(F.TR.x, F.TR.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(F.TL.x, F.TL.y); ctx.lineTo(ROOM.x, WALL_TOP); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(F.TR.x, F.TR.y); ctx.lineTo(ROOM.x+ROOM.w, WALL_TOP); ctx.stroke();

    ctx.strokeStyle="rgba(17,24,39,0.18)";
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(ROOM.x + ROOM.w*0.50, WALL_TOP);
    ctx.lineTo(lerp(F.TL.x, F.TR.x, 0.50), F.TL.y);
    ctx.stroke();

    // floor outline
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.moveTo(F.TL.x,F.TL.y);
    ctx.lineTo(F.TR.x,F.TR.y);
    ctx.lineTo(F.BR.x,F.BR.y);
    ctx.lineTo(F.BL.x,F.BL.y);
    ctx.closePath();
    ctx.stroke();

    // caption
    ctx.fillStyle="rgba(17,24,39,0.22)";
    ctx.font="900 12px ui-monospace, monospace";
    ctx.fillText("RUM 01 — KALT / TYDLIGT / JUL", ROOM.x+22, ROOM.y+ROOM.h-14);

    // border
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    rrPath(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 24);
    ctx.stroke();

    ctx.restore();
  }

  function drawFrame(){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const f=props.frame;
    const maxY = F.TL.y - f.h - 14;
    const y = Math.min(f.y, maxY);

    ctx.fillStyle="#ffffff";
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    rrPath(f.x, y, f.w, f.h, 14); ctx.fill(); ctx.stroke();

    const ix=f.x+7, iy=y+7, iw=f.w-14, ih=f.h-14;
    if(tavlaLoaded && tavla.naturalWidth>0){
      ctx.save();
      rrPath(ix,iy,iw,ih,10); ctx.clip();
      const imgAR=tavla.naturalWidth/tavla.naturalHeight;
      const boxAR=iw/ih;
      let dx=ix, dy=iy, dw=iw, dh=ih;
      if(imgAR>boxAR){ dh=ih; dw=ih*imgAR; dx=ix-(dw-iw)/2; }
      else { dw=iw; dh=iw/imgAR; dy=iy-(dh-ih)/2; }
      ctx.drawImage(tavla, dx, dy, dw, dh);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha=0.10;
      ctx.fillStyle="#60a5fa";
      rrPath(ix,iy,iw,ih,10); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle="#f3f4f6";
      rrPath(ix,iy,iw,ih,10); ctx.fill();
      ctx.strokeStyle="rgba(17,24,39,0.18)";
      ctx.setLineDash([6,6]);
      ctx.strokeRect(ix+4, iy+4, iw-8, ih-8);
      ctx.setLineDash([]);
      ctx.fillStyle="rgba(17,24,39,0.45)";
      ctx.font="900 11px ui-monospace, monospace";
      ctx.fillText("TAVLA", f.x+24, y+32);
      ctx.fillStyle="rgba(17,24,39,0.26)";
      ctx.font="900 10px ui-monospace, monospace";
      ctx.fillText("(lägg tavla.jpg)", f.x+12, y+54);
    }

    ctx.restore();
  }

  // Furniture
  function drawTable(){
    const t=props.table;
    const p=floorToScreen(t.u,t.v);
    const s=1 - t.v*0.10;
    shadowAt(t.u,t.v, 74*s, 12*s, 0.12);

    const W=220*s, H=120*s, skew=W*0.24;

    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;

    ctx.fillStyle="#ffffff";
    ctx.beginPath();
    ctx.moveTo(p.x - W*0.55, p.y - H*0.60);
    ctx.lineTo(p.x + W*0.55, p.y - H*0.60);
    ctx.lineTo(p.x + W*0.55 + skew, p.y - H*0.32);
    ctx.lineTo(p.x - W*0.55 + skew, p.y - H*0.32);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle="#e5e7eb";
    ctx.beginPath();
    ctx.moveTo(p.x - W*0.50 + skew, p.y - H*0.30);
    ctx.lineTo(p.x + W*0.50 + skew, p.y - H*0.30);
    ctx.lineTo(p.x + W*0.50 + skew, p.y + H*0.02);
    ctx.lineTo(p.x - W*0.50 + skew, p.y + H*0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle="#e5e7eb";
    const legW=18*s, legH=62*s;
    rrPath(p.x - 92*s + skew*0.16, p.y + H*0.00, legW, legH, 8*s); ctx.fill(); ctx.stroke();
    rrPath(p.x + 64*s + skew*0.16, p.y + H*0.00, legW, legH, 8*s); ctx.fill(); ctx.stroke();
    rrPath(p.x - 54*s + skew*0.62, p.y - 6*s, legW, legH, 8*s); ctx.fill(); ctx.stroke();
    rrPath(p.x + 102*s + skew*0.62, p.y - 6*s, legW, legH, 8*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle="#dbeafe";
    rrPath(p.x + 66*s, p.y - 72*s, 22*s, 16*s, 6*s); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x + 90*s, p.y - 64*s, 7*s, -0.6, 0.6); ctx.stroke();
  }

  function drawChair(){
    const c=props.chair;
    const p=floorToScreen(c.u,c.v);
    const s=1 - c.v*0.10;
    shadowAt(c.u,c.v, 54*s, 10*s, 0.12);

    const W=120*s, H=86*s, skew=W*0.26;

    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;

    ctx.fillStyle="#ffffff";
    ctx.beginPath();
    ctx.moveTo(p.x - W*0.55, p.y - H*0.22);
    ctx.lineTo(p.x + W*0.55, p.y - H*0.22);
    ctx.lineTo(p.x + W*0.55 + skew, p.y - H*0.00);
    ctx.lineTo(p.x - W*0.55 + skew, p.y - H*0.00);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle="#e5e7eb";
    ctx.beginPath();
    ctx.moveTo(p.x - W*0.55 + skew, p.y - H*0.00);
    ctx.lineTo(p.x + W*0.55 + skew, p.y - H*0.00);
    ctx.lineTo(p.x + W*0.55 + skew, p.y + H*0.28);
    ctx.lineTo(p.x - W*0.55 + skew, p.y + H*0.28);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle="#e5e7eb";
    const legW=14*s, legH=52*s;
    rrPath(p.x - 40*s + skew*0.18, p.y + H*0.18, legW, legH, 8*s); ctx.fill(); ctx.stroke();
    rrPath(p.x + 18*s + skew*0.18, p.y + H*0.18, legW, legH, 8*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle="#ffffff";
    rrPath(p.x - 30*s, p.y - 136*s, 78*s, 62*s, 18*s); ctx.fill(); ctx.stroke();
    ctx.fillStyle="rgba(17,24,39,0.28)";
    ctx.font=`900 ${11*s}px ui-monospace, monospace`;
    ctx.fillText("STOL", p.x-20*s, p.y-98*s);
  }

  function drawTree(tMs){
    const tr=props.tree;
    const p=floorToScreen(tr.u,tr.v);
    const s=1 - tr.v*0.10;
    shadowAt(tr.u,tr.v, 44*s, 9*s, 0.12);

    ctx.fillStyle="#d1d5db";
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    rrPath(p.x-9*s, p.y-20*s, 18*s, 38*s, 8*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle="#dcfce7";
    const tri=(cx,cy,w,h)=>{
      ctx.beginPath();
      ctx.moveTo(cx, cy-h);
      ctx.lineTo(cx-w, cy+h*0.60);
      ctx.lineTo(cx+w, cy+h*0.60);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    };
    tri(p.x, p.y-110*s, 52*s, 70*s);
    tri(p.x, p.y-64*s, 70*s, 90*s);

    ctx.font=`${26*s}px system-ui`;
    ctx.fillText("⭐", p.x-12*s, p.y-146*s);
    ctx.font=`${20*s}px system-ui`;
    ctx.fillText("🔴", p.x-56*s, p.y-96*s);
    ctx.fillText("🔴", p.x+34*s, p.y-84*s);
    ctx.fillText("🔴", p.x-12*s, p.y-52*s);

    const pulse=0.65+0.35*Math.sin(tMs/230);
    ctx.save();
    ctx.globalAlpha=0.12*pulse;
    ctx.fillStyle="#60a5fa";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y-70*s, 82*s, 98*s, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawOrnament(o){
    shadowAt(o.u,o.v, 16, 5, 0.10);
    const p=floorToScreen(o.u,o.v);
    ctx.fillStyle=o.base;
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(p.x, p.y, 19, 0, Math.PI*2); ctx.fill(); ctx.stroke();
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
    const s=(1 - jesper.v*0.12) * 1.24;
    shadowAt(jesper.u, jesper.v, 26*s, 7*s, 0.14);

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

    ctx.fillStyle=PANTS;
    rrPath(p.x-10*s + swing*2, p.y-8*s, 10*s, 18*s, 6*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+ 0*s - swing*2, p.y-8*s, 10*s, 18*s, 6*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle=SHOE;
    rrPath(p.x-14*s + swing*2, p.y+6*s, 14*s, 8*s, 6*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+ 0*s - swing*2, p.y+6*s, 14*s, 8*s, 6*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle=HOOD;
    rrPath(p.x-18*s, p.y-30*s + bob*0.5, 36*s, 28*s, 14*s); ctx.fill(); ctx.stroke();

    rrPath(p.x-30*s, p.y-28*s + bob*0.5 + swing*1.2, 14*s, 10*s, 10*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+16*s,  p.y-28*s + bob*0.5 - swing*1.2, 14*s, 10*s, 10*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle=SKIN;
    rrPath(p.x-30*s, p.y-20*s + bob*0.5 + swing*1.2, 10*s, 8*s, 6*s); ctx.fill(); ctx.stroke();
    rrPath(p.x+20*s,  p.y-20*s + bob*0.5 - swing*1.2, 10*s, 8*s, 6*s); ctx.fill(); ctx.stroke();

    ctx.fillStyle=SKIN;
    ctx.beginPath(); ctx.arc(p.x, p.y-48*s + bob, 16*s, 0, Math.PI*2); ctx.fill(); ctx.stroke();

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

    ctx.fillStyle=GL2; rrPath(p.x-14*s, p.y-52*s + bob, 12*s, 10*s, 5*s); ctx.fill(); ctx.stroke();
    ctx.fillStyle=GL1; rrPath(p.x+2*s,  p.y-52*s + bob, 12*s, 10*s, 5*s); ctx.fill(); ctx.stroke();

    ctx.strokeStyle=GL2;
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(p.x-2*s, p.y-47*s + bob); ctx.lineTo(p.x+2*s, p.y-47*s + bob); ctx.stroke();

    ctx.strokeStyle=OUT; ctx.lineWidth=4; ctx.fillStyle=OUT;
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
    const p = floorToScreen(jesper.u, jesper.v);
    const cx = view.ox + p.x*view.s;
    const cy = view.oy + p.y*view.s;
    bubbleEl.style.maxWidth="92%";
    bubbleEl.style.left = `${Math.max(10, Math.min(view.cssW-260, cx-140))}px`;
    const wantedBottom = (view.cssH - cy) + 140;
    bubbleEl.style.bottom = `${clamp(wantedBottom, 110, view.cssH-80)}px`;
  }

  // ===== Update =====
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
      if(Math.random()<0.50) bubble(lines[(Math.random()*lines.length)|0], 1700);
      state.nextTalk = now + 2300 + Math.random()*2400;
    }

    state.kickT = Math.max(0, state.kickT - dt);

    let du=0, dv=0;
    if(!state.sitting && state.joy.active){
      const v=dragToRoomVec(state.joy.dx, state.joy.dy);
      const L=Math.hypot(v.du,v.dv)||1;
      du=(v.du/L)*jesper.speed;
      dv=(v.dv/L)*jesper.speed;
    } else if(!state.sitting){
      du = jesper.du * Math.pow(0.02, dt);
      dv = jesper.dv * Math.pow(0.02, dt);
    }
    jesper.du = du; jesper.dv = dv;

    collideAndSlide(jesper, jesper.r, jesper.u + du*dt, jesper.v + dv*dt);

    // ornaments
    const fr=Math.pow(0.02, dt);
    for(const o of ornaments){
      if(state.dragging===o) continue;
      o.du *= fr; o.dv *= fr;
      collideAndSlide(o, o.r, o.u + o.du*dt, o.v + o.dv*dt);
    }

    // ornament separation
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

  // ===== Draw =====
  function draw(tMs){
    drawRoom();

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    for(const p of state.puffs){
      const pp=floorToScreen(p.u,p.v);
      ctx.save();
      ctx.globalAlpha=Math.max(0,p.a)*0.22;
      ctx.fillStyle="#111827";
      ctx.beginPath(); ctx.arc(pp.x, pp.y-6, 12, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

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

    ctx.restore();
    drawFrame();
  }

  // ===== Loop =====
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
