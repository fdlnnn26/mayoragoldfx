/* ══════════════════════════════════════════════════════════════
   MAYORA SHARE CARD — kartu hasil trading siap bagikan (PNG)
   Digambar murni dengan <canvas> (tanpa library). Dimuat lazy oleh
   firebase-core.js saat user VIP membuka Journal. Data diambil dari
   window._getJournalStats(days) yang disediakan firebase-core.js.
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.MayoraShare) return;

var THEMES = {
  gold:     { name:'Gold',     bg1:'#0B0B10', bg2:'#17130A', a:'#C9A84C', a2:'#F0D98A', glow:'201,168,76'  },
  emerald:  { name:'Emerald',  bg1:'#04110E', bg2:'#0A211B', a:'#2DD4A0', a2:'#9BF5DA', glow:'45,212,160'  },
  midnight: { name:'Midnight', bg1:'#07070F', bg2:'#15122E', a:'#8B7CFF', a2:'#D0C7FF', glow:'139,124,255' }
};
var POS = '#3DDC97', NEG = '#FF6B6B';
var FD = '"Space Grotesk","DM Sans",system-ui,sans-serif';
var FB = '"DM Sans",system-ui,sans-serif';

/* ---------- helpers gambar ---------- */
function rr(c,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
// teks dengan letter-spacing manual (Safari lama tidak punya ctx.letterSpacing)
function spaced(c, text, x, y, sp, align){
  var chars = String(text).split(''), w = 0, i;
  for (i=0;i<chars.length;i++) w += c.measureText(chars[i]).width + sp;
  w -= sp;
  var cx = align==='right' ? x-w : align==='center' ? x-w/2 : x;
  c.textAlign = 'left';
  for (i=0;i<chars.length;i++){ c.fillText(chars[i], cx, y); cx += c.measureText(chars[i]).width + sp; }
  return w;
}
function fitFont(c, text, weight, maxPx, maxW, fam){
  var px = maxPx;
  for (; px>20; px-=4){ c.font = weight+' '+px+'px '+fam; if (c.measureText(text).width <= maxW) break; }
  return px;
}
function money(n, sign){
  var a = Math.abs(n);
  var s = '$' + a.toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
  return (n<0?'-':(sign&&n>0?'+':'')) + s;
}
function rfmt(n){ return (n>0?'+':n<0?'-':'') + Math.abs(n).toFixed(2) + 'R'; }
function glass(c,x,y,w,h,r,accent,strong){
  rr(c,x,y,w,h,r);
  c.fillStyle = 'rgba(255,255,255,'+(strong?0.055:0.04)+')'; c.fill();
  var g = c.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,'rgba('+accent+',0.38)'); g.addColorStop(0.5,'rgba(255,255,255,0.07)'); g.addColorStop(1,'rgba('+accent+',0.10)');
  c.lineWidth = 2; c.strokeStyle = g; c.stroke();
}

