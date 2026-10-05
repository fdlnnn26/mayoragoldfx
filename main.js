document.getElementById('fyear').textContent = new Date().getFullYear();

/* ══ FIREBASE READY SIGNAL ══
   Firebase (module script) di-load & di-init secara async dan bisa selesai
   kapan saja — kadang jauh setelah goPage() pertama kali dipanggil (terutama
   di koneksi/HP yang lambat). window._fbReadyPromise resolve begitu Firebase
   selesai init (lihat "window._fbReadyResolve && window._fbReadyResolve();"
   di FIREBASE MODULE script). invokeWhenReady() dipakai supaya pemanggilan
   fungsi loader (mis. _renderNews) TIDAK cuma di-skip diam-diam kalau
   Firebase belum siap, tapi otomatis dipanggil ulang begitu siap. ══ */
window._fbReadyPromise = new Promise(function(res){ window._fbReadyResolve = res; });
/* Sinyal "status login sudah diketahui". Tanpa ini, refresh di halaman VIP dianggap belum login
   (Firebase Auth butuh waktu memulihkan sesi) lalu dilempar ke halaman login. */
window._authReady = false;
window._authReadyPromise = new Promise(function(res){
  window._authReadyResolve = function(){ window._authReady = true; res(); };
});
setTimeout(function(){ window._authReadyResolve && window._authReadyResolve(); }, 10000); /* jaring pengaman kalau Firebase gagal load */
function invokeWhenReady(name, args){
  if(typeof window[name] === 'function'){ window[name].apply(null, args||[]); return; }
  window._fbReadyPromise.then(function(){
    if(typeof window[name] === 'function') window[name].apply(null, args||[]);
  });
}
window._invokeWhenReady = invokeWhenReady;

/* Page routing */
var pages=['home','berita','vip','auth','journal','admin','modul','kalender','sessions','calc','swap','ai','research','consult'];

/* Deep link handler — support path (/berita, /vip, dll) + ?artikel=slug untuk artikel + 404 redirect (?p=) */
(function(){
  /* 0. Handle redirect dari 404.html (GitHub Pages SPA trick) */
  var qp = new URLSearchParams(window.location.search);
  var redirectPath = qp.get('p');
  if(redirectPath){
    var clean = '/' + redirectPath.replace(/^\/+/,'');
    history.replaceState({}, '', clean + (qp.get('artikel') ? ('?artikel='+qp.get('artikel')) : ''));
  }

  /* 1. Cek path untuk navigasi halaman */
  var initPage = getPageFromPath();
  if(initPage !== 'home') {
    setTimeout(function(){ goPage(initPage); }, 50);
  }

  /* 2. Cek ?artikel=slug untuk buka artikel langsung */
  var params = new URLSearchParams(window.location.search);
  var slug = params.get('artikel') || params.get('berita');
  if(slug){
    /* Simpan slug ke global supaya bisa dibuka saat allNewsCache siap */
    window._pendingArticleSlug = slug;
    var attempts = 0;
    var tryOpen = setInterval(function(){
      attempts++;
      var cache = window.allNewsCache || [];
      var found = cache.find(function(n){ return n.slug === slug || n.id === slug; });
      if(found){
        clearInterval(tryOpen);
        window._pendingArticleSlug = null;
        goPage('berita');
        setTimeout(function(){ window.openNews(found.id); }, 150);
      }
      if(attempts > 100) {
        clearInterval(tryOpen);
        window._pendingArticleSlug = null;
        goPage('berita');
        setTimeout(function(){
          var main=document.getElementById('news-main');
          if(main && (main.innerHTML.trim()==='' || !window._renderNews)) renderArticleLoadFailed();
        }, 300);
      }
    }, 300);
    /* Render news lebih awal supaya Firebase fetch segera dimulai —
       tunggu Firebase siap (bukan cuma coba sekali di 200ms) supaya
       tidak gagal diam-diam di koneksi/HP yang lambat. */
    invokeWhenReady('_renderNews');
  }
})();

/* FAQ */
window.toggleFaq = function(el){
  var item = el.closest('.faq-item');
  var isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(function(f){ f.classList.remove('open'); });
  if(!isOpen) item.classList.add('open');
};

/* Background canvas — dimatikan di HP/reduced-motion, pause saat tab tidak aktif */
(function(){
  var c=document.getElementById('bg-canvas');
  if(!c) return;
  var isMobile = window.matchMedia('(max-width:900px), (hover:none) and (pointer:coarse)').matches;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(isMobile || reduce){ c.style.display='none'; return; }
  var ctx=c.getContext('2d');
  var W,H,pts,raf=0,lastW=0;
  function init(){W=c.width=window.innerWidth;H=c.height=window.innerHeight;lastW=W;pts=Array.from({length:40},function(){return{x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.4+.3,dx:(Math.random()-.5)*.3,dy:(Math.random()-.5)*.3,a:Math.random()*.6}});}
  function draw(){ctx.clearRect(0,0,W,H);pts.forEach(function(p){p.x+=p.dx;p.y+=p.dy;if(p.x<0||p.x>W)p.dx*=-1;if(p.y<0||p.y>H)p.dy*=-1;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle='rgba(201,168,76,'+p.a+')';ctx.fill()});for(var i=0;i<pts.length;i++)for(var j=i+1;j<pts.length;j++){var dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=dx*dx+dy*dy;if(d<10000){d=Math.sqrt(d);ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.strokeStyle='rgba(201,168,76,'+(0.08*(1-d/100))+')';ctx.lineWidth=.5;ctx.stroke()}}raf=requestAnimationFrame(draw);}
  function start(){ if(!raf) raf=requestAnimationFrame(draw); }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf=0; } }
  init();start();
  document.addEventListener('visibilitychange',function(){ document.hidden ? stop() : start(); });
  window.addEventListener('resize',function(){ if(window.innerWidth===lastW) return; stop();init();start(); });
})();

/* Reveal observer */
/* ══ MOTION ENHANCER — auto-tags cards/headers/articles site-wide with
   scroll-reveal + stagger, including content rendered later by Firestore
   (news, modules, admin, etc). Runs on load, after page switch, and via
   MutationObserver for dynamic inserts. Respects prefers-reduced-motion. ══ */
var _reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var revObs = new IntersectionObserver(function(es){
  es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('vis'); revObs.unobserve(e.target); } });
},{threshold:.12});

var MOTION_SELECTOR = [
  '.about-card','.testi-card','.news-card','.news-featured','.seo-col-card','.faq-item',
  '.seo-trust-card','.mod-card','.vip-price-card','.scard','.news-sidebar-card','.note-card',
  '.fp-card','.about-header','.testi-header','.news-top','.cta-inner','.nsc-item',
  '.page-title','.page-sub','.seo-h1','.seo-h2'
].join(',');

function enhanceMotion(root){
  root = root || document;
  var els = root.querySelectorAll ? root.querySelectorAll(MOTION_SELECTOR) : [];
  var groupIndex = {};
  els.forEach(function(el){
    if(el.classList.contains('reveal') || el.dataset.motionDone) return;
    if(el.offsetParent===null && el.closest('.page.active')===null) { /* still tag even if hidden page; observer will catch on activation */ }
    el.classList.add('reveal');
    el.dataset.motionDone = '1';
    /* Stagger based on position among siblings sharing the same parent */
    var parentKey = el.parentElement ? (el.parentElement.className||'') + (el.parentElement.id||'') : 'root';
    groupIndex[parentKey] = (groupIndex[parentKey]||0) + 1;
    var idx = Math.min(groupIndex[parentKey]-1, 8);
    if(!el.style.transitionDelay) el.style.transitionDelay = (idx*0.07).toFixed(2)+'s';
    if(_reducedMotion){ el.classList.add('vis'); } else { revObs.observe(el); }
  });
}

/* Initial pass (covers .reveal elements already hand-placed in HTML too) */
document.querySelectorAll('.reveal').forEach(function(e){
  if(_reducedMotion){ e.classList.add('vis'); } else { revObs.observe(e); }
});
enhanceMotion(document);

/* Watch for dynamically injected content (news list, modules, admin tables, etc.) */
var motionMutObs = new MutationObserver(function(mutations){
  mutations.forEach(function(m){
    m.addedNodes.forEach(function(n){
      if(n.nodeType===1) enhanceMotion(n.parentElement || document);
    });
  });
});
motionMutObs.observe(document.body, {childList:true, subtree:true});
window._enhanceMotion = enhanceMotion;

/* Nav scroll */
(function(){var nv=document.getElementById('nav');window.addEventListener('scroll',function(){nv.classList.toggle('solid',window.scrollY>30);},{passive:true});})();
document.getElementById('nav').classList.add('solid');

window.toggleMob=function(){
  var mob=document.getElementById('mob-nav');
  var ham=document.getElementById('ham');
  var backdrop=document.getElementById('mob-nav-backdrop');
  var isOpen=mob.classList.toggle('open');
  ham.classList.toggle('open',isOpen);
  if(backdrop)backdrop.classList.toggle('open',isOpen);
  ham.setAttribute('aria-expanded',isOpen);
};

window.switchTab=function(t){
  ['login','reg'].forEach(function(n){
    document.getElementById('tab-'+n).classList.toggle('on',n===t);
    document.getElementById('tab-'+n).setAttribute('aria-selected',n===t);
    document.getElementById('form-'+n).classList.toggle('on',n===t);
  });
  document.getElementById('li-err').textContent='';document.getElementById('ri-err').textContent='';
  document.getElementById('li-ok').style.display='none';document.getElementById('ri-ok').style.display='none';
};

