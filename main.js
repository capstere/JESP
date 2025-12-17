(() => {
  "use strict";
  // Notes:
  // - Side-view room (2D). Jesper can walk across the whole room (no prop-blocking).
  // - Props (table/chair/tree) are drawn much clearer.
  // - Jesper is rendered as a tiny pixel-sprite on an offscreen canvas, then scaled up.

  const $ = (id) => document.getElementById(id);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const dist = (ax,ay,bx,by)=>Math.hypot(ax-bx, ay-by);

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
  function bubble(msg, ms=1600){
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
    bubble("Tillbaka. Det var bara en sekund av lycka.", 1500);
  });

  if (wonderImg && wonderFallback){
    wonderImg.addEventListener("error", () => {
      wonderImg.classList.add("hidden");
      wonderFallback.classList.remove("hidden");
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
    o.frequency.setValueAtTime(160 + Math.random()*90, now);
    o.frequency.exponentialRampToValueAtTime(90, now+0.16);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.085*intensity, now+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.22);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now+0.24);
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
      toast("Ljud på. (Diskret gubbljud aktiverat.)");
      grunt(1.0);
    } else toast("Ljud av.");
  });

  // ===== Canvas =====
  if(!canvas){ console.warn("Canvas #game saknas."); return; }
  const ctx = canvas.getContext("2d", {alpha:false});

  // Fixed world: side-view (keep it SIMPLE)
  const WORLD = { w: 900, h: 420 };
  const view = { s:1, ox:0, oy:0, cssW:0, cssH:0 };

  const ROOM = { x: 50, y: 52, w: 800, h: 280 };
  const FLOOR_Y = ROOM.y + ROOM.h - 42;

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.width = Math.max(1, Math.round(rect.width*dpr));
    canvas.height= Math.max(1, Math.round(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    view.cssW = rect.width;
    view.cssH = rect.height;

    view.s = rect.width / WORLD.w;            // fill width
    view.ox = (rect.width - WORLD.w*view.s)/2;
    view.oy = 8;                              // top align
  }
  window.addEventListener("resize", resize, {passive:true});
  resize();

  // ===== Helpers =====
  function roundRectPath(x,y,w,h,r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y,   x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x,   y+h, rr);
    ctx.arcTo(x,   y+h, x,   y,   rr);
    ctx.arcTo(x,   y,   x+w, y,   rr);
    ctx.closePath();
  }
  function rrFillStroke(x,y,w,h,r,fill,stroke="#111827",lw=4){
    ctx.fillStyle=fill;
    ctx.strokeStyle=stroke;
    ctx.lineWidth=lw;
    roundRectPath(x,y,w,h,r);
    ctx.fill();
    ctx.stroke();
  }
  function circleFill(x,y,r,fill){
    ctx.fillStyle=fill;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  function shadowEllipse(x,y,rx,ry,a=0.14){
    ctx.save();
    ctx.globalAlpha=a;
    ctx.fillStyle="#111827";
    ctx.beginPath();
    ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // ===== Assets: Tavla (optional) =====
  const tavla = new Image();
  let tavlaLoaded=false;
  tavla.onload=()=>{tavlaLoaded=true;};
  tavla.onerror=()=>{tavlaLoaded=false;};
  tavla.src="assets/tavla.jpg?v=1";

  // ===== Props (clear silhouettes) =====
  const props = {
    frame: { x: ROOM.x+40, y: ROOM.y+34, w: 140, h: 98 },
    table: { x: ROOM.x+175, w: 280 },
    chair: { x: ROOM.x+520, w: 140 },
    tree:  { x: ROOM.x+720, w: 130 }
  };

  // ===== Entities =====
  const state = {
    joy:{active:false, sx:0, sy:0, dx:0},
    dragging:null,
    kickT:0,
    sitting:false,
    secret:{step:0, unlocked:false},
    nextTalk: performance.now() + 900 + Math.random()*1200,
  };

  const jesper = { x: ROOM.x+130, vx:0, facing: 1, action:"idle", actionT:0 };

  const ornaments = [
    {id:"clock", label:"⏰", x: ROOM.x+260, y:FLOOR_Y, vx:0, r:19, base:"#fde047"},
    {id:"candy", label:"🍬", x: ROOM.x+360, y:FLOOR_Y, vx:0, r:19, base:"#fb7185"},
    {id:"star",  label:"⭐", x: ROOM.x+460, y:FLOOR_Y, vx:0, r:19, base:"#60a5fa"},
  ];

  // ===== Secret =====
  function advanceSecret(id){
    if(state.secret.unlocked) return;
    const want = state.secret.step===0?"clock":state.secret.step===1?"candy":state.secret.step===2?"star":null;
    if(id===want){
      state.secret.step++;
      toast(`Hemligheten: ${state.secret.step}/3`);
      if(state.secret.step===3) bubble("SITT på stolen. Nu.", 1300);
      grunt(1.0);
      return;
    }
    state.secret.step=0;
    toast("Fel ordning. Julen nekade.");
    grunt(0.8);
  }
  function unlockWonder(){
    if(state.secret.unlocked) return;
    state.secret.unlocked=true;
    jingle();
    bubble("…okej. Det där var faktiskt mysigt.", 1600);
    wonder?.classList.remove("hidden");
  }

  // ===== Movement / physics =====
  function resolveWallsX(x, r){
    return clamp(x, ROOM.x + r, ROOM.x + ROOM.w - r);
  }
  function resolveOrnament(o){
    // walls
    const minX = ROOM.x + o.r;
    const maxX = ROOM.x + ROOM.w - o.r;
    if(o.x < minX){ o.x=minX; o.vx*=-0.55; }
    if(o.x > maxX){ o.x=maxX; o.vx*=-0.55; }

    // table / chair / tree are "solid-ish" for ornaments only
    const blocks = [
      {x: props.table.x+18, w: 28},
      {x: props.table.x+props.table.w-46, w: 28},
      {x: props.chair.x+12, w: props.chair.w-24},
      {x: props.tree.x+56, w: 22},
    ];
    for(const b of blocks){
      const left = b.x - o.r;
      const right= b.x + b.w + o.r;
      if(o.x > left && o.x < right){
        if(o.vx >= 0) o.x = left;
        else o.x = right;
        o.vx *= -0.48;
      }
    }
  }

  // ===== Actions =====
  function nearestOrnament(){
    let best=null, bestD=1e18;
    for(const o of ornaments){
      const d = Math.abs(o.x - jesper.x);
      if(d<bestD){bestD=d; best=o;}
    }
    return {o:best, d:bestD};
  }

  function doKnuff(){
    if(wonder && !wonder.classList.contains("hidden")) return;
    state.kickT=0.22;
    jesper.action="kick"; jesper.actionT=0.0;

    const {o,d}=nearestOrnament();
    if(!o || d>88){
      bubble("Knuffade luft. KPI: oklart.", 1400);
      grunt(0.75);
      return;
    }
    const dir = (o.x>=jesper.x) ? 1 : -1;
    o.vx += dir*(380 + Math.random()*140);
    bubble(`KNUFF! (${o.label})`, 900);
    grunt(1.0);
    advanceSecret(o.id);
  }

  function doSit(){
    if(wonder && !wonder.classList.contains("hidden")) return;
    const near = Math.abs(jesper.x - (props.chair.x + props.chair.w/2)) < 84;
    if(!near){
      bubble("Satt… i själen. Inte på stolen.", 1500);
      grunt(0.65);
      return;
    }
    state.sitting=true;
    jesper.action="sit"; jesper.actionT=0.0;
    bubble("🪑 “Jag är bara… en gubbe i ett rum.”", 1700);
    grunt(0.85);
    setTimeout(()=>{ state.sitting=false; jesper.action="idle"; }, 900);

    if(state.secret.step===3 && !state.secret.unlocked){
      toast("Kombination fullbordad!");
      unlockWonder();
    } else if(!state.secret.unlocked){
      toast("Du satt. Hemligheten: avvaktande.");
    }
  }

  kickBtn?.addEventListener("click", doKnuff);
  sitBtn?.addEventListener("click", doSit);

  // ===== Input (drag to move; drag ornament to move ornament) =====
  function pointerPos(e){
    const r = canvas.getBoundingClientRect();
    return {x:e.clientX-r.left, y:e.clientY-r.top};
  }
  function toWorld(px,py){
    return { x:(px-view.ox)/view.s, y:(py-view.oy)/view.s };
  }
  function hitOrnament(wx,wy){
    for(const o of ornaments){
      const oy = o.y;
      if(dist(wx,wy, o.x, oy) < (o.r+10)) return o;
    }
    return null;
  }

  canvas.addEventListener("pointerdown",(e)=>{
    e.preventDefault();
    const p=pointerPos(e);
    const w=toWorld(p.x,p.y);

    const hit = hitOrnament(w.x,w.y);
    if(hit){
      state.dragging=hit;
      hit.vx=0;
      canvas.setPointerCapture(e.pointerId);
      toast("Flyttar pynt.");
      grunt(0.7);
      return;
    }

    state.joy.active=true;
    state.joy.sx=p.x;
    state.joy.sy=p.y;
    state.joy.dx=0;
    canvas.setPointerCapture(e.pointerId);
  }, {passive:false});

  canvas.addEventListener("pointermove",(e)=>{
    e.preventDefault();
    const p=pointerPos(e);
    const w=toWorld(p.x,p.y);

    if(state.dragging){
      state.dragging.x = resolveWallsX(w.x, state.dragging.r);
      resolveOrnament(state.dragging);
      return;
    }
    if(state.joy.active){
      // horizontal only (NO "flying")
      state.joy.dx = clamp(p.x - state.joy.sx, -150, 150);
    }
  }, {passive:false});

  function endPointer(){
    state.dragging=null;
    state.joy.active=false;
    state.joy.dx=0;
  }
  canvas.addEventListener("pointerup", endPointer, {passive:false});
  canvas.addEventListener("pointercancel", endPointer, {passive:false});

  // ===== Talk bubbles =====
  function maybeTalk(){
    const t = performance.now();
    if(t < state.nextTalk) return;
    const lines=[
      "Det här känns som ett möte utan agenda.",
      "Jag gick hit för kaffe. Jag fann… vägg.",
      "Tre pynt. Noll mening. Perfekt.",
      "Jag vill ha en ticket: Fönster i rummet.",
      "Jag är en gubbe i ett rum. Det är allt."
    ];
    if(Math.random()<0.55) bubble(lines[(Math.random()*lines.length)|0], 1750);
    state.nextTalk = t + 2600 + Math.random()*2600;
  }

  // ===== Pixel-sprite Jesper (offscreen) =====
  const spr = document.createElement("canvas");
  spr.width = 64; spr.height=64;
  const sctx = spr.getContext("2d");

  function pix(x,y,w,h,c){ sctx.fillStyle=c; sctx.fillRect(x|0,y|0,w|0,h|0); }
  function pixC(x,y,r,c){
    sctx.fillStyle=c;
    sctx.beginPath(); sctx.arc(x,y,r,0,Math.PI*2); sctx.fill();
  }

  function drawJesperSprite(frame, action, facing){
    sctx.clearRect(0,0,64,64);
    sctx.imageSmoothingEnabled = false;

    const OUT="#0b1220";
    const SKIN="#f6d7b5";
    const HAIR="#7a3b19";
    const HAIR2="#c46a35";
    const HOOD="#111827";
    const PANTS="#9ca3af";
    const SHOE="#7a4a24";
    const GLD="#1f1f1f";
    const GLB="#6b3f1f";
    const GLT="#d6b98f";

    // shadow
    pixC(32, 58, 12, "rgba(11,18,32,0.18)");

    let bob = (action==="walk") ? (frame%2===0?0:1) : 0;
    let arm = (action==="walk") ? (frame%4<2?1:-1) : 0;
    let leg = (action==="walk") ? (frame%4<2?-1:1) : 0;

    if(action==="sit"){ bob=2; arm=0; leg=0; }
    if(action==="kick"){ arm=1; leg=1; }

    const baseY = 44 + bob;
    const fx = facing<0 ? -1 : 1;

    function fxX(x){ return fx<0 ? (64 - x) : x; }

    // legs
    pix(fxX(26), baseY+6, 5, 10, PANTS);
    pix(fxX(33), baseY+6, 5, 10, PANTS);
    pix(fxX(25+leg*1), baseY+14, 7, 4, SHOE);
    pix(fxX(32-leg*1), baseY+14, 7, 4, SHOE);

    // hoodie/body
    pix(fxX(22), baseY-8, 20, 18, HOOD);

    // arms
    pix(fxX(18), baseY-6, 5, 10, HOOD);
    pix(fxX(41), baseY-6, 5, 10, HOOD);
    pix(fxX(18), baseY+3, 5, 5, SKIN);
    pix(fxX(41), baseY+3, 5, 5, SKIN);

    // head
    pixC(32, baseY-18, 10, SKIN);
    // hair curls (curly brown-red)
    pixC(24, baseY-26, 5, HAIR);
    pixC(32, baseY-28, 6, HAIR);
    pixC(40, baseY-26, 5, HAIR);
    pixC(28, baseY-29, 3, HAIR2);
    pixC(36, baseY-29, 3, HAIR2);

    // glasses (tortoise)
    pix(fxX(24), baseY-22, 8, 6, GLB);
    pix(fxX(34), baseY-22, 8, 6, GLD);
    pix(fxX(24), baseY-22, 8, 1, OUT);
    pix(fxX(34), baseY-22, 8, 1, OUT);
    pix(fxX(24), baseY-17, 8, 1, OUT);
    pix(fxX(34), baseY-17, 8, 1, OUT);
    pix(fxX(31), baseY-20, 2, 2, GLT);

    // eyes & mouth
    const blink = (action==="idle" && Math.random()<0.02);
    if(blink){
      pix(28, baseY-20, 3, 1, OUT);
      pix(36, baseY-20, 3, 1, OUT);
    } else {
      pixC(29, baseY-20, 1.4, OUT);
      pixC(37, baseY-20, 1.4, OUT);
    }
    if(action==="kick"){
      pixC(33, baseY-14, 3.2, OUT);
    } else if(action==="sit"){
      pix(30, baseY-14, 7, 2, OUT);
    } else {
      pixC(33, baseY-14, 2.6, OUT);
      pix(30, baseY-14, 7, 1, SKIN);
    }
  }

  // ===== Drawing (world) =====
  function drawRoom(){
    // full canvas (in CSS pixels)
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,view.cssW,view.cssH);

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    // panel background
    rrFillStroke(ROOM.x-16, ROOM.y-18, ROOM.w+32, ROOM.h+36, 26, "#f4f6ff", "#111827", 4);

    // wall
    const wallGrad = ctx.createLinearGradient(0, ROOM.y, 0, FLOOR_Y-18);
    wallGrad.addColorStop(0, "#ffffff");
    wallGrad.addColorStop(1, "#f2f5ff");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(ROOM.x, ROOM.y, ROOM.w, FLOOR_Y-ROOM.y);

    // subtle wall glow
    ctx.save();
    ctx.globalAlpha=0.10;
    ctx.fillStyle="#60a5fa";
    ctx.beginPath();
    ctx.ellipse(ROOM.x+ROOM.w*0.62, ROOM.y+ROOM.h*0.30, 240, 120, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // floor
    const floorGrad = ctx.createLinearGradient(0, FLOOR_Y-30, 0, ROOM.y+ROOM.h);
    floorGrad.addColorStop(0, "#eef2ff");
    floorGrad.addColorStop(1, "#e9edff");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(ROOM.x, FLOOR_Y-18, ROOM.w, ROOM.y+ROOM.h-(FLOOR_Y-18));

    // baseboard + floor line
    ctx.strokeStyle="rgba(17,24,39,0.26)";
    ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(ROOM.x, FLOOR_Y-18); ctx.lineTo(ROOM.x+ROOM.w, FLOOR_Y-18); ctx.stroke();

    ctx.strokeStyle="#111827";
    ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(ROOM.x, FLOOR_Y); ctx.lineTo(ROOM.x+ROOM.w, FLOOR_Y); ctx.stroke();

    // room outline
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    rrFillStroke(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 22, "rgba(0,0,0,0)", "#111827", 4);

    // caption
    ctx.fillStyle="rgba(17,24,39,0.20)";
    ctx.font="900 12px ui-monospace, monospace";
    ctx.fillText("RUM 01 — KALT / TYDLIGT / JUL / KAFFE", ROOM.x+18, ROOM.y+ROOM.h-16);

    ctx.restore();
  }

  function drawFrame(){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const f=props.frame;

    // frame border
    rrFillStroke(f.x, f.y, f.w, f.h, 14, "#ffffff", "#111827", 4);

    const ix=f.x+7, iy=f.y+7, iw=f.w-14, ih=f.h-14;
    if(tavlaLoaded && tavla.naturalWidth>0){
      ctx.save();
      roundRectPath(ix,iy,iw,ih,10); ctx.clip();
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
      rrFillStroke(ix,iy,iw,ih,10,"rgba(96,165,250,0.15)","rgba(0,0,0,0)",0);
      ctx.restore();
    } else {
      ctx.fillStyle="#f3f4f6";
      roundRectPath(ix,iy,iw,ih,10); ctx.fill();
      ctx.strokeStyle="rgba(17,24,39,0.18)";
      ctx.setLineDash([6,6]);
      ctx.strokeRect(ix+4, iy+4, iw-8, ih-8);
      ctx.setLineDash([]);
      ctx.fillStyle="rgba(17,24,39,0.45)";
      ctx.font="1000 11px ui-monospace, monospace";
      ctx.fillText("TAVLA", f.x+22, f.y+34);
      ctx.fillStyle="rgba(17,24,39,0.26)";
      ctx.font="900 10px ui-monospace, monospace";
      ctx.fillText("(lägg tavla.jpg)", f.x+12, f.y+56);
    }

    ctx.restore();
  }

  function drawTable(){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const x=props.table.x, w=props.table.w;
    const topY = FLOOR_Y - 110;

    shadowEllipse(x+w/2, FLOOR_Y+10, w*0.33, 10, 0.10);

    // table top
    rrFillStroke(x, topY, w, 46, 16, "#ffffff", "#111827", 4);
    // inset
    ctx.save();
    ctx.globalAlpha=0.08;
    rrFillStroke(x+10, topY+10, w-20, 26, 14, "#60a5fa", "rgba(0,0,0,0)", 0);
    ctx.restore();

    // apron
    rrFillStroke(x+18, topY+42, w-36, 34, 14, "#e5e7eb", "#111827", 4);

    // legs
    rrFillStroke(x+26,     topY+70, 22, 78, 12, "#e5e7eb", "#111827", 4);
    rrFillStroke(x+w-48,   topY+70, 22, 78, 12, "#e5e7eb", "#111827", 4);

    // a tiny laptop + coffee cup (office core)
    rrFillStroke(x+w*0.58, topY+14, 54, 22, 8, "#dbeafe", "#111827", 4);
    rrFillStroke(x+w*0.72, topY+16, 18, 20, 8, "#ffffff", "#111827", 4);
    circleFill(x+w*0.74, topY+28, 4, "#111827");

    ctx.restore();
  }

  function drawChair(){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const x=props.chair.x, w=props.chair.w;
    const seatY = FLOOR_Y - 78;

    shadowEllipse(x+w/2, FLOOR_Y+10, w*0.28, 9, 0.10);

    // seat
    rrFillStroke(x, seatY, w, 34, 16, "#ffffff", "#111827", 4);
    rrFillStroke(x+12, seatY+30, w-24, 30, 14, "#e5e7eb", "#111827", 4);

    // back
    rrFillStroke(x+18, seatY-68, w-36, 72, 18, "#ffffff", "#111827", 4);
    ctx.save();
    ctx.globalAlpha=0.10;
    rrFillStroke(x+24, seatY-62, w-48, 56, 16, "#60a5fa", "rgba(0,0,0,0)", 0);
    ctx.restore();

    // legs
    rrFillStroke(x+16, seatY+56, 16, 58, 10, "#e5e7eb", "#111827", 4);
    rrFillStroke(x+w-32, seatY+56, 16, 58, 10, "#e5e7eb", "#111827", 4);

    // label (tiny, but clear)
    ctx.fillStyle="rgba(17,24,39,0.30)";
    ctx.font="1000 11px ui-monospace, monospace";
    ctx.fillText("STOL", x+ w/2 - 16, seatY-26);

    ctx.restore();
  }

  function drawTree(tMs){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const x=props.tree.x, w=props.tree.w;
    const cx = x + w/2;
    shadowEllipse(cx, FLOOR_Y+10, w*0.22, 9, 0.10);

    // trunk
    rrFillStroke(cx-10, FLOOR_Y-44, 20, 42, 10, "#e5e7eb", "#111827", 4);

    // body (layered triangles)
    ctx.strokeStyle="#111827"; ctx.lineWidth=4;
    ctx.fillStyle="#dcfce7";
    ctx.beginPath();
    ctx.moveTo(cx, FLOOR_Y-180);
    ctx.lineTo(cx-56, FLOOR_Y-94);
    ctx.lineTo(cx+56, FLOOR_Y-94);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, FLOOR_Y-144);
    ctx.lineTo(cx-72, FLOOR_Y-48);
    ctx.lineTo(cx+72, FLOOR_Y-48);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // ornaments
    ctx.font="26px system-ui";
    ctx.fillText("⭐", cx-12, FLOOR_Y-196);
    ctx.font="22px system-ui";
    ctx.fillText("🔴", cx-70, FLOOR_Y-106);
    ctx.fillText("🔴", cx+40, FLOOR_Y-112);
    ctx.fillText("🔴", cx-10, FLOOR_Y-74);

    // subtle glow pulse
    const pulse = 0.65 + 0.35*Math.sin(tMs/260);
    ctx.save();
    ctx.globalAlpha=0.12*pulse;
    ctx.fillStyle="#60a5fa";
    ctx.beginPath();
    ctx.ellipse(cx, FLOOR_Y-110, 88, 120, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawOrnament(o){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    shadowEllipse(o.x, o.y+12, 16, 5, 0.10);
    ctx.fillStyle=o.base;
    ctx.strokeStyle="#111827";
    ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.font="24px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillStyle="#111827";
    ctx.fillText(o.label, o.x, o.y+1);
    ctx.textAlign="start";
    ctx.textBaseline="alphabetic";

    ctx.restore();
  }

  function drawJesper(tMs){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const moving = Math.abs(jesper.vx) > 40 && !state.sitting && jesper.action!=="kick";
    const phase = (tMs/140);
    const frame = moving ? (Math.floor(phase) % 4) : 0;

    let action="idle";
    if(state.sitting) action="sit";
    else if(jesper.action==="kick" && jesper.actionT < 0.26) action="kick";
    else if(moving) action="walk";

    // render sprite
    drawJesperSprite(frame, action, jesper.facing);

    // draw sprite scaled (pixel look)
    const scale = 2.15;       // sprite size
    const drawW = 64*scale;
    const drawH = 64*scale;

    const x = jesper.x - drawW/2;
    const y = FLOOR_Y - drawH + 18; // align feet to floor

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr, x, y, drawW, drawH);
    ctx.restore();

    // name tag (small)
    ctx.font="900 12px ui-monospace, monospace";
    ctx.fillStyle="rgba(17,24,39,0.55)";
    ctx.textAlign="center";
    ctx.fillText("JESPER", jesper.x, y-6);
    ctx.textAlign="start";

    ctx.restore();
  }

  function drawJoystick(){
    if(!state.joy.active) return;
    // draw a simple horizontal slider cue (NOT d-pad)
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const bx = clamp((state.joy.sx - view.ox)/view.s, ROOM.x+70, ROOM.x+ROOM.w-70);
    const by = ROOM.y + ROOM.h - 78;
    const kx = clamp(bx + (state.joy.dx/view.s), bx-110, bx+110);

    ctx.globalAlpha = 0.92;
    ctx.strokeStyle="rgba(17,24,39,0.30)";
    ctx.lineWidth=6;
    ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(bx-80, by); ctx.lineTo(bx+80, by); ctx.stroke();

    ctx.fillStyle="rgba(37,99,235,0.18)";
    ctx.strokeStyle="rgba(17,24,39,0.55)";
    ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(kx, by, 18, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.restore();
  }

  function pinBubble(){
    if(!bubbleEl || bubbleEl.classList.contains("hidden")) return;
    // anchor above Jesper
    const cx = (view.ox + jesper.x*view.s);
    const cy = (view.oy + FLOOR_Y*view.s);
    bubbleEl.style.maxWidth="92%";
    bubbleEl.style.left = `${Math.max(10, Math.min(view.cssW-260, cx-140))}px`;
    bubbleEl.style.bottom = `${clamp((view.cssH - cy) + 165, 110, view.cssH-80)}px`;
  }

  // ===== Game loop =====
  let last = performance.now();
  function step(t){
    const dt = Math.min(0.033, (t-last)/1000);
    last=t;

    if(!(wonder && !wonder.classList.contains("hidden"))){
      maybeTalk();

      // update action timers
      if(jesper.action!=="idle"){
        jesper.actionT += dt;
        if(jesper.action==="kick" && jesper.actionT>0.35){ jesper.action="idle"; }
      }
      state.kickT = Math.max(0, state.kickT - dt);

      // joystick -> velocity
      if(state.joy.active && !state.sitting){
        const target = (state.joy.dx/150) * 360;
        jesper.vx = lerp(jesper.vx, target, 0.28);
      } else {
        jesper.vx = lerp(jesper.vx, 0, 0.18);
      }
      if(Math.abs(jesper.vx) > 15) jesper.facing = jesper.vx>=0 ? 1 : -1;

      // integrate
      jesper.x = resolveWallsX(jesper.x + jesper.vx*dt, 28);

      // ornaments
      const fr = Math.pow(0.02, dt);
      for(const o of ornaments){
        if(state.dragging===o) continue;
        o.vx *= fr;
        o.x += o.vx*dt;
        resolveOrnament(o);
      }

      // ornament separation
      for(let i=0;i<ornaments.length;i++){
        for(let j=i+1;j<ornaments.length;j++){
          const a=ornaments[i], b=ornaments[j];
          const dx=b.x-a.x;
          const d=Math.abs(dx);
          const minD=a.r+b.r+8;
          if(d>0 && d<minD){
            const push=(minD-d)/2;
            const s = Math.sign(dx)||1;
            a.x -= s*push; b.x += s*push;
            const tv=a.vx; a.vx=b.vx; b.vx=tv;
          }
        }
      }

      pinBubble();
    }

    // draw
    drawRoom();
    drawFrame();
    drawTable();
    drawChair();
    drawTree(t);

    // ornaments behind Jesper? (simple: draw ornaments first)
    for(const o of ornaments) drawOrnament(o);
    drawJesper(t);

    drawJoystick();

    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  // Initial hints
  setTimeout(()=>toast("Dra i rummet = gå vänster/höger • Dra pynt = flytta • KNUFF nära pynt • SITT nära stolen"), 850);
  setTimeout(()=>toast("Tips: KNUFF ⏰ → 🍬 → ⭐ och SITT på stolen."), 2600);

})();