/* ---------- kurva ekuitas halus ---------- */
function curve(c, pts, x, y, w, h, T, up){
  var n = pts.length;
  if (n < 2){ pts = [0,0]; n = 2; }
  var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts);
  if (mn === mx){ mn -= 1; mx += 1; }
  var padY = h*0.12, ih = h - padY*2;
  function px(i){ return x + (i/(n-1))*w; }
  function py(v){ return y + padY + (1-(v-mn)/(mx-mn))*ih; }
  var col = up ? POS : NEG;

  // garis nol
  if (mn < 0 && mx > 0){
    var zy = py(0);
    c.save(); c.setLineDash([8,10]); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.beginPath(); c.moveTo(x,zy); c.lineTo(x+w,zy); c.stroke(); c.restore();
  }
  // path halus (midpoint quadratic)
  function path(){
    c.beginPath(); c.moveTo(px(0), py(pts[0]));
    for (var i=1;i<n-1;i++){
      var mx2 = (px(i)+px(i+1))/2, my2 = (py(pts[i])+py(pts[i+1]))/2;
      c.quadraticCurveTo(px(i), py(pts[i]), mx2, my2);
    }
    c.lineTo(px(n-1), py(pts[n-1]));
  }
  // area
  path(); c.lineTo(px(n-1), y+h); c.lineTo(px(0), y+h); c.closePath();
  var ag = c.createLinearGradient(0,y,0,y+h);
  ag.addColorStop(0,'rgba('+(up?'61,220,151':'255,107,107')+',0.30)');
  ag.addColorStop(1,'rgba('+(up?'61,220,151':'255,107,107')+',0)');
  c.fillStyle = ag; c.fill();
  // garis + glow
  c.save();
  c.shadowColor = col; c.shadowBlur = 22; c.lineWidth = 6; c.lineJoin = 'round'; c.lineCap = 'round';
  var lg = c.createLinearGradient(x,0,x+w,0);
  lg.addColorStop(0, 'rgba('+T.glow+',0.9)'); lg.addColorStop(1, col);
  c.strokeStyle = lg; path(); c.stroke();
  c.restore();
  // titik akhir
  var ex = px(n-1), ey = py(pts[n-1]);
  c.beginPath(); c.arc(ex,ey,22,0,Math.PI*2); c.fillStyle = col; c.globalAlpha = 0.18; c.fill(); c.globalAlpha = 1;
  c.beginPath(); c.arc(ex,ey,11,0,Math.PI*2); c.fillStyle = '#fff'; c.fill();
  c.beginPath(); c.arc(ex,ey,6.5,0,Math.PI*2); c.fillStyle = col; c.fill();
}

/* ---------- gambar kartu utama ---------- */
var logoImg = null, logoTried = false;
function loadLogo(cb){
  if (logoImg || logoTried){ cb(); return; }
  logoTried = true;
  var im = new Image();
  im.onload = function(){ logoImg = im; cb(); };
  im.onerror = function(){ cb(); };
  im.src = '/logomayora.webp';
}