/* SEO-friendly page titles & descriptions per halaman */
var PAGE_META = {
  home:    { title: 'Mayora Gold FX — Komunitas Trading Emas XAU/USD Indonesia | Sinyal & Edukasi Premium', desc: 'Platform trading emas (XAU/USD) premium Indonesia. Sinyal XAUUSD akurasi kategori Excelent, live session, journal otomatis & komunitas VIP 500+ trader elite. Daftar GRATIS sekarang!', url: 'https://mayoragoldfx.com/' },
  berita:  { title: 'Berita & Analisa Pasar Emas XAU/USD Terkini — Mayora Gold FX', desc: 'Update terkini seputar emas XAU/USD, forex, dan pasar keuangan global. Analisa teknikal harian, sinyal trading, dan market update dari tim analis Mayora Gold FX.', url: 'https://mayoragoldfx.com/berita' },
  vip:     { title: 'VIP Membership Gratis — Sinyal Emas XAU/USD & Komunitas Trader Elite | Mayora Gold FX', desc: 'Bergabung komunitas VIP trading emas gratis. Dapatkan sinyal XAU/USD harian, live trading session, webinar mingguan, journal otomatis & analisa Smart Money Concept.', url: 'https://mayoragoldfx.com/vip' },
  modul:   { title: 'Modul Belajar Trading Emas XAU/USD — Dari Dasar hingga SMC | Mayora Gold FX', desc: 'Pelajari trading emas XAU/USD dari nol: dasar trading, market structure, Smart Money Concept, manajemen risiko, hingga strategi advanced. Gratis untuk member VIP.', url: 'https://mayoragoldfx.com/modul' },
  auth:    { title: 'Login Member — Mayora Gold FX', desc: 'Login atau daftar akun Mayora Gold FX untuk akses trading journal, modul edukasi, dan fitur VIP eksklusif.', url: 'https://mayoragoldfx.com/auth' },
  journal: { title: 'Trading Journal Pro — Mayora Gold FX', desc: 'Catat dan analisa performa trading emas XAU/USD kamu. Fitur eksklusif untuk member VIP Mayora Gold FX.', url: 'https://mayoragoldfx.com/journal' },
  consult: { title: 'AI Konsultasi Trading Emas — Mayora Gold FX', desc: 'Konsultasi trading XAU/USD dengan AI: strategi, manajemen risiko, dan psikologi trading.', url: 'https://mayoragoldfx.com/consult' },
  admin:   { title: 'Admin Dashboard — Mayora Gold FX', desc: 'Dashboard administrasi Mayora Gold FX.', url: 'https://mayoragoldfx.com/admin' },
  kalender:{ title: 'Kalender Ekonomi Forex — High Impact USD | Mayora Gold FX', desc: 'Kalender ekonomi real-time untuk event high-impact USD. Pantau NFP, CPI, FOMC, GDP dan data makro lainnya yang mempengaruhi XAU/USD.', url: 'https://mayoragoldfx.com/kalender' },
  sessions:{ title: 'Market Sessions — Jam Aktif Sesi Forex | Mayora Gold FX', desc: 'Pantau sesi forex aktif secara real-time: Sydney, Tokyo, London, New York. Rencanakan entry di jam likuiditas tinggi XAU/USD.', url: 'https://mayoragoldfx.com/sessions' },
  calc:    { title: 'Kalkulator Lot & Risk XAU/USD — Mayora Gold FX', desc: 'Hitung ukuran lot dan risk management optimal untuk trading emas XAU/USD. Fitur VIP Mayora Gold FX.', url: 'https://mayoragoldfx.com/calc' },
  swap:    { title: 'Kalkulator Swap XAU/USD — Mayora Gold FX', desc: 'Hitung biaya atau pendapatan swap overnight untuk posisi gold XAU/USD. Fitur VIP Mayora Gold FX.', url: 'https://mayoragoldfx.com/swap' },
  ai:      { title: 'AI Analisa Chart XAU/USD — Mayora Gold FX', desc: 'Analisa screenshot chart XAU/USD dengan AI secara instan. Identifikasi setup, support/resistance, dan peluang trading. Fitur VIP eksklusif.', url: 'https://mayoragoldfx.com/ai' },
  research:{ title: 'Research Harian XAU/USD — Mayora Gold FX', desc: 'Research dan analisa mendalam harian untuk trader emas XAU/USD. Update rutin dari tim analis Mayora Gold FX.', url: 'https://mayoragoldfx.com/research' }
};

/* Canonical link tag — update per halaman */
function updateCanonical(url) {
  var el = document.querySelector('link[rel="canonical"]');
  if (el) el.setAttribute('href', url);
}

/* ══ STANDALONE FALLBACK — tidak bergantung pada Firebase module.
   Kalau Firebase SDK gagal dimuat total (diblokir in-app browser, dll),
   window._renderNews tidak akan pernah ada. Watchdog ini memastikan
   halaman berita tetap menampilkan konten statis, bukan kosong. ══ */
var FALLBACK_NEWS=[
  {cat:'Market Update',title:'Harga Emas Catat Level Tertinggi di Tengah Ketegangan Geopolitik',date:'5 Jun 2026',excerpt:'Harga emas spot menguat signifikan dalam perdagangan sesi Asia, didukung meningkatnya permintaan safe haven akibat ketegangan di kawasan Timur Tengah dan kekhawatiran inflasi global.'},
  {cat:'Analisa Teknikal',title:'XAU/USD: Breakout Struktur Weekly — Potensi Target 2400',date:'4 Jun 2026',excerpt:'Analisa market structure pada timeframe weekly menunjukkan potensi breakout yang valid di atas resistance kunci 2350.'},
  {cat:'Edukasi',title:'Memahami Smart Money Concept dalam Trading Emas XAU/USD',date:'3 Jun 2026',excerpt:'Panduan lengkap menggunakan SMC untuk mengidentifikasi order block dan fair value gap pada pair XAU/USD.'},
  {cat:'Sinyal',title:'Setup BUY XAU/USD — Konfirmasi Rejection dari OB H4',date:'2 Jun 2026',excerpt:'Tim analis Mayora Gold FX mengidentifikasi setup buy dengan risk-reward 1:3.2 dari order block H4 yang valid.'},
  {cat:'Market Update',title:'Fed Pertahankan Suku Bunga — Emas Merespons Positif',date:'1 Jun 2026',excerpt:'Keputusan Federal Reserve mempertahankan suku bunga memberikan sentimen positif terhadap harga emas global.'}
];
function renderFallbackNews(){
  var main=document.getElementById('news-main');
  if(!main) return;
  var f=FALLBACK_NEWS[0];
  var html='<div class="news-featured" role="article"><div class="news-featured-thumb img-ar-16-9"><div class="nf-cat">'+f.cat+'</div></div><div class="news-featured-body"><div class="nf-date">'+f.date+'</div><h2 class="nf-title">'+f.title+'</h2><p class="nf-excerpt">'+f.excerpt+'</p></div></div><div class="news-list">';
  FALLBACK_NEWS.slice(1).forEach(function(n){
    html+='<article class="news-card"><div class="nc-cat-dot" aria-hidden="true"></div><div class="nc-body"><div class="nc-cat">'+n.cat+'</div><h3 class="nc-title">'+n.title+'</h3><div class="nc-date">'+n.date+'</div></div></article>';
  });
  html+='</div>';
  main.innerHTML=html;
  var aside=document.getElementById('news-aside');
  if(aside) aside.innerHTML='<div class="nsc-header">Artikel Terpopuler</div>'+FALLBACK_NEWS.map(function(a){return '<div class="nsc-item"><div class="nsc-title">'+a.title+'</div><div class="nsc-meta">'+a.date+'</div></div>';}).join('');
  if(window._enhanceMotion) window._enhanceMotion(main);
}
function renderArticleLoadFailed(){
  var main=document.getElementById('news-main');
  if(!main) return;
  main.innerHTML='<div class="empty-state" style="padding:60px 20px;text-align:center">'+
    '<div class="empty-icon" style="font-size:2rem;margin-bottom:12px">⚠</div>'+
    '<p style="margin-bottom:18px;color:var(--text-dim)">Artikel gagal dimuat. Ini biasanya terjadi kalau link dibuka lewat browser bawaan aplikasi chat (WhatsApp/Instagram).</p>'+
    '<button class="btn-hero-primary" onclick="location.reload()" style="margin-right:8px">Coba Lagi</button>'+
    '<button class="btn-hero-sec" onclick="(function(){var a=document.createElement(\'a\');a.href=location.href;a.target=\'_blank\';a.rel=\'noopener\';a.click();})()">Buka di Browser</button>'+
  '</div>';
}
function watchdogNews(){
  /* Kalau ada slug artikel pending, JANGAN tampilkan daftar generik —
     biarkan proses buka-artikel-spesifik (tryOpen loop, max 18 detik)
     yang menentukan. Watchdog generik cuma untuk halaman /berita biasa. */
  if(window._pendingArticleSlug) return;
  setTimeout(function(){
    /* Kalau Firebase module berhasil load (window._renderNews ada),
       biarkan try/catch internalnya sendiri yang menangani gagal/fallback —
       jangan timpa dengan data statis supaya tidak balapan dgn data asli. */
    if(window._renderNews) return;
    var main=document.getElementById('news-main');
    var onBerita=document.getElementById('page-berita')&&document.getElementById('page-berita').classList.contains('active');
    if(onBerita && main && main.innerHTML.trim()===''){
      renderFallbackNews();
    }
  },8000);
}
window._watchdogNews=watchdogNews;

