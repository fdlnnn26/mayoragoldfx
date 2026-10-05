/* Simulasi Risiko — versi bahasa sederhana: kesimpulan dulu, angka kemudian */
(function(){'use strict';
if(window.MayoraRisk)return;
var CSS='.rs-bar{display:flex;justify-content:flex-end;margin:0 0 10px}.rs-open{border:1px solid rgba(201,168,76,.5);background:transparent;color:#F0D98A;border-radius:999px;padding:10px 20px;font-size:.74rem;font-weight:600;cursor:pointer}'+
'.rs-ov{position:fixed;inset:0;z-index:900;background:rgba(5,5,8,.85);display:none;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}.rs-ov.on{display:flex}'+
'.rs-box{position:relative;background:#101013;border:1px solid rgba(201,168,76,.24);border-radius:24px;padding:24px;max-width:720px;width:100%;margin:auto;color:#F4F4F2;font-family:"DM Sans",sans-serif}'+
'.rs-box h3{font-family:"Space Grotesk",sans-serif;margin:0 0 4px;font-size:1.2rem}.rs-sub{margin:0 0 18px;font-size:.76rem;color:#9C9CA3;line-height:1.7}'+
'.rs-x{position:absolute;top:12px;right:14px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:none;color:#F4F4F2;font-size:1.2rem;cursor:pointer}'+
'.rs-vd{border-radius:18px;padding:18px;margin-bottom:16px;border:1px solid}.rs-vd b{display:block;font-family:"Space Grotesk",sans-serif;font-size:1.35rem;margin-bottom:6px}.rs-vd p{margin:0;font-size:.82rem;line-height:1.75;color:#DADADD}'+
'.rs-vd.g{background:rgba(61,220,151,.08);border-color:rgba(61,220,151,.4)}.rs-vd.g b{color:#3DDC97}.rs-vd.y{background:rgba(240,217,138,.08);border-color:rgba(240,217,138,.4)}.rs-vd.y b{color:#F0D98A}.rs-vd.r{background:rgba(255,107,107,.08);border-color:rgba(255,107,107,.4)}.rs-vd.r b{color:#FF6B6B}'+
'.rs-kp{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}.rs-k{background:#17171B;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px}.rs-k b{display:block;font-family:"Space Grotesk",sans-serif;font-size:1.45rem;margin:4px 0}.rs-k span{font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:#8A8A92;line-height:1.5;display:block}.rs-k small{font-size:.66rem;color:#65656C;line-height:1.5;display:block}'+
'.rs-cv{width:100%;height:auto;border-radius:14px;background:#0C0C0F;display:block;margin-bottom:6px}.rs-cap{font-size:.68rem;color:#8A8A92;line-height:1.7;margin-bottom:18px}'+
'.rs-h{font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;color:#65656C;margin:4px 0 10px}'+
'.rs-in{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:12px}.rs-in label{font-size:.78rem;color:#DADADD;display:block}.rs-in small{display:block;color:#65656C;font-size:.66rem;margin-top:2px;line-height:1.5}.rs-in input{width:100%;margin-top:8px;background:#17171B;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:11px 12px;color:#fff;font-size:.95rem}'+
'.rs-ch{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 0}.rs-c{border:1px solid rgba(255,255,255,.12);background:#17171B;color:#C9C9CE;border-radius:999px;padding:6px 12px;font-size:.7rem;cursor:pointer}.rs-c.on,.rs-c:hover{border-color:#C9A84C;color:#F0D98A}'+
'.rs-tb{width:100%;border-collapse:collapse;font-size:.78rem;margin-bottom:6px}.rs-tb th{font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:#65656C;text-align:left;padding:6px 8px;font-weight:500}.rs-tb td{padding:10px 8px;border-top:1px solid rgba(255,255,255,.07)}.rs-tb tr.cur td{background:rgba(201,168,76,.1);color:#F0D98A}'+
'.rs-n{font-size:.64rem;color:#65656C;line-height:1.7;margin-top:12px}@media(max-width:560px){.rs-kp{grid-template-columns:1fr}.rs-box{padding:20px 16px}}';
var box,tm;
function el(h){var d=document.createElement('div');d.innerHTML=h;return d.firstChild}
function $(i){return box.querySelector('#'+i)}
function build(){
  if(box)return;
  var s=document.createElement('style');s.textContent=CSS;document.head.appendChild(s);
  box=el('<div class="rs-ov" role="dialog" aria-modal="true"><div class="rs-box"><button class="rs-x" type="button" aria-label="Tutup">×</button>'+
  '<h3>Seberapa Aman Strategimu?</h3><p class="rs-sub">Kami mengacak urutan menang-kalah ribuan kali untuk melihat seberapa dalam modalmu bisa turun. Angka awal diambil dari journal-mu, ubah untuk coba "bagaimana kalau".</p>'+
  '<div id="rs-res"></div>'+
  '<div class="rs-h">Atur skenario</div><div class="rs-in">'+
  '<div><label>Win rate kamu (%)<small>Dari berapa trade yang menang. Otomatis dari journal.</small><input id="rs-wr" type="number" min="1" max="99" step="1"></label></div>'+
  '<div><label>Untung vs rugi (RR)<small>1,5 artinya sekali menang untungnya 1,5x dari sekali rugi.</small><input id="rs-rr" type="number" min="0.2" max="10" step="0.1"></label></div>'+
  '<div><label>Risiko per trade (% modal)<small>Berapa % modal yang kamu pertaruhkan tiap entry.</small><input id="rs-rk" type="number" min="0.1" max="25" step="0.1"></label>'+
  '<div class="rs-ch"><button class="rs-c" type="button" data-r="0.5">0,5%</button><button class="rs-c" type="button" data-r="1">1%</button><button class="rs-c" type="button" data-r="2">2%</button><button class="rs-c" type="button" data-r="5">5%</button></div></div>'+
  '<div><label>Jumlah trade ke depan<small>Simulasi akan menjalankan sebanyak ini.</small><input id="rs-n" type="number" min="10" max="500" step="10"></label></div>'+
  '<div><label>Dianggap bahaya jika modal turun (%)<small>Batas yang membuatmu berhenti atau panik.</small><input id="rs-ru" type="number" min="5" max="95" step="5"></label></div></div>'+
  '<div class="rs-ch" style="margin-bottom:6px"><button class="rs-c" type="button" id="rs-pes">Uji skenario pesimis (win rate −10)</button><button class="rs-c" type="button" id="rs-rst">Kembalikan ke data journal</button></div>'+
  '<div class="rs-n">Ini model matematika, bukan ramalan. Hasil tiap trade dianggap independen dengan risiko tetap. Bukan saran finansial.</div></div></div>');
  document.body.appendChild(box);
  box.addEventListener('click',function(e){
    if(e.target===box||e.target.closest('.rs-x'))return close();
    var c=e.target.closest('[data-r]');if(c){$('rs-rk').value=c.getAttribute('data-r');run()}
    if(e.target.id==='rs-pes'){$('rs-wr').value=Math.max(1,(+$('rs-wr').value||50)-10);run()}
    if(e.target.id==='rs-rst')prefill();
  });
  box.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(run,250)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&box.classList.contains('on'))close()});
}
var base=null;
function prefill(){
  var d=typeof window._getJournalStats==='function'?window._getJournalStats(0):null;
  base=d;var v=function(i,x){$(i).value=x};
  v('rs-wr',d&&d.n>=5?Math.round(d.wr):50);v('rs-rr',1.5);v('rs-rk',1);v('rs-n',100);v('rs-ru',30);run();
}
function open(){build();document.body.style.overflow='hidden';box.classList.add('on');prefill()}
function close(){box.classList.remove('on');document.body.style.overflow=''}
function pc(a,p){return a[Math.min(a.length-1,Math.floor(p*a.length))]}
function sim(wr,rr,rk,N,ru,S,keep){
  var hit=0,dds=[],fin=[],paths=[];
  for(var s=0;s<S;s++){
    var eq=1,pk=1,m=0,h=false,p=s<keep?[100]:null;
    for(var i=0;i<N;i++){eq*=Math.random()<wr?1+rk*rr:1-rk;if(eq>pk)pk=eq;var d=1-eq/pk;if(d>m)m=d;if(d>=ru)h=true;if(p)p.push(eq*100)}
    if(h)hit++;dds.push(m);fin.push(eq);if(p)paths.push({p:p,hit:h});
  }
  dds.sort(function(a,b){return a-b});fin.sort(function(a,b){return a-b});
  return{ror:hit/S*100,dd50:pc(dds,.5)*100,dd95:pc(dds,.95)*100,med:(pc(fin,.5)-1)*100,paths:paths};
}
function f1(n){return n.toFixed(1).replace('.',',')}
function run(){
  var g=function(i){return parseFloat($(i).value)};
  var wr=Math.min(.99,Math.max(.01,g('rs-wr')/100)),rr=g('rs-rr'),rk=g('rs-rk')/100,N=Math.min(500,Math.max(10,g('rs-n')|0)),ru=g('rs-ru')/100;
  if(!(rr>0&&rk>0&&ru>0))return;
  var r=sim(wr,rr,rk,N,ru,2000,40),exp=wr*rr-(1-wr),rk100=rk*100,wr100=Math.round(wr*100);
  var cls,title,txt;
  if(exp<=0){cls='r';title='Strategi ini cenderung merugi';
    txt='Dengan win rate '+wr100+'% dan RR 1:'+rr+', rata-rata kamu rugi '+f1(Math.abs(exp))+'R tiap trade. Dalam jangka panjang modal cenderung turun, bukan karena sial tapi karena hitungannya. Naikkan RR atau win rate, jangan hanya mengecilkan risiko.';}
  else{
    cls=r.ror<2?'g':r.ror<15?'y':'r';
    title=cls==='g'?'Aman':cls==='y'?'Waspada':'Berbahaya';
    txt='Dari 2.000 simulasi '+N+' trade, modalmu turun lebih dari '+Math.round(ru*100)+'% hanya di '+f1(r.ror)+'% skenario. '+
      'Penurunan terdalam yang wajar kamu alami sekitar '+f1(r.dd95)+'%. Hasil tengahnya '+(r.med>=0?'untung ':'rugi ')+f1(Math.abs(r.med))+'% dari modal awal. '+
      (cls==='r'?'Risiko per trade '+f1(rk100)+'% terlalu besar untuk statistikmu, coba kecilkan.':cls==='y'?'Masih ada kemungkinan nyata modalmu tergerus, pertimbangkan risiko lebih kecil.':'Edge positif dan risikomu terkendali.');
  }
  if(base&&base.n<50&&+g('rs-wr')===Math.round(base.wr))txt+=' Catatan: win rate-mu dihitung dari baru '+base.n+' trade, jadi bisa meleset. Coba uji skenario pesimis di bawah.';
  var rows='';[0.5,1,2,5].forEach(function(x){var q=sim(wr,rr,x/100,N,ru,800,0);var cur=Math.abs(x-rk100)<0.01;
    rows+='<tr'+(cur?' class="cur"':'')+'><td>'+f1(x)+'%'+(cur?' (sekarang)':'')+'</td><td>'+f1(q.ror)+'%</td><td>'+f1(q.dd95)+'%</td><td>'+(q.med>=0?'+':'-')+f1(Math.abs(q.med))+'%</td></tr>'});
  $('rs-res').innerHTML='<div class="rs-vd '+cls+'"><b>'+title+'</b><p>'+txt+'</p></div>'+
  '<div class="rs-kp"><div class="rs-k"><span>Peluang modal turun > '+Math.round(ru*100)+'%</span><b class="rs-'+(r.ror<2?'g':r.ror<15?'y':'r')+'">'+f1(r.ror)+'%</b><small>makin kecil makin aman</small></div>'+
  '<div class="rs-k"><span>Penurunan terdalam yang wajar</span><b>'+f1(r.dd95)+'%</b><small>terjadi di 95% skenario</small></div>'+
  '<div class="rs-k"><span>Hasil tengah setelah '+N+' trade</span><b class="rs-'+(r.med>=0?'g':'r')+'">'+(r.med>=0?'+':'-')+f1(Math.abs(r.med))+'%</b><small>dari modal awal</small></div></div>'+
  '<canvas class="rs-cv" id="rs-cv" width="800" height="340"></canvas>'+
  '<div class="rs-cap"><b style="color:#F0D98A">Garis emas</b> = hasil tengah · <b>garis abu</b> = 40 kemungkinan acak · <b style="color:#FF6B6B">garis merah putus</b> = batas bahaya '+Math.round(ru*100)+'%. Jalur merah menyentuh batas itu.</div>'+
  '<div class="rs-h">Kalau risiko per trade diubah</div><table class="rs-tb"><tr><th>Risiko</th><th>Modal turun > '+Math.round(ru*100)+'%</th><th>Turun terdalam</th><th>Hasil tengah</th></tr>'+rows+'</table><div style="height:14px"></div>';
  chart(r.paths,N,ru);
}
function chart(paths,N,ru){
  var c=$('rs-cv').getContext('2d'),W=800,H=340,L=52,R=14,T=14,B=30,all=[];
  paths.forEach(function(o){o.p.forEach(function(v){all.push(v)})});
  var lo=Math.min(Math.min.apply(null,all),(1-ru)*100)-3,hi=Math.max.apply(null,all)+3;
  var X=function(i){return L+i/N*(W-L-R)},Y=function(v){return T+(1-(v-lo)/(hi-lo))*(H-T-B)};
  c.font='13px sans-serif';c.fillStyle='#65656C';c.strokeStyle='rgba(255,255,255,.06)';c.lineWidth=1;
  for(var k=0;k<=4;k++){var v=lo+(hi-lo)*k/4,y=Y(v);c.beginPath();c.moveTo(L,y);c.lineTo(W-R,y);c.stroke();c.textAlign='right';c.fillText(Math.round(v)+'%',L-8,y+4)}
  c.textAlign='center';[0,.25,.5,.75,1].forEach(function(f){c.fillText(Math.round(N*f),X(N*f),H-8)});
  c.textAlign='left';c.fillText('trade ke-',L,H-8+0);
  c.setLineDash([7,6]);c.strokeStyle='rgba(255,255,255,.28)';c.beginPath();c.moveTo(L,Y(100));c.lineTo(W-R,Y(100));c.stroke();
  c.strokeStyle='rgba(255,107,107,.7)';c.lineWidth=1.5;c.beginPath();c.moveTo(L,Y((1-ru)*100));c.lineTo(W-R,Y((1-ru)*100));c.stroke();c.setLineDash([]);
  c.fillStyle='rgba(255,255,255,.4)';c.textAlign='right';c.fillText('modal awal',W-R,Y(100)-6);
  paths.forEach(function(o){c.strokeStyle=o.hit?'rgba(255,107,107,.55)':'rgba(255,255,255,.16)';c.lineWidth=o.hit?1.6:1.1;c.beginPath();o.p.forEach(function(v,i){i?c.lineTo(X(i),Y(v)):c.moveTo(X(i),Y(v))});c.stroke()});
  var m=[];for(var i=0;i<=N;i++){var col=paths.map(function(o){return o.p[i]}).sort(function(a,b){return a-b});m.push(col[col.length>>1])}
  c.strokeStyle='#E8C96A';c.lineWidth=3.5;c.lineJoin='round';c.beginPath();m.forEach(function(v,i){i?c.lineTo(X(i),Y(v)):c.moveTo(X(i),Y(v))});c.stroke();
}
function mount(){
  var host=document.getElementById('vip-cnt-dash');
  if(!host||host.querySelector('.rs-open'))return;
  if(!document.getElementById('rs-btn-style')){var s=document.createElement('style');s.id='rs-btn-style';s.textContent=CSS;document.head.appendChild(s)}
  var b=el('<div class="rs-bar"><button class="rs-open" type="button">Cek Keamanan Strategi</button></div>');
  b.firstChild.addEventListener('click',open);host.insertBefore(b,host.firstChild);
}
mount();window.MayoraRisk={open:open};
})();