function draw(cv, o, d){
  var story = o.format === 'story';
  var W = 1080, H = story ? 1920 : 1350, P = 64;
  cv.width = W; cv.height = H;
  var c = cv.getContext('2d');
  var T = THEMES[o.theme] || THEMES.gold;
  var up = d.pnl >= 0;

  /* latar */
  var bg = c.createLinearGradient(0,0,W*0.6,H);
  bg.addColorStop(0,T.bg1); bg.addColorStop(1,T.bg2);
  c.fillStyle = bg; c.fillRect(0,0,W,H);
  var g1 = c.createRadialGradient(W-120,140,0,W-120,140,760);
  g1.addColorStop(0,'rgba('+T.glow+',0.26)'); g1.addColorStop(1,'rgba('+T.glow+',0)');
  c.fillStyle = g1; c.fillRect(0,0,W,H);
  var g2 = c.createRadialGradient(40,H-80,0,40,H-80,640);
  g2.addColorStop(0,'rgba('+T.glow+',0.13)'); g2.addColorStop(1,'rgba('+T.glow+',0)');
  c.fillStyle = g2; c.fillRect(0,0,W,H);
  // titik-titik halus
  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (var gx=36; gx<W; gx+=36) for (var gy=36; gy<H; gy+=36){ c.fillRect(gx,gy,2,2); }
  // cincin dekor
  c.lineWidth = 2;
  [[380,0.11],[490,0.075],[600,0.045]].forEach(function(r){
    c.beginPath(); c.arc(W+60,-40,r[0],0,Math.PI*2); c.strokeStyle='rgba('+T.glow+','+r[1]+')'; c.stroke();
  });

  /* header */
  var hy = 100;
  if (logoImg){
    c.save(); c.beginPath(); c.arc(P+38,hy,38,0,Math.PI*2); c.clip();
    c.drawImage(logoImg,P,hy-38,76,76); c.restore();
    c.beginPath(); c.arc(P+38,hy,38,0,Math.PI*2); c.lineWidth=2; c.strokeStyle='rgba('+T.glow+',0.7)'; c.stroke();
  }
  var tx = logoImg ? P+98 : P;
  c.fillStyle = '#fff'; c.font = '700 30px '+FD; c.textBaseline = 'alphabetic';
  var wm = spaced(c,'MAYORA',tx,hy-2,5,'left');
  c.fillStyle = T.a; spaced(c,'GOLD FX',tx+wm+16,hy-2,5,'left');
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = '500 20px '+FB;
  spaced(c,'TRADING RESULT',tx,hy+30,4,'left');
  // pill periode
  c.font = '600 20px '+FB;
  var pl = o.periodLabel, pw = 0, i0;
  for (i0=0;i0<pl.length;i0++) pw += c.measureText(pl[i0]).width + 3;
  pw += 52;
  rr(c,W-P-pw,hy-26,pw,52,26);
  c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba('+T.glow+',0.5)'; c.stroke();
  c.fillStyle = T.a2; spaced(c,pl,W-P-26,hy+7,3,'right');

  /* panel hero */
  var panelY = 190, panelH = story ? 1170 : 590, px0 = P, pw0 = W - P*2, ix = px0 + 52, iw = pw0 - 104;
  glass(c,px0,panelY,pw0,panelH,52,T.glow,true);
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.font = '500 22px '+FB;
  var heroIsR = !o.showMoney && d.rCount > 0;
  var heroLabel = o.showMoney ? 'TOTAL PROFIT & LOSS' : (d.rCount>0 ? 'TOTAL RISK-REWARD' : 'WIN RATE');
  spaced(c,heroLabel,ix,panelY+78,5,'left');
  // chip profit/loss
  var chipTxt = up ? 'PROFIT' : 'LOSS', chipCol = up ? POS : NEG;
  c.font = '700 20px '+FB;
  var cw = 0; for (var k=0;k<chipTxt.length;k++) cw += c.measureText(chipTxt[k]).width + 3;
  cw += 66;
  rr(c,px0+pw0-52-cw,panelY+42,cw,50,25);
  c.fillStyle = chipCol; c.globalAlpha = 0.14; c.fill(); c.globalAlpha = 1;
  c.lineWidth = 1.5; c.strokeStyle = chipCol; c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
  c.fillStyle = chipCol;
  c.beginPath();
  var ax = px0+pw0-52-cw+30, ay = panelY+67;
  if (up){ c.moveTo(ax-9,ay+7); c.lineTo(ax+9,ay+7); c.lineTo(ax,ay-8); } else { c.moveTo(ax-9,ay-7); c.lineTo(ax+9,ay-7); c.lineTo(ax,ay+8); }
  c.closePath(); c.fill();
  c.font = '700 20px '+FB; spaced(c,chipTxt,ax+22,panelY+74,3,'left');

  // angka besar
  var big = o.showMoney ? money(d.pnl,true) : (d.rCount>0 ? rfmt(d.totalR) : d.wr.toFixed(0)+'%');
  var bigPx = fitFont(c,big,'700',story?170:152,iw,FD);
  c.font = '700 '+bigPx+'px '+FD; c.textAlign = 'left';
  var bw = c.measureText(big).width, by = panelY + 78 + bigPx*0.98 + 26;
  var tg = c.createLinearGradient(ix,by-bigPx,ix+bw,by);
  if (up){ tg.addColorStop(0,'#FFFFFF'); tg.addColorStop(0.55,T.a2); tg.addColorStop(1,T.a); }
  else   { tg.addColorStop(0,'#FFFFFF'); tg.addColorStop(0.55,'#FFB0B0'); tg.addColorStop(1,NEG); }
  c.save(); c.shadowColor = 'rgba('+(up?T.glow:'255,107,107')+',0.45)'; c.shadowBlur = 40;
  c.fillStyle = tg; c.fillText(big,ix,by); c.restore();

  // sub
  c.fillStyle = 'rgba(255,255,255,0.62)'; c.font = '500 28px '+FB;
  c.fillText(d.wins+'W  ·  '+d.losses+'L  ·  '+d.n+' trade closed', ix, by+54);

  // kurva
  var cy = by + 96, ch = panelY + panelH - 56 - cy;
  curve(c, d.equity, ix, cy, iw, ch, T, up);
  c.fillStyle = 'rgba(255,255,255,0.38)'; c.font = '500 18px '+FB;
  spaced(c,'EQUITY CURVE',ix,panelY+panelH-26,4,'left');
  if (d.from && d.to){ c.fillStyle='rgba(255,255,255,0.38)'; spaced(c,d.from+'  →  '+d.to,ix+iw,panelY+panelH-26,2,'right'); }

  /* kartu statistik */
  function card(x,y,w,h,label,val,sub,col,bar){
    glass(c,x,y,w,h,36,T.glow,false);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = '500 19px '+FB;
    spaced(c,label,x+30,y+46,4,'left');
    var vp = fitFont(c,val,'700',h>180?64:52,w-60,FD);
    c.font = '700 '+vp+'px '+FD; c.fillStyle = col || '#fff'; c.textAlign='left';
    c.fillText(val,x+30,y+46+vp*1.05+12);
    if (sub){ c.fillStyle='rgba(255,255,255,0.45)'; c.font='500 19px '+FB; c.fillText(sub,x+30,y+h-24); }
    if (bar != null){
      var bx=x+30, bw2=w-60, byy=y+h-30;
      rr(c,bx,byy,bw2,8,4); c.fillStyle='rgba(255,255,255,0.1)'; c.fill();
      var bg2 = c.createLinearGradient(bx,0,bx+bw2,0); bg2.addColorStop(0,T.a); bg2.addColorStop(1,POS);
      rr(c,bx,byy,Math.max(8,bw2*Math.min(1,bar)),8,4); c.fillStyle=bg2; c.fill();
    }
  }
  var gap = 20, cw3 = (W-P*2-gap*2)/3, r1 = panelY+panelH+30, r1h = 196;
  var pf = d.profitFactor;
  card(P,r1,cw3,r1h,'WIN RATE', d.wr.toFixed(0)+'%', null, d.wr>=50?POS:NEG, d.wr/100);
  card(P+cw3+gap,r1,cw3,r1h,'PROFIT FACTOR', pf===null ? '—' : (pf===Infinity ? '∞' : pf.toFixed(2)), pf===null?'belum ada data':'win ÷ loss', pf!==null&&pf>=1?POS:'#fff');
  card(P+(cw3+gap)*2,r1,cw3,r1h,'AVG R', d.rCount>0 ? rfmt(d.avgR) : '—', d.rCount>0?'per trade':'butuh SL', d.rCount>0&&d.avgR>=0?POS:(d.rCount>0?NEG:'#fff'));

  var r2 = r1 + r1h + gap, r2h = 170;
  var bestVal = o.showMoney ? (d.bestPnl>0 ? money(d.bestPnl,true) : '—') : (d.bestR>0 ? rfmt(d.bestR) : '—');
  card(P,r2,cw3,r2h,'TOTAL TRADE', String(d.n), null, '#fff');
  card(P+cw3+gap,r2,cw3,r2h,'BEST TRADE', bestVal, null, bestVal==='—'?'#fff':POS);
  card(P+(cw3+gap)*2,r2,cw3,r2h,'WIN STREAK', String(d.streak), d.streak===1?'trade':'trade beruntun', '#fff');

  /* footer */
  var fy = H - 124;
  c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(P,fy,W-P*2,1.5);
  var name = o.showName ? (d.name || 'Trader') : 'Anonymous Trader';
  if (name.length > 22) name = name.slice(0,21) + '…';
  var ac = P+32, acy = fy+46;
  var ag = c.createLinearGradient(ac-32,acy-32,ac+32,acy+32); ag.addColorStop(0,T.a2); ag.addColorStop(1,T.a);
  c.beginPath(); c.arc(ac,acy,32,0,Math.PI*2); c.fillStyle = ag; c.fill();
  c.fillStyle = '#0A0A0D'; c.font = '700 30px '+FD; c.textAlign = 'center';
  c.fillText((o.showName ? name.charAt(0) : '?').toUpperCase(), ac, acy+11);
  c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = '600 28px '+FD;
  c.fillText(name, P+82, acy+4);
  var nw = c.measureText(name).width;
  if (d.vip){
    c.font = '700 16px '+FB; var vt='VIP', vw = 62;
    rr(c,P+82+nw+16,acy-22,vw,32,16); c.fillStyle='rgba('+T.glow+',0.18)'; c.fill();
    c.lineWidth=1.5; c.strokeStyle='rgba('+T.glow+',0.7)'; c.stroke();
    c.fillStyle = T.a2; spaced(c,vt,P+82+nw+16+vw/2,acy-1,2,'center');
  }
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = '500 20px '+FB;
  c.fillText(d.when || '', P+82, acy+34);
  c.fillStyle = T.a2; c.font = '600 26px '+FD; c.textAlign = 'right';
  c.fillText('mayoragoldfx.com', W-P, acy+4);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.font = '500 17px '+FB; c.textAlign = 'center';
  c.fillText('Hasil masa lalu bukan jaminan hasil di masa depan. Bukan saran finansial.', W/2, H-18);
  c.textAlign = 'left';
}