function goPage(p){
  /* Kalau sudah login dan mau ke auth, redirect ke home */
  if(p==='auth'&&window._curUser){p='home';}
  /* VIP-gated tool pages: redirect to auth jika belum login */
  var vipPages=['journal','calc','swap','ai'];
  if((vipPages.indexOf(p)!==-1||p==='consult')&&!window._curUser){
    /* Status login belum diketahui (baru refresh) -> tunggu dulu, jangan langsung ke halaman login */
    if(!window._authReady){ window._authReadyPromise.then(function(){ goPage(p); }); return; }
    goPage('auth');return;
  }
  pages.forEach(function(n){document.getElementById('page-'+n).classList.toggle('active',n===p);});
  ['home','berita','vip','modul','research'].forEach(function(n){var el=document.getElementById('nl-'+n);if(el)el.classList.toggle('active',n===p);});
  /* Trading Tools dropdown — highlight when on any tool page */
  var toolPages=['kalender','sessions','journal','calc','swap','ai','research','consult'];
  var nlTools=document.getElementById('nl-tools');
  if(nlTools) nlTools.classList.toggle('active', toolPages.indexOf(p)!==-1);
  document.getElementById('mob-nav').classList.remove('open');
  var _hamBtn=document.getElementById('ham');
  if(_hamBtn){_hamBtn.classList.remove('open');_hamBtn.setAttribute('aria-expanded','false');}
  var _mobBackdrop=document.getElementById('mob-nav-backdrop');
  if(_mobBackdrop)_mobBackdrop.classList.remove('open');
  window.scrollTo(0,0);

  /* Update URL path untuk SEO (path-based routing, home = "/") */
  var newPath = (p === 'home') ? '/' : '/' + p;
  if (window.location.pathname !== newPath) {
    history.pushState({ page: p }, '', newPath);
  }

  /* Update meta per halaman */
  var meta = PAGE_META[p] || PAGE_META['home'];
  if(p !== 'berita') {
    updateSeoMeta({ title: meta.title, desc: meta.desc, image: DEFAULT_META.image });
    updateCanonical(meta.url);
  }

  if(p==='berita'){closeNewsDetail();invokeWhenReady('_renderNews');invokeWhenReady('_startEcalListener');invokeWhenReady('_renderEcal');watchdogNews();}
  if(p==='admin') invokeWhenReady('_loadAdminData');
  if(p==='modul') invokeWhenReady('modLoadModules');
  if(p==='kalender'){invokeWhenReady('_startEcalListener');invokeWhenReady('_renderEcal');}
  if(p==='sessions'){window._startSessInterval&&window._startSessInterval();}
  else{window._stopSessInterval&&window._stopSessInterval();}
  if(p==='ai'&&window._curUser&&(window._isVip||window._isAdmin)){window.aiRenderQuota&&window.aiRenderQuota();}
  if(p==='research') invokeWhenReady('rsLoadResearch');
  if(p==='consult') invokeWhenReady('consultInit');
}
window.goPage=goPage;

/* Handle browser back/forward */
window.addEventListener('popstate', function(e) {
  var p = (e.state && e.state.page) ? e.state.page : getPageFromPath();
  if (pages.indexOf(p) !== -1) goPage(p);
});

/* Read path on load */
function getPageFromPath() {
  var path = window.location.pathname.replace(/^\/+|\/+$/g,'').split('/')[0];
  return (path && pages.indexOf(path) !== -1) ? path : 'home';
}

window.requireVipNav=function(){
  if(!window._curUser){goPage('auth');return;}
  goPage('journal');
};

window.admTab=function(n,el){
  document.querySelectorAll('.admin-page').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('.admin-tab').forEach(function(t){t.classList.remove('on');});
  document.getElementById('adm-'+n).classList.add('on');
  el.classList.add('on');
  if(n==='users'&&window._loadUsers) window._loadUsers();
  if(n==='stats'&&window._loadStats) window._loadStats();
  if(n==='research'){ window.rsLoadResearch&&window.rsLoadResearch(); window.rsRenderAdminList&&window.rsRenderAdminList(); }
};

window.jTab=function(n,el){
  document.querySelectorAll('.journal-page').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('.app-tab').forEach(function(t){t.classList.remove('on');});
  document.getElementById('jp-'+n).classList.add('on');el.classList.add('on');
  if(n==='ecal'){window._renderEcal&&window._renderEcal();window._startEcalListener&&window._startEcalListener();}
};


/* Trading Tools nav dropdown */
window.toggleToolsMenu=function(e){
  if(e)e.stopPropagation();
  document.getElementById('tools-dropdown').classList.toggle('open');
};
window.closeToolsMenu=function(){
  document.getElementById('tools-dropdown').classList.remove('open');
};

document.addEventListener('click',function(e){
  var td=document.getElementById('tools-dropdown');
  if(td&&td.classList.contains('open')&&!td.contains(e.target)) td.classList.remove('open');
});

/* goJournalTab — backward compat, now routes to standalone pages */
window.goJournalTab=function(n){
  var pageMap={dash:'journal',history:'journal',notes:'journal',ecal:'kalender',sessions:'sessions',calc:'calc',swap:'swap',ai:'ai'};
  goPage(pageMap[n]||'journal');
};
window.fltHist=function(f,btn){window._histFlt=f;document.querySelectorAll('.flt-btn').forEach(function(b){b.classList.remove('on');});btn.classList.add('on');window._renderHistory&&window._renderHistory();};
window._histFlt='all';

/* Lot & Risk Calculator (VIP) */
window.calcLotRisk=function(){
  var modal=parseFloat(document.getElementById('calc-modal').value);
  var risk=parseFloat(document.getElementById('calc-risk').value);
  var sl=parseFloat(document.getElementById('calc-sl').value);
  var rr=parseFloat(document.getElementById('calc-rr').value);
  if(!(modal>0)||!(risk>0)||!(sl>0)||!(rr>0)){
    toast('MGF','Lengkapi semua kolom dengan angka lebih dari 0','#E05A5A');
    return;
  }
  var riskAmount=modal*risk/100;
  var VALUE_PER_POIN_PER_LOT=100; // 1 poin ($1 price move) = $100 per 1.00 lot (= $1 per 0.01 lot)
  var lot=riskAmount/(sl*VALUE_PER_POIN_PER_LOT);
  var rewardAmount=riskAmount*rr;
  var tpPoin=sl*rr;
  var lotStr=lot<0.01?lot.toFixed(4):lot.toFixed(2);

  var html='';
  html+='<div class="scard"><div class="scard-l">Risk Amount</div><div class="scard-v r">$'+riskAmount.toFixed(2)+'</div><div class="scard-sub">'+risk+'% dari modal $'+modal.toFixed(2)+'</div></div>';
  html+='<div class="scard"><div class="scard-l">Lot Size</div><div class="scard-v g">'+lotStr+'</div><div class="scard-sub">SL '+sl+' poin</div></div>';
  html+='<div class="scard"><div class="scard-l">Potential Profit</div><div class="scard-v g">$'+rewardAmount.toFixed(2)+'</div><div class="scard-sub">RR 1:'+rr+' · TP ±'+tpPoin.toFixed(1)+' poin</div></div>';
  html+='<div class="scard"><div class="scard-l">Potential Loss</div><div class="scard-v r">-$'+riskAmount.toFixed(2)+'</div><div class="scard-sub">Jika SL kena</div></div>';
  document.getElementById('calc-stats').innerHTML=html;

  var riskNote=document.getElementById('calc-risk-note');
  if(risk>5){
    riskNote.style.display='block';
    riskNote.innerHTML='<div class="acc-sec-t" style="color:var(--red)">⚠ Risk per Trade Tergolong Tinggi</div><div style="font-size:.7rem;color:var(--text2);line-height:1.95">Risk '+risk+'% per trade cukup besar. Kebanyakan trader profesional menjaga risk di kisaran 1–2% per trade agar modal tetap aman dari rangkaian loss berturut-turut.</div>';
  }else{
    riskNote.style.display='none';
  }

  var centNote=document.getElementById('calc-cent-note');
  if(lot<0.01){
    centNote.style.display='block';
    centNote.innerHTML='<div class="acc-sec-t" style="color:var(--gold)">Saran: Pakai Akun Cent</div><div style="font-size:.7rem;color:var(--text2);line-height:1.95">Dengan modal $'+modal.toFixed(2)+', risk '+risk+'%, dan SL '+sl+' poin, lot size yang dibutuhkan ('+lot.toFixed(4)+') lebih kecil dari minimum lot di akun standard (0.01). Supaya money management tetap presisi sesuai rencana risk kamu, lebih cocok pakai <strong style="color:var(--gold)">Akun Cent</strong> — modal yang sama akan terasa lebih besar (cth: $'+modal.toFixed(2)+' setara ¢'+(modal*100).toFixed(0)+'), sehingga lot size minimum jadi realistis untuk diterapkan tanpa memperbesar risk di luar rencana.</div>';
  }else{
    centNote.style.display='none';
  }

  document.getElementById('calc-result').style.display='block';
};

