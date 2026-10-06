import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import{getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,sendPasswordResetEmail,updateProfile,GoogleAuthProvider,signInWithPopup}from'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import{getFirestore,doc,getDoc,setDoc,getDocs,collection,addDoc,updateDoc,deleteDoc,query,orderBy,limit,where,serverTimestamp,writeBatch,onSnapshot}from'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const FB={
  apiKey:"AIzaSyClc59Muo0ajiNjvC5s0rq74BtDrce6rp8",
  authDomain:"journal-97254.firebaseapp.com",
  projectId:"journal-97254",
  storageBucket:"journal-97254.firebasestorage.app",
  messagingSenderId:"101188824456",
  appId:"1:101188824456:web:a0ca25a26e63704b361e3d"
};

const CLOUDINARY_CLOUD  = 'dktcrzfck';
const CLOUDINARY_PRESET = 'mayoragold_preset';
const CLOUDINARY_URL    = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

const app=initializeApp(FB),auth=getAuth(app),db=getFirestore(app);
window._db=db;
window.getDB=function(){return window._db;};
window._fsQuery=query;window._fsCollection=collection;window._fsOnSnapshot=onSnapshot;window._fsOrderBy=orderBy;window._fsWhere=where;
/* Beri tahu semua pemanggil (goPage, deep-link handler, dll) bahwa Firebase sudah siap dipakai */
window._fbReadyResolve && window._fbReadyResolve();

let trades=[],isVip=false,isAdmin=false,tickInterval=null,saveDebounce=null;
window._curUser=null;
window.allNewsCache=[];

function fmsg(c){return({'auth/user-not-found':'Akun tidak ditemukan.','auth/wrong-password':'Password salah.','auth/invalid-credential':'Email atau password salah.','auth/email-already-in-use':'Email sudah terdaftar.','auth/invalid-email':'Format email tidak valid.','auth/weak-password':'Password terlalu lemah.','auth/too-many-requests':'Terlalu banyak percobaan. Tunggu sebentar.'})[c]||'Error: '+c;}

function setBtnLoad(id,loading,txt){
  const b=document.getElementById(id);if(!b)return;
  b.disabled=loading;
  b.innerHTML=loading?'<div class="spin"></div>':`<span>${txt}</span>`;
}

/* ═══ GLOBAL IMAGE COMPRESS — dipakai semua upload ke Cloudinary ═══
   Max 1200px, quality 0.82, output WebP. Kalau sudah kecil, skip.       */
