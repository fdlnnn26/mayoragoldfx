/* Simulasi Drawdown & Risk of Ruin (Monte Carlo) — dimuat lazy bersama share-card.js */
(function(){'use strict';
if(window.MayoraRisk)return;
var CSS='.rs-bar{display:flex;justify-content:flex-end;margin:0 0 10px}.rs-open{border:1px solid rgba(201,168,76,.5);background:transparent;color:#F0D98A;border-radius:999px;padding:10px 20px;font-size:.74rem;font-weight:600;letter-spacing:.04em;cursor:pointer}'+
'.rs-ov{position:fixed;inset:0;z-index:900;background:rgba(5,5,8,.82);display:none;align-items:center;justify-content:center;padding:18px}.rs-ov.on{display:flex}'+
'.rs-box{position:relative;background:#101013;border:1px solid rgba(201,168,76,.24);border-radius:24px;padding:24px;max-width:860px;width:100%;max-height:calc(100vh - 36px);overflow:auto;color:#F4F4F2;font-family:"DM Sans",sans-serif}'+
'.rs-box h3{font-family:"Space Grotesk",sans-serif;margin:0 0 4px;font-size:1.2rem}.rs-box p{margin:0 0 16px;font-size:.76rem;color:#9C9CA3;line-height:1.7}'+
'.rs-x{position:absolute;top:12px;right:14px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:none;color:#F4F4F2;font-size:1.2rem;cursor:pointer}'+
'.rs-in{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}'+
'.rs-in label{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:#65656C;display:block}.rs-in input{width:100%;margin-top:6px;background:#17171B;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px;color:#fff;font-size:.9rem}'+
'.rs-go{border:none;border-radius:999px;padding:12px 26px;background:linear-gradient(135deg,#E8C96A,#C9A84C);color:#0A0A0D;font-weight:600;font-size:.78rem;cursor:pointer;margin-bottom:18px}'+
'.rs-out{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}'+
'.rs-k{background:#17171B;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px}.rs-k b{display:block;font-family:"Space Grotesk",sans-serif;font-size:1.5rem;margin-top:4px}.rs-k span{font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#65656C}'+
'.rs-g{color:#3DDC97}.rs-r{color:#FF6B6B}.rs-y{color:#F0D98A}#rs-cv{width:100%;height:auto;border-radius:14px;background:#0C0C0F;display:block}.rs-n{font-size:.66rem;color:#65656C;margin-top:10px;line-height:1.7}';
var box,cv;
function el(h){var d=document.createElement('div');d.innerHTML=h;return d.firstChild}
function build(){
  if(box)return;
  var s=document.createElement('style');s.textContent=CSS;document.head.appendChild(s);
  box=el('<div class="rs-ov" role="dialog" aria-modal="true"><div class="rs-box"><button class="rs-x" type="button" aria-label="Tutup">×</button>'+
  '<h3>Simulasi Drawdown & Risk of Ruin</h3><p>Monte Carlo 2.000 skenario. Nilai awal diisi dari journal kamu; ubah untuk uji "bagaimana kalau".</p>'+
  '<div class="rs-in"><div><label>Win rate (%)</label><input id="rs-wr" type="number" min="1" max="99" step="1"></div>'+
  '<div><label>Rata-rata RR (win)</label><input id="rs-rr" type="number" min="0.2" max="10" step="0.1"></div>'+
  '<div><label>Risiko / trade (%)</label><input id="rs-rk" type="number" min="0.1" max="25" step="0.1"></div>'+
  '<div><label>Jumlah trade</label><input id="rs-n" type="number" min="10" max="500" step="10"></div>'+
  '<div><label>Batas "ruin" (DD %)</label><input id="rs-ru" type="number" min="5" max="95" step="5"></div></div>'+
  '<button class="rs-go" type="button">Jalankan Simulasi</button><div id="rs-res"></div></div></div>');
  document.body.appendChild(box);
  box.addEventListener('click',function(e){if(e.target===box||e.target.closest('.rs-x'))close();if(e.target.closest('.rs-go'))run()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
}
function open(){
  build();
  var d=typeof window._getJournalStats==='function'?window._getJournalStats(0):null,v=function(i,x){box.querySelector('#'+i).value=x};
  v('rs-wr',d&&d.n>=5?Math.round(d.wr):50);v('rs-rr',1.5);v('rs-rk',1);v('rs-n',100);v('rs-ru',30);
  document.body.style.overflow='hidden';box.classList.add('on');run();
}
function close(){box.classList.remove('on');document.body.style.overflow=''}
function pct(a,p){return a[Math.min(a.length-1,Math.floor(p*a.length))]}
function run(){
  var g=function(i){return parseFloat(box.querySelector('#'+i).value)};
  var wr=Math.min(.99,Math.max(.01,g('rs-wr')/100)),rr=g('rs-rr'),rk=g('rs-rk')/100,N=Math.min(500,Math.max(10,g('rs-n')|0)),ru=g('rs-ru')/100,S=2000;
  if(!(rr>0&&rk>0)){return}
  var ruin=0,prof=0,dds=[],fin=[],paths=[];
  for(var s=0;s<S;s++){
    var eq=1,pk=1,mdd=0,hit=false,p=s<40?[1]:null;
    for(var i=0;i<N;i++){
      eq*=Math.random()<wr?1+rk*rr:1-rk;
      if(eq>pk)pk=eq;var dd=1-eq/pk;if(dd>mdd)mdd=dd;if(dd>=ru)hit=true;
      if(p)p.push(eq);
    }
    if(hit)ruin++;if(eq>1)prof++;dds.push(mdd);fin.push(eq);if(p)paths.push({p:p,hit:hit});
  }
  dds.sort(function(a,b){return a-b});fin.sort(function(a,b){return a-b});
  var ror=ruin/S*100,exp=wr*rr-(1-wr),cls=ror<5?'rs-g':ror<20?'rs-y':'rs-r';
  var res=box.querySelector('#rs-res');
  res.innerHTML='<div class="rs-out">'+
  '<div class="rs-k"><span>Peluang kena ruin</span><b class="'+cls+'">'+ror.toFixed(1)+'%</b></div>'+
  '<div class="rs-k"><span>Drawdown median</span><b>'+(pct(dds,.5)*100).toFixed(1)+'%</b></div>'+
  '<div class="rs-k"><span>Drawdown terburuk (95%)</span><b class="rs-r">'+(pct(dds,.95)*100).toFixed(1)+'%</b></div>'+
  '<div class="rs-k"><span>Return median</span><b class="'+(pct(fin,.5)>=1?'rs-g':'rs-r')+'">'+((pct(fin,.5)-1)*100).toFixed(1)+'%</b></div>'+
  '<div class="rs-k"><span>Peluang profit</span><b>'+(prof/S*100).toFixed(0)+'%</b></div>'+
  '<div class="rs-k"><span>Expectancy / trade</span><b class="'+(exp>=0?'rs-g':'rs-r')+'">'+(exp>=0?'+':'')+exp.toFixed(2)+'R</b></div></div>'+
  '<canvas id="rs-cv" width="800" height="300"></canvas>'+
  '<div class="rs-n">Garis emas = skenario median, merah = skenario yang menyentuh batas ruin. Simulasi mengasumsikan hasil tiap trade independen dengan risiko tetap per trade; ini model, bukan prediksi. Bukan saran finansial.</div>';
  var c=res.querySelector('#rs-cv').getContext('2d'),W=800,H=300,all=[];
  paths.forEach(function(o){o.p.forEach(function(v){all.push(v)})});
  var lo=Math.min.apply(null,all),hi=Math.max.apply(null,all);lo=Math.min(lo,1-ru);
  var X=function(i){return 14+i/N*(W-28)},Y=function(v){return H-14-(v-lo)/(hi-lo||1)*(H-28)};
  c.strokeStyle='rgba(255,255,255,.18)';c.setLineDash([6,6]);c.beginPath();c.moveTo(14,Y(1));c.lineTo(W-14,Y(1));c.stroke();
  c.strokeStyle='rgba(255,107,107,.45)';c.beginPath();c.moveTo(14,Y(1-ru));c.lineTo(W-14,Y(1-ru));c.stroke();c.setLineDash([]);
  paths.forEach(function(o){c.strokeStyle=o.hit?'rgba(255,107,107,.35)':'rgba(255,255,255,.14)';c.lineWidth=1.2;c.beginPath();o.p.forEach(function(v,i){i?c.lineTo(X(i),Y(v)):c.moveTo(X(i),Y(v))});c.stroke()});
  var med=paths.map(function(o){return o}).length&&[],m=[];
  for(var i=0;i<=N;i++){var col=paths.map(function(o){return o.p[i]}).sort(function(a,b){return a-b});m.push(col[col.length>>1])}
  c.strokeStyle='#E8C96A';c.lineWidth=3;c.beginPath();m.forEach(function(v,i){i?c.lineTo(X(i),Y(v)):c.moveTo(X(i),Y(v))});c.stroke();
}
function mount(){
  var host=document.getElementById('vip-cnt-dash');
  if(!host)return;if(host.querySelector('.rs-open'))return;
  if(!document.getElementById('rs-btn-style')){var s=document.createElement('style');s.id='rs-btn-style';s.textContent=CSS;document.head.appendChild(s)}
  var b=el('<div class="rs-bar"><button class="rs-open" type="button">Simulasi Risiko</button></div>');
  b.firstChild.addEventListener('click',open);host.insertBefore(b,host.firstChild);
}
mount();
window.MayoraRisk={open:open};
})();