/* ══════════ UI (modal + tombol) ══════════ */
var st = { period:'all', format:'feed', theme:'gold', showMoney:true, showName:true };
var els = {}, built = false, raf = 0;

var CSS = '' +
'.sc-bar{display:flex;justify-content:flex-end;margin:0 0 14px}' +
'.sc-open{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#E8C96A,#C9A84C);color:#0A0A0D;border:none;border-radius:999px;padding:10px 20px;font-size:.74rem;font-weight:600;letter-spacing:.04em;cursor:pointer;transition:transform .2s,box-shadow .2s;box-shadow:0 8px 24px -10px rgba(201,168,76,.7)}' +
'.sc-open:hover{transform:translateY(-1px)}' +
'.sc-open svg{width:15px;height:15px}' +
'.sc-ov{position:fixed;inset:0;z-index:900;background:rgba(5,5,8,.82);display:none;align-items:center;justify-content:center;padding:18px}' +
'.sc-ov.on{display:flex}' +
'.sc-box{position:relative;display:flex;gap:28px;background:#101013;border:1px solid rgba(201,168,76,.24);border-radius:26px;padding:26px;max-width:960px;width:100%;max-height:calc(100vh - 36px);overflow:auto;color:#F4F4F2;font-family:"DM Sans",system-ui,sans-serif}' +
'.sc-x{position:absolute;top:12px;right:14px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#F4F4F2;font-size:1.2rem;line-height:1;cursor:pointer}' +
'.sc-prev{flex:0 0 auto;display:flex;align-items:center;justify-content:center;min-width:0}' +
'.sc-prev canvas{height:min(72vh,640px);width:auto;max-width:100%;border-radius:18px;box-shadow:0 20px 50px -20px rgba(0,0,0,.8);display:block}' +
'.sc-empty{max-width:300px;text-align:center;color:#9C9CA3;font-size:.84rem;line-height:1.7;padding:30px 10px}' +
'.sc-ctl{flex:1;min-width:250px;display:flex;flex-direction:column;gap:18px;padding-top:4px}' +
'.sc-ctl h3{font-family:"Space Grotesk",sans-serif;font-size:1.25rem;font-weight:600;margin:0}' +
'.sc-ctl p{font-size:.76rem;color:#9C9CA3;line-height:1.7;margin:4px 0 0}' +
'.sc-lbl{font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:#65656C;margin-bottom:8px}' +
'.sc-chips{display:flex;flex-wrap:wrap;gap:8px}' +
'.sc-chip{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#C9C9CE;border-radius:999px;padding:8px 15px;font-size:.74rem;cursor:pointer;transition:all .2s}' +
'.sc-chip.on{background:rgba(201,168,76,.16);border-color:#C9A84C;color:#F0D98A}' +
'.sc-tg{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:.8rem;color:#DADADD;cursor:pointer;user-select:none}' +
'.sc-tg small{display:block;color:#65656C;font-size:.68rem;margin-top:2px}' +
'.sc-sw{position:relative;flex:0 0 auto;width:42px;height:24px;border-radius:12px;background:rgba(255,255,255,.14);transition:background .2s}' +
'.sc-sw::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s}' +
'.sc-tg.on .sc-sw{background:#C9A84C}.sc-tg.on .sc-sw::after{transform:translateX(18px)}' +
'.sc-act{display:flex;gap:10px;margin-top:auto;flex-wrap:wrap}' +
'.sc-btn{flex:1;min-width:130px;border-radius:999px;padding:13px 18px;font-size:.78rem;font-weight:600;cursor:pointer;border:1px solid rgba(201,168,76,.5);background:transparent;color:#F0D98A}' +
'.sc-btn.p{background:linear-gradient(135deg,#E8C96A,#C9A84C);color:#0A0A0D;border-color:transparent}' +
'.sc-btn[disabled]{opacity:.4;cursor:not-allowed}' +
'.sc-note{font-size:.66rem;color:#65656C;line-height:1.7}' +
'@media(max-width:820px){.sc-box{flex-direction:column;gap:18px;padding:20px 16px;max-height:calc(100vh - 20px)}.sc-prev canvas{height:auto;width:min(100%,360px)}.sc-ctl{min-width:0}}';

