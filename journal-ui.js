/* Journal UI mobile (kartu, tab bawah, tombol Log Trade) + Scan screenshot trade via AI */
(function(){'use strict';
if(window.MayoraJournalUI)return;
var CSS='@media(max-width:768px){'+
'#page-journal .app-header{padding:12px 16px}#page-journal .save-status,#page-journal .live-badge,#page-journal .nav-username{display:none}'+
'#page-journal .jmain{padding:14px 14px 110px}'+
'.stats-row{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important}.stats-row .scard:first-child{grid-column:1/-1}'+
'#page-journal .app-tabs{position:fixed!important;top:auto!important;bottom:0;left:0;right:0;z-index:420;display:grid;grid-template-columns:repeat(4,1fr);gap:0;padding:6px 6px calc(6px + env(safe-area-inset-bottom));border-top:1px solid var(--card-border);border-bottom:0;background:var(--bg2)!important}'+
'#page-journal .app-tab{padding:12px 4px;font-size:.62rem;text-align:center;white-space:normal;line-height:1.3;border-radius:12px}'+
'#btn-newtrade{position:fixed!important;right:16px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:430;border-radius:999px!important;padding:15px 22px!important;box-shadow:0 12px 30px -8px rgba(201,168,76,.6)}'+
'.ju-scanbtn{position:fixed!important;right:16px;bottom:calc(132px + env(safe-area-inset-bottom));z-index:430;border-radius:999px!important}'+
'#page-journal .tbl-scroll{overflow:visible}#page-journal table,#page-journal tbody{display:block;width:100%}#page-journal thead{display:none}'+
'#page-journal tbody tr{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;padding:14px;margin:0 0 10px;border:1px solid var(--card-border);border-radius:16px;background:var(--bg3)}'+
'#page-journal tbody td{display:block;padding:0!important;border:0!important;min-width:0}'+
'#page-journal tbody td[data-label]::before{content:attr(data-label);display:block;font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text3);margin-bottom:2px}'+
'#page-journal td[data-label="Size"],#page-journal td[data-label="Progress"],#page-journal td[data-label="SL / TP"]{display:none}'+
'#page-journal td[colspan]{grid-column:1/-1}.bottom-grid{grid-template-columns:1fr!important}}'+
'.ju-scan{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;margin-bottom:14px;border:1px dashed rgba(201,168,76,.5);border-radius:14px;background:rgba(201,168,76,.06)}'+
'.ju-scan button,.ju-scanbtn{border:1px solid rgba(201,168,76,.55);background:rgba(201,168,76,.12);color:#F0D98A;border-radius:999px;padding:9px 16px;font-size:.72rem;font-weight:600;cursor:pointer}'+
'.ju-st{flex:1;min-width:150px;font-size:.7rem;color:var(--text2,#9C9CA3);line-height:1.6}.ju-st.err{color:#FF6B6B}.ju-st.ok{color:#3DDC97}'+
'.ju-hl{box-shadow:0 0 0 2px rgba(61,220,151,.55)!important}';
var $=function(i){return document.getElementById(i)};
function css(){if($('ju-style'))return;var s=document.createElement('style');s.id='ju-style';s.textContent=CSS;document.head.appendChild(s)}

/* label tiap sel dari header tabel, supaya tabel bisa jadi kartu di HP */
function label(tb){
  if(!tb)return;var th=[].map.call(tb.closest('table').querySelectorAll('thead th'),function(h){return h.textContent.trim()});
  [].forEach.call(tb.rows,function(r){[].forEach.call(r.cells,function(c,i){if(th[i]&&!c.hasAttribute('data-label'))c.setAttribute('data-label',th[i])})});
}
function watch(id){var tb=$(id);if(!tb)return;label(tb);new MutationObserver(function(){label(tb)}).observe(tb,{childList:true})}

/* kecilkan gambar sebelum dikirim (hemat kuota & cepat) */
function shrink(file){return new Promise(function(ok,no){
  var im=new Image(),u=URL.createObjectURL(file);
  im.onload=function(){var m=1600,k=Math.min(1,m/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.85).split(',')[1])};
  im.onerror=function(){no(new Error('Gambar tidak bisa dibaca'))};im.src=u})}

function setV(id,v){var e=$(id);if(!e||v===null||v===undefined||v==='')return false;
  if(e.tagName==='SELECT'&&![].some.call(e.options,function(o){return o.value===String(v)}))return false;
  e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.classList.add('ju-hl');return true}

async function scan(file,st){
  st.className='ju-st';st.textContent='Membaca screenshot…';
  try{
    var b64=await shrink(file),h={'Content-Type':'application/json'};
    try{if(window._curUser&&window._curUser.getIdToken)h['Authorization']='Bearer '+await window._curUser.getIdToken()}catch(_){}
    var r=await fetch('/api/gemini',{method:'POST',headers:h,body:JSON.stringify({mode:'ocr',prompt:'ocr',image:b64,mimeType:'image/jpeg'})});
    var j=await r.json();if(!r.ok)throw new Error(j.error||'Gagal membaca gambar');
    var d=JSON.parse(String(j.text).replace(/```json|```/g,'').trim());
    if(d.error)throw new Error('Ini sepertinya bukan screenshot trade.');
    document.querySelectorAll('.ju-hl').forEach(function(e){e.classList.remove('ju-hl')});
    var sym=String(d.symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(sym==='GOLD')sym='XAUUSD';
    var got=[setV('f-sym',sym),setV('f-dir',d.dir),setV('f-entry',d.entry),setV('f-exit',d.exit),setV('f-sl',d.sl),setV('f-tp',d.tp),setV('f-size',d.size),setV('f-date',d.date)].filter(Boolean).length;
    if(d.entry&&d.exit&&$('f-notes')&&!$('f-notes').value)$('f-notes').value='Auto-scan dari screenshot'+(d.profit!=null?' (profit tertera: '+d.profit+')':'');
    st.className='ju-st '+(got?'ok':'err');
    st.textContent=got?got+' kolom terisi (disorot hijau). Cek lagi sebelum simpan, AI bisa salah baca.':'Tidak ada data yang terbaca. Coba screenshot yang lebih jelas.';
    if(d.symbol&&!$('f-sym').classList.contains('ju-hl'))st.textContent+=' Symbol "'+d.symbol+'" belum ada di daftar, pilih manual.';
  }catch(e){st.className='ju-st err';st.textContent=e.message||'Gagal'}
}

function mountScan(){
  var sym=$('f-sym');if(!sym||document.querySelector('.ju-scan'))return;
  var body=sym.closest('.modal-body');if(!body)return;
  var w=document.createElement('div');w.className='ju-scan';
  w.innerHTML='<button type="button">📷 Scan screenshot trade (AI)</button><div class="ju-st">Upload screenshot hasil trade dari MT4/MT5/broker, form terisi otomatis.</div><input type="file" accept="image/*" hidden>';
  var inp=w.querySelector('input'),st=w.querySelector('.ju-st');
  w.querySelector('button').onclick=function(){inp.click()};
  inp.onchange=function(){if(inp.files[0])scan(inp.files[0],st);inp.value=''};
  body.insertBefore(w,body.firstChild);
  window._juPick=function(){inp.click()};
}

function mountFab(){
  var nt=$('btn-newtrade');if(!nt||document.querySelector('.ju-scanbtn'))return;
  var b=document.createElement('button');b.type='button';b.className='ju-scanbtn';b.textContent='📷 Scan';b.style.display='none';
  b.onclick=function(){if(window.openModal)window.openModal();setTimeout(function(){window._juPick&&window._juPick()},150)};
  nt.parentNode.insertBefore(b,nt);
  var sync=function(){b.style.display=nt.style.display==='none'?'none':''};sync();
  new MutationObserver(sync).observe(nt,{attributes:true,attributeFilter:['style']});
}

css();mountScan();mountFab();watch('hist-tbody');watch('open-tbody');
window.MayoraJournalUI={scan:scan};
})();