/* ===== MARKET SESSIONS ===== */
(function(){
  // Sessions defined in UTC hours
  var SESSIONS=[
    {name:'Sydney',   utcOpen:21, utcClose:6,  color:'#4A9EE0', focus:'AUD, NZD, Asia-Pacific handoff', wib:'04:00–13:00'},
    {name:'Tokyo',    utcOpen:23, utcClose:8,  color:'#E0A84A', focus:'JPY, AUD, NZD, Asia liquidity', wib:'06:00–15:00'},
    {name:'London',   utcOpen:7,  utcClose:16, color:'#4AE0A8', focus:'EUR, GBP, gold, major FX liquidity', wib:'14:00–23:00'},
    {name:'New York', utcOpen:12, utcClose:21, color:'#E05A5A', focus:'USD, yields, equities, gold, event risk', wib:'19:00–04:00'},
  ];
  function isOpen(s){
    var now=new Date();
    var h=now.getUTCHours()+(now.getUTCMinutes()/60);
    if(s.utcOpen<s.utcClose) return h>=s.utcOpen&&h<s.utcClose;
    return h>=s.utcOpen||h<s.utcClose; // overnight
  }
  function renderSessions(){
    var now=new Date();
    // Clock WIB
    var wibOffset=7*60;
    var wibMs=now.getTime()+(now.getTimezoneOffset()+wibOffset)*60000;
    var wib=new Date(wibMs);
    var hh=String(wib.getHours()).padStart(2,'0');
    var mm=String(wib.getMinutes()).padStart(2,'0');
    var ss=String(wib.getSeconds()).padStart(2,'0');
    var clk=document.getElementById('sess-clock');
    if(clk) clk.textContent=hh+':'+mm+':'+ss;

    // Active sessions
    var active=SESSIONS.filter(isOpen);
    var actEl=document.getElementById('sess-active-now');
    var actvEl=document.getElementById('sess-activity-now');
    if(actEl){
      if(active.length===0){actEl.textContent='Sepi / Weekend';actEl.style.color='var(--text3)';}
      else{actEl.textContent=active.map(function(s){return s.name;}).join(' + ');actEl.style.color='var(--gold)';}
    }
    if(actvEl){
      var act=active.length===0?'No Active Session':active.length>=2?'High Activity — Overlap':active.length===1?'Medium Activity':'—';
      actvEl.textContent=act;
      actvEl.style.color=active.length>=2?'var(--green)':active.length===1?'var(--gold)':'var(--text3)';
    }

    // Session cards
    var grid=document.getElementById('sess-cards-grid');
    if(grid){
      grid.innerHTML=SESSIONS.map(function(s){
        var open=isOpen(s);
        return '<div style="background:var(--bg3);border:1px solid '+(open?s.color+' ':'var(--card-border)')+';border-radius:18px;padding:18px 20px;transition:border-color .3s">'
          +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
          +'<span style="font-size:.54rem;letter-spacing:.15em;text-transform:uppercase;color:var(--text3)">'+s.name+'</span>'
          +'<span style="font-size:.5rem;letter-spacing:.12em;text-transform:uppercase;padding:2px 8px;border-radius:8px;'+(open?'background:'+s.color+'22;border:1px solid '+s.color+';color:'+s.color:'background:var(--bg4);border:1px solid var(--card-border);color:var(--text3)')+'">'+( open?'OPEN NOW':'CLOSED')+'</span>'
          +'</div>'
          +'<div style="font-family:\'Space Grotesk\',sans-serif;font-size:1.8rem;font-weight:600;color:var(--text);line-height:1;margin-bottom:8px">'+s.name+'</div>'
          +'<div style="font-size:.62rem;color:var(--text2);margin-bottom:4px"><b style="color:var(--text)">Market focus:</b> '+s.focus+'</div>'
          +'<div style="font-size:.58rem;color:var(--text3);margin-top:6px">WIB: '+s.wib+'</div>'
          +'</div>';
      }).join('');
    }

    // 24hr bar
    var bar=document.getElementById('sess-bar-24');
    if(bar){
      var totalMins=24*60;
      bar.innerHTML=SESSIONS.map(function(s){
        var openMins=(s.utcOpen+7)*60%1440;
        var closeMins=(s.utcClose+7)*60%1440;
        var dur=(closeMins>openMins)?(closeMins-openMins):(1440-openMins+closeMins);
        var leftPct=openMins/totalMins*100;
        var widthPct=dur/totalMins*100;
        return '<div style="position:absolute;top:6px;height:32px;border-radius:10px;background:'+s.color+'55;border:1px solid '+s.color+';opacity:'+(isOpen(s)?1:.55)+';left:'+leftPct+'%;width:'+widthPct+'%;min-width:2px" title="'+s.name+'"></div>';
      }).join('');
      // Current time marker
      var nowMins=wib.getHours()*60+wib.getMinutes();
      var pct=nowMins/totalMins*100;
      bar.innerHTML+='<div style="position:absolute;top:0;bottom:0;width:2px;background:var(--gold);left:'+pct+'%;border-radius:6px;box-shadow:0 0 6px var(--gold)"></div>';
    }
  }
  window._renderSessions=renderSessions;
  // Start ticker when tab activated
  var _sessInterval=null;
  window._startSessInterval=function(){
    if(_sessInterval) return;
    renderSessions();
    _sessInterval=setInterval(renderSessions,1000);
  };
  window._stopSessInterval=function(){
    if(_sessInterval){clearInterval(_sessInterval);_sessInterval=null;}
  };
})();

/* ===== SWAP CALCULATOR (VIP) ===== */
window.autoFillSwapPrice=async function(){
  try{
    var r=await fetch('https://api.gold-api.com/price/XAU',{cache:'no-cache'});
    var d=await r.json();
    var p=d.price||d.Price||d.ask||null;
    if(p){
      document.getElementById('swap-price').value=parseFloat(p).toFixed(2);
      toast('Swap','Harga XAU/USD berhasil diambil: $'+parseFloat(p).toFixed(2),'var(--gold)');
    }
  }catch(e){toast('Error','Gagal ambil harga live','var(--red)');}
};
window.toggleSwapPointValue=function(){
  var type=document.getElementById('swap-rate-type').value;
  var wrap=document.getElementById('swap-point-value-wrap');
  if(wrap) wrap.style.display=(type==='point'?'':'none');
};

window.calcSwap=function(){
  var lot=parseFloat(document.getElementById('swap-lot').value);
  var dir=document.getElementById('swap-dir').value;
  var days=parseInt(document.getElementById('swap-days').value)||1;
  var rateBuy=parseFloat(document.getElementById('swap-rate-buy').value);
  var rateSell=parseFloat(document.getElementById('swap-rate-sell').value);
  var price=parseFloat(document.getElementById('swap-price').value);
  var rateType=document.getElementById('swap-rate-type').value;
  var pointValue=parseFloat(document.getElementById('swap-point-value').value)||1;
  if(!(lot>0)||isNaN(rateBuy)||isNaN(rateSell)||!(days>0)){
    toast('MGF','Lengkapi semua kolom swap','var(--red)');return;
  }
  if(rateType==='point'&&!(pointValue>0)){
    toast('MGF','Masukkan Point Value yang valid','var(--red)');return;
  }

  var rate=dir==='buy'?rateBuy:rateSell;

  // Konversi ke USD/malam berdasarkan tipe rate
  // Jika POINT: swap_USD = rate_point × lot × point_value
  // Jika USD/lot: swap_USD = rate × lot (sudah dalam USD)
  var swapPerNight;
  if(rateType==='point'){
    swapPerNight=rate*lot*pointValue;
  } else {
    swapPerNight=rate*lot;
  }

  var totalSwap=swapPerNight*days;
  var isPos=totalSwap>=0;

  var rateLabel=rateType==='point'
    ? rate+' point/lot (× '+pointValue+' point value = '+(rate*pointValue).toFixed(4)+' USD/lot)'
    : rate+' USD/lot';

  var html='';
  html+='<div class="scard"><div class="scard-l">Swap per Malam</div><div class="scard-v '+(swapPerNight>=0?'g':'r')+'">'+(swapPerNight>=0?'+':'')+swapPerNight.toFixed(4)+' USD</div><div class="scard-sub">'+dir.toUpperCase()+' '+lot+' lot</div></div>';
  html+='<div class="scard"><div class="scard-l">Total Swap ('+days+' malam)</div><div class="scard-v '+(totalSwap>=0?'g':'r')+'">'+(totalSwap>=0?'+':'')+totalSwap.toFixed(4)+' USD</div><div class="scard-sub">Rate: '+rateLabel+'</div></div>';
  if(price>0){
    var contractSize=100; // XAUUSD: 100 oz per lot
    var posValue=price*lot*contractSize;
    var swapPct=Math.abs(totalSwap)/posValue*100;
    html+='<div class="scard"><div class="scard-l">% dari Nilai Posisi</div><div class="scard-v">'+swapPct.toFixed(4)+'%</div><div class="scard-sub">Nilai posisi ~$'+posValue.toFixed(0)+'</div></div>';
  }
  document.getElementById('swap-stats').innerHTML=html;

  var tripleDay='Rabu';
  var detail='<b>Arah:</b> '+(dir==='buy'?'Buy (Long)':'Sell (Short)')+'<br>'
    +'<b>Tipe Rate:</b> '+(rateType==='point'?'Point (dikonversi ke USD)':'USD/lot')+'<br>'
    +'<b>Swap Rate '+dir+':</b> '+rateLabel+'<br>'
    +'<b>Lot:</b> '+lot+'<br>'
    +'<b>Swap per Malam:</b> '+swapPerNight.toFixed(4)+' USD<br>'
    +'<b>Durasi:</b> '+days+' malam<br>'
    +'<b>Triple Swap:</b> Hari '+tripleDay+' dihitung 3x (weekend rollover)<br><br>'
    +'<span style="color:var(--red)">Total biaya swap: <b>-'+Math.abs(totalSwap).toFixed(4)+' USD</b> selama '+days+' malam.</span>';
  var detEl=document.getElementById('swap-detail');
  detEl.innerHTML=detail;
  document.getElementById('swap-result').style.display='block';
};

/* Slug generator */
function generateSlug(text){
  var map={'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a','è':'e','é':'e','ê':'e','ë':'e','ì':'i','í':'i','î':'i','ï':'i','ò':'o','ó':'o','ô':'o','õ':'o','ö':'o','ù':'u','ú':'u','û':'u','ü':'u','ñ':'n','ç':'c'};
  return text.toLowerCase()
    .replace(/[àáâãäåèéêëìíîïòóôõöùúûüñç]/g,function(c){return map[c]||c;})
    .replace(/[^a-z0-9\s-]/g,'').trim()
    .replace(/\s+/g,'-').replace(/-{2,}/g,'-').replace(/^-+|-+$/g,'');
}
window.generateSlug=generateSlug;

/* ===== AI ANALISA CHART — Gemini Vision (via /api/gemini, key aman di server) ===== */
const AI_DAILY_LIMIT = 10;

function aiGetTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

async function aiGetQuota(uid) {
  // Kuota dihitung & dikunci di SERVER (/api/gemini). Client hanya membaca untuk ditampilkan.
  try {
    const db = window.getDB();
    const {getDoc, doc} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const dayKey = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta'}).format(new Date()); // sama dgn server (WIB)
    const snap = await getDoc(doc(db, 'users', uid, 'aiQuota', dayKey));
    return snap.exists() ? (snap.data().chart || 0) : 0;
  } catch(e) { return 0; }
}

async function aiIncrementQuota(uid) {
  /* no-op: server yang menambah kuota. Client tidak boleh menulis kuota. */
}