function periodInfo(){
  if (st.period === '7')  return { days:7,  label:'7 HARI TERAKHIR' };
  if (st.period === '30') return { days:30, label:'30 HARI TERAKHIR' };
  return { days:0, label:'SEMUA WAKTU' };
}

function injectCss(){
  if (document.getElementById('sc-style')) return;
  var s = document.createElement('style'); s.id = 'sc-style'; s.textContent = CSS; document.head.appendChild(s);
}

function build(){
  if (built) return;
  built = true;
  injectCss();
  var ov = document.createElement('div');
  ov.className = 'sc-ov'; ov.id = 'sc-ov'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','Kartu hasil trading');
  ov.innerHTML =
  '<div class="sc-box">' +
    '<button class="sc-x" type="button" aria-label="Tutup">×</button>' +
    '<div class="sc-prev"><canvas id="sc-cv"></canvas><div class="sc-empty" id="sc-empty" style="display:none">Belum ada trade yang <b>closed</b> pada periode ini. Catat dan tutup trade dulu di Journal, lalu buat kartunya.</div></div>' +
    '<div class="sc-ctl">' +
      '<div><h3>Kartu Hasil Trading</h3><p>Bagikan statistik journal kamu ke sosmed. Data diambil dari trade yang sudah closed.</p></div>' +
      '<div><div class="sc-lbl">Periode</div><div class="sc-chips" data-k="period">' +
        '<button class="sc-chip on" data-v="all" type="button">Semua</button><button class="sc-chip" data-v="30" type="button">30 Hari</button><button class="sc-chip" data-v="7" type="button">7 Hari</button></div></div>' +
      '<div><div class="sc-lbl">Format</div><div class="sc-chips" data-k="format">' +
        '<button class="sc-chip on" data-v="feed" type="button">Feed 4:5</button><button class="sc-chip" data-v="story" type="button">Story 9:16</button></div></div>' +
      '<div><div class="sc-lbl">Tema</div><div class="sc-chips" data-k="theme">' +
        '<button class="sc-chip on" data-v="gold" type="button">Gold</button><button class="sc-chip" data-v="emerald" type="button">Emerald</button><button class="sc-chip" data-v="midnight" type="button">Midnight</button></div></div>' +
      '<label class="sc-tg on" data-t="showMoney"><span>Tampilkan nominal $<small>Matikan untuk pamer dalam R-multiple saja</small></span><span class="sc-sw"></span></label>' +
      '<label class="sc-tg on" data-t="showName"><span>Tampilkan nama<small>Matikan untuk tampil anonim</small></span><span class="sc-sw"></span></label>' +
      '<div class="sc-act"><button class="sc-btn p" id="sc-dl" type="button">Unduh PNG</button><button class="sc-btn" id="sc-sh" type="button">Bagikan</button></div>' +
      '<div class="sc-note">Kartu dibuat langsung di perangkatmu, tidak diunggah ke server.</div>' +
    '</div>' +
  '</div>';
  document.body.appendChild(ov);
  els.ov = ov; els.cv = ov.querySelector('#sc-cv'); els.empty = ov.querySelector('#sc-empty');
  els.dl = ov.querySelector('#sc-dl'); els.sh = ov.querySelector('#sc-sh');

  ov.addEventListener('click', function(e){
    if (e.target === ov || e.target.closest('.sc-x')){ close(); return; }
    var chip = e.target.closest('.sc-chip');
    if (chip){
      var grp = chip.parentNode, k = grp.getAttribute('data-k');
      st[k] = chip.getAttribute('data-v');
      [].forEach.call(grp.children, function(b){ b.classList.toggle('on', b === chip); });
      schedule(); return;
    }
    var tg = e.target.closest('.sc-tg');
    if (tg){
      e.preventDefault();
      var key = tg.getAttribute('data-t'); st[key] = !st[key];
      tg.classList.toggle('on', st[key]); schedule();
    }
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && els.ov.classList.contains('on')) close(); });
  els.dl.addEventListener('click', download);
  els.sh.addEventListener('click', share);
  if (!(navigator.canShare && navigator.share)) els.sh.style.display = 'none';
}