function compressImage(file, maxPx, quality){
  maxPx = maxPx || 1200;
  quality = quality || 0.82;
  return new Promise(function(resolve){
    if(file.size < 300*1024){
      // Sudah kecil, langsung pakai
      resolve(file); return;
    }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function(){
      URL.revokeObjectURL(url);
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, maxPx / Math.max(w, h));
      if(scale === 1 && file.size < 500*1024){ resolve(file); return; }
      var canvas = document.createElement('canvas');
      canvas.width  = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function(blob){ resolve(blob || file); }, 'image/webp', quality);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
window.compressImage = compressImage;

async function uploadToCloudinary(file, filename, onProgress){
  file = await compressImage(file);
  return new Promise((resolve, reject)=>{
    const formData = new FormData();
    formData.append('file', file, filename + '.webp');
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('folder', 'news-images');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CLOUDINARY_URL);
    xhr.upload.onprogress = e => {
      if(e.lengthComputable) onProgress && onProgress(Math.round(e.loaded/e.total*100));
    };
    xhr.onload = () => {
      if(xhr.status === 200){
        try { resolve(JSON.parse(xhr.responseText).secure_url); }
        catch(e){ reject(new Error('Gagal parse response Cloudinary.')); }
      } else {
        let msg = 'Upload gagal (HTTP '+xhr.status+')';
        try{ const err=JSON.parse(xhr.responseText); msg=err.error?.message||msg; }catch(_){}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Upload gagal. Periksa koneksi internet.'));
    xhr.send(formData);
  });
}

function setUploadProgress(pct, label=''){
  const wrap=document.getElementById('upload-prog');
  const bar=document.getElementById('upload-prog-bar');
  const lbl=document.getElementById('upload-prog-label');
  const show=pct>0&&pct<100;
  if(wrap) wrap.style.display=show?'block':'none';
  if(bar)  bar.style.width=pct+'%';
  if(lbl){ lbl.style.display=show?'block':'none'; lbl.textContent=label; }
}

async function ensureUniqueSlug(baseSlug, editId=null){
  let slug=baseSlug, counter=2;
  while(true){
    const q=query(collection(db,'news'),where('slug','==',slug));
    const snap=await getDocs(q);
    const conflict=snap.docs.filter(d=>d.id!==editId);
    if(conflict.length===0) return slug;
    slug=`${baseSlug}-${counter}`; counter++;
  }
}

window.saveNews = async ()=>{
  const errEl = document.getElementById('nf-save-err');
  errEl.style.display = 'none';
  const judul   = document.getElementById('nf-judul').value.trim();
  const excerpt = document.getElementById('nf-excerpt').value.trim();
  const konten  = document.getElementById('nf-konten').value.trim();
  const tgl     = document.getElementById('nf-tgl').value;
  const kat     = document.getElementById('nf-kat').value;
  const featured= document.getElementById('nf-featured').checked;
  const srcName = (document.getElementById('nf-src-name')?.value||'').trim().slice(0,80);
  let srcUrl = (document.getElementById('nf-src-url')?.value||'').trim();
  if(srcUrl && !/^https?:\/\//i.test(srcUrl)) srcUrl='';
  if(!judul||!excerpt||!tgl){
    errEl.textContent='⚠ Judul, Tanggal, dan Ringkasan wajib diisi.';
    errEl.style.display='block'; return;
  }
  const btn = document.getElementById('btn-save-news');
  btn.disabled=true;
  btn.innerHTML='<div class="spin" style="border-top-color:var(--bg)"></div>';
  setUploadProgress(0);
  try{
    const editId    = document.getElementById('nf-edit-id').value||null;
    const oldImgUrl = document.getElementById('nf-old-img-url').value||'';
    const fileInput = document.getElementById('nf-foto');
    const file      = fileInput?.files?.[0]||null;
    const slug = await ensureUniqueSlug(generateSlug(judul), editId);
    let imageUrl = oldImgUrl;
    if(file){
      setUploadProgress(10, 'Mengunggah ke Cloudinary...');
      imageUrl = await uploadToCloudinary(file, slug, pct => {
        setUploadProgress(10 + Math.round(pct * 0.8), `Mengunggah gambar... ${pct}%`);
      });
    }
    setUploadProgress(92, 'Menyimpan ke database...');
    if(featured){
      const snap = await getDocs(query(collection(db,'news')));
      await Promise.all(snap.docs
        .filter(d=>d.id!==editId&&d.data().featured)
        .map(d=>updateDoc(doc(db,'news',d.id),{featured:false})));
    }
    const payload={
      title:judul, slug, cat:kat, date:tgl, excerpt, konten, featured, imageUrl, srcName, srcUrl,
      metaTitle:judul,
      metaDescription:excerpt.substring(0,200),
      updatedAt:serverTimestamp(),
    };
    if(editId){ await updateDoc(doc(db,'news',editId),payload); }
    else { payload.createdAt=serverTimestamp(); await addDoc(collection(db,'news'),payload); }
    setUploadProgress(100);
    setTimeout(()=>setUploadProgress(0),400);
    toast('Admin', editId?'Berita diperbarui!':'Berita ditambahkan!', '#3DBA7A');
    hideNewsForm();
    await renderAdminNewsList();
  }catch(e){
    console.error('[saveNews]',e);
    errEl.textContent='⚠ '+(e.message||'Terjadi kesalahan. Coba lagi.');
    errEl.style.display='block';
    toast('Error',e.message||'Gagal simpan','#E05A5A');
    setUploadProgress(0);
  }finally{
    btn.disabled=false;
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Berita';
  }
};

onAuthStateChanged(auth, async user=>{
  try{
    if(user){
      window._curUser = user;
      await loadData(user.uid);
      startRoleListener(user);
      showLoggedIn(user);
      refreshRoleDependentViews();
      setBtnLoad('li-btn',false,'Sign In →');
      setBtnLoad('ri-btn',false,'Buat Akun →');
      resetGoogleBtn();
      const activePage = document.querySelector('.page.active');
      if(activePage&&activePage.id==='page-auth'){
        const isReg = document.getElementById('form-reg').classList.contains('on');
        const okEl  = document.getElementById(isReg?'ri-ok':'li-ok');
        if(okEl) okEl.style.display='block';
        setTimeout(()=>{
          if(okEl) okEl.style.display='none';
          goPage(isAdmin?'admin':'home');
          toast('Selamat datang','Login berhasil!','#3DBA7A');
        },900);
      }
    }else{
      stopRoleListener();
      resetAuthForms();
      window._curUser=null; isVip=false; isAdmin=false;
      window._isVip=false; window._isAdmin=false;
      document.getElementById('nav-guest').style.display='block';
      document.getElementById('nav-loggedin').style.display='none';
      document.getElementById('nl-admin').style.display='none';
      document.getElementById('mob-admin-link').style.display='none';
      const vdmMship=document.getElementById('vdm-membership');
      if(vdmMship) vdmMship.style.display='block';
      const vdmJ=document.getElementById('vdm-journal');
      if(vdmJ) vdmJ.style.display='none';
      const mobMembership=document.getElementById('mob-vdm-membership');
      if(mobMembership)mobMembership.style.display='block';
      const mobLoginBtn=document.getElementById('mob-login-btn');
      if(mobLoginBtn)mobLoginBtn.style.display='block';
      const mobVipBtn=document.getElementById('mob-vip-btn');
      if(mobVipBtn)mobVipBtn.style.display='block';
      const mobLogoutBtn=document.getElementById('mob-logout-btn');
      if(mobLogoutBtn)mobLogoutBtn.style.display='none';
      stopTick();
    }
  }catch(err){ console.error('onAuthStateChanged error:',err); }
  finally{
    window._authReadyResolve && window._authReadyResolve();
    document.getElementById('loader').classList.add('out');
  }
});

/* Render ulang tampilan yang bergantung pada status VIP (modul, research, konsultasi, kuota AI).
   Dipanggil setelah login/refresh selesai & saat status VIP berubah, supaya kartu modul tidak tetap
   terkunci gara-gara sempat dirender sebelum status VIP diketahui. */
function refreshRoleDependentViews(){
  try{ if(window._modAllModules && window.modLoadModules) window.modLoadModules(); }catch(e){ console.warn(e); }
  try{ window.rsRenderPublic && window.rsRenderPublic(); }catch(e){ console.warn(e); }
  try{ window._consultOnRoleChange && window._consultOnRoleChange(); }catch(e){ console.warn(e); }
  try{ window.aiRenderQuota && window.aiRenderQuota(); }catch(e){ console.warn(e); }
}

function showLoggedIn(user){
  const name=user.displayName||user.email.split('@')[0];
  document.getElementById('nav-guest').style.display='none';
  document.getElementById('nav-loggedin').style.display='block';
  const mobLoginBtn=document.getElementById('mob-login-btn');
  if(mobLoginBtn)mobLoginBtn.style.display='none';
  const mobVipBtn=document.getElementById('mob-vip-btn');
  if(mobVipBtn)mobVipBtn.style.display='none';
  const mobLogoutBtn=document.getElementById('mob-logout-btn');
  if(mobLogoutBtn)mobLogoutBtn.style.display='block';
  document.getElementById('nav-avatar').textContent=name.charAt(0).toUpperCase();
  document.getElementById('nav-uname').textContent=name;
  document.getElementById('nav-vip-pill').style.display=isVip?'block':'none';
  document.getElementById('nav-admin-pill').style.display=isAdmin?'block':'none';
  document.getElementById('nl-admin').style.display=isAdmin?'block':'none';
  document.getElementById('mob-admin-link').style.display=isAdmin?'block':'none';
  document.getElementById('ap-avatar').textContent=name.charAt(0).toUpperCase();
  document.getElementById('ap-uname').textContent=name;
  document.getElementById('ap-vip').style.display=isVip?'block':'none';
  document.getElementById('btn-newtrade').style.display=isVip||isAdmin?'block':'none';
  document.getElementById('danger-vip').style.display=isVip||isAdmin?'block':'none';
  document.getElementById('acc-email').textContent=user.email;
  document.getElementById('acc-name').textContent=name;
  document.getElementById('acc-trades').textContent=trades.length+' trades';
  document.getElementById('acc-status').innerHTML=isAdmin?'<span style="color:var(--green)">Administrator</span>':isVip?'<span style="color:var(--gold)">VIP Member</span>':'<span style="color:var(--text3)">Regular — hubungi admin untuk upgrade</span>';
  document.getElementById('adm-avatar').textContent=name.charAt(0).toUpperCase();
  document.getElementById('adm-uname').textContent=name;
  const vdmMembership=document.getElementById('vdm-membership');
  if(vdmMembership) vdmMembership.style.display='block';
  const vdmJournal=document.getElementById('vdm-journal');
  if(vdmJournal) vdmJournal.style.display=(isVip||isAdmin)?'block':'none';
  const mobMembership=document.getElementById('mob-vdm-membership');
  if(mobMembership)mobMembership.style.display=(isVip||isAdmin)?'none':'block';
  ['dash','hist','notes'].forEach(k=>{
    document.getElementById('vip-lock-'+k).style.display=(isVip||isAdmin)?'none':'block';
    document.getElementById('vip-cnt-'+k).style.display=(isVip||isAdmin)?'block':'none';
  });
  /* Standalone tool pages VIP lock */
  ['calc','swap','ai'].forEach(k=>{
    var lockEl=document.getElementById('vip-lock-'+k);
    var cntEl=document.getElementById('vip-cnt-'+k);
    if(lockEl) lockEl.style.display=(isVip||isAdmin)?'none':'block';
    if(cntEl) cntEl.style.display=(isVip||isAdmin)?'block':'none';
  });
  /* Kalender is standalone FREE page, no lock needed */
  if(isVip||isAdmin){window._startEcalListener&&window._startEcalListener();window._renderEcal&&window._renderEcal();}
  setSaveStatus('saved');
  renderAll();
  startTick();
}

window.doLogin = async ()=>{
  const email=document.getElementById('li-email').value.trim();
  const pass=document.getElementById('li-pass').value;
  const err=document.getElementById('li-err');
  err.textContent='';
  document.getElementById('li-ok').style.display='none';
  if(!email||!pass){ err.textContent='Email dan password diperlukan.'; return; }
  setBtnLoad('li-btn',true,'Sign In →');
  try{ await signInWithEmailAndPassword(auth,email,pass); }
  catch(e){ err.textContent=fmsg(e.code); setBtnLoad('li-btn',false,'Sign In →'); }
};

window.doRegister = async ()=>{
  const name=document.getElementById('ri-name').value.replace(/[<>]/g,'').trim().slice(0,50),email=document.getElementById('ri-email').value.trim(),pass=document.getElementById('ri-pass').value;
  const err=document.getElementById('ri-err');err.textContent='';document.getElementById('ri-ok').style.display='none';
  if(!name||!email||!pass){err.textContent='Semua field harus diisi.';return;}
  if(pass.length<6){err.textContent='Password minimal 6 karakter.';return;}
  setBtnLoad('ri-btn',true,'Buat Akun →');
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await updateProfile(cred.user,{displayName:name});
    await setDoc(doc(db,'users',cred.user.uid),{displayName:name,email,vip:false,admin:false,createdAt:serverTimestamp()});
  }catch(e){document.getElementById('ri-err').textContent=fmsg(e.code);setBtnLoad('ri-btn',false,'Buat Akun →');}
};

/* Simpan tampilan asli tombol Google supaya bisa dikembalikan setelah spinner */
var GOOGLE_BTN_HTML = (document.getElementById('google-btn')||{}).innerHTML || '';
function resetGoogleBtn(){
  const b = document.getElementById('google-btn');
  if(!b) return;
  b.disabled = false;
  if(GOOGLE_BTN_HTML && !b.querySelector('svg')) b.innerHTML = GOOGLE_BTN_HTML;   // hanya kalau isinya sedang spinner
}
function resetAuthForms(){
  resetGoogleBtn();
  setBtnLoad('li-btn',false,'Sign In →');
  setBtnLoad('ri-btn',false,'Buat Akun →');
  ['li-err','ri-err'].forEach(id=>{ const e=document.getElementById(id); if(e) e.textContent=''; });
}

window.doLogout = async ()=>{
  try{ await signOut(auth); }
  catch(e){ console.error('[logout]',e); toast('Error','Gagal logout, coba lagi','#E05A5A'); return; }
  resetAuthForms();
  goPage('home');
  toast('Mayora GFX','Logout berhasil','#C9A84C');
};

/* ── Google Sign-In ── */
window.doGoogleLogin = async ()=>{
  const btn = document.getElementById('google-btn');
  if(btn && btn.disabled) return;                 // cegah klik ganda / popup dobel
  const errEl = document.getElementById('li-err');
  if(errEl) errEl.textContent = '';
  if(btn){ btn.disabled = true; btn.innerHTML = '<div class="spin"></div>'; }
  try{
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });   // selalu tampilkan pilihan akun setelah logout
    const cred = await signInWithPopup(auth, provider);
    /* Ensure user doc exists in Firestore */
    const userRef = doc(db,'users',cred.user.uid);
    const snap = await getDoc(userRef);
    if(!snap.exists()){
      await setDoc(userRef,{
        displayName: String(cred.user.displayName||cred.user.email.split('@')[0]).replace(/[<>]/g,'').slice(0,50),
        email: cred.user.email,
        vip: false, admin: false, createdAt: serverTimestamp()
      });
    }
  }catch(e){
    console.error('[google login]', e);
    const msgs = {
      'auth/popup-closed-by-user': 'Login dibatalkan.',
      'auth/cancelled-popup-request': '',
      'auth/popup-blocked': 'Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.',
      'auth/network-request-failed': 'Koneksi bermasalah. Cek internet lalu coba lagi.',
      'auth/unauthorized-domain': 'Domain ini belum diizinkan di Firebase (Authentication → Settings → Authorized domains).',
      'auth/account-exists-with-different-credential': 'Email ini sudah terdaftar dengan metode login lain (email & password).'
    };
    if(errEl) errEl.textContent = (e.code in msgs) ? msgs[e.code] : fmsg(e.code);
  }finally{
    resetGoogleBtn();      // SELALU kembalikan tombol, sukses maupun gagal
  }
};

/* ── Forgot Password Modal ── */
window.openForgotPassword = function(){
  const liEmail = document.getElementById('li-email').value.trim();
  if(liEmail) document.getElementById('fp-email').value = liEmail;
  document.getElementById('fp-err').style.display='none';
  document.getElementById('fp-ok').style.display='none';
  document.getElementById('fp-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('fp-email').focus(),100);
};
window.closeForgotPassword = function(){
  document.getElementById('fp-overlay').classList.remove('open');
};
window.doForgotPassword = async ()=>{
  const email = document.getElementById('fp-email').value.trim();
  const errEl = document.getElementById('fp-err');
  const okEl  = document.getElementById('fp-ok');
  const btn   = document.getElementById('fp-btn');
  errEl.style.display='none'; okEl.style.display='none';
  if(!email){ errEl.textContent='Masukkan email kamu.'; errEl.style.display='block'; return; }
  btn.disabled=true; btn.innerHTML='<div class="spin" style="border-top-color:var(--bg)"></div>';
  try{
    await sendPasswordResetEmail(auth, email);
    okEl.style.display='block';
    btn.innerHTML='✓ Terkirim';
    setTimeout(()=>{ closeForgotPassword(); btn.disabled=false; btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Kirim Link Reset'; }, 3000);
  }catch(e){
    errEl.textContent = fmsg(e.code)||'Gagal mengirim email. Cek kembali alamat email.';
    errEl.style.display='block';
    btn.disabled=false;
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Kirim Link Reset';
  }
};
/* Close forgot password overlay on backdrop click */
document.getElementById('fp-overlay').addEventListener('click', function(e){
  if(e.target===this) closeForgotPassword();
});

window.doReset = async ()=>{
  const email=window._curUser?.email;if(!email)return;
  try{
    await sendPasswordResetEmail(auth,email);
    const ok=document.getElementById('reset-ok');ok.style.display='block';
    setTimeout(()=>ok.style.display='none',5000);
    toast('MGF','Reset email dikirim!','#3DBA7A');
  }catch(e){toast('MGF',fmsg(e.code),'#E05A5A');}
};

/* ===== Realtime listener role user (VIP/Admin) — VIP langsung aktif tanpa re-login ===== */
var _roleUnsub=null;
function stopRoleListener(){ if(_roleUnsub){ try{_roleUnsub();}catch(e){} _roleUnsub=null; } }
function startRoleListener(user){
  stopRoleListener();
  try{
    _roleUnsub=onSnapshot(doc(db,'users',user.uid),snap=>{
      if(!snap.exists()) return;
      const d=snap.data();
      const nv=d.vip===true, na=d.admin===true;
      if(nv===isVip && na===isAdmin) return;      /* tidak ada perubahan role */
      const wasVip=isVip;
      isVip=nv; isAdmin=na;
      window._isVip=nv; window._isAdmin=na;
      showLoggedIn(window._curUser||user);        /* refresh semua UI: pill, lock, menu */
      refreshRoleDependentViews();
      if(!wasVip&&nv) toast('MGF','Akun VIP kamu sudah aktif','#C9A84C');
      else if(wasVip&&!nv&&!na) toast('MGF','Status VIP kamu dicabut','#E05A5A');
    },err=>console.warn('[role listener]',err));
  }catch(e){ console.warn('[role listener] gagal start:',e); }
}

async function loadData(uid){
  try{
    const snap=await getDoc(doc(db,'users',uid));
    if(snap.exists()){
      const d=snap.data();
      isVip   = d.vip===true;
      isAdmin = d.admin===true;
      window._isVip=isVip;window._isAdmin=isAdmin;
      const ts=d.updatedAt?.toDate();
      if(ts) document.getElementById('acc-lastsave').textContent=ts.toLocaleString('id-ID');
    }else{
      isVip=false;isAdmin=false;
      window._isVip=false;window._isAdmin=false;
      await setDoc(doc(db,'users',uid),{
        displayName:String(window._curUser?.displayName||'').replace(/[<>]/g,'').slice(0,50),
        email:window._curUser?.email||'',
        vip:false,admin:false,createdAt:serverTimestamp()
      });
    }
    await loadTrades(uid);
  }catch(e){
    console.error('loadData error:',e);
    trades=[];isVip=false;isAdmin=false;
  }
}

async function loadTrades(uid){
  try{
    const q=query(collection(db,'users',uid,'trades'),orderBy('createdAt','desc'),limit(200));
    const snap=await getDocs(q);
    trades=[];
    snap.forEach(d=>trades.push({_docId:d.id,...d.data()}));
    trades.forEach((t,i)=>{ if(!t.id) t.id=t._docId; });
    document.getElementById('acc-trades').textContent=trades.length+' trades';
  }catch(e){
    console.error('loadTrades error:',e);
    trades=[];
  }
}

async function persistOneTrade(t){
  if(!window._curUser) return;
  setSaveStatus('saving');
  try{
    const uid=window._curUser.uid;
    const payload={
      symbol:t.symbol,dir:t.dir,type:t.type,activated:t.activated||false,
      entry:t.entry,exit:t.exit??null,size:t.size,
      sl:t.sl??null,tp:t.tp??null,
      date:t.date,notes:t.notes||'',tag:t.tag||'',
      closedReason:t.closedReason??null,date_close:t.date_close??null,
      updatedAt:serverTimestamp(),
    };
    if(t._docId){
      await updateDoc(doc(db,'users',uid,'trades',t._docId),payload);
    }else{
      payload.createdAt=serverTimestamp();
      const ref=await addDoc(collection(db,'users',uid,'trades'),payload);
      t._docId=ref.id;
      t.id=ref.id;
    }
    await setDoc(doc(db,'users',uid),{updatedAt:serverTimestamp()},{merge:true});
    setSaveStatus('saved');
    document.getElementById('acc-lastsave').textContent=new Date().toLocaleString('id-ID');
  }catch(e){
    console.error('persistOneTrade:',e);
    setSaveStatus('error');
  }
}

function triggerSave(){
  setSaveStatus('saving');
  clearTimeout(saveDebounce);
  saveDebounce=setTimeout(async()=>{
    if(!window._curUser) return;
    try{
      await Promise.all(trades.map(t=>persistOneTrade(t)));
      setSaveStatus('saved');
    }catch(e){ setSaveStatus('error'); }
  },1200);
}
function setSaveStatus(s){
  const el=document.getElementById('save-status'),lb=document.getElementById('save-lbl');
  el.className='save-status '+s;
  lb.textContent=s==='saved'?'Saved':s==='saving'?'Saving...':s==='error'?'Error':'—';
}

async function loadNewsFromDB(){
  /* De-dupe: kalau ada fetch yang lagi jalan (misal dipicu bareng oleh
     goPage('berita') DAN handler slug artikel), pakai fetch yang sama —
     jangan query Firestore dua kali secara paralel. */
  if(window._newsFetchInFlight) return window._newsFetchInFlight;

  const fetchPromise=(async function(){
    const q=query(collection(db,'news'),orderBy('createdAt','desc'));
    const snap=await getDocs(q);
    const arr=[];snap.forEach(d=>arr.push({id:d.id,...d.data()}));
    window.allNewsCache=arr;
    /* Cek apakah ada artikel yang sedang menunggu untuk dibuka (dari deep link) */
    if(window._pendingArticleSlug){
      var pending=window._pendingArticleSlug;
      var found=arr.find(function(n){return n.slug===pending||n.id===pending;});
      if(found){
        window._pendingArticleSlug=null;
        goPage('berita');
        setTimeout(function(){window.openNews(found.id);},150);
      }
    }
    return arr;
  })();
  window._newsFetchInFlight=fetchPromise;
  fetchPromise.finally(function(){ window._newsFetchInFlight=null; });

  /* Timeout 7 detik cuma supaya user gak nunggu lama tanpa kepastian —
     kalau kelewat, tampilkan dulu data statis. TAPI fetchPromise di atas
     TETAP JALAN di background (tidak dibatalkan/dibuang). Begitu dia
     selesai — walau telat — tampilan di-refresh diam-diam dengan data
     ASLI, supaya user tidak nyangkut lihat berita dummy/gagal padahal
     datanya sebenarnya berhasil dimuat. */
  const timeout=new Promise(res=>setTimeout(()=>res('__TIMEOUT__'),3000));
  const winner=await Promise.race([fetchPromise, timeout]);
  if(winner!=='__TIMEOUT__') return winner;

  fetchPromise.then(function(arr){
    var onBerita=document.getElementById('page-berita')&&document.getElementById('page-berita').classList.contains('active');
    if(onBerita) window._renderNewsFromData&&window._renderNewsFromData(arr);
  }).catch(function(){ /* fetch akhirnya gagal juga — biarkan, halaman sudah nampilin fallback statis */ });

  return getStaticNews();
}

function getStaticNews(){
  return[
    {id:'s1',cat:'Market Update',title:'Harga Emas Catat Level Tertinggi di Tengah Ketegangan Geopolitik',date:'5 Jun 2026',excerpt:'Harga emas spot menguat signifikan dalam perdagangan sesi Asia, didukung meningkatnya permintaan safe haven akibat ketegangan di kawasan Timur Tengah dan kekhawatiran inflasi global.',featured:true,imageUrl:'',slug:'harga-emas-catat-level-tertinggi',konten:'Analisa pasar lebih lanjut: Harga emas spot terus mendapat dukungan dari aliran safe haven di tengah meningkatnya ketidakpastian geopolitik. Trader memperhatikan level resistance 2380 sebagai target jangka pendek, dengan support kuat di 2310.\n\nDari sisi fundamental, inflasi AS yang masih elevated membatasi ruang penurunan suku bunga Fed, yang secara historis menjadi katalis bullish untuk emas.'},
    {id:'s2',cat:'Analisa Teknikal',title:'XAU/USD: Breakout Struktur Weekly — Potensi Target 2400',date:'4 Jun 2026',excerpt:'Analisa market structure pada timeframe weekly menunjukkan potensi breakout yang valid di atas resistance kunci 2350.',featured:false,imageUrl:'',slug:'xauusd-breakout-struktur-weekly',konten:'Analisa Teknikal Detail:\n\nTimeframe Weekly menunjukkan Break of Structure (BOS) yang valid di atas 2350. Area ini sebelumnya merupakan swing high yang belum di-mitigasi, menandakan interest institusional yang kuat.\n\nSetup:\n- Entry: 2342-2348 (area premium OB H4)\n- Stop Loss: 2320\n- Take Profit 1: 2375\n- Take Profit 2: 2400\n\nWin rate setup serupa dalam 6 bulan terakhir: 82%'},
    {id:'s3',cat:'Edukasi',title:'Memahami Smart Money Concept dalam Trading Emas XAU/USD',date:'3 Jun 2026',excerpt:'Panduan lengkap menggunakan SMC untuk mengidentifikasi order block dan fair value gap pada pair XAU/USD.',featured:false,imageUrl:'',slug:'memahami-smart-money-concept-trading-emas',konten:'Smart Money Concept (SMC) — Panduan Lengkap untuk XAU/USD\n\n1. Order Block (OB)\nArea harga di mana institusi besar menempatkan order. Ditandai dengan candle bearish/bullish sebelum gerakan impulsif yang besar.\n\n2. Fair Value Gap (FVG)\nKesenjangan harga yang terjadi saat pergerakan terlalu cepat. Market cenderung kembali mengisi FVG sebelum melanjutkan tren.\n\n3. Liquidity Sweep\nPergerakan harga yang menjebak retail trader sebelum reversal. Biasanya terjadi di area stop loss yang obvious (swing high/low).'},
    {id:'s4',cat:'Sinyal',title:'Setup BUY XAU/USD — Konfirmasi Rejection dari OB H4',date:'2 Jun 2026',excerpt:'Tim analis Mayora Gold FX mengidentifikasi setup buy dengan risk-reward 1:3.2 dari order block H4 yang valid.',featured:false,imageUrl:'',slug:'setup-buy-xauusd-ob-h4',konten:'BUKAN SARAN INVESTASI — hanya untuk edukasi\n\nSetup Teknikal:\nSymbol: XAU/USD\nDirection: BUY\nEntry Zone: 2315-2320\nStop Loss: 2302\nTake Profit: 2358\nRisk:Reward: 1:3.2\n\nRationale:\n- Rejection kuat dari OB H4 yang valid\n- FVG H1 sudah terisi sepenuhnya\n- Market structure H4 masih bullish (Higher High, Higher Low)\n- Volume relatif tinggi di area entry'},
    {id:'s5',cat:'Market Update',title:'Fed Pertahankan Suku Bunga — Emas Merespons Positif',date:'1 Jun 2026',excerpt:'Keputusan Federal Reserve mempertahankan suku bunga memberikan sentimen positif terhadap harga emas global.',featured:false,imageUrl:'',slug:'fed-pertahankan-suku-bunga-emas-positif',konten:'FOMC Meeting Update\n\nFederal Reserve memutuskan untuk mempertahankan suku bunga di level 5.25-5.50% dalam pertemuan terbaru. Keputusan ini sesuai ekspektasi pasar namun statement Powell yang dovish memberikan dorongan tambahan bagi emas.\n\nImplikasi untuk XAU/USD:\n- Jangka pendek: Bullish bias, target 2350-2380\n- Jangka menengah: Tergantung data inflasi PCE minggu depan\n- Support kuat: 2290-2300'},
  ];
}

function renderNewsFromData(newsData){
  const main=document.getElementById('news-main');
  const featured=newsData.find(n=>n.featured)||newsData[0];
  let html='';
  if(featured){
    const featImg=featured.imageUrl?getOptUrl(featured.imageUrl,780):'';
    html+=`<div class="news-featured" onclick="openNews('${featured.id}')" role="article" tabindex="0">
      <div class="news-featured-thumb img-ar-16-9">
        ${featImg
          ?`<img src="${featImg}" alt="${featured.title}" loading="lazy">`
          :`<svg viewBox="0 0 200 80" width="100%" height="100%" style="opacity:.06;position:absolute;inset:0"><path d="M0,40 Q50,10 100,40 T200,40" stroke="#C9A84C" stroke-width="2" fill="none"/></svg><svg viewBox="0 0 60 60" width="60" height="60" style="position:absolute"><circle cx="30" cy="30" r="28" stroke="#C9A84C" stroke-width="1" fill="none" stroke-dasharray="4 4"/></svg>`
        }
        <div class="nf-cat">${featured.cat}</div>
      </div>
      <div class="news-featured-body">
        <div class="nf-date">${fmtDate(featured.date||featured.createdAt)}</div>
        <h2 class="nf-title">${featured.title}</h2>
        <p class="nf-excerpt">${featured.excerpt}</p>
      </div>
    </div>`;
  }
  html+='<div class="news-list">';
  newsData.filter(n=>n!==featured).forEach(n=>{
    const thumb=n.imageUrl?getOptUrl(n.imageUrl,120):'';
    html+=`<article class="news-card" onclick="openNews('${n.id}')" tabindex="0">
      ${thumb
        ?`<div class="nc-thumb"><img src="${thumb}" alt="${n.title}" loading="lazy"></div>`
        :'<div class="nc-cat-dot" aria-hidden="true"></div>'
      }
      <div class="nc-body">
        <div class="nc-cat">${n.cat}</div>
        <h3 class="nc-title">${n.title}</h3>
        <div class="nc-date">${fmtDate(n.date||n.createdAt)}</div>
      </div>
    </article>`;
  });
  html+='</div>';
  main.innerHTML=html;
  if(window._enhanceMotion) window._enhanceMotion(main);

  const pw=document.getElementById('price-widget');
  const pRows=[['XAU/USD',window._lp?.XAUUSD,'up'],['BTC/USDT',window._lp?.BTCUSDT,'up'],['ETH/USDT',window._lp?.ETHUSDT,'dn']];
  pw.innerHTML=`<div class="pw-header">Live Prices</div>`+pRows.map(([s,p,c])=>`<div class="pw-row"><span class="pw-sym">${s}</span><span class="pw-price">${typeof p==='number'?p.toFixed(2):'—'}</span><span class="pw-chg ${c}">${c==='up'?'▲':'▼'}</span></div>`).join('');

  const aside=document.getElementById('news-aside');
  aside.innerHTML=`<div class="nsc-header">Artikel Terpopuler</div>`+newsData.slice(0,4).map(a=>`<div class="nsc-item" onclick="openNews('${a.id}')"><div class="nsc-title">${a.title}</div><div class="nsc-meta">${fmtDate(a.date||a.createdAt)}</div></div>`).join('');
}
window._renderNewsFromData=renderNewsFromData;

async function renderNews(){
  /* Kalau lagi nampilin skeleton kosong, jangan diapa-apain — biarin animasi
     jalan sampai data datang, biar gak keliatan "kosong" ke user. */
  const main=document.getElementById('news-main');
  if(main && main.querySelector('.news-skel')===null && main.innerHTML.trim()===''){
    main.innerHTML='<div class="news-skel" aria-hidden="true"><div class="news-skel-feat"></div><div class="news-skel-row"></div><div class="news-skel-row"></div><div class="news-skel-row"></div></div>';
  }
  const newsData=await loadNewsFromDB();
  renderNewsFromData(newsData);
}
window._renderNews=renderNews;

/* ===== ECONOMIC CALENDAR — Shared Firestore Cache + FCS API ===== */
/*
  ARSITEKTUR:
  - Firestore doc: _cache/ecal_current
      { data: [...], fetchedAt: timestamp, weekKey: 'YYYY-Www' }
  - Satu user fetch FCS → simpan ke Firestore → semua user lain baca dari Firestore
  - FCS hanya dipanggil kalau cache Firestore expired (beda minggu / >23 jam)
  - actual update: onSnapshot Firestore → realtime ke semua user tanpa poll FCS

  TTL LOGIC (anti-kelewat news):
  - Cache Firestore expire kalau weekKey beda (ganti minggu) ATAU >23 jam
  - Saat window aktif event (5 menit sebelum s/d 10 menit setelah rilis):
      → 1 "fetcher" call FCS tiap 30 detik → update Firestore
      → semua user lain dapat update via onSnapshot (0 FCS call tambahan)
  - Fetcher dipilih pakai lock di Firestore (_cache/ecal_lock) agar tidak double fetch

  ESTIMASI CREDIT FCS (500/bulan):
  - Refresh jadwal: 1/hari × 30 hari = 30
  - Poll actual saat event aktif: ~8 event/minggu × 20 poll = 160/bulan
  - Total: ~190/bulan (terlepas berapa pun user online) ✅
*/

window._ecalData=[];
window._ecalPoll=null;
window._ecalUnsub=null; // Firestore onSnapshot unsubscribe

/* FCS API keys — fallback otomatis kalau key 1 limit/error, coba key 2, lalu key 3 */
const FCS_KEYS=[
  'bo2IiWM3oqzDHapogHRNTg', // Key 1 (utama)
  'qraH0LeaQTs8uA0lqHKe2lG106w6G4',  // Key 2 (cadangan 1)
  'RbArIRNcpqR6tSpNo2La',  // Key 3 (cadangan 2)
];
/* Simpan index key aktif di memory (reset tiap reload) */
window._fcsKeyIdx = window._fcsKeyIdx ?? 0;

/* ===== DAFTAR NEWS HIGH IMPACT — hanya yang benar-benar market mover XAU/USD ===== */
/*
  FILOSOFI:
  - High = benar-benar menggerakkan XAU/USD signifikan (Fed, inflasi, NFP, GDP)
  - Semua yang lain → Medium, meskipun FCS kasih importance=2
  - Lebih baik false negative (High terlewat) daripada false positive (banyak noise)
*/
const TRUE_HIGH_KEYWORDS=[

  /* ── FOMC / Fed ── paling berpengaruh ke XAU/USD */
  'fomc rate decision',
  'federal funds rate',
  'fomc statement',
  'fomc minutes',
  'fomc economic projections',
  'fed interest rate decision',
  'powell speaks',
  'powell press conference',
  'fed chair powell',
  'fed press conference',
  'press conference',

  /* ── INFLASI ── */
  'cpi m/m','cpi mom',
  'cpi y/y','cpi yoy',
  'core cpi m/m','core cpi mom',
  'core cpi y/y','core cpi yoy',
  'consumer price index',
  'ppi m/m','ppi mom',
  'ppi y/y','ppi yoy',
  'producer price index',
  'core pce price index',
  'pce price index',

  /* ── NFP & Employment utama ── */
  'nonfarm payrolls',
  'non-farm payrolls',
  'unemployment rate',
  'average hourly earnings m/m',
  'average hourly earnings mom',
  'initial jobless claims',

  /* ── GDP ── */
  'gdp q/q','gdp qq',
  'gdp growth rate',
  'gross domestic product',

  /* ── ISM — hanya headline Manufacturing & Services ── */
  'ism manufacturing pmi',
  'ism services pmi',
  'ism non-manufacturing pmi',

  /* ── Retail Sales — hanya headline ── */
  'retail sales m/m',
  'retail sales mom',
  'retail sales ex autos m/m',
  'retail sales ex autos mom',

  /* ── Consumer Confidence / Sentiment ── */
  'michigan consumer sentiment',
  'umich consumer sentiment',
  'cb consumer confidence',
];

/* Exact-match mode: judul harus mengandung salah satu keyword di atas (case-insensitive)
   Tidak ada fuzzy matching — mencegah false positive */
function ecalIsHighImpact(title){
  const tl=title.toLowerCase().trim();
  return TRUE_HIGH_KEYWORDS.some(k=>tl.includes(k.toLowerCase()));
}

/* Hitung week key format YYYY-Www (misal 2026-W25) untuk deteksi ganti minggu */
function getWeekKey(){
  const now=new Date();
  const dow=now.getDay()||7;
  const mon=new Date(now);mon.setDate(now.getDate()-(dow-1));mon.setHours(0,0,0,0);
  const jan4=new Date(mon.getFullYear(),0,4);
  const week=Math.ceil(((mon-jan4)/86400000+jan4.getDay()+1)/7);
  return `${mon.getFullYear()}-W${String(week).padStart(2,'0')}`;
}

function getWeekRange(){
  const now=new Date();
  const dow=now.getDay()||7;
  const mon=new Date(now);mon.setDate(now.getDate()-(dow-1));mon.setHours(0,0,0,0);
  const sun=new Date(mon);sun.setDate(mon.getDate()+6);sun.setHours(23,59,59,0);
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return{start:fmt(mon),end:fmt(sun)};
}

function ecalFmtTime(iso){
  try{
    const d=new Date(iso);
    const wib=new Date(d.getTime()+7*3600*1000);
    return String(wib.getUTCHours()).padStart(2,'0')+':'+String(wib.getUTCMinutes()).padStart(2,'0');
  }catch(e){return '--:--';}
}

/* Normalize raw FCS response → format internal */
function ecalNormalize(response){
  const filtered=response.filter(e=>
    e.country==='US'&&
    (e.importance==='2'||e.importance===2||e.importance==='1'||e.importance===1)
  );
  return filtered.map(e=>{
    const isRealHigh=ecalIsHighImpact(e.title||e.indicator||'');
    return{
      id: e.id||'',
      title: e.title||e.indicator||'',
      country:'USD',
      date: e.date.replace(' ','T')+'Z',
      impact: isRealHigh?'High':'Medium',
      forecast: e.forecast||'',
      previous: e.previous||'',
      actual: (e.actual!=null&&e.actual!==undefined&&e.actual!=='')?String(e.actual):'',
    };
  });
}

/* Fetch dari FCS API — dengan fallback 3 key otomatis */
async function fetchFromFCS(){
  const now=Date.now();
  if(window._lastFcsFetch && now-window._lastFcsFetch < 65000){
    console.log('[ecal] FCS throttled — terlalu cepat, tunggu sebentar');
    return null;
  }
  window._lastFcsFetch=now;
  const{start,end}=getWeekRange();
  /* Coba semua key mulai dari index aktif, muter jika perlu */
  const total=FCS_KEYS.length;
  for(let attempt=0;attempt<total;attempt++){
    const idx=(window._fcsKeyIdx+attempt)%total;
    const key=FCS_KEYS[idx];
    /* Skip placeholder key yang belum diisi */
    if(!key||key.startsWith('GANTI_'))continue;
    try{
      const url=`https://fcsapi.com/api-v3/forex/economy_cal?country=US&from=${start}&to=${end}&access_key=${key}`;
      const r=await fetch(url,{signal:AbortSignal.timeout(8000)});
      if(!r.ok){
        console.warn(`[ecal] Key ${idx+1} HTTP error ${r.status}, coba key berikutnya...`);
        continue;
      }
      const json=await r.json();
      /* Deteksi limit habis — FCS mengembalikan status false / pesan limit */
      const isLimited=(
        json.status===false||
        json.status===0||
        (typeof json.msg==='string'&&(
          json.msg.toLowerCase().includes('limit')||
          json.msg.toLowerCase().includes('exceed')||
          json.msg.toLowerCase().includes('invalid')||
          json.msg.toLowerCase().includes('credit')
        ))
      );
      if(isLimited){
        console.warn(`[ecal] Key ${idx+1} limit/invalid (${json.msg||'no msg'}), beralih ke key berikutnya...`);
        /* Geser ke key berikutnya agar percobaan berikutnya langsung pakai key baru */
        window._fcsKeyIdx=(idx+1)%total;
        continue;
      }
      if(!json.response||!Array.isArray(json.response))return null;
      /* Berhasil — simpan key yang sukses sebagai starting point berikutnya */
      window._fcsKeyIdx=idx;
      console.info(`[ecal] Berhasil dengan Key ${idx+1}`);
      return ecalNormalize(json.response);
    }catch(err){
      console.warn(`[ecal] Key ${idx+1} error:`,err.message||err);
    }
  }
  /* Semua key gagal */
  console.error('[ecal] Semua FCS key gagal/limit.');
  return null;
}

/* Baca cache dari Firestore */
async function ecalReadFirestore(){
  try{
    const db=getDB();
    const{getDoc,doc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const snap=await getDoc(doc(db,'_cache','ecal_current'));
    if(!snap.exists())return null;
    return snap.data(); // {data, fetchedAt (ms), weekKey}
  }catch(e){
    console.warn('[ecal] Firestore read error:',e);
    return null;
  }
}

/* Tulis cache ke Firestore — hanya admin (rules: isAdmin()) */
async function ecalWriteFirestore(data){
  if(!window._isAdmin)return false; // hanya admin yang boleh write ke _cache
  try{
    const db=getDB();
    const{setDoc,doc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    await setDoc(doc(db,'_cache','ecal_current'),{
      data,
      fetchedAt: Date.now(),
      weekKey: getWeekKey(),
    });
    return true;
  }catch(e){
    console.warn('[ecal] Firestore write error:',e);
    return false;
  }
}

/* Cek apakah cache Firestore masih valid:
   - weekKey harus sama (belum ganti minggu)
   - fetchedAt < 23 jam yang lalu */
function ecalCacheValid(cached){
  if(!cached||!cached.data||!cached.fetchedAt||!cached.weekKey)return false;
  if(cached.weekKey!==getWeekKey())return false;           // ganti minggu → invalid
  if(Date.now()-cached.fetchedAt > 23*3600*1000)return false; // >23 jam → invalid
  return true;
}

/* Coba ambil lock fetcher — hanya admin yang bisa lock & write Firestore */
async function ecalTryLock(){
  if(!window._isAdmin)return true; // non-admin: fetch FCS lokal aja tanpa lock
  try{
    const db=getDB();
    const{getDoc,setDoc,doc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const lockRef=doc(db,'_cache','ecal_lock');
    const snap=await getDoc(lockRef);
    const now=Date.now();
    if(snap.exists()&&(now-snap.data().at)<60000)return false; // ada lock aktif
    await setDoc(lockRef,{at:now});
    return true;
  }catch(e){return true;}
}

async function ecalReleaseLock(){
  if(!window._isAdmin)return;
  try{
    const db=getDB();
    const{deleteDoc,doc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    await deleteDoc(doc(db,'_cache','ecal_lock'));
  }catch(e){}
}

/* Subscribe Firestore realtime → update semua user tanpa poll FCS */
function ecalSubscribeFirestore(){
  if(window._ecalUnsub){window._ecalUnsub();window._ecalUnsub=null;}
  try{
    const db=getDB();
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({onSnapshot,doc})=>{
      window._ecalUnsub=onSnapshot(doc(db,'_cache','ecal_current'),snap=>{
        if(!snap.exists())return;
        const cached=snap.data();
        if(cached&&Array.isArray(cached.data)&&cached.data.length){
          window._ecalData=cached.data;
          renderEcal();
        }
      });
    });
  }catch(e){console.warn('[ecal] onSnapshot error:',e);}
}

/* Main entry */
async function startEcalPolling(){
  if(window._ecalStarted){renderEcal();return;}
  if(window._ecalStarting){await window._ecalStarting;renderEcal();return;}
  let resolveLock;
  window._ecalStarting=new Promise(r=>{resolveLock=r;});
  window._ecalStarted=true;
  if(window._ecalPoll){clearTimeout(window._ecalPoll);window._ecalPoll=null;}

  /* Tampilkan loading */
  document.querySelectorAll('.ecal-list').forEach(l=>{
    if(!l.innerHTML.trim()||l.innerHTML.includes('ecal-empty'))
      l.innerHTML='<div class="ecal-empty">Memuat kalender ekonomi...</div>';
  });

  /* 1. Baca cache Firestore dulu */
  const cached=await ecalReadFirestore();
  if(ecalCacheValid(cached)){
    window._ecalData=cached.data;
    renderEcal();
  }

  /* 2. Subscribe realtime — semua user dapat update otomatis saat ada yang update Firestore */
  ecalSubscribeFirestore();

  /* 3. Kalau cache invalid/expired → fetch FCS (dengan lock agar tidak dobel) */
  const doFetchFCS=async()=>{
    const gotLock=await ecalTryLock();
    if(!gotLock)return; // user lain sedang fetch, tunggu onSnapshot
    try{
      const data=await fetchFromFCS();
      if(data){
        await ecalWriteFirestore(data); // onSnapshot akan update semua user
        window._ecalData=data;
        renderEcal();
      }else if(!window._ecalData.length){
        document.querySelectorAll('.ecal-list').forEach(l=>{
          l.innerHTML='<div class="ecal-empty">Gagal memuat — <a href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener" style="color:var(--gold)">buka Forex Factory →</a></div>';
        });
      }
    }finally{
      await ecalReleaseLock();
    }
  };

  /* Fetch FCS jika: cache invalid/expired ATAU ada event yang sudah lewat tapi actual masih kosong */
  const now0=Date.now();
  const hasMissedActuals=ecalCacheValid(cached)&&(cached.data||[]).some(e=>{
    const t=new Date(e.date).getTime();
    return (e.actual===''||e.actual==null)&&t<now0-10*60000;
  });
  if(!ecalCacheValid(cached)||hasMissedActuals) await doFetchFCS();

  /* 4. Smart schedule — hanya fetch FCS saat window aktif event
        Di luar window: onSnapshot Firestore sudah cukup untuk realtime update
        
        WINDOW AKTIF: 5 menit sebelum s/d 10 menit setelah rilis
        → fetch FCS tiap 30 detik (dengan lock → hanya 1 user yang actual call FCS)
        
        Di luar window → tidur sampai 5 menit sebelum event berikutnya
        Tidak ada event → tidur sampai besok (re-check jadwal minggu baru) */
  function scheduleNext(){
    const now=Date.now();
    const pending=(window._ecalData||[])
      .map(e=>({...e,_t:new Date(e.date).getTime()}))
      .filter(e=>(e.actual===''||e.actual==null)&&e._t+10*60000>now)
      .sort((a,b)=>a._t-b._t);

    let delay;
    if(pending.length){
      const next=pending[0];
      const diff=next._t-now;
      if(diff>-10*60000&&diff<=5*60000){
        // Dalam window aktif → poll FCS tiap 30 detik (via lock)
        delay=30000;
      }else{
        // Luar window → tidur sampai 5 menit sebelum event
        delay=Math.max(diff-5*60000,60000);
      }
    }else{
      // Tidak ada event pending → tidur 1 jam (re-check kalau ada event baru)
      delay=60*60*1000;
    }
    window._ecalPoll=setTimeout(async()=>{
      // Di luar window: cukup re-check cache Firestore (bukan call FCS)
      const now2=Date.now();
      const p2=(window._ecalData||[])
        .map(e=>({...e,_t:new Date(e.date).getTime()}))
        .filter(e=>(e.actual===''||e.actual==null)&&e._t+10*60000>now2&&e._t-now2<=5*60000);
      if(p2.length){
        // Masuk window aktif → fetch FCS
        await doFetchFCS();
      }else{
        // Cek kalau ada event yang sudah lewat tapi masih belum ada actual (missed window)
        const missedActual=(window._ecalData||[]).some(e=>{
          const t=new Date(e.date).getTime();
          return (e.actual===''||e.actual==null)&&t<now2-10*60000;
        });
        // Cek kalau cache Firestore perlu refresh (ganti minggu / >23 jam / missed actual)
        const c=await ecalReadFirestore();
        if(!ecalCacheValid(c)||missedActual) await doFetchFCS();
      }
      scheduleNext();
    },delay);
  }
  scheduleNext();
  if(resolveLock)resolveLock();
}
window._startEcalListener=startEcalPolling;


const ECAL_INVERSE_KEYWORDS=['unemployment','jobless','inventories','trade balance deficit'];
function ecalBias(e){
  const a=parseFloat(e.actual),fc=parseFloat(e.forecast);
  if(e.actual===''||e.actual==null||isNaN(a)||isNaN(fc)||a===fc)return null;
  const inverse=ECAL_INVERSE_KEYWORDS.some(k=>e.title.toLowerCase().includes(k));
  let beat=a>fc;
  if(inverse)beat=!beat;
  return beat?'bull':'bear';
}
function ecalDateLabel(iso){
  const d=new Date(iso);
  const wib=new Date(d.getTime()+7*3600*1000);
  const now=new Date(Date.now()+7*3600*1000);
  const dKey=wib.toISOString().slice(0,10);
  const todayKey=now.toISOString().slice(0,10);
  const tom=new Date(now.getTime()+86400000);
  const tomKey=tom.toISOString().slice(0,10);
  const days=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const dateStr=`${days[wib.getUTCDay()]}, ${wib.getUTCDate()} ${months[wib.getUTCMonth()]}`;
  if(dKey===todayKey)return{key:dKey,label:`Hari ini · ${dateStr}`,cls:'today'};
  if(dKey===tomKey)return{key:dKey,label:`Besok · ${dateStr}`,cls:'future'};
  return{key:dKey,label:dateStr,cls:'future'};
}
function renderEcal(){
  const lists=document.querySelectorAll('.ecal-list');
  if(!lists.length)return;
  const data=window._ecalData||[];
  if(!data.length){
    lists.forEach(function(list){list.innerHTML='<div class="ecal-empty">Tidak ada event high-impact USD minggu ini.</div>';});
    return;
  }
  const now=Date.now();
  let nextIdx=data.findIndex(e=>(e.actual===''||e.actual==null)&&new Date(e.date).getTime()>=now-15*60000);
  let lastDateKey=null;
  let html='';
  data.forEach((e,i)=>{
    const dl=ecalDateLabel(e.date);
    if(dl.key!==lastDateKey){
      html+=`<div class="ecal-datehead ${dl.cls}">${dl.label}</div>`;
      lastDateKey=dl.key;
    }
    const hasActual=e.actual!==''&&e.actual!=null;
    const bias=ecalBias(e);
    let biasHtml='';
    if(bias==='bull'){
      biasHtml=`<span class="ecal-bias bull"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 17l6-6 4 4 8-8M21 7v6h-6"/></svg>Bullish ${e.country}</span>`;
    }else if(bias==='bear'){
      biasHtml=`<span class="ecal-bias bear"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 7l6 6 4-4 8 8M21 17v-6h-6"/></svg>Bearish ${e.country}</span>`;
    }
    let valHtml='';
    if(hasActual){
      valHtml=`<span>Actual: <b>${e.actual}</b>${biasHtml}</span><span>Forecast: <b>${e.forecast||'—'}</b></span><span>Previous: <b>${e.previous||'—'}</b></span>`;
    }else{
      valHtml=`<span>Forecast: <b>${e.forecast||'—'}</b></span><span>Previous: <b>${e.previous||'—'}</b></span><span>Actual: <b>—</b></span>`;
    }
    html+=`<div class="ecal-row ${i===nextIdx?'is-next':''}">
      <div class="ecal-time">${ecalFmtTime(e.date)}<small>WIB</small></div>
      <div class="ecal-impact"><span class="ecal-dot ${e.impact==='High'?'high':'medium'}" title="${e.impact} impact"></span></div>
      <div class="ecal-body">
        <div class="ecal-event-top"><span class="ecal-curr">${e.country}</span><span class="ecal-name">${e.title}</span></div>
        <div class="ecal-vals">${valHtml}</div>
      </div>
    </div>`;
  });
  lists.forEach(function(list){list.innerHTML=html;});
}
window._renderEcal=renderEcal;

async function loadAdminData(){ await renderAdminNewsList(); }
window._loadAdminData=loadAdminData;

async function renderAdminNewsList(){
  const list=document.getElementById('admin-news-list');
  list.innerHTML='<div class="empty-state">Memuat...</div>';
  const news=await loadNewsFromDB();
  if(!news.length){list.innerHTML='<div class="empty-state">Belum ada berita</div>';return;}
  list.innerHTML=news.map(n=>{
    const thumb=n.imageUrl?getOptUrl(n.imageUrl,144):'';
    return`<div class="admin-news-item">
      <div class="ani-thumb">${thumb
        ?`<img src="${thumb}" alt="${n.title}" loading="lazy">`
        :'<div style="width:100%;height:100%;background:var(--bg5);display:flex;align-items:center;justify-content:center;font-family:Space Grotesk,sans-serif;color:var(--gold);opacity:.3;font-size:1.4rem"></div>'
      }</div>
      <div class="ani-body">
        <div class="ani-cat">${n.cat}${n.featured?'<span class="ani-featured">FEATURED</span>':''}</div>
        <div class="ani-title">${n.title}</div>
        <div class="ani-date">${fmtDate(n.date||n.createdAt)}</div>
        ${n.slug?`<div class="ani-slug">/?berita=${n.slug}</div>`:''}
        <div class="ani-actions">
          <button class="btn-edit-n" onclick="window._editNews('${n.id}')">✎ Edit</button>
          <button class="btn-feat-n" onclick="window._toggleFeatured('${n.id}',${!n.featured})">${n.featured?'★ Unfeatured':'☆ Set Featured'}</button>
          <button class="btn-del-n" onclick="window._deleteNews('${n.id}')">✕ Hapus</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

window._editNews=async id=>{
  const n=window.allNewsCache.find(x=>x.id===id);if(!n)return;
  document.getElementById('news-form-wrap').style.display='block';
  document.getElementById('nf-title-lbl').textContent='Edit Berita';
  document.getElementById('nf-edit-id').value=id;
  document.getElementById('nf-old-img-url').value=n.imageUrl||'';
  document.getElementById('nf-judul').value=n.title||'';
  document.getElementById('nf-excerpt').value=n.excerpt||'';
  document.getElementById('nf-konten').value=n.konten||'';
  document.getElementById('nf-tgl').value=n.date||new Date().toISOString().slice(0,10);
  document.getElementById('nf-kat').value=n.cat||'Market Update';
  document.getElementById('nf-featured').checked=!!n.featured;
  if(document.getElementById('nf-src-name')){document.getElementById('nf-src-name').value=n.srcName||'';document.getElementById('nf-src-url').value=n.srcUrl||'';}
  document.getElementById('nf-foto').value='';
  document.getElementById('nf-save-err').style.display='none';
  const exc=n.excerpt||'';
  const excEl=document.getElementById('nf-excerpt-count');
  if(excEl) excEl.textContent=exc.length+'/200';
  const slugEl=document.getElementById('nf-slug-preview');
  if(slugEl) slugEl.textContent=n.slug?'/?berita='+n.slug:(n.title?'/?berita='+generateSlug(n.title):'—');
  if(n.imageUrl){
    document.getElementById('img-preview-wrap').style.display='block';
    document.getElementById('img-preview').src=getOptUrl(n.imageUrl,400);
    document.getElementById('img-current-label').textContent='Gambar saat ini (ganti jika perlu)';
  }else{
    document.getElementById('img-preview-wrap').style.display='none';
    document.getElementById('img-preview').src='';
  }
  window.scrollTo(0,0);
};

window._toggleFeatured=async(id,val)=>{
  try{
    if(val){
      const snap=await getDocs(query(collection(db,'news')));
      await Promise.all(snap.docs.filter(d=>d.id!==id&&d.data().featured).map(d=>updateDoc(doc(db,'news',d.id),{featured:false})));
    }
    await updateDoc(doc(db,'news',id),{featured:val});
    toast('Admin',val?'Dijadikan featured':'Dihapus dari featured','#C9A84C');
    await renderAdminNewsList();
  }catch(e){toast('Error',e.message,'#E05A5A');}
};

window._deleteNews=async id=>{
  if(!confirm('Hapus berita ini?')) return;
  try{
    await deleteDoc(doc(db,'news',id));
    toast('Admin','Berita dihapus','#E05A5A');
    await renderAdminNewsList();
  }catch(e){toast('Error',e.message,'#E05A5A');}
};

async function loadUsers(){
  const list=document.getElementById('user-list');
  list.innerHTML='<div class="empty-state">Memuat user...</div>';
  try{
    const snap=await getDocs(collection(db,'users'));
    const users=[];snap.forEach(d=>users.push({uid:d.id,...d.data()}));
    document.getElementById('user-count-lbl').textContent=users.length+' total user';
    if(!users.length){list.innerHTML='<div class="empty-state">Belum ada user</div>';return;}
    const E=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');list.innerHTML=users.map(u=>`<div class="user-item"><div class="user-av">${E(String(u.displayName||u.email||'?').charAt(0).toUpperCase())}</div><div class="user-info-col"><div class="user-name">${E(u.displayName||'—')}</div><div class="user-email">${E(u.email||'—')}</div></div><div class="user-badges">${u.admin?'<span class="admin-pill">ADMIN</span>':''}<button class="toggle-vip ${u.vip?'is-vip':'not-vip'}" onclick="window._toggleUserVip('${E(u.uid)}',${!u.vip})">${u.vip?'VIP — Cabut':'Jadikan VIP'}</button></div></div>`).join('');
  }catch(e){list.innerHTML=`<div class="empty-state">Gagal memuat user: ${String(e.message||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</div>`;}
}
window._loadUsers=loadUsers;

window._toggleUserVip=async(uid,val)=>{
  try{
    await setDoc(doc(db,'users',uid),{vip:val},{merge:true});
    toast('Admin',val?'User dijadikan VIP':'VIP dicabut','#3DBA7A');
    await loadUsers();await loadStats();
  }catch(e){toast('Error',e.message,'#E05A5A');}
};

async function loadStats(){
  try{
    const newsSnap=await getDocs(collection(db,'news'));
    const userSnap=await getDocs(collection(db,'users'));
    const users=[];userSnap.forEach(d=>users.push(d.data()));
    const vips=users.filter(u=>u.vip===true);
    document.getElementById('stat-news').textContent=newsSnap.size;
    document.getElementById('stat-users').textContent=users.length;
    document.getElementById('stat-vip').textContent=vips.length;
    document.getElementById('stat-reg').textContent=users.length-vips.length;
  }catch(e){console.error('loadStats:',e);}
}
window._loadStats=loadStats;

const CRYPTO=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT'];

async function fetchXau(){
  try{const r=await fetch('https://api.gold-api.com/price/XAU',{signal:AbortSignal.timeout(6000)});const d=await r.json();if(d.price){const p=parseFloat(d.price)-2;window._lp.XAUUSD=p;window._lp.XAUTUSDT=p;return;}}catch(_){}
  try{const r=await fetch('https://data-asg.goldprice.org/dbXRates/USD',{signal:AbortSignal.timeout(6000)});const d=await r.json();const p=d?.items?.[0]?.xauPrice;if(p){const v=parseFloat(p)-2;window._lp.XAUUSD=v;window._lp.XAUTUSDT=v;}}catch(_){}
}

async function fetchCrypto(){
  try{const r=await fetch('https://api.binance.com/api/v3/ticker/price',{signal:AbortSignal.timeout(5000)});const data=await r.json();const lookup={};data.forEach(d=>lookup[d.symbol]=parseFloat(d.price));CRYPTO.forEach(s=>{if(lookup[s])window._lp[s]=lookup[s];});return;}catch(_){}
  try{const cgIds={BTCUSDT:'bitcoin',ETHUSDT:'ethereum',SOLUSDT:'solana',BNBUSDT:'binancecoin',XRPUSDT:'ripple',DOGEUSDT:'dogecoin',ADAUSDT:'cardano'};const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(cgIds).join(',')}&vs_currencies=usd`,{signal:AbortSignal.timeout(8000)});const d=await r.json();Object.entries(cgIds).forEach(([s,id])=>{if(d[id]?.usd)window._lp[s]=d[id].usd;});}catch(_){}
}

async function fetchPrices(){
  window._prevLp={...window._lp};
  await Promise.allSettled([fetchXau(),fetchCrypto()]);
  const has=Object.keys(window._lp).length>0;
  const dot=document.getElementById('ap-dot');
  if(dot){dot.className='live-dot'+(has?' on':'');document.getElementById('ap-live').textContent=has?'Live':'Offline';}
}

function startTick(){
  if(tickInterval) return;
  tickInterval=setInterval(tick,9000);
}
function stopTick(){
  if(tickInterval){ clearInterval(tickInterval); tickInterval=null; }
}

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    stopTick();
  }else if(window._curUser){
    tick();
    startTick();
  }
});

const calcPnl=t=>!t.exit?null:+((t.dir==='Long'?(t.exit-t.entry):(t.entry-t.exit))*t.size).toFixed(2);
const calcOpnl=t=>{const cp=window._lp[t.symbol];return cp?((t.dir==='Long'?(cp-t.entry):(t.entry-cp))*t.size):null;};
const calcR=t=>{if(!t.exit||!t.sl)return null;const risk=Math.abs(t.entry-t.sl)*t.size,pnl=calcPnl(t);return(!risk||pnl===null)?null:+(pnl/risk).toFixed(2);};
const calcProg=t=>{const cp=window._lp[t.symbol];if(!cp||!t.sl||!t.tp)return null;const rng=t.dir==='Long'?t.tp-t.sl:t.sl-t.tp;return rng<=0?null:Math.min(100,Math.max(0,((t.dir==='Long'?cp-t.sl:t.sl-cp)/rng)*100));};
const fmtM=n=>{if(n===null||isNaN(n))return'—';const a=Math.abs(n),s=a>=1000?'$'+(a/1000).toFixed(2)+'K':'$'+a.toFixed(2);return(n<0?'-':'')+s;};
const fmtPct=n=>n===null||isNaN(n)?'—':(n>0?'+':'')+n.toFixed(2)+'%';
const sDec=s=>(s==='XAUUSD'||s==='XAUTUSDT')?2:((window._lp[s]||0)<1?4:2);
const fmtP=(n,s)=>n===null||isNaN(n)?'—':n.toFixed(sDec(s));

function autoCheck(){
  let changed=false;
  trades.forEach(t=>{
    if(t.exit!==null)return;
    const cp=window._lp[t.symbol];if(!cp)return;
    if(t.type==='limit'&&!t.activated){
      if(t.dir==='Long'?cp<=t.entry:cp>=t.entry){t.activated=true;toast(t.symbol,'Limit triggered','#C9A84C');changed=true;}
      else return;
    }
    if(t.sl&&(t.dir==='Long'?cp<=t.sl:cp>=t.sl)){t.exit=t.sl;t.closedReason='SL';t.date_close=new Date().toISOString().slice(0,10);toast(t.symbol,'Stop Loss hit','#E05A5A');changed=true;}
    if(!t.exit&&t.tp&&(t.dir==='Long'?cp>=t.tp:cp<=t.tp)){t.exit=t.tp;t.closedReason='TP';t.date_close=new Date().toISOString().slice(0,10);toast(t.symbol,'Take Profit hit','#3DBA7A');changed=true;}
  });
  return changed;
}

function renderStats(){
  const closed=trades.filter(t=>t.exit!==null),open=trades.filter(t=>t.exit===null&&(t.type!=='limit'||t.activated));
  const wins=closed.filter(t=>calcPnl(t)>0),totalPnl=closed.reduce((a,t)=>a+calcPnl(t),0);
  const wr=closed.length?(wins.length/closed.length*100):0,avgR=closed.length?closed.reduce((a,t)=>{const r=calcR(t);return a+(r||0);},0)/closed.length:0;
  const openPnl=open.reduce((a,t)=>{const p=calcOpnl(t);return a+(p||0);},0);
  document.getElementById('stats-row').innerHTML=[
    {l:'Total P&L',v:fmtM(totalPnl),c:totalPnl>=0?'g':'r',s:closed.length+' closed'},
    {l:'Win Rate',v:wr.toFixed(0)+'%',c:wr>=50?'g':'r',s:wins.length+'W/'+(closed.length-wins.length)+'L'},
    {l:'Avg R',v:(avgR>0?'+':'')+avgR.toFixed(2)+'R',c:avgR>=1?'g':'r',s:'Risk-adjusted'},
    {l:'Open',v:open.length,c:'',s:fmtM(openPnl)+' unrealized'},
    {l:'Total Trades',v:trades.length,c:'',s:closed.length+' closed'}
  ].map(s=>`<div class="scard"><div class="scard-l">${s.l}</div><div class="scard-v ${s.c}">${s.v}</div><div class="scard-sub">${s.s}</div></div>`).join('');
}

function renderOpen(){
  const open=trades.filter(t=>t.exit===null);
  const tb=document.getElementById('open-tbody');
  const SD=window.SYM_D||{};
  if(!open.length){tb.innerHTML=`<tr><td colspan="10"><div class="empty-state">No open positions</div></td></tr>`;return;}
  tb.innerHTML=open.map(t=>{
    const cp=window._lp[t.symbol],isLim=t.type==='limit'&&!t.activated;
    const pnl=isLim?null:calcOpnl(t),pnlPct=(pnl!==null&&t.entry&&t.size)?(pnl/(t.entry*t.size)*100):null;
    const prog=!isLim?calcProg(t):null,pc=prog!==null?(prog>66?'#3DBA7A':prog>33?'#C9A84C':'#E05A5A'):'var(--text3)';
    return`<tr><td><span class="td-sym">${mesc(SD[t.symbol]||t.symbol)}</span></td><td><span class="badge ${mesc(String(t.dir).toLowerCase())}">${mesc(t.dir)}</span></td><td>${fmtP(t.entry,t.symbol)}</td><td style="font-family:'Space Grotesk',sans-serif;font-size:1rem">${cp?fmtP(cp,t.symbol):'—'}</td><td><span style="color:var(--red)">${t.sl?fmtP(t.sl,t.symbol):'—'}</span>/<span style="color:var(--green)">${t.tp?fmtP(t.tp,t.symbol):'—'}</span></td><td>${mesc(t.size)}</td><td class="${pnl===null?'':pnl>=0?'p-pos':'p-neg'}">${pnl===null?`<span style="color:var(--text3)">${isLim?'Pending':'—'}</span>`:fmtM(pnl)+` <span style="opacity:.5;font-size:.6rem">(${fmtPct(pnlPct)})</span>`}</td><td>${prog!==null?`<div class="prog-wrap"><div class="prog-bar"><div class="prog-fill" style="width:${prog.toFixed(0)}%;background:${pc}"></div></div><div class="prog-txt">${prog.toFixed(0)}%</div></div>`:isLim?`<span style="font-size:.6rem;color:var(--text3)">Waiting</span>`:'—'}</td><td>${isLim?'<span class="badge lim">Limit</span>':'<span class="badge open">Open</span>'}</td><td><div class="row-actions"><button class="act-btn" onclick="window._editTrade('${t._docId||t.id}')">Edit</button><button class="act-btn del" onclick="window._delTrade('${t._docId||t.id}')">Del</button></div></td></tr>`;
  }).join('');
}

function renderHistory(){
  const SD=window.SYM_D||{};
  let data=trades.filter(t=>t.exit!==null);
  if(window._histFlt==='win') data=data.filter(t=>calcPnl(t)>0);
  if(window._histFlt==='loss') data=data.filter(t=>calcPnl(t)<=0);
  const tb=document.getElementById('hist-tbody');
  if(!data.length){tb.innerHTML=`<tr><td colspan="9"><div class="empty-state">No trades found</div></td></tr>`;return;}
  tb.innerHTML=[...data].reverse().map(t=>{
    const pnl=calcPnl(t),r=calcR(t),rb=t.closedReason?`<span class="badge ${t.closedReason==='TP'?'tp':'sl'}" style="margin-left:4px">${t.closedReason}</span>`:'';
    return`<tr><td>${mesc(t.date_close||t.date)}</td><td><span class="td-sym">${mesc(SD[t.symbol]||t.symbol)}</span></td><td><span class="badge ${mesc(String(t.dir).toLowerCase())}">${mesc(t.dir)}</span></td><td>${fmtP(t.entry,t.symbol)}</td><td>${fmtP(t.exit,t.symbol)}${rb}</td><td>${mesc(t.size)}</td><td class="${pnl>0?'p-pos':'p-neg'}">${fmtM(pnl)}</td><td class="${r&&r>=1?'p-pos':r&&r<0?'p-neg':'p-neu'}">${r!==null?(r>0?'+':'')+r+'R':'—'}</td><td><div class="row-actions"><button class="act-btn" onclick="window._editTrade('${t._docId||t.id}')">Edit</button><button class="act-btn del" onclick="window._delTrade('${t._docId||t.id}')">Del</button></div></td></tr>`;
  }).join('');
}
window._renderHistory=renderHistory;

function renderEquity(){
  const closed=trades.filter(t=>t.exit!==null).sort((a,b)=>(a.date_close||a.date).localeCompare(b.date_close||b.date));
  let cum=0;const pts=[{v:0}];closed.forEach(t=>{cum+=calcPnl(t);pts.push({v:cum})});
  if(pts.length<2){document.getElementById('eq-svg').innerHTML='';return;}
  const vals=pts.map(p=>p.v),mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1;
  const W=440,H=120,pad=16,xS=(W-2*pad)/(pts.length-1),yS=(H-2*pad)/rng;
  const pstr=pts.map((p,i)=>`${(pad+i*xS).toFixed(1)},${(H-pad-(p.v-mn)*yS).toFixed(1)}`).join(' ');
  const lx=(pad+(pts.length-1)*xS).toFixed(1),ly=(H-pad-(pts[pts.length-1].v-mn)*yS).toFixed(1);
  document.getElementById('eq-svg').innerHTML=`<defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#C9A84C" stop-opacity=".2"/><stop offset="100%" stop-color="#C9A84C" stop-opacity="0"/></linearGradient></defs><polyline points="${pstr}" stroke="#C9A84C" stroke-width="2" fill="none"/><circle cx="${lx}" cy="${ly}" r="3.5" fill="#C9A84C"/>`;
}

function renderBkd(){
  const SD=window.SYM_D||{};const syms={};
  trades.filter(t=>t.exit).forEach(t=>{const p=calcPnl(t);syms[t.symbol]=(syms[t.symbol]||0)+p;});
  const arr=Object.entries(syms).sort((a,b)=>b[1]-a[1]);
  if(!arr.length){document.getElementById('bkd-list').innerHTML='<div class="empty-state" style="padding:20px">No closed trades</div>';return;}
  const maxA=Math.max(...arr.map(a=>Math.abs(a[1])));
  document.getElementById('bkd-list').innerHTML=arr.map(([sym,pnl])=>`<div class="bk-row"><span class="bk-sym">${SD[sym]||sym}</span><div class="bk-bar-wrap"><div class="bk-bar" style="width:${(Math.abs(pnl)/maxA*100).toFixed(1)}%;background:${pnl>=0?'#3DBA7A':'#E05A5A'}"></div></div><span class="bk-val ${pnl>=0?'p-pos':'p-neg'}">${fmtM(pnl)}</span></div>`).join('');
}

function renderNotes(){
  const SD=window.SYM_D||{};
  const notes=trades.filter(t=>t.notes);
  const g=document.getElementById('notes-grid');
  if(!notes.length){g.innerHTML=`<div class="empty-state" style="grid-column:1/-1">No journal notes yet</div>`;return;}
  g.innerHTML=[...notes].reverse().map(t=>`<div class="note-card"><div class="note-sym">${mesc(SD[t.symbol]||t.symbol)}</div><div class="note-date">${mesc(t.date)} · ${mesc(t.dir)}</div><div class="note-txt">${mesc(t.notes)}</div>${t.tag?`<div class="note-tag">${mesc(t.tag)}</div>`:''}</div>`).join('');
}

/* ── Share Card: statistik untuk kartu hasil + loader lazy ── */
window._getJournalStats=function(days){
  const dOf=t=>t.date_close||t.date||'';
  const cut=days?new Date(Date.now()-days*864e5).toISOString().slice(0,10):null;
  const cl=trades.filter(t=>t.exit!==null&&t.exit!==undefined&&(!cut||dOf(t)>=cut)).sort((a,b)=>dOf(a).localeCompare(dOf(b)));
  const pn=cl.map(calcPnl);
  const wins=pn.filter(p=>p>0).length,losses=cl.length-wins;
  const gw=pn.filter(p=>p>0).reduce((a,p)=>a+p,0),gl=Math.abs(pn.filter(p=>p<0).reduce((a,p)=>a+p,0));
  const rs=cl.map(calcR).filter(r=>r!==null);
  let cum=0,streak=0,best=0;const eq=[0];
  pn.forEach(p=>{cum+=p;eq.push(+cum.toFixed(2));if(p>0){streak++;if(streak>best)best=streak;}else streak=0;});
  const u=window._curUser;
  const d=new Date();
  return{
    n:cl.length,wins,losses,
    wr:cl.length?wins/cl.length*100:0,
    pnl:+pn.reduce((a,p)=>a+p,0).toFixed(2),
    profitFactor:gl>0?gw/gl:(gw>0?Infinity:null),
    rCount:rs.length,totalR:rs.reduce((a,r)=>a+r,0),avgR:rs.length?rs.reduce((a,r)=>a+r,0)/rs.length:0,
    bestPnl:pn.length?Math.max(...pn):0,bestR:rs.length?Math.max(...rs):0,
    streak:best,equity:eq,
    from:cl.length?dOf(cl[0]):'',to:cl.length?dOf(cl[cl.length-1]):'',
    name:(u&&u.displayName)||'Trader',vip:!!(isVip||isAdmin),
    when:d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})
  };
};
let _shareLoaded=false;
function ensureShareCard(){
  if(_shareLoaded||!(isVip||isAdmin))return;
  _shareLoaded=true;
  const s=document.createElement('script');s.src='/share-card.js?v=1';s.async=true;
  s.onerror=()=>{_shareLoaded=false;};
  document.head.appendChild(s);
  const r=document.createElement('script');r.src='/risk-sim.js?v=1';r.async=true;document.head.appendChild(r);
  const u=document.createElement('script');u.src='/journal-ui.js?v=1';u.async=true;document.head.appendChild(u);
}
function renderAll(){renderStats();renderOpen();renderHistory();renderEquity();renderBkd();renderNotes();ensureShareCard();}

window.openModal=t=>{
  if(!isVip&&!isAdmin){toast('MGF','Fitur VIP — hubungi admin','#C9A84C');return;}
  document.getElementById('modal-ttl').textContent=t?'Edit Trade':'Log New Trade';
  document.getElementById('edit-id').value=t?t._docId||t.id:'';
  ['sym','dir','type'].forEach(f=>document.getElementById('f-'+f).value=t?t[f]:(f==='sym'?'XAUUSD':f==='dir'?'Long':'market'));
  document.getElementById('f-entry').value=t?t.entry:'';
  document.getElementById('f-exit').value=t&&t.exit?t.exit:'';
  document.getElementById('f-sl').value=t&&t.sl?t.sl:'';
  document.getElementById('f-tp').value=t&&t.tp?t.tp:'';
  document.getElementById('f-size').value=t?t.size:'';
  document.getElementById('f-date').value=t?t.date:new Date().toISOString().slice(0,10);
  document.getElementById('f-notes').value=t?t.notes:'';
  document.getElementById('f-tag').value=t?t.tag:'';
  document.getElementById('overlay').classList.add('open');
};
window.closeModal=()=>document.getElementById('overlay').classList.remove('open');
document.getElementById('overlay').addEventListener('click',e=>{if(e.target===document.getElementById('overlay'))window.closeModal();});

window._editTrade = docId => {
  const t = trades.find(x=>(x._docId||x.id)===docId);
  if(t) window.openModal(t);
};

window._delTrade = async docId => {
  if(!confirm('Delete this trade?')) return;
  if(!window._curUser) return;
  const t = trades.find(x=>(x._docId||x.id)===docId);
  if(t?._docId){
    try{ await deleteDoc(doc(db,'users',window._curUser.uid,'trades',t._docId)); }
    catch(e){ console.error('_delTrade:',e); }
  }
  trades = trades.filter(x=>(x._docId||x.id)!==docId);
  renderAll();
  document.getElementById('acc-trades').textContent=trades.length+' trades';
};

window.saveTrade = async ()=>{
  if(!isVip&&!isAdmin) return;
  const sym=document.getElementById('f-sym').value,entry=parseFloat(document.getElementById('f-entry').value);
  if(!sym||!entry){alert('Symbol dan Entry harus diisi.');return;}
  const exitVal=document.getElementById('f-exit').value;
  const editDocId=document.getElementById('edit-id').value||null;
  const existing=trades.find(t=>(t._docId||t.id)===editDocId);
  const obj={
    _docId:editDocId||null,
    id:editDocId||null,
    symbol:sym,
    dir:document.getElementById('f-dir').value,
    type:document.getElementById('f-type').value,
    activated:existing?.activated||false,
    entry,
    exit:exitVal?parseFloat(exitVal):null,
    size:parseFloat(document.getElementById('f-size').value)||1,
    sl:parseFloat(document.getElementById('f-sl').value)||null,
    tp:parseFloat(document.getElementById('f-tp').value)||null,
    date:document.getElementById('f-date').value||new Date().toISOString().slice(0,10),
    notes:document.getElementById('f-notes').value.trim(),
    tag:document.getElementById('f-tag').value.trim(),
    closedReason:existing?.closedReason||null,
    date_close:existing?.date_close||null,
  };
  if(editDocId){
    trades=trades.map(t=>(t._docId||t.id)===editDocId?obj:t);
  }else{
    trades.push(obj);
  }
  window.closeModal();
  renderAll();
  await persistOneTrade(obj);
};

window.clearAll = async ()=>{
  if(!isVip&&!isAdmin) return;
  if(!confirm('Hapus semua data trade?')) return;
  if(!window._curUser) return;
  try{
    setSaveStatus('saving');
    const uid=window._curUser.uid;
    const snap=await getDocs(collection(db,'users',uid,'trades'));
    const batchSize=400;
    const docsArr=snap.docs;
    for(let i=0;i<docsArr.length;i+=batchSize){
      const batch=writeBatch(db);
      docsArr.slice(i,i+batchSize).forEach(d=>batch.delete(d.ref));
      await batch.commit();
    }
    trades=[];
    renderAll();
    document.getElementById('acc-trades').textContent='0 trades';
    setSaveStatus('saved');
    toast('MGF','Semua trade dihapus','#E05A5A');
  }catch(e){ console.error('clearAll:',e); setSaveStatus('error'); }
};

async function tick(){
  await fetchPrices();
  renderTicker();
  renderPricebar();
  updateHeroCard(window._lp.XAUUSD,window._prevLp.XAUUSD);
  const changed=autoCheck();
  if(changed){ renderAll(); triggerSave(); }
  else { renderOpen(); renderStats(); }
}

fetchPrices().then(()=>{ renderTicker(); updateHeroCard(window._lp.XAUUSD,null); });
setInterval(()=>fetchPrices().then(()=>{ renderTicker(); updateHeroCard(window._lp.XAUUSD,window._prevLp.XAUUSD); }),15000);
// Fetch 24h high/low dari API — jalankan sekali saat load, lalu tiap 5 menit
fetch24hXau();
setInterval(fetch24hXau, 5*60*1000);


/* ── Admin berita: kolom sumber + isi otomatis dari link (gagal = tanpa AI) ── */
(function(){
  function mount(){
    const ex=document.getElementById('nf-excerpt');
    if(!ex||document.getElementById('nf-src-url'))return;
    const g=ex.closest('.form-group')||ex.parentNode;
    const w=document.createElement('div');w.className='form-group';
    w.innerHTML='<label class="form-lbl" for="nf-src-url">Link sumber (opsional)</label>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><input class="form-input" id="nf-src-url" type="url" placeholder="https://id.investing.com/news/..." style="flex:1;min-width:200px">'+
      '<button type="button" class="btn-save-m" id="nf-src-auto" style="white-space:nowrap">Isi otomatis dari link</button></div>'+
      '<input class="form-input" id="nf-src-name" placeholder="Nama sumber, mis. Investing.com" style="margin-top:8px">'+
      '<div id="nf-src-msg" style="font-size:.7rem;margin-top:6px;color:var(--text3);line-height:1.6">Hanya mencoba mengambil artikel. Kalau gagal, AI tidak dipakai dan kamu isi manual. Tulis ulang dengan kata sendiri dan cantumkan sumber.</div>';
    g.parentNode.insertBefore(w,g);
    document.getElementById('nf-src-auto').onclick=async()=>{
      const url=document.getElementById('nf-src-url').value.trim(),msg=document.getElementById('nf-src-msg');
      if(!/^https?:\/\//i.test(url)){msg.textContent='Tempel link lengkap (https://...) dulu.';return;}
      msg.style.color='var(--text3)';msg.textContent='Mengambil artikel…';
      try{
        const h={'Content-Type':'application/json'};
        try{h['Authorization']='Bearer '+await window._curUser.getIdToken();}catch(_){}
        const r=await fetch('/api/gemini',{method:'POST',headers:h,body:JSON.stringify({mode:'newsurl',prompt:url})});
        const j=await r.json();if(!r.ok)throw new Error(j.error||'Gagal');
        const d=JSON.parse(String(j.text).replace(/```json|```/g,'').trim());
        const set=(id,v,force)=>{const e=document.getElementById(id);if(e&&v&&(force||!e.value)){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}};
        set('nf-judul',d.judul);set('nf-excerpt',String(d.excerpt||'').slice(0,200),true);set('nf-konten',d.konten);set('nf-src-name',d.sumber);
        msg.style.color='#3DBA7A';msg.textContent='Terisi. Cek akurasi angka dan faktanya dulu sebelum simpan.';
      }catch(e){msg.style.color='#E05A5A';msg.textContent=e.message;}
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();

/* ── Admin berita: isi sumber default ke berita lama yang kolom sumbernya kosong ── */
window.fillDefaultSource=async()=>{
  const list=(window.allNewsCache||[]).filter(n=>!n.srcName&&!n.srcUrl);
  const msg=document.getElementById('bulk-src-msg');
  const say=(t,c)=>{if(msg){msg.textContent=t;msg.style.color=c||'var(--text3)';}};
  if(!list.length){say('Semua berita sudah punya sumber. Tidak ada yang perlu diisi.');return;}
  const name=(prompt('Isi "Sumber: …" ke '+list.length+' berita lama yang kolom sumbernya kosong.\nNama sumber:','Investing.com')||'').trim().slice(0,80);
  if(!name)return;
  if(!confirm('Yakin? '+list.length+' berita akan diberi "Sumber: '+name+'".\nPastikan semuanya memang dari sumber ini, karena tidak ada tombol batalkan.'))return;
  try{
    say('Menyimpan… 0/'+list.length);let done=0;
    for(const n of list){
      await updateDoc(doc(db,'news',n.id),{srcName:name});
      n.srcName=name;done++;
      if(done%5===0)say('Menyimpan… '+done+'/'+list.length);
    }
    say('Selesai: '+done+' berita diberi sumber "'+name+'".','#3DBA7A');
  }catch(e){say('Gagal di tengah jalan: '+(e.message||e)+'. Sebagian mungkin sudah tersimpan, coba lagi.','#E05A5A');}
};
(function(){
  function mount(){
    const wrap=document.getElementById('news-form-wrap');
    if(!wrap||document.getElementById('bulk-src-btn'))return;
    const d=document.createElement('div');
    d.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 16px';
    d.innerHTML='<button type="button" class="btn-save-m" id="bulk-src-btn">Isi sumber ke berita lama</button><span id="bulk-src-msg" style="font-size:.7rem;color:var(--text3)">Hanya untuk berita yang kolom sumbernya masih kosong.</span>';
    wrap.parentNode.insertBefore(d,wrap);
    document.getElementById('bulk-src-btn').onclick=window.fillDefaultSource;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();


/* ── Admin berita: tempel teks artikel → AI olah ulang → isi judul/kategori/ringkasan/konten ── */
(function(){
  function mount(){
    const anchor=document.getElementById('nf-src-msg');
    if(!anchor||document.getElementById('nf-paste'))return false;
    const w=document.createElement('div');w.className='form-group';
    w.innerHTML='<label class="form-lbl" for="nf-paste">Atau tempel teks artikel (alternatif kalau link gagal)</label>'+
      '<textarea class="form-input" id="nf-paste" rows="5" placeholder="Salin seluruh teks artikel dari sumber, tempel di sini…" style="resize:vertical"></textarea>'+
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn-save-m" id="nf-paste-go">Olah dengan AI</button>'+
      '<span id="nf-paste-msg" style="font-size:.7rem;color:var(--text3);line-height:1.6">AI mengambil poin penting dan menulis ulang. Mengisi judul, kategori, ringkasan, dan konten.</span></div>';
    anchor.parentNode.parentNode.insertBefore(w,anchor.parentNode.nextSibling);
    document.getElementById('nf-paste-go').onclick=async()=>{
      const txt=document.getElementById('nf-paste').value.trim(),msg=document.getElementById('nf-paste-msg'),btn=document.getElementById('nf-paste-go');
      if(txt.length<400){msg.style.color='#E05A5A';msg.textContent='Teks terlalu pendek. Salin seluruh isi artikel.';return;}
      const cats=[...document.getElementById('nf-kat').options].map(o=>o.value).filter(Boolean);
      msg.style.color='var(--text3)';msg.textContent='AI sedang mengolah…';btn.disabled=true;
      try{
        const h={'Content-Type':'application/json'};
        try{h['Authorization']='Bearer '+await window._curUser.getIdToken();}catch(_){}
        const r=await fetch('/api/gemini',{method:'POST',headers:h,body:JSON.stringify({mode:'newstext',prompt:'KATEGORI: '+cats.join(' | ')+'\n\nTEKS:\n'+txt})});
        const j=await r.json();if(!r.ok)throw new Error(j.error||'Gagal');
        const d=JSON.parse(String(j.text).replace(/```json|```/g,'').trim());
        const set=(id,v)=>{const e=document.getElementById(id);if(e&&v){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}};
        set('nf-judul',d.judul);set('nf-excerpt',String(d.excerpt||'').slice(0,200));set('nf-konten',d.konten);
        if(cats.includes(d.kategori))set('nf-kat',d.kategori);
        if(d.sumber&&!document.getElementById('nf-src-name').value)set('nf-src-name',d.sumber);
        msg.style.color='#3DBA7A';msg.textContent='Terisi'+(cats.includes(d.kategori)?'':' (kategori pilih manual)')+'. Cek akurasi angka dan fakta dulu, lalu isi link sumber sebelum simpan.';
      }catch(e){msg.style.color='#E05A5A';msg.textContent=e.message;}
      btn.disabled=false;
    };
    return true;
  }
  if(!mount()){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,0));else setTimeout(mount,0);}
})();