async function aiRenderQuota() {
  const uid = window._curUser?.uid;
  if (!uid) return;
  const used = await aiGetQuota(uid);
  const remaining = Math.max(0, AI_DAILY_LIMIT - used);
  const dots = document.getElementById('ai-quota-dots');
  const txt = document.getElementById('ai-quota-txt');
  if (!dots || !txt) return;
  let dotsHtml = '';
  for (let i = 0; i < AI_DAILY_LIMIT; i++) {
    const filled = i < remaining;
    dotsHtml += `<div style="width:22px;height:8px;border-radius:12px;background:${filled ? 'var(--gold)' : 'var(--bg4)'};border:1px solid var(--card-border);transition:background .3s"></div>`;
  }
  dots.innerHTML = dotsHtml;
  txt.textContent = `${remaining}/${AI_DAILY_LIMIT} tersisa`;
  txt.style.color = remaining === 0 ? 'var(--red)' : 'var(--text2)';
}

window._aiImageBase64 = null;
window._aiImageMime = null;

window._aiMode = 'signal';
window._aiTf = 'auto';
window._aiLastText = '';

window.aiSetMode = function(m){
  window._aiMode = m;
  document.querySelectorAll('#ai-mode-seg .ai-seg-b').forEach(b=>b.classList.toggle('on', b.dataset.m===m));
  const ta = document.getElementById('ai-prompt-input');
  if(ta) ta.placeholder = m==='zona'
    ? 'cth: Tandai support/resistance & order block terdekat dari harga sekarang'
    : 'cth: Fokus ke area sekitar 4380, harga baru saja sweep low';
};
window.aiSetTf = function(t){
  window._aiTf = t;
  document.querySelectorAll('#ai-tf-chips .ai-chip').forEach(b=>b.classList.toggle('on', b.dataset.tf===t));
};

/* Kompres gambar di browser: max 1600px + JPEG, supaya aman di limit body Vercel (~4.5MB) & lebih cepat */
function aiCompressImage(file){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      try{
        const MAX = 1600;
        let w = img.naturalWidth, h = img.naturalHeight;
        const sc = Math.min(1, MAX / Math.max(w, h));
        w = Math.round(w*sc); h = Math.round(h*sc);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
        let q = 0.9, out = c.toDataURL('image/jpeg', q);
        while(out.length > 3000000 && q > 0.5){ q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        URL.revokeObjectURL(url);
        resolve(out);
      }catch(e){ URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca')); };
    img.src = url;
  });
}

async function aiHandleFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast('Error', 'File harus berupa gambar (JPG, PNG, WEBP)', '#E05A5A'); return;
  }
  if (file.size > 15 * 1024 * 1024) {
    toast('Error', 'Ukuran gambar maksimal 15MB', '#E05A5A'); return;
  }
  try{
    const dataUrl = await aiCompressImage(file);
    window._aiImageBase64 = dataUrl.split(',')[1];
    window._aiImageMime = 'image/jpeg';
    const preview = document.getElementById('ai-preview-img');
    const wrap = document.getElementById('ai-preview-wrap');
    const uploadArea = document.getElementById('ai-upload-area');
    if (preview) preview.src = dataUrl;
    if (wrap) wrap.style.display = 'block';
    if (uploadArea) uploadArea.style.display = 'none';
    document.getElementById('ai-error').style.display = 'none';
    document.getElementById('ai-result').style.display = 'none';
  }catch(e){
    toast('Error', e.message || 'Gagal memproses gambar', '#E05A5A');
  }
}
window.aiHandleFile = aiHandleFile;

window.aiHandleDrop = function(e) {
  e.preventDefault();
  e.currentTarget.style.borderColor = 'var(--card-border)';
  const file = e.dataTransfer.files[0];
  if (file) aiHandleFile(file);
};

window.aiClearPreview = function() {
  window._aiImageBase64 = null;
  window._aiImageMime = null;
  document.getElementById('ai-preview-wrap').style.display = 'none';
  document.getElementById('ai-upload-area').style.display = 'block';
  document.getElementById('ai-file-input').value = '';
  document.getElementById('ai-result').style.display = 'none';
  document.getElementById('ai-error').style.display = 'none';
};

window.aiClearAll = function() {
  window.aiClearPreview();
  document.getElementById('ai-prompt-input').value = '';
  aiRenderQuota();
};

function aiEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function aiFormatResult(text) {
  // Convert markdown-like to clean HTML (input HARUS sudah di-escape)
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--gold)">$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<div style="font-weight:600;color:var(--gold);margin:14px 0 6px;font-size:.76rem;letter-spacing:.06em;text-transform:uppercase">$1</div>')
    .replace(/^[-•]\s+(.+)$/gm, '<div style="display:flex;gap:8px;margin:4px 0"><span style="color:var(--gold);flex-shrink:0">›</span><span>$1</span></div>')
    .replace(/\n{2,}/g, '<div style="height:10px"></div>')
    .replace(/\n/g, '<br>');
}

function aiRenderResult(text, mode){
  const t = String(text||'').replace(/\r/g,'').trim();
  window._aiLastText = t.replace(/\*\*/g,'');
  const field = (label)=>{
    const m = t.match(new RegExp('\\*\\*\\s*'+label+'\\s*:?\\s*\\*\\*\\s*:?\\s*([^\\n]*)','i'));
    return m ? m[1].replace(/\*\*/g,'').trim() : '';
  };
  if(mode !== 'zona'){
    const arah = field('Arah'), entry = field('Entry'), sl = field('Stop Loss'), tp = field('Take Profit');
    const dm = arah.match(/\b(BUY|SELL)\b/i);
    if(dm && entry && sl && tp){
      const dir = dm[1].toUpperCase();
      const zona = field('Zona/Konfluensi'), tipe = field('Tipe Entry'), alasan = field('Alasan Singkat');
      return `<div class="ai-sig">
        <div class="ai-sig-h"><div class="ai-dir ${dir==='BUY'?'buy':'sell'}">${dir} XAU/USD</div>${tipe?`<span class="ai-tag">${aiEsc(tipe)}</span>`:''}</div>
        <div class="ai-grid">
          <div class="ai-cell e"><div class="ai-cell-l">Entry</div><div class="ai-cell-v">${aiEsc(entry)}</div></div>
          <div class="ai-cell s"><div class="ai-cell-l">Stop Loss</div><div class="ai-cell-v">${aiEsc(sl)}</div></div>
          <div class="ai-cell t"><div class="ai-cell-l">Take Profit</div><div class="ai-cell-v">${aiEsc(tp)}</div></div>
        </div>
        ${zona?`<div class="ai-row"><b>Zona/Konfluensi:</b> ${aiEsc(zona)}</div>`:''}
        ${alasan?`<div class="ai-row"><b>Alasan:</b> ${aiEsc(alasan)}</div>`:''}
        <div class="ai-disc">Analisa berbasis screenshot &amp; bukan jaminan profit. Gunakan lot sesuai risk kamu (Kalkulator Lot &amp; Risk) dan konfirmasi sendiri sebelum eksekusi.</div>
      </div>`;
    }
  }
  return `<div style="font-size:.72rem;line-height:1.85">${aiFormatResult(aiEsc(t))}</div>`;
}

window.aiCopyResult = async function(){
  try{
    await navigator.clipboard.writeText(window._aiLastText || '');
    const b = document.getElementById('ai-copy-btn');
    if(b){ const o=b.textContent; b.textContent='Tersalin ✓'; setTimeout(()=>b.textContent=o,1600); }
  }catch(e){ toast('Error','Gagal menyalin hasil','#E05A5A'); }
};

window.aiAnalyze = async function() {
  const uid = window._curUser?.uid;
  if (!uid) { toast('Error', 'Kamu harus login dulu', '#E05A5A'); return; }
  if (!window._aiImageBase64) { toast('Error', 'Upload chart terlebih dahulu', '#E05A5A'); return; }

  // Check quota
  const used = await aiGetQuota(uid);
  if (used >= AI_DAILY_LIMIT) {
    document.getElementById('ai-error').style.display = 'block';
    document.getElementById('ai-error').textContent = `Kuota analisa kamu hari ini sudah habis (${AI_DAILY_LIMIT}/${AI_DAILY_LIMIT}). Kuota akan reset besok pukul 00:00.`;
    return;
  }

  // UI loading state
  const btn = document.getElementById('ai-analyze-btn');
  const loading = document.getElementById('ai-loading');
  const result = document.getElementById('ai-result');
  const errEl = document.getElementById('ai-error');
  btn.style.display = 'none';
  loading.style.display = 'block';
  result.style.display = 'none';
  errEl.style.display = 'none';

  const loadingTexts = [
    'Membaca struktur chart...', 'Mengidentifikasi support & resistance...',
    'Menganalisa price action...', 'Menyusun rekomendasi trading...'
  ];
  let ltIdx = 0;
  const ltEl = document.getElementById('ai-loading-txt');
  const ltInterval = setInterval(() => { ltEl.textContent = loadingTexts[ltIdx++ % loadingTexts.length]; }, 1800);

  const userPrompt = document.getElementById('ai-prompt-input').value.trim().slice(0, 400);
  const usedMode = window._aiMode;

  try {
    const _aiHdr = { 'Content-Type': 'application/json' };
    try { if (window._curUser && window._curUser.getIdToken) _aiHdr['Authorization'] = 'Bearer ' + await window._curUser.getIdToken(); } catch (_) {}
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: _aiHdr,
      body: JSON.stringify({
        mode: 'chart',
        analysisMode: usedMode,
        timeframe: window._aiTf,
        prompt: userPrompt || (usedMode === 'zona' ? 'Tandai zona penting di chart' : 'Cari setup entry terbaik'),
        image: window._aiImageBase64,
        mimeType: window._aiImageMime
      })
    });

    clearInterval(ltInterval);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.text || '';
    if (!text) throw new Error('Respons AI kosong. Coba lagi.');

    // Increment quota
    await aiIncrementQuota(uid);
    await aiRenderQuota();

    // Show result
    loading.style.display = 'none';
    btn.style.display = 'flex';
    result.style.display = 'block';
    document.getElementById('ai-result-body').innerHTML = aiRenderResult(text, usedMode);

  } catch(e) {
    clearInterval(ltInterval);
    loading.style.display = 'none';
    btn.style.display = 'flex';
    errEl.style.display = 'block';
    errEl.textContent = '⚠ ' + (e.message || 'Terjadi kesalahan. Coba lagi.');
    console.error('[aiAnalyze]', e);
  }
};