var current = null;
function render(){
  raf = 0;
  if (typeof window._getJournalStats !== 'function') return;
  var pi = periodInfo();
  var d = window._getJournalStats(pi.days);
  current = d;
  var has = d && d.n > 0;
  els.cv.style.display = has ? 'block' : 'none';
  els.empty.style.display = has ? 'none' : 'block';
  els.dl.disabled = els.sh.disabled = !has;
  if (!has) return;
  var o = { format:st.format, theme:st.theme, showMoney:st.showMoney, showName:st.showName, periodLabel:pi.label };
  var run = function(){ draw(els.cv, o, d); };
  var fontsReady = (document.fonts && document.fonts.load)
    ? Promise.all([document.fonts.load('700 100px "Space Grotesk"'), document.fonts.load('500 24px "DM Sans"'), document.fonts.load('600 24px "DM Sans"'), document.fonts.load('700 24px "DM Sans"')]).catch(function(){})
    : Promise.resolve();
  fontsReady.then(function(){ loadLogo(run); });
}
function schedule(){ if (!raf) raf = requestAnimationFrame(render); }

function blobOf(cb){ els.cv.toBlob(cb, 'image/png'); }
function fname(){ return 'mayora-result-' + new Date().toISOString().slice(0,10) + '.png'; }
function download(){
  blobOf(function(b){
    if (!b) return;
    var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fname();
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  });
}
function share(){
  blobOf(function(b){
    if (!b) return;
    var f = new File([b], fname(), { type:'image/png' });
    if (navigator.canShare && navigator.canShare({ files:[f] })){
      navigator.share({ files:[f], title:'Hasil trading — Mayora Gold FX', text:'Hasil trading aku di Mayora Gold FX · mayoragoldfx.com' }).catch(function(){});
    } else { download(); }
  });
}

function open(){
  build();
  document.body.style.overflow = 'hidden';
  els.ov.classList.add('on');
  schedule();
}
function close(){
  els.ov.classList.remove('on');
  document.body.style.overflow = '';
}

/* tombol di Journal (hanya terlihat oleh VIP: ditaruh di dalam #vip-cnt-dash) */
function mountButton(){
  var host = document.getElementById('vip-cnt-dash');
  if (!host || host.querySelector('.sc-open')) return !!host;
  injectCss();
  var bar = document.createElement('div'); bar.className = 'sc-bar';
  bar.innerHTML = '<button class="sc-open" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>Bagikan Hasil</button>';
  bar.firstChild.addEventListener('click', open);
  host.insertBefore(bar, host.firstChild);
  return true;
}
mountButton();

window.MayoraShare = { open:open, close:close, draw:draw, themes:THEMES, mountButton:mountButton };
})();
