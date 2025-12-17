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
  function bubble(msg, ms=1650){
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
    o.frequency.setValueAtTime(150 + Math.random()*90, now);
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
  ctx.imageSmoothingEnabled = true;

  // World aspect matches canvas (4:3) so we fill the whole area (no huge white void)
  const WORLD = { w: 1000, h: 750 };
  const view = { s:1, ox:0, oy:0, cssW:0, cssH:0 };

  function resize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.width = Math.max(1, Math.round(rect.width*dpr));
    canvas.height= Math.max(1, Math.round(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    view.cssW = rect.width;
    view.cssH = rect.height;

    const sx = rect.width / WORLD.w;
    const sy = rect.height / WORLD.h;
    view.s = Math.min(sx, sy);
    view.ox = (rect.width - WORLD.w*view.s)/2;
    view.oy = (rect.height - WORLD.h*view.s)/2;
  }
  window.addEventListener("resize", resize, {passive:true});
  resize();

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
  function rrFillStroke(x,y,w,h,r,fill,stroke="#111827",lw=6){
    ctx.fillStyle=fill;
    ctx.strokeStyle=stroke;
    ctx.lineWidth=lw;
    roundRectPath(x,y,w,h,r);
    ctx.fill();
    ctx.stroke();
  }
  function ellipseShadow(x,y,rx,ry,a=0.14){
    ctx.save();
    ctx.globalAlpha=a;
    ctx.fillStyle="#111827";
    ctx.beginPath();
    ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // ===== Room layout (big, centered, clear) =====
  const ROOM = { x: 90, y: 120, w: 820, h: 460 };
  const FLOOR_Y = ROOM.y + ROOM.h - 92;

  const props = {
    frame: { x: ROOM.x+44, y: ROOM.y+40, w: 170, h: 118 },
    table: { x: ROOM.x+230, y: FLOOR_Y-150, w: 310, h: 150 },
    chair: { x: ROOM.x+610, y: FLOOR_Y-138, w: 190, h: 180 },
    tree:  { x: ROOM.x+805, y: FLOOR_Y-260, w: 120, h: 260 },
  };

  // Tavla (optional jpg)
  const tavla = new Image();
  let tavlaLoaded=false;
  tavla.onload=()=>{tavlaLoaded=true;};
  tavla.onerror=()=>{tavlaLoaded=false;};
  tavla.src="assets/tavla.jpg?v=1";

  // ===== Entities =====
  const state = {
    joy:{active:false, sx:0, sy:0, dx:0},
    dragging:null,
    kickT:0,
    sitting:false,
    secret:{step:0, unlocked:false},
    nextTalk: performance.now() + 900 + Math.random()*1200,
  };

  const jesper = {
    x: ROOM.x+160,
    vx:0,
    facing: 1,
    action:"idle",
    actionT:0,
    mood:0, // 0..2
    moodT: performance.now() + 1200
  };

  const ornaments = [
    {id:"clock", label:"⏰", x: ROOM.x+360, y:FLOOR_Y+14, vx:0, r:22, base:"#fde047"},
    {id:"candy", label:"🍬", x: ROOM.x+470, y:FLOOR_Y+14, vx:0, r:22, base:"#fb7185"},
    {id:"star",  label:"⭐", x: ROOM.x+580, y:FLOOR_Y+14, vx:0, r:22, base:"#60a5fa"},
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
    state.kickT=0.25;
    jesper.action="kick"; jesper.actionT=0.0;

    const {o,d}=nearestOrnament();
    if(!o || d>110){
      bubble("Knuffade luft. KPI: oklart.", 1400);
      grunt(0.75);
      return;
    }
    const dir = (o.x>=jesper.x) ? 1 : -1;
    o.vx += dir*(520 + Math.random()*160);
    bubble(`KNUFF! (${o.label})`, 900);
    grunt(1.0);
    advanceSecret(o.id);
  }

  function doSit(){
    if(wonder && !wonder.classList.contains("hidden")) return;
    const chairMid = props.chair.x + props.chair.w*0.38;
    const near = Math.abs(jesper.x - chairMid) < 120;
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

  // ===== Input =====
  function pointerPos(e){
    const r = canvas.getBoundingClientRect();
    return {x:e.clientX-r.left, y:e.clientY-r.top};
  }
  function toWorld(px,py){
    return { x:(px-view.ox)/view.s, y:(py-view.oy)/view.s };
  }
  function hitOrnament(wx,wy){
    for(const o of ornaments){
      const dx = wx - o.x;
      const dy = wy - o.y;
      if(dx*dx+dy*dy < (o.r+14)*(o.r+14)) return o;
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
      state.dragging.x = clamp(w.x, ROOM.x + state.dragging.r, ROOM.x + ROOM.w - state.dragging.r);
      state.dragging.y = FLOOR_Y+14;
      return;
    }
    if(state.joy.active){
      state.joy.dx = clamp(p.x - state.joy.sx, -180, 180);
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

  // ===== Drawing (high quality, consistent style) =====
  function drawRoom(tMs){
    // background
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,view.cssW,view.cssH);

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    // outer panel around room (nice framing)
    rrFillStroke(ROOM.x-22, ROOM.y-24, ROOM.w+44, ROOM.h+48, 28, "#f4f6ff", "#111827", 6);

    // wall gradient
    const wallGrad = ctx.createLinearGradient(0, ROOM.y, 0, FLOOR_Y-40);
    wallGrad.addColorStop(0, "#ffffff");
    wallGrad.addColorStop(1, "#f2f5ff");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(ROOM.x, ROOM.y, ROOM.w, (FLOOR_Y-32)-ROOM.y);

    // subtle glow (keep it clean)
    ctx.save();
    ctx.globalAlpha=0.08;
    ctx.fillStyle="#60a5fa";
    ctx.beginPath();
    ctx.ellipse(ROOM.x+ROOM.w*0.62, ROOM.y+ROOM.h*0.30, 260, 140, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // floor
    const floorGrad = ctx.createLinearGradient(0, FLOOR_Y-30, 0, ROOM.y+ROOM.h);
    floorGrad.addColorStop(0, "#eef2ff");
    floorGrad.addColorStop(1, "#e7ecff");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(ROOM.x, FLOOR_Y-22, ROOM.w, ROOM.y+ROOM.h-(FLOOR_Y-22));

    // baseboard
    ctx.strokeStyle="rgba(17,24,39,0.26)";
    ctx.lineWidth=10;
    ctx.beginPath(); ctx.moveTo(ROOM.x, FLOOR_Y-22); ctx.lineTo(ROOM.x+ROOM.w, FLOOR_Y-22); ctx.stroke();

    // floor line
    ctx.strokeStyle="#111827";
    ctx.lineWidth=8;
    ctx.beginPath(); ctx.moveTo(ROOM.x, FLOOR_Y); ctx.lineTo(ROOM.x+ROOM.w, FLOOR_Y); ctx.stroke();

    // room inner outline
    ctx.strokeStyle="#111827";
    ctx.lineWidth=8;
    roundRectPath(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 26);
    ctx.stroke();

    // caption
    ctx.fillStyle="rgba(17,24,39,0.20)";
    ctx.font="900 14px ui-monospace, monospace";
    ctx.fillText("RUM 01 — KALT / TYDLIGT / JUL / KAFFE", ROOM.x+20, ROOM.y+ROOM.h-22);

    ctx.restore();
  }

  function drawFrame(){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const f=props.frame;
    rrFillStroke(f.x, f.y, f.w, f.h, 16, "#ffffff", "#111827", 6);

    const ix=f.x+9, iy=f.y+9, iw=f.w-18, ih=f.h-18;
    if(tavlaLoaded && tavla.naturalWidth>0){
      ctx.save();
      roundRectPath(ix,iy,iw,ih,12); ctx.clip();
      const imgAR=tavla.naturalWidth/tavla.naturalHeight;
      const boxAR=iw/ih;
      let dx=ix, dy=iy, dw=iw, dh=ih;
      if(imgAR>boxAR){ dh=ih; dw=ih*imgAR; dx=ix-(dw-iw)/2; }
      else { dw=iw; dh=iw/imgAR; dy=iy-(dh-ih)/2; }
      ctx.drawImage(tavla, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle="#f3f4f6";
      roundRectPath(ix,iy,iw,ih,12); ctx.fill();
      ctx.strokeStyle="rgba(17,24,39,0.18)";
      ctx.setLineDash([10,10]);
      ctx.lineWidth=4;
      ctx.strokeRect(ix+6, iy+6, iw-12, ih-12);
      ctx.setLineDash([]);
      ctx.fillStyle="rgba(17,24,39,0.45)";
      ctx.font="1000 13px ui-monospace, monospace";
      ctx.fillText("TAVLA", f.x+24, f.y+40);
      ctx.fillStyle="rgba(17,24,39,0.26)";
      ctx.font="900 12px ui-monospace, monospace";
      ctx.fillText("(lägg tavla.jpg)", f.x+12, f.y+68);
    }

    ctx.restore();
  }

  function drawTable(){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const t=props.table;
    ellipseShadow(t.x + t.w/2, FLOOR_Y+24, t.w*0.32, 14, 0.10);

    // tabletop
    rrFillStroke(t.x, t.y, t.w, 62, 22, "#ffffff", "#111827", 8);

    // inner highlight
    ctx.save(); ctx.globalAlpha=0.10;
    rrFillStroke(t.x+16, t.y+16, t.w-32, 30, 18, "#60a5fa", "rgba(0,0,0,0)", 0);
    ctx.restore();

    // apron
    rrFillStroke(t.x+26, t.y+58, t.w-52, 56, 18, "#e5e7eb", "#111827", 8);

    // legs (4)
    rrFillStroke(t.x+40,         t.y+106, 30, 112, 16, "#e5e7eb", "#111827", 8);
    rrFillStroke(t.x+t.w-70,     t.y+106, 30, 112, 16, "#e5e7eb", "#111827", 8);

    // laptop
    rrFillStroke(t.x+t.w*0.60, t.y+22, 76, 34, 12, "#dbeafe", "#111827", 6);
    rrFillStroke(t.x+t.w*0.69, t.y+14, 52, 30, 12, "#ffffff", "#111827", 6);
    ctx.fillStyle="#111827";
    ctx.beginPath(); ctx.arc(t.x+t.w*0.72, t.y+30, 5, 0, Math.PI*2); ctx.fill();

    // coffee mug
    rrFillStroke(t.x+56, t.y+22, 30, 34, 10, "#ffffff", "#111827", 6);
    ctx.strokeStyle="#111827"; ctx.lineWidth=6;
    ctx.beginPath();
    ctx.arc(t.x+88, t.y+38, 10, -0.8, 0.8);
    ctx.stroke();

    ctx.restore();
  }

  function drawChair(){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const c=props.chair;
    ellipseShadow(c.x + c.w*0.46, FLOOR_Y+24, c.w*0.26, 14, 0.10);

    // backrest
    rrFillStroke(c.x+30, c.y-76, c.w-60, 120, 28, "#ffffff", "#111827", 8);
    ctx.save(); ctx.globalAlpha=0.10;
    rrFillStroke(c.x+44, c.y-62, c.w-88, 92, 24, "#60a5fa", "rgba(0,0,0,0)", 0);
    ctx.restore();

    // seat
    rrFillStroke(c.x, c.y+38, c.w*0.86, 56, 26, "#ffffff", "#111827", 8);
    rrFillStroke(c.x+18, c.y+86, c.w*0.70, 52, 22, "#e5e7eb", "#111827", 8);

    // legs
    rrFillStroke(c.x+34,         c.y+130, 22, 104, 14, "#e5e7eb", "#111827", 8);
    rrFillStroke(c.x+c.w*0.70,   c.y+130, 22, 104, 14, "#e5e7eb", "#111827", 8);

    // label
    ctx.fillStyle="rgba(17,24,39,0.30)";
    ctx.font="1000 14px ui-monospace, monospace";
    ctx.fillText("STOL", c.x + c.w*0.36, c.y-6);

    ctx.restore();
  }

  function drawTree(tMs){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    const tr=props.tree;
    const cx = tr.x + tr.w/2;
    ellipseShadow(cx, FLOOR_Y+24, 46, 14, 0.10);

    // trunk
    rrFillStroke(cx-14, FLOOR_Y-58, 28, 56, 16, "#e5e7eb", "#111827", 8);

    // layers
    ctx.strokeStyle="#111827"; ctx.lineWidth=8;
    ctx.fillStyle="#dcfce7";
    ctx.beginPath();
    ctx.moveTo(cx, FLOOR_Y-282);
    ctx.lineTo(cx-72, FLOOR_Y-168);
    ctx.lineTo(cx+72, FLOOR_Y-168);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, FLOOR_Y-230);
    ctx.lineTo(cx-92, FLOOR_Y-98);
    ctx.lineTo(cx+92, FLOOR_Y-98);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // ornaments
    ctx.font="30px system-ui";
    ctx.fillText("⭐", cx-14, FLOOR_Y-306);
    ctx.font="26px system-ui";
    ctx.fillText("🔴", cx-92, FLOOR_Y-182);
    ctx.fillText("🔴", cx+60, FLOOR_Y-182);
    ctx.fillText("🔴", cx-14, FLOOR_Y-130);

    // subtle glow pulse
    const pulse = 0.65 + 0.35*Math.sin(tMs/260);
    ctx.save();
    ctx.globalAlpha=0.10*pulse;
    ctx.fillStyle="#60a5fa";
    ctx.beginPath();
    ctx.ellipse(cx, FLOOR_Y-190, 120, 160, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawOrnament(o){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    ellipseShadow(o.x, o.y+22, 18, 6, 0.10);
    ctx.fillStyle=o.base;
    ctx.strokeStyle="#111827";
    ctx.lineWidth=8;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    ctx.font="28px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillStyle="#111827";
    ctx.fillText(o.label, o.x, o.y+2);
    ctx.textAlign="start";
    ctx.textBaseline="alphabetic";

    ctx.restore();
  }

  function drawJesper(tMs){
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.s, view.s);

    // animation
    const moving = Math.abs(jesper.vx) > 40 && !state.sitting && jesper.action!=="kick";
    const phase = (tMs/140);
    const swing = moving ? Math.sin(phase) : 0;
    const bob   = moving ? Math.sin(phase*2)*3 : 0;

    const OUT="#111827";
    const SKIN="#f6d7b5";
    const HAIR="#7a3b19";
    const HAIR2="#c46a35";
    const HOOD="#111827";
    const PANTS="#9ca3af";
    const SHOE="#7a4a24";
    const GLD="#1f1f1f";
    const GLB="#6b3f1f";
    const GLL="#d6b98f";

    const x=jesper.x;
    const y=FLOOR_Y;
    const s=1.10;

    // shadow
    ellipseShadow(x, y+26, 44, 12, 0.12);

    ctx.strokeStyle=OUT;
    ctx.lineWidth=8;
    ctx.lineCap="round";
    ctx.lineJoin="round";

    const legSwing = moving ? swing*10 : 0;
    const armSwing = moving ? -swing*12 : 0;

    // legs
    ctx.fillStyle=PANTS;
    rrFillStroke(x-18*s + legSwing*0.2, y-44*s, 18*s, 54*s, 12*s, PANTS, OUT, 8);
    rrFillStroke(x+ 0*s - legSwing*0.2, y-44*s, 18*s, 54*s, 12*s, PANTS, OUT, 8);

    // shoes
    rrFillStroke(x-28*s + legSwing*0.4, y-8*s, 30*s, 16*s, 10*s, SHOE, OUT, 8);
    rrFillStroke(x- 2*s - legSwing*0.4, y-8*s, 30*s, 16*s, 10*s, SHOE, OUT, 8);

    // body hoodie
    rrFillStroke(x-42*s, y-112*s + bob*0.2, 84*s, 76*s, 32*s, HOOD, OUT, 8);

    // arms
    rrFillStroke(x-70*s, y-104*s + bob*0.2 + armSwing*0.15, 30*s, 26*s, 18*s, HOOD, OUT, 8);
    rrFillStroke(x+40*s, y-104*s + bob*0.2 - armSwing*0.15, 30*s, 26*s, 18*s, HOOD, OUT, 8);

    // hands
    rrFillStroke(x-62*s, y-92*s + bob*0.2 + armSwing*0.12, 18*s, 16*s, 10*s, SKIN, OUT, 8);
    rrFillStroke(x+44*s, y-92*s + bob*0.2 - armSwing*0.12, 18*s, 16*s, 10*s, SKIN, OUT, 8);

    // head
    ctx.fillStyle=SKIN;
    ctx.beginPath();
    ctx.arc(x, y-152*s + bob, 34*s, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // hair curls
    ctx.fillStyle=HAIR;
    const curl = (cx,cy,r)=>{ ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.stroke(); };
    curl(x-28*s, y-188*s + bob, 15*s);
    curl(x- 6*s, y-200*s + bob, 18*s);
    curl(x+18*s, y-192*s + bob, 15*s);
    ctx.fillStyle=HAIR2;
    ctx.beginPath(); ctx.arc(x-10*s, y-200*s + bob, 10*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x+14*s, y-198*s + bob, 9*s, 0, Math.PI*2); ctx.fill();

    // glasses (tortoise-ish)
    ctx.fillStyle=GLB;
    rrFillStroke(x-30*s, y-166*s + bob, 30*s, 22*s, 10*s, GLB, OUT, 8);
    ctx.fillStyle=GLD;
    rrFillStroke(x+ 2*s, y-166*s + bob, 30*s, 22*s, 10*s, GLD, OUT, 8);
    ctx.strokeStyle=GLL; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(x-2*s, y-155*s + bob); ctx.lineTo(x+2*s, y-155*s + bob); ctx.stroke();

    // eyes
    ctx.strokeStyle=OUT; ctx.lineWidth=8; ctx.fillStyle=OUT;
    const blink = (!moving && Math.random()<0.02);
    if(blink || state.sitting){
      ctx.beginPath(); ctx.moveTo(x-16*s, y-156*s + bob); ctx.lineTo(x-6*s, y-156*s + bob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+10*s, y-156*s + bob); ctx.lineTo(x+20*s, y-156*s + bob); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x-11*s, y-156*s + bob, 4*s, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x+15*s, y-156*s + bob, 4*s, 0, Math.PI*2); ctx.fill();
    }

    // mouth (changes by mood)
    let mood = jesper.mood;
    if(state.kickT>0) mood=2;
    ctx.strokeStyle=OUT; ctx.lineWidth=8;
    if(mood===0){
      ctx.beginPath(); ctx.arc(x+3*s, y-128*s + bob, 10*s, 0, Math.PI); ctx.stroke();
    } else if(mood===1){
      ctx.beginPath(); ctx.moveTo(x-4*s, y-126*s + bob); ctx.lineTo(x+14*s, y-126*s + bob); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x+4*s, y-124*s + bob, 12*s, Math.PI, 0); ctx.stroke();
    }

    // name tag
    ctx.fillStyle="rgba(17,24,39,0.45)";
    ctx.font="1000 16px ui-monospace, monospace";
    ctx.textAlign="center";
    ctx.fillText("JESPER", x, y-230*s);
    ctx.textAlign="start";

    ctx.restore();
  }

  function pinBubble(){
    if(!bubbleEl || bubbleEl.classList.contains("hidden")) return;
    const cx = view.ox + jesper.x*view.s;
    const cy = view.oy + (FLOOR_Y-160)*view.s;
    bubbleEl.style.maxWidth="92%";
    bubbleEl.style.left = `${Math.max(10, Math.min(view.cssW-280, cx-160))}px`;
    bubbleEl.style.bottom = `${clamp((view.cssH - cy) + 40, 110, view.cssH-80)}px`;
  }

  // ===== Update =====
  function update(dt){
    if(wonder && !wonder.classList.contains("hidden")) return;

    maybeTalk();

    // mood cycle a bit
    const now = performance.now();
    if(now > jesper.moodT){
      jesper.mood = (Math.random()*2.99)|0;
      jesper.moodT = now + 1500 + Math.random()*2500;
    }

    if(jesper.action!=="idle"){
      jesper.actionT += dt;
      if(jesper.action==="kick" && jesper.actionT>0.35){ jesper.action="idle"; }
    }
    state.kickT = Math.max(0, state.kickT - dt);

    // drag to move (horizontal only)
    if(state.joy.active && !state.sitting){
      const target = (state.joy.dx/180) * 520;
      jesper.vx = lerp(jesper.vx, target, 0.28);
    } else {
      jesper.vx = lerp(jesper.vx, 0, 0.18);
    }
    if(Math.abs(jesper.vx) > 18) jesper.facing = jesper.vx>=0 ? 1 : -1;

    // integrate
    jesper.x = clamp(jesper.x + jesper.vx*dt, ROOM.x+46, ROOM.x+ROOM.w-46);

    // ornaments
    const fr = Math.pow(0.02, dt);
    for(const o of ornaments){
      if(state.dragging===o) continue;
      o.vx *= fr;
      o.x += o.vx*dt;
      o.x = clamp(o.x, ROOM.x + o.r, ROOM.x + ROOM.w - o.r);

      // bounce off chair/table legs/tree trunk (simple & clean)
      const blocks = [
        {x: props.table.x+44, w: 34},
        {x: props.table.x+props.table.w-78, w: 34},
        {x: props.chair.x+34, w: props.chair.w*0.70},
        {x: props.tree.x+46, w: 28},
      ];
      for(const b of blocks){
        const left = b.x - o.r;
        const right= b.x + b.w + o.r;
        if(o.x > left && o.x < right){
          if(o.vx >= 0) o.x = left; else o.x = right;
          o.vx *= -0.48;
        }
      }
    }

    // ornament separation
    for(let i=0;i<ornaments.length;i++){
      for(let j=i+1;j<ornaments.length;j++){
        const a=ornaments[i], b=ornaments[j];
        const dx=b.x-a.x;
        const d=Math.abs(dx);
        const minD=a.r+b.r+10;
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

  function draw(tMs){
    drawRoom(tMs);
    drawFrame();
    drawTable();
    drawChair();
    drawTree(tMs);

    // ornaments first (Jesper in front)
    for(const o of ornaments) drawOrnament(o);
    drawJesper(tMs);
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

  setTimeout(()=>toast("Dra i rummet = gå vänster/höger • Dra pynt = flytta • KNUFF nära pynt • SITT nära stolen"), 850);
  setTimeout(()=>toast("Tips: KNUFF ⏰ → 🍬 → ⭐ och SITT på stolen."), 2600);

})();