/* Render quota when switching to AI tab */
const _origJTab = window.jTab;
window.jTab = function(n, el) {
  _origJTab(n, el);
  if (n === 'ai') aiRenderQuota();
};


/* ===== AI KONSULTASI TRADING (chat terbatas: VIP 5x10, Non-VIP 2x5 per hari) ===== */
const CONSULT_LIMITS = { vip: {sessions:5, msgs:10}, free: {sessions:2, msgs:5} };
const CS_FS = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
window._consultState = null;
let _csBusy = false;

function csIsVip(){ return !!(window._isVip || window._isAdmin); }
function csLim(){ return csIsVip() ? CONSULT_LIMITS.vip : CONSULT_LIMITS.free; }
function csDefault(){ return {sessions:0, count:0, active:false, history:[]}; }
function csEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function csLoad(uid){
  try{
    const db = window.getDB();
    const {getDoc, doc} = await import(CS_FS);
    const snap = await getDoc(doc(db,'users',uid,'aiUsage','consult-'+aiGetTodayKey()));
    if(!snap.exists()) return csDefault();
    const d = snap.data();
    return {sessions:d.sessions||0, count:d.count||0, active:d.active===true, history:Array.isArray(d.history)?d.history:[]};
  }catch(e){ console.error('[consultLoad]',e); return null; }
}
async function csSave(uid, st){
  try{
    const db = window.getDB();
    const {setDoc, doc, serverTimestamp} = await import(CS_FS);
    await setDoc(doc(db,'users',uid,'aiUsage','consult-'+aiGetTodayKey()),
      {sessions:st.sessions, count:st.count, active:st.active, history:st.history, updatedAt:serverTimestamp()}, {merge:true});
    return true;
  }catch(e){ console.error('[consultSave]',e); return false; }
}

const CS_CHIPS_ADVICE = ['Saya overtrading & susah disiplin ikut plan','Gimana cara validasi order block yang benar?','Analisa saya sering benar tapi SL kena dulu, kenapa?','Cara menentukan lot & risk sesuai modal saya'];
const CS_CHIPS_LEARN = ['Saya sering FOMO masuk telat, ajarin dasarnya','Ajarin market structure yang benar dari buku','Saya nggak paham position sizing & R-multiple','Kenapa saya susah terima loss? Ajarin psikologinya'];
const CS_MODE_DESC = {
  advice: 'Konsultasi: ceritakan masalahmu, AI kasih diagnosis & saran konkret.',
  learn:  'Belajar: sebutkan keluhan atau topik, AI ajarkan konsepnya berdasarkan buku & teori trading terbaik + latihan + rekomendasi bacaan.'
};
let _csMode = 'advice';
try{ const m = localStorage.getItem('mgf_cs_mode'); if(m==='learn'||m==='advice') _csMode = m; }catch(e){}
function csChips(){ return _csMode==='learn' ? CS_CHIPS_LEARN : CS_CHIPS_ADVICE; }
window.consultSetMode = function(m){
  if(_csBusy) return;
  if(m==='learn' && !csIsVip()){
    toast('AI Belajar','Mode Belajar khusus member VIP. Konsultasi tetap bisa dipakai.','#C9A84C');
    _csMode = 'advice';
    consultRender();
    return;
  }
  _csMode = (m==='learn') ? 'learn' : 'advice';
  try{ localStorage.setItem('mgf_cs_mode', _csMode); }catch(e){}
  consultRender();
};

function csUpsellHtml(limitHit){
  return `<div class="cs-card" style="padding:22px;border-color:rgba(201,168,76,.35);background:linear-gradient(160deg,rgba(201,168,76,.07),var(--bg3))">
    <div style="font-size:.58rem;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">Benefit VIP</div>
    <div style="font-size:.9rem;font-weight:600;color:var(--text);margin-bottom:8px">${limitHit?'Kuota konsultasi kamu sudah habis — upgrade VIP biar bisa lanjut':'Mau konsultasi lebih banyak? Upgrade ke VIP gratis'}</div>
    <div style="font-size:.7rem;color:var(--text2);line-height:1.9;margin-bottom:14px">
      <div>› <b style="color:var(--gold)">5 konsultasi/hari</b> × <b style="color:var(--gold)">10 percakapan</b> <span style="color:var(--text3)">(Non-VIP: 2 × 5)</span></div>
      <div>› AI Analisa Chart (upload screenshot, dapat setup entry)</div>
      <div>› Trading Journal, Kalkulator Lot &amp; Risk, Kalkulator Swap</div>
      <div>› Sinyal harian XAU/USD, live session &amp; komunitas VIP 24 jam</div>
    </div>
    <a href="WA1" target="_blank" rel="noopener noreferrer" class="vll-btn">Hubungi Admin →</a>
  </div>`.replace('WA1','__WA1__');
}

function consultRender(pending){
  const st = window._consultState || csDefault();
  const lim = csLim();
  const vip = csIsVip();
  if(_csMode==='learn' && !vip) _csMode = 'advice';   /* non-VIP tidak boleh di mode Belajar (mis. sisa pilihan lama di localStorage) */

  /* quota */
  const sessLeft = Math.max(0, lim.sessions - st.sessions);
  const dots = document.getElementById('cs-sess-dots');
  if(dots){
    let h=''; for(let i=0;i<lim.sessions;i++){ h+=`<div style="width:26px;height:8px;border-radius:12px;background:${i<sessLeft?'var(--gold)':'var(--bg4)'};border:1px solid var(--card-border);transition:background .3s"></div>`; }
    dots.innerHTML = h + `<span style="font-size:.62rem;color:${sessLeft===0?'var(--red)':'var(--text2)'};margin-left:6px">${sessLeft}/${lim.sessions} tersisa</span>`;
  }
  const tier = document.getElementById('cs-tier'); if(tier) tier.textContent = window._isAdmin ? 'ADMIN' : (vip ? 'VIP' : 'REGULAR');
  const cnt = st.active ? st.count : 0;
  const mt = document.getElementById('cs-msg-txt');
  if(mt){ mt.textContent = `${cnt}/${lim.msgs}`; mt.style.color = cnt>=lim.msgs ? 'var(--red)' : 'var(--gold)'; }

  /* status limit */
  const sessionFull = st.active && st.count >= lim.msgs;
  const allDone = st.sessions >= lim.sessions && (sessionFull || !st.active);
  const blocked = sessionFull || allDone;

  /* chat bubbles */
  const box = document.getElementById('cs-msgs');
  let html = '';
  if(!st.history.length && !pending){
    if(_csMode==='learn'){
      html += `<div class="cs-b m">Halo! Aku AI mentor belajar Mayora Gold FX 📚<br>Sebutkan <b>keluhan atau topik</b> yang mau kamu kuasai (mis. FOMO, market structure, position sizing). Aku ajarkan <b>konsep intinya</b> berdasarkan teori & buku trading terbaik, kasih <b>latihan</b>, dan rekomendasi <b>bacaan lanjut</b>.<br><span style="color:var(--text3)">Catatan: ini ringkasan pembelajaran, bukan pengganti buku aslinya. Tidak ada sinyal buy/sell atau prediksi harga — setup entry ada di menu AI Analisa Chart.</span></div>`;
    } else {
      html += `<div class="cs-b m">Halo! Aku AI konsultan trading Mayora Gold FX<br>Konsultasi bareng aku soal <b>psikologi</b> (overtrading, FOMO, susah disiplin), <b>teknikal analisis</b> (market structure, order block, validasi zona), <b>manajemen risiko</b>, strategi, atau masalah trading lainnya. Aku bantu cari akar masalahnya dan kasih saran yang bisa langsung dipraktikkan.<br><span style="color:var(--text3)">Catatan: di sini tidak ada sinyal buy/sell atau prediksi harga — setup entry ada di menu AI Analisa Chart.</span></div>`;
    }
  }
  st.history.forEach(h=>{ html += `<div class="cs-b ${h.r==='u'?'u':'m'}">${h.r==='u'?csEsc(h.t):aiFormatResult(csEsc(h.t))}</div>`; });
  if(pending){
    html += `<div class="cs-b u">${csEsc(pending)}</div><div class="cs-b m"><span class="cs-dot"></span><span class="cs-dot"></span><span class="cs-dot"></span></div>`;
  }
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;

  /* chips */
  const chips = document.getElementById('cs-chips');
  chips.innerHTML = (!st.history.length && !pending && !blocked)
    ? csChips().map((c,i)=>`<button class="cs-chip" onclick="consultSend(csChips()[${i}])">${csEsc(c)}</button>`).join('') : '';

  /* notifikasi limit */
  const nt = document.getElementById('cs-notice');
  let n = '';
  if(allDone){
    n = `<div style="background:rgba(224,90,90,.08);border:1px solid rgba(224,90,90,.3);border-radius:16px;padding:12px 16px;font-size:.7rem;color:var(--red);line-height:1.7">⚠ Kuota konsultasi hari ini habis (${lim.sessions}/${lim.sessions}). Reset besok pukul 00:00.</div>`;
  } else if(sessionFull){
    n = `<div style="background:rgba(201,168,76,.08);border:1px solid var(--gold-border);border-radius:16px;padding:12px 16px;font-size:.7rem;color:var(--gold);line-height:1.7;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><span>Batas ${lim.msgs} percakapan di konsultasi ini sudah tercapai. Sisa ${sessLeft} konsultasi hari ini.</span><button class="cs-btn" onclick="consultNew()">Mulai Konsultasi Baru</button></div>`;
  } else if(!vip && st.active && lim.msgs - st.count === 1){
    n = `<div style="background:rgba(201,168,76,.08);border:1px solid var(--gold-border);border-radius:16px;padding:12px 16px;font-size:.7rem;color:var(--gold);line-height:1.7">Sisa 1 percakapan di konsultasi ini.</div>`;
  }
  nt.innerHTML = n; nt.style.display = n ? 'block' : 'none';

  /* toggle mode */
  document.querySelectorAll('#cs-mode-seg .cs-seg-b').forEach(b=>b.classList.toggle('on', b.dataset.m===_csMode));
  const md = document.getElementById('cs-mode-desc'); if(md) md.textContent = CS_MODE_DESC[_csMode];

  /* input state */
  const inp = document.getElementById('cs-input'), btn = document.getElementById('cs-send');
  if(inp){ inp.disabled = blocked || _csBusy; inp.placeholder = blocked ? 'Batas percakapan tercapai' : (_csMode==='learn' ? 'Tulis keluhan / topik yang mau dipelajari...' : 'Ceritakan masalah trading kamu...'); }
  if(btn) btn.disabled = blocked || _csBusy;

  /* upsell non-VIP */
  const up = document.getElementById('cs-upsell');
  if(up){
    if(vip){ up.style.display='none'; up.innerHTML=''; }
    else{
      up.innerHTML = csUpsellHtml(blocked)
        .replace('__WA1__','https://wa.me/6289681470758?text=Halo%20Admin,%20saya%20ingin%20upgrade%20ke%20VIP!');
      up.style.display='block';
    }
  }
}
window.consultRender = consultRender;

window.consultInit = async function(){
  const uid = window._curUser?.uid;
  if(!uid) return;
  const st = await csLoad(uid);
  if(!st){ toast('Error','Gagal memuat data konsultasi','#E05A5A'); window._consultState = csDefault(); }
  else window._consultState = st;
  consultRender();
};
window._consultOnRoleChange = function(){
  const pg = document.getElementById('page-consult');
  if(pg && pg.classList.contains('active')) consultRender();
};

window.consultNew = async function(){
  const uid = window._curUser?.uid; if(!uid || _csBusy) return;
  const st = await csLoad(uid);
  if(!st){ toast('Error','Gagal memuat data konsultasi','#E05A5A'); return; }
  const lim = csLim();
  if(st.sessions >= lim.sessions){
    window._consultState = st; consultRender();
    toast('AI Konsultasi','Kuota konsultasi hari ini habis. Reset besok 00:00.','#E05A5A'); return;
  }
  st.active = false; st.count = 0; st.history = [];
  await csSave(uid, st);
  window._consultState = st;
  consultRender();
  const inp = document.getElementById('cs-input'); if(inp){ inp.value=''; inp.focus(); }
};

window.consultSend = async function(pre){
  if(_csBusy) return;
  const uid = window._curUser?.uid;
  if(!uid){ toast('Error','Kamu harus login dulu','#E05A5A'); return; }
  const inp = document.getElementById('cs-input');
  const text = (typeof pre === 'string' ? pre : inp.value).trim();
  if(!text) return;
  if(text.length > 500){ toast('Error','Pesan maksimal 500 karakter','#E05A5A'); return; }

  if(_csMode==='learn' && !csIsVip()){
    toast('AI Belajar','Mode Belajar khusus member VIP','#C9A84C');
    _csMode='advice'; consultRender(); return;
  }
  _csBusy = true;
  try{
    /* selalu ambil state terbaru dari Firestore (aman dari tab ganda / ganti hari) */
    const st = await csLoad(uid);
    if(!st) throw new Error('Gagal memuat kuota konsultasi. Coba lagi.');
    const lim = csLim();

    if(!st.active){
      if(st.sessions >= lim.sessions){
        window._consultState = st; _csBusy = false; consultRender();
        toast('AI Konsultasi','Kuota konsultasi hari ini habis. Reset besok 00:00.','#E05A5A');
        return;
      }
      st.active = true; st.sessions += 1; st.count = 0; st.history = [];
    }
    if(st.count >= lim.msgs){
      window._consultState = st; _csBusy = false; consultRender();
      toast('AI Konsultasi',`Batas ${lim.msgs} percakapan tercapai. Mulai konsultasi baru.`,'#C9A84C');
      return;
    }

    if(inp) inp.value = '';
    window._consultState = Object.assign({}, st, {history: st.history.slice()});
    consultRender(text);

    const history = st.history.slice(-16).map(h=>({role: h.r==='u' ? 'user' : 'model', text: h.t}));
    const hdrs = {'Content-Type':'application/json'};
    try{ if(window._curUser && window._curUser.getIdToken) hdrs['Authorization'] = 'Bearer ' + await window._curUser.getIdToken(); }catch(_){}
    const res = await fetch('/api/gemini', {
      method:'POST', headers:hdrs,
      body: JSON.stringify({mode:'consult', style:_csMode, prompt:text, history})
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({}));
      throw new Error(err?.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const reply = (data.text || '').trim();
    if(!reply) throw new Error('Respons AI kosong. Coba lagi.');

    st.history.push({r:'u', t:text}, {r:'m', t:reply});
    st.count += 1;
    const ok = await csSave(uid, st);
    if(!ok) toast('AI Konsultasi','Gagal menyimpan kuota, cek koneksi.','#E05A5A');
    window._consultState = st;
    _csBusy = false;
    consultRender();

    /* notifikasi limit */
    const left = lim.sessions - st.sessions;
    if(st.count >= lim.msgs){
      if(left > 0) toast('AI Konsultasi',`Batas ${lim.msgs} percakapan tercapai. Mulai konsultasi baru (sisa ${left}).`,'#C9A84C');
      else toast('AI Konsultasi', csIsVip() ? 'Kuota konsultasi hari ini habis. Reset besok 00:00.' : 'Kuota habis. Upgrade VIP untuk 5 konsultasi × 10 percakapan/hari','#E05A5A');
    } else if(!csIsVip() && lim.msgs - st.count === 1){
      toast('AI Konsultasi','Sisa 1 percakapan. VIP dapat 10 percakapan per konsultasi','#C9A84C');
    }
  }catch(e){
    console.error('[consultSend]', e);
    if(inp && !inp.value) inp.value = text;   /* kembalikan teks, kuota tidak terpotong */
    _csBusy = false;
    const st = await csLoad(uid).catch(()=>null);
    window._consultState = st || window._consultState || csDefault();
    consultRender();
    toast('Error', e.message || 'Terjadi kesalahan. Coba lagi.', '#E05A5A');
  }finally{
    _csBusy = false;
  }
};

/* Cloudinary URL optimizer */
function getOptUrl(url, width){
  if(!url) return '';
  var clMatch = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
  if(!clMatch) return url;
  var base = clMatch[1], rest = clMatch[2];
  var transform = 'c_limit,w_'+width+',f_auto,q_auto';
  if(rest.includes('c_limit') || rest.includes('f_auto')) return url;
  return base+transform+'/'+rest;
}
window.getOptUrl = getOptUrl;

/* SEO meta helpers */
var DEFAULT_META = {
  title: 'Mayora Gold FX — Komunitas Trading Emas XAU/USD Indonesia | Sinyal & Edukasi Premium',
  desc: 'Platform trading emas (XAU/USD) premium Indonesia. Sinyal XAUUSD akurasi kategori Excelent, live session, journal otomatis & komunitas VIP 500+ trader elite. Daftar GRATIS sekarang!',
  image: 'https://mayoragoldfx.com/og-image.jpg'
};

function updateSeoMeta(o){
  document.title = o.title;
  document.getElementById('meta-desc').setAttribute('content', o.desc);
  document.getElementById('og-title').setAttribute('content', o.title);
  document.getElementById('og-desc').setAttribute('content', o.desc);
  document.getElementById('og-image').setAttribute('content', o.image);
  document.getElementById('tw-title').setAttribute('content', o.title);
  document.getElementById('tw-desc').setAttribute('content', o.desc);
  document.getElementById('tw-image').setAttribute('content', o.image);
}

function resetSeoMeta(){ updateSeoMeta(DEFAULT_META); }

/* ✅ FIX: News Detail — share link pakai ?berita=slug (kompatibel static hosting) */
window.openNews = function(id){
  var n = (window.allNewsCache||[]).find(function(x){return x.id===id;});
  if(!n) return;

  var seoTitle = (n.metaTitle || n.title) + ' — Mayora Gold FX';
  var seoDesc  = (n.metaDescription || n.excerpt || '').substring(0,200);
  var seoImg   = n.imageUrl ? getOptUrl(n.imageUrl, 1200) : DEFAULT_META.image;
  updateSeoMeta({ title: seoTitle, desc: seoDesc, image: seoImg });

  document.getElementById('nd-cat').textContent   = n.cat || '';
  document.getElementById('nd-date').textContent  = fmtDate(n.date || n.createdAt);
  document.getElementById('nd-title').textContent = n.title || '';
  document.getElementById('nd-excerpt').textContent = n.excerpt || '';
  (function(){
    var ex=document.getElementById('nd-excerpt'),box=document.getElementById('nd-src');
    if(!box){box=document.createElement('div');box.id='nd-src';box.className='nd-src';ex.parentNode.insertBefore(box,ex.nextSibling);}
    box.textContent='';
    var p=document.createElement('p');p.className='nd-src-line';
    if(n.srcName||n.srcUrl){
      p.appendChild(document.createTextNode('Sumber: '));
      if(n.srcUrl&&/^https?:\/\//i.test(n.srcUrl)){var a=document.createElement('a');a.href=n.srcUrl;a.target='_blank';a.rel='nofollow noopener noreferrer';a.textContent=n.srcName||n.srcUrl;p.appendChild(a);}
      else p.appendChild(document.createTextNode(n.srcName));
      box.appendChild(p);
    }
    var c=document.createElement('p');c.className='nd-copy';
    c.textContent='Ringkasan ini disusun ulang oleh tim Mayora Gold FX untuk tujuan informasi. Hak cipta artikel asli dimiliki penerbit sumbernya. Bukan saran finansial.';
    box.appendChild(c);
  })();
  document.getElementById('nd-body').textContent  = n.konten || 'Konten lengkap belum tersedia.';

  var imgWrap = document.getElementById('nd-img-wrap');
  var imgEl   = document.getElementById('nd-img');
  if(n.imageUrl){
    imgEl.src = getOptUrl(n.imageUrl, 860);
    imgEl.alt = n.title;
    imgWrap.style.display = 'block';
  } else {
    imgWrap.style.display = 'none';
  }

  /* Update URL supaya artikel bisa di-share & diindex */
  var articleSlug = n.slug || n.id;
  history.pushState({ page: 'berita', slug: articleSlug }, '', '/berita?artikel=' + articleSlug);
  updateCanonical('https://mayoragoldfx.com/berita?artikel=' + articleSlug);

  var shareUrl  = 'https://mayoragoldfx.com/berita?artikel=' + articleSlug;
  var shareText = encodeURIComponent(n.title + '\n\n' + (n.excerpt||'') + '\n\n' + shareUrl);
  document.getElementById('nd-share-wa').href = 'https://wa.me/?text=' + shareText;

  document.getElementById('news-list-view').style.display  = 'none';
  document.getElementById('news-detail-view').style.display = 'block';
  window.scrollTo(0,0);
};

window.closeNewsDetail = function(){
  document.getElementById('news-list-view').style.display  = '';
  document.getElementById('news-detail-view').style.display = '';
  history.pushState({ page: 'berita' }, '', '/berita');
  updateCanonical('https://mayoragoldfx.com/berita');
  resetSeoMeta();
};

function fmtDate(ts){
  if(!ts)return'';
  if(typeof ts==='string')return ts;
  if(ts.toDate)return ts.toDate().toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
  return new Date(ts).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
}
window.fmtDate = fmtDate;

/* Admin form helpers */
document.getElementById('nf-judul')&&document.getElementById('nf-judul').addEventListener('input',function(){
  var slug=generateSlug(this.value);
  var el=document.getElementById('nf-slug-preview');
  if(el) el.textContent=slug?'/?berita='+slug:'—';
});
document.getElementById('nf-excerpt')&&document.getElementById('nf-excerpt').addEventListener('input',function(){
  var n=this.value.length;
  var el=document.getElementById('nf-excerpt-count');
  if(el){el.textContent=n+'/200';el.style.color=n>200?'var(--red)':n>130?'var(--gold)':'var(--text3)';}
});

window.showNewsForm=function(){
  document.getElementById('news-form-wrap').style.display='block';
  document.getElementById('nf-title-lbl').textContent='Tambah Berita Baru';
  document.getElementById('nf-edit-id').value='';
  document.getElementById('nf-old-img-url').value='';
  document.getElementById('nf-judul').value='';
  ['nf-src-name','nf-src-url'].forEach(function(i){var e=document.getElementById(i);if(e)e.value='';});
  document.getElementById('nf-excerpt').value='';
  document.getElementById('nf-konten').value='';
  document.getElementById('nf-tgl').value=new Date().toISOString().slice(0,10);
  document.getElementById('nf-featured').checked=false;
  document.getElementById('nf-foto').value='';
  document.getElementById('nf-excerpt-count').textContent='0/200';
  document.getElementById('nf-slug-preview').textContent='—';
  document.getElementById('nf-save-err').style.display='none';
  clearImg();
  window.scrollTo(0,0);
};
window.hideNewsForm=function(){document.getElementById('news-form-wrap').style.display='none';};

window.previewImg=function(input){
  var file=input.files[0];if(!file)return;
  var wrap=document.getElementById('img-preview-wrap'),img=document.getElementById('img-preview');
  wrap.style.display='block';
  var url=URL.createObjectURL(file);
  img.onload=function(){URL.revokeObjectURL(url);};
  img.src=url;
  document.getElementById('img-current-label').textContent='Gambar baru dipilih';
};
window.clearImg=function(){
  document.getElementById('nf-foto').value='';
  document.getElementById('img-preview-wrap').style.display='none';
  document.getElementById('img-preview').src='';
  document.getElementById('img-current-label').textContent='';
  document.getElementById('nf-old-img-url').value='';
};

/* Toast */
var toastT;
function toast(sym,msg,color){
  document.getElementById('tdot').style.background=color;
  document.getElementById('tsym').textContent=sym;
  document.getElementById('tmsg').textContent=msg;
  var el=document.getElementById('toast');el.classList.add('show');
  if(toastT)clearTimeout(toastT);
  toastT=setTimeout(function(){el.classList.remove('show');},3500);
}
window.toast=toast;

/* Ticker / Price */
var SYM_D={XAUUSD:'XAU/USD',XAUTUSDT:'XAUT/USDT',BTCUSDT:'BTC/USDT',ETHUSDT:'ETH/USDT',SOLUSDT:'SOL/USDT',BNBUSDT:'BNB/USDT',XRPUSDT:'XRP/USDT',DOGEUSDT:'DOGE/USDT',ADAUSDT:'ADA/USDT'};
window.SYM_D=SYM_D;
var TICK_SYMS=['XAUUSD','BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'];
window._lp={};window._prevLp={};

function renderTicker(){
  var items=TICK_SYMS.map(function(s){var p=window._lp[s],prev=window._prevLp[s]||p;if(!p)return'';var up=p>=(prev||p),dec=s==='XAUUSD'?2:(p<1?4:2);return'<div class="ticker-item"><span class="ti-sym">'+SYM_D[s]+'</span><span class="ti-price">'+p.toFixed(dec)+'</span><span class="pb-chg '+(up?'up':'dn')+'">'+(up?'▲':'▼')+'</span><span class="ti-sep">|</span></div>';}).join('');
  document.getElementById('ticker-wrap').innerHTML='<div class="ticker-inner" aria-hidden="true">'+items+items+'</div>';
}
window.renderTicker=renderTicker;

function renderPricebar(){
  document.getElementById('pricebar').innerHTML=TICK_SYMS.map(function(s){var p=window._lp[s],prev=window._prevLp[s]||p;if(!p)return'';var up=p>=(prev||p),dec=s==='XAUUSD'?2:(p<1?4:2);return'<div class="pb-item"><span class="pb-sym">'+SYM_D[s]+'</span><span class="pb-price">'+p.toFixed(dec)+'</span><span class="pb-chg '+(up?'up':'dn')+'">'+(up?'▲':'▼')+'</span></div>';}).join('');
}
window.renderPricebar=renderPricebar;

var xauHistory=[];
var _xau24h={high:null,low:null,prevClose:null};

async function fetch24hXau(){
  // Try goldprice.org — returns open, high, low for the day
  try{
    var r=await fetch('https://data-asg.goldprice.org/dbXRates/USD',{signal:AbortSignal.timeout(6000)});
    var d=await r.json();
    var item=d?.items?.[0];
    if(item){
      if(item.xauHighPrice) _xau24h.high=parseFloat(item.xauHighPrice);
      if(item.xauLowPrice)  _xau24h.low=parseFloat(item.xauLowPrice);
      if(item.xauOpenPrice) _xau24h.prevClose=parseFloat(item.xauOpenPrice);
      return;
    }
  }catch(_){}
  // Fallback: Binance XAUUSDT 24h ticker
  try{
    var r2=await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=XAUUSDT',{signal:AbortSignal.timeout(6000)});
    var d2=await r2.json();
    if(d2.highPrice) _xau24h.high=parseFloat(d2.highPrice);
    if(d2.lowPrice)  _xau24h.low=parseFloat(d2.lowPrice);
    if(d2.openPrice) _xau24h.prevClose=parseFloat(d2.openPrice);
  }catch(_){}
}

function updateHeroCard(p,prev){
  if(!p)return;
  var priceEl=document.getElementById('hcc-price');
  if(!priceEl)return; // hero card sudah dihapus, cukup ticker bar yang jalan
  priceEl.textContent=p.toFixed(2);

  // 24h change: pakai prevClose dari API jika tersedia, fallback ke prev session tick
  var base=_xau24h.prevClose||prev;
  var chgPct=base?((p-base)/base*100):0;
  var el=document.getElementById('hcc-chg');
  el.textContent=(chgPct>=0?'▲ +':'▼ ')+Math.abs(chgPct).toFixed(3)+'%';
  el.className='hcc-change '+(chgPct>=0?'up':'dn');

  xauHistory.push(p);if(xauHistory.length>40)xauHistory.shift();
  if(xauHistory.length>1){
    var mn=Math.min.apply(null,xauHistory),mx=Math.max.apply(null,xauHistory),rng=mx-mn||1;
    var W=400,H=80,pad=8,xS=(W-2*pad)/(xauHistory.length-1),yS=(H-2*pad)/rng;
    var coords=xauHistory.map(function(v,i){return(pad+i*xS).toFixed(1)+','+(H-pad-(v-mn)*yS).toFixed(1);});
    var pts=coords.join(' ');
    var firstX=pad.toFixed(1),lastX=(pad+(xauHistory.length-1)*xS).toFixed(1),floorY=(H-pad).toFixed(1);
    var dPath='M'+firstX+','+floorY+' L'+coords.join(' L')+' L'+lastX+','+floorY+' Z';
    document.getElementById('hcc-line').setAttribute('points',pts);
    document.getElementById('hcc-fill').setAttribute('d',dPath);
  }

  // 24H HIGH & LOW: pakai data API jika tersedia, fallback ke session history
  var highVal = _xau24h.high || Math.max.apply(null,xauHistory);
  var lowVal  = _xau24h.low  || Math.min.apply(null,xauHistory);
  document.getElementById('hcc-high').textContent=highVal.toFixed(2);
  document.getElementById('hcc-low').textContent=lowVal.toFixed(2);
  document.getElementById('hcc-pct').textContent=(chgPct>=0?'+':'')+chgPct.toFixed(2)+'%';
  document.getElementById('hcc-pct').className='hcc-metric-v '+(chgPct>=0?'up':'dn');
}
window.updateHeroCard=updateHeroCard;
