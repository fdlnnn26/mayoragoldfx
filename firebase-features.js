import{getFirestore,doc,setDoc,getDocs,collection,addDoc,updateDoc,deleteDoc,query,orderBy,serverTimestamp}from'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* reuse existing db and auth state */
function getDB(){return window._db;}

const CLOUD_NAME='dktcrzfck',CLOUD_PRESET='mayoragold_preset';
async function modUploadImg(file,slug,onProg){
  file = await window.compressImage(file);
  return new Promise((res,rej)=>{
    const fd=new FormData();
    fd.append('file',file,slug+'.webp');
    fd.append('upload_preset',CLOUD_PRESET);
    fd.append('folder','module-images');
    const xhr=new XMLHttpRequest();
    xhr.open('POST',`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.upload.onprogress=e=>{if(e.lengthComputable&&onProg)onProg(Math.round(e.loaded/e.total*100));};
    xhr.onload=()=>{if(xhr.status===200){try{res(JSON.parse(xhr.responseText).secure_url);}catch(e){rej(e);}}else{rej(new Error('Upload gagal '+xhr.status));}};
    xhr.onerror=()=>rej(new Error('Upload gagal. Cek koneksi.'));
    xhr.send(fd);
  });
}

/* ── Isi materi VIP disimpan di subcollection {koleksi}/{id}/private/content, yang dijaga Firestore Rules.
   Dokumen utama hanya berisi data untuk daftar/kartu (judul, cover, level, jumlah pelajaran, dll). ── */
window._loadPrivate=async function(coll,id){
  try{
    const {getDoc,doc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const sn=await getDoc(doc(getDB(),coll,id,'private','content'));
    return sn.exists()?sn.data():null;
  }catch(e){console.warn('[private '+coll+']',e.code||e);return null;}
};
window.modLoadModules=async function(){
  const db=getDB();if(!db)return;
  try{
    const q=query(collection(db,'modules'),orderBy('num','asc'));
    const snap=await getDocs(q);
    const arr=[];snap.forEach(d=>arr.push({id:d.id,...d.data()}));
    window._modAllModules=arr;
  }catch(e){console.error('modLoadModules:',e);window._modAllModules=[];}
  window.modRenderGrid();

  /* Show admin tab if admin */
  if(window._isAdmin){
    document.getElementById('mat-adm').style.display='block';
  }

  /* Load progress if logged in */
  const uid=window._curUser?.uid;
  if(uid&&db){
    try{
      const pSnap=await getDocs(collection(db,'users',uid,'progress'));
      pSnap.forEach(d=>window._modProgress[d.id]={...d.data()});
    }catch(_){}
  }
};

window.modSubBlockUploadImage=async function(li,si,input){
  let file=input.files[0];if(!file)return;
  file = await window.compressImage(file);
  const progWrap=document.getElementById(`msb-prog-${li}-${si}`);
  const progBar=document.getElementById(`msb-prog-bar-${li}-${si}`);
  const preview=document.getElementById(`msb-img-preview-${li}-${si}`);
  if(progWrap)progWrap.style.display='block';
  input.disabled=true;
  try{
    const slug=`mod-lesson-${li}-img-${si}-${Date.now()}`;
    let pct=0;
    const url=await new Promise((res,rej)=>{
      const fd=new FormData();
      fd.append('file',file,slug+'.webp');
      fd.append('upload_preset','mayoragold_preset');
      fd.append('folder','module-images');
      const xhr=new XMLHttpRequest();
      xhr.open('POST',`https://api.cloudinary.com/v1_1/dktcrzfck/image/upload`);
      xhr.upload.onprogress=e=>{
        if(e.lengthComputable){pct=Math.round(e.loaded/e.total*100);if(progBar)progBar.style.width=pct+'%';}
      };
      xhr.onload=()=>{
        if(xhr.status===200){try{res(JSON.parse(xhr.responseText).secure_url);}catch(e){rej(e);}}
        else{rej(new Error('Upload gagal '+xhr.status));}
      };
      xhr.onerror=()=>rej(new Error('Upload gagal. Cek koneksi.'));
      xhr.send(fd);
    });
    /* Save URL to block data */
    if(window._modFormBlocks[li]?.lessonBlocks?.[si]){
      window._modFormBlocks[li].lessonBlocks[si].imageUrl=url;
    }
    /* Show preview */
    if(preview){
      preview.style.display='block';
      preview.innerHTML=`<img src="${url}" style="max-width:100%;max-height:160px;object-fit:contain;border-radius:16px;border:1px solid var(--card-border)">
        <div style="font-size:.58rem;color:var(--green);margin-top:4px">✓ Gambar berhasil diupload</div>`;
    }
    if(progWrap)progWrap.style.display='none';
    toast('Upload','Gambar berhasil diunggah!','#3DBA7A');
  }catch(e){
    if(progWrap)progWrap.style.display='none';
    toast('Error',e.message,'#E05A5A');
  }finally{
    input.disabled=false;
  }
};

window.modSaveModule=async function(){
  const errEl=document.getElementById('mf-err-m');errEl.style.display='none';
  const title=document.getElementById('mf-title').value.trim();
  const num=parseInt(document.getElementById('mf-num').value)||1;
  const cat=document.getElementById('mf-cat').value;
  const level=document.getElementById('mf-level').value;
  const duration=parseInt(document.getElementById('mf-duration').value)||15;
  const vip=document.getElementById('mf-vip').value==='true';
  const excerpt=document.getElementById('mf-excerpt').value.trim();
  if(!title||!excerpt){errEl.textContent='⚠ Judul dan Deskripsi wajib diisi.';errEl.style.display='block';return;}
  const btn=document.getElementById('mf-save-btn');
  btn.disabled=true;btn.innerHTML='<div class="spin" style="border-top-color:var(--bg)"></div>';
  try{
    const db=getDB();
    const editId=document.getElementById('mf-edit-id').value||null;
    const coverFile=document.getElementById('mf-cover')?.files?.[0]||null;
    const oldCover=editId?(window._modAllModules.find(m=>m.id===editId)?.coverUrl||''):'';
    let coverUrl=editId?oldCover:'';
    if(coverFile){
      const progWrap=document.getElementById('cover-prog-m');
      const progBar=document.getElementById('cover-prog-bar-m');
      const progLbl=document.getElementById('cover-prog-lbl-m');
      if(progWrap)progWrap.style.display='block';
      if(progLbl){progLbl.style.display='block';progLbl.textContent='Mengunggah cover...';}
      const slug='module-'+(title.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,''));
      coverUrl=await modUploadImg(coverFile,slug+'-cover',pct=>{if(progBar)progBar.style.width=pct+'%';});
      if(progWrap)progWrap.style.display='none';
      if(progLbl)progLbl.style.display='none';
    }
    const lessons=(window._modFormBlocks||[])
      .filter(b=>b.type==='_lesson')
      .map(b=>({title:b.lessonTitle||'Pelajaran',duration:b.lessonDuration||10,blocks:b.lessonBlocks||[]}));
    const payload={title,num,cat,level,duration,vip,excerpt,coverUrl,lessonCount:lessons.length,updatedAt:serverTimestamp()};
    const _fs=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    let modId=editId;
    if(editId){payload.lessons=_fs.deleteField();await updateDoc(doc(db,'modules',editId),payload);}
    else{payload.createdAt=serverTimestamp();const ref=await addDoc(collection(db,'modules'),payload);modId=ref.id;}
    await _fs.setDoc(_fs.doc(db,'modules',modId,'private','content'),{lessons,updatedAt:serverTimestamp()});
    toast('Admin',editId?'Modul diperbarui!':'Modul ditambahkan!','#3DBA7A');
    window.modHideForm();
    await window.modLoadModules();
    window.modRenderAdminList();
  }catch(e){
    console.error('[modSaveModule]',e);
    errEl.textContent='⚠ '+(e.message||'Terjadi kesalahan.');errEl.style.display='block';
    toast('Error',e.message||'Gagal simpan','#E05A5A');
  }finally{
    btn.disabled=false;
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Modul';
  }
};

window.modDeleteModule=async function(id){
  if(!confirm('Hapus modul ini secara permanen?'))return;
  try{
    await deleteDoc(doc(getDB(),'modules',id));
    toast('Admin','Modul dihapus','#E05A5A');
    await window.modLoadModules();window.modRenderAdminList();
  }catch(e){toast('Error',e.message,'#E05A5A');}
};

/* ── THEME TOGGLE ── */
(function(){
  var stored = localStorage.getItem('mgfx-theme') || 'dark';
  function applyTheme(t){
    document.documentElement.classList.toggle('light', t==='light');
    var icon = document.getElementById('theme-icon');
    var lbl  = document.getElementById('theme-lbl');
    if(icon) icon.textContent = t==='light' ? '☀️' : '🌙';
    if(lbl)  lbl.textContent  = t==='light' ? 'Light' : 'Dark';
    localStorage.setItem('mgfx-theme', t);
  }
  applyTheme(stored);
  window.toggleTheme = function(){
    var isLight = document.documentElement.classList.contains('light');
    applyTheme(isLight ? 'dark' : 'light');
  };
})();

/* ── LEADERBOARD ── */
window.modLoadLeaderboard=async function(){
  const container=document.getElementById('mod-lb-container');
  if(!container)return;
  container.innerHTML='<div style="text-align:center;padding:48px 24px;color:var(--text3)"><div style="font-family:\'Space Grotesk\',sans-serif;font-size:2.8rem;opacity:.1;color:var(--gold);margin-bottom:10px">🏆</div><div style="font-size:.72rem">Memuat leaderboard...</div></div>';
  const db=getDB();if(!db)return;
  try{
    const {getDocs,collection}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

    /* Ambil semua users */
    const usersSnap=await getDocs(collection(db,'users'));
    const userList=[];
    usersSnap.forEach(d=>userList.push({uid:d.id,...d.data()}));

    const allMods=window._modAllModules||[];

    /* Untuk setiap user, ambil progress subcollection */
    const ranked=[];
    await Promise.all(userList.map(async u=>{
      try{
        const pSnap=await getDocs(collection(db,'users',u.uid,'progress'));
        let completedModules=0,totalLessons=0;
        pSnap.forEach(d=>{
          const prog=d.data();
          const lessons=prog.completedLessons||[];
          totalLessons+=lessons.length;
          const mod=allMods.find(m=>m.id===d.id);
          const totalL=mod?modCount(mod):0;
          if(totalL>0&&lessons.length>=totalL)completedModules++;
        });
        if(completedModules>0||totalLessons>0){
          const displayName=u.displayName||u.name||u.email||('Trader #'+u.uid.slice(0,6));
          ranked.push({uid:u.uid,displayName,completedModules,totalLessons});
        }
      }catch(_){}
    }));

    ranked.sort((a,b)=>b.completedModules-a.completedModules||b.totalLessons-a.totalLessons);

    if(!ranked.length){
      container.innerHTML='<div style="text-align:center;padding:48px 24px;color:var(--text3)"><div style="font-family:\'Space Grotesk\',sans-serif;font-size:2.8rem;opacity:.15;color:var(--gold);margin-bottom:10px">🏆</div><div style="font-size:.72rem;line-height:1.9">Belum ada data. Jadilah yang pertama menyelesaikan modul!</div></div>';
      return;
    }

    const medals=['🥇','🥈','🥉'];
    const podiumColors=['#C9A84C','#A0A0A0','#CD7F32'];
    const podiumBg=['rgba(201,168,76,0.12)','rgba(160,160,160,0.08)','rgba(205,127,50,0.08)'];

    /* TOP 3 PODIUM */
    let podiumHtml='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px">';
    ranked.slice(0,3).forEach((u,i)=>{
      const initials=(u.displayName||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
      podiumHtml+=`<div style="background:${podiumBg[i]||'var(--bg3)'};border:1px solid ${i===0?'rgba(201,168,76,0.4)':'var(--card-border)'};border-radius:20px;padding:20px 12px;text-align:center;position:relative;${i===0?'transform:translateY(-8px)':''}">
        <div style="font-size:1.6rem;margin-bottom:8px">${medals[i]||''}</div>
        <div style="width:48px;height:48px;border-radius:50%;background:var(--bg4);border:2px solid ${podiumColors[i]||'var(--card-border)'};margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;font-size:1.1rem;color:${podiumColors[i]||'var(--text2)'};font-weight:600">${initials}</div>
        <div style="font-size:.72rem;font-weight:500;color:var(--text);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${mesc(u.displayName)}</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:1.5rem;color:${podiumColors[i]||'var(--gold)'};font-weight:600;line-height:1">${u.completedModules}</div>
        <div style="font-size:.52rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text3);margin-top:4px">Modul Selesai</div>
        <div style="font-size:.58rem;color:var(--text3);margin-top:3px">${u.totalLessons} pelajaran</div>
      </div>`;
    });
    podiumHtml+='</div>';

    /* RANKING TABLE for rank 4+ */
    let tableHtml='';
    if(ranked.length>3){
      tableHtml='<div style="background:var(--bg3);border:1px solid var(--card-border);border-radius:18px;overflow:hidden">';
      tableHtml+='<div style="padding:12px 18px;border-bottom:1px solid var(--card-border);font-size:.54rem;letter-spacing:.2em;text-transform:uppercase;color:var(--text3)">Peringkat Lainnya</div>';
      ranked.slice(3).forEach((u,i)=>{
        const rank=i+4;
        const initials=(u.displayName||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
        tableHtml+=`<div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(201,168,76,0.04)">
          <div style="width:24px;text-align:center;font-size:.7rem;color:var(--text3);font-weight:500">${rank}</div>
          <div style="width:34px;height:34px;border-radius:50%;background:var(--bg4);border:1px solid var(--card-border);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--text3);font-family:'Space Grotesk',sans-serif">${initials}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.74rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${mesc(u.displayName)}</div>
            <div style="font-size:.58rem;color:var(--text3)">${u.totalLessons} pelajaran selesai</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:'Space Grotesk',sans-serif;font-size:1.1rem;color:var(--gold)">${u.completedModules}</div>
            <div style="font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text3)">Modul</div>
          </div>
        </div>`;
      });
      tableHtml+='</div>';
    }

    /* Current user highlight */
    const myUid=window._curUser?.uid;
    let myRankHtml='';
    if(myUid){
      const myRank=ranked.findIndex(u=>u.uid===myUid);
      if(myRank>=0){
        myRankHtml=`<div style="margin-top:16px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.3);border-radius:18px;padding:14px 18px;display:flex;align-items:center;gap:12px">
          <div style="font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)">Peringkat Kamu</div>
          <div style="font-family:'Space Grotesk',sans-serif;font-size:1.4rem;color:var(--gold);margin-left:auto">#${myRank+1}</div>
          <div style="font-size:.72rem;color:var(--text2)">${ranked[myRank].completedModules} modul · ${ranked[myRank].totalLessons} pelajaran</div>
        </div>`;
      } else {
        myRankHtml=`<div style="margin-top:16px;background:var(--bg3);border:1px solid var(--card-border);border-radius:18px;padding:14px 18px;font-size:.72rem;color:var(--text3);text-align:center">Kamu belum menyelesaikan modul apapun. Yuk mulai belajar! 🚀</div>`;
      }
    }

    container.innerHTML=podiumHtml+tableHtml+myRankHtml;
  }catch(e){
    console.error('[leaderboard]',e);
    container.innerHTML='<div style="text-align:center;padding:32px;color:var(--text3);font-size:.72rem">Gagal memuat leaderboard: '+mesc(e.message||'unknown error')+'</div>';
  }
};

/* Hook into existing Firebase auth state — load modules once auth resolves */
const _origAuthReady=window._onAuthReady;
function afterAuth(){
  window.modLoadModules();
}
/* Poll for _db to be ready then load modules */
(function waitDB(){
  if(window._db){afterAuth();}
  else{setTimeout(waitDB,300);}
})();

/* ══════════════════════════════════════════
   RESEARCH HARIAN — CRUD + PUBLIC VIEW
══════════════════════════════════════════ */
(function(){
  var _rsCache=[];
  var _rsImageSlots=[];   // [{file, url}]

  /* ── helpers ── */
  function getDB(){ return window._db || window.getDB(); }

  function fmtDate(d){
    if(!d) return '';
    var dt = d.toDate ? d.toDate() : new Date(d);
    return dt.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  }

  /* ── upload single image to Cloudinary ── */
  async function rsUploadImg(file, idx){
    var compressed = await window.compressImage(file);
    return new Promise(function(resolve, reject){
      var fd = new FormData();
      fd.append('file', compressed);
      fd.append('upload_preset', 'mayoragold_preset');
      fd.append('public_id', 'research-'+Date.now()+'-'+idx);
      var xhr = new XMLHttpRequest();
      xhr.open('POST','https://api.cloudinary.com/v1_1/dktcrzfck/image/upload');
      xhr.onload = function(){
        try{ var r=JSON.parse(xhr.responseText); resolve(r.secure_url||r.url); }
        catch(e){ reject(new Error('Upload gagal')); }
      };
      xhr.onerror = function(){ reject(new Error('Network error')); };
      xhr.send(fd);
    });
  }

  /* ── IMAGE SLOTS (admin form) ── */
  /* ── LEMBARAN (slides) admin ── */
  var _rsLembarSlots = []; // [{file, url, teks}]
  var _rsThumbSlot = {file:null, url:''};

  function rsUpdateLembarCount(){
    var active = _rsLembarSlots.filter(function(s){ return s && !s._removed; }).length;
    var el = document.getElementById('rs-lembar-count');
    if(el) el.textContent = active + ' Lembar';
  }

  /* ── BLOCK-BASED LEMBAR SYSTEM ── */
  // Each lembar slot now stores an array of blocks: [{type:'gambar'|'h2'|'teks', ...data}]
  // _rsLembarSlots[idx] = {_removed, blocks:[...], _blockCount}

  function rsRenderLembarBlocks(idx){
    var slot = _rsLembarSlots[idx];
    if(!slot) return;
    var blocksWrap = document.getElementById('rs-lembar-blocks-'+idx);
    if(!blocksWrap) return;
    blocksWrap.innerHTML = '';
    (slot.blocks||[]).forEach(function(block, bi){
      var bdiv = document.createElement('div');
      bdiv.id = 'rs-block-'+idx+'-'+bi;
      bdiv.style.cssText = 'background:var(--bg4);border:1px solid var(--card-border);border-radius:16px;padding:12px;margin-bottom:8px;position:relative';
      var removeBtn = '<button type="button" onclick="rsRemoveBlock('+idx+','+bi+')" style="position:absolute;top:8px;right:8px;background:rgba(224,90,90,.08);border:1px solid rgba(224,90,90,.2);color:var(--red);cursor:pointer;font-size:.55rem;padding:2px 8px;border-radius:var(--radius)">✕</button>';
      if(block.type === 'gambar'){
        var hasImg = block.url||'';
        bdiv.innerHTML = '<div style="font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">🖼 Gambar</div>'
          + removeBtn
          +'<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style="font-size:.65rem;color:var(--text2);width:100%;margin-bottom:6px" onchange="rsBlockHandleFile('+idx+','+bi+',this)">'
          +'<div id="rs-bprev-'+idx+'-'+bi+'" style="margin-bottom:6px">'
          +(hasImg?'<div style="border-radius:12px;overflow:hidden;border:1px solid var(--card-border)"><img src="'+hasImg+'" style="width:100%;max-height:180px;object-fit:contain;display:block;background:var(--bg3)"></div>':'')
          +'</div>'
          +'<input class="form-inp" type="text" placeholder="Caption (opsional)" value="'+(block.caption||'')+'" style="font-size:.68rem" oninput="rsBlockUpdate('+idx+','+bi+',\'caption\',this.value)">';
      } else if(block.type === 'h2'){
        bdiv.innerHTML = '<div style="font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">H2 Header</div>'
          + removeBtn
          +'<input class="form-inp" type="text" placeholder="Contoh: Analisa Supply & Demand" value="'+(block.value||'')+'" style="font-size:.8rem;font-weight:600" oninput="rsBlockUpdate('+idx+','+bi+',\'value\',this.value)">';
      } else if(block.type === 'teks'){
        bdiv.innerHTML = '<div style="font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:8px">¶ Teks</div>'
          + removeBtn
          +'<textarea class="form-inp form-textarea" rows="4" placeholder="Tulis analisa di sini..." style="font-size:.7rem;resize:vertical" oninput="rsBlockUpdate('+idx+','+bi+',\'value\',this.value)">'+(block.value||'')+'</textarea>';
      }
      blocksWrap.appendChild(bdiv);
    });
  }

  window.rsBlockUpdate = function(idx, bi, key, val){
    if(_rsLembarSlots[idx]&&_rsLembarSlots[idx].blocks[bi]) _rsLembarSlots[idx].blocks[bi][key]=val;
  };

  window.rsBlockHandleFile = function(idx, bi, inp){
    var file = inp.files[0]; if(!file) return;
    _rsLembarSlots[idx].blocks[bi].file = file;
    _rsLembarSlots[idx].blocks[bi].url = '';
    var reader = new FileReader();
    reader.onload = function(e){
      var prev = document.getElementById('rs-bprev-'+idx+'-'+bi);
      if(prev) prev.innerHTML = '<div style="border-radius:12px;overflow:hidden;border:1px solid var(--card-border);position:relative">'
        +'<img src="'+e.target.result+'" style="width:100%;max-height:180px;object-fit:contain;display:block;background:var(--bg3)">'
        +'<div style="position:absolute;bottom:4px;right:6px;font-size:.5rem;color:var(--green);background:rgba(10,10,13,.8);padding:2px 6px;border-radius:10px">✓ Siap upload</div>'
        +'</div>';
    };
    reader.readAsDataURL(file);
  };

  window.rsAddBlock = function(idx, type){
    var slot = _rsLembarSlots[idx]; if(!slot) return;
    slot.blocks = slot.blocks||[];
    var block = {type:type};
    if(type==='gambar') block = {type:'gambar', file:null, url:'', caption:''};
    else if(type==='h2') block = {type:'h2', value:''};
    else if(type==='teks') block = {type:'teks', value:''};
    slot.blocks.push(block);
    rsRenderLembarBlocks(idx);
    // Scroll to new block
    setTimeout(function(){
      var el = document.getElementById('rs-block-'+idx+'-'+(slot.blocks.length-1));
      if(el) el.scrollIntoView({behavior:'smooth', block:'nearest'});
    }, 50);
  };

  window.rsRemoveBlock = function(idx, bi){
    if(_rsLembarSlots[idx]&&_rsLembarSlots[idx].blocks) _rsLembarSlots[idx].blocks.splice(bi,1);
    rsRenderLembarBlocks(idx);
  };

  window.rsAddLembar = function(){
    var idx = _rsLembarSlots.length;
    _rsLembarSlots.push({_removed:false, blocks:[]});
    var wrap = document.getElementById('rs-lembar-wrap');
    var div = document.createElement('div');
    div.id = 'rs-lembar-slot-'+idx;
    div.style.cssText = 'border:1px solid var(--gold-border);border-radius:18px;padding:16px;background:var(--bg3);margin-bottom:12px';
    div.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      +'<span style="font-size:.6rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)">Lembar '+(idx+1)+'</span>'
      +'<button type="button" onclick="rsRemoveLembar('+idx+')" style="background:rgba(224,90,90,.08);border:1px solid rgba(224,90,90,.25);color:var(--red);cursor:pointer;font-size:.58rem;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:var(--radius)">Hapus</button>'
      +'</div>'
      // blocks container
      +'<div id="rs-lembar-blocks-'+idx+'"></div>'
      // add block buttons
      +'<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
      +'<button type="button" onclick="rsAddBlock('+idx+',\'gambar\')" style="display:flex;align-items:center;gap:5px;background:rgba(201,168,76,.06);border:1px dashed var(--gold-border);color:var(--text2);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:7px 14px;border-radius:var(--radius);cursor:pointer;transition:all .2s" onmouseover="this.style.borderColor=\'var(--gold)\';this.style.color=\'var(--gold)\'" onmouseout="this.style.borderColor=\'var(--gold-border)\';this.style.color=\'var(--text2)\'">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> + Gambar</button>'
      +'<button type="button" onclick="rsAddBlock('+idx+',\'h2\')" style="display:flex;align-items:center;gap:5px;background:rgba(201,168,76,.06);border:1px dashed var(--gold-border);color:var(--text2);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:7px 14px;border-radius:var(--radius);cursor:pointer;transition:all .2s" onmouseover="this.style.borderColor=\'var(--gold)\';this.style.color=\'var(--gold)\'" onmouseout="this.style.borderColor=\'var(--gold-border)\';this.style.color=\'var(--text2)\'">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M4 6h16M4 12h8M4 18h12"/></svg> + H2</button>'
      +'<button type="button" onclick="rsAddBlock('+idx+',\'teks\')" style="display:flex;align-items:center;gap:5px;background:rgba(201,168,76,.06);border:1px dashed var(--gold-border);color:var(--text2);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:7px 14px;border-radius:var(--radius);cursor:pointer;transition:all .2s" onmouseover="this.style.borderColor=\'var(--gold)\';this.style.color=\'var(--gold)\'" onmouseout="this.style.borderColor=\'var(--gold-border)\';this.style.color=\'var(--text2)\'">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg> + Teks</button>'
      +'</div>';
    wrap.appendChild(div);
    rsUpdateLembarCount();
    setTimeout(function(){ div.scrollIntoView({behavior:'smooth', block:'nearest'}); }, 50);
  };

  // Legacy compat stubs (replaced by block system)
  window.rsHandleLembarFile    = function(){};
  window.rsHandleLembarCaption = function(){};
  window.rsHandleLembarHeader  = function(){};
  window.rsHandleLembarInfo    = function(){};
  window.rsHandleLembarUrl     = function(){};
  window.rsHandleLembarTeks    = function(){};

  window.rsRemoveLembar = function(idx){
    _rsLembarSlots[idx]._removed = true;
    var slot = document.getElementById('rs-lembar-slot-'+idx);
    if(slot) slot.remove();
    rsUpdateLembarCount();
  };

  // Thumbnail
  window.rsHandleThumb = function(inp){
    var file = inp.files[0];
    if(!file) return;
    _rsThumbSlot = {file:file, url:''};
    var reader = new FileReader();
    reader.onload = function(e){
      var prev = document.getElementById('rs-thumb-prev');
      if(prev) prev.innerHTML = '<img src="'+e.target.result+'" style="max-width:100%;max-height:120px;object-fit:contain;border-radius:12px;border:1px solid var(--card-border)">'
        +'<div style="font-size:.55rem;color:var(--green);margin-top:3px">✓ Thumbnail siap</div>';
    };
    reader.readAsDataURL(file);
  };

  window.rsPreviewThumb = function(url){
    _rsThumbSlot = {file:null, url:url.trim()};
    var prev = document.getElementById('rs-thumb-prev');
    if(prev && url.trim()){
      prev.innerHTML = '<img src="'+url.trim()+'" style="max-width:100%;max-height:120px;object-fit:contain;border-radius:12px;border:1px solid var(--card-border)" onerror="this.style.display=\'none\'">';
    } else if(prev){ prev.innerHTML=''; }
  };

  /* ── legacy compat (old data used _rsImageSlots) ── */
  var _rsImageSlots = [];
  window.rsAddImageSlot = window.rsAddLembar; // redirect old calls

  /* ── FORM show/hide ── */
  window.rsShowForm = function(editData){
    _rsLembarSlots = [];
    _rsThumbSlot = {file:null, url:''};
    document.getElementById('rs-lembar-wrap').innerHTML = '';
    document.getElementById('rs-edit-id').value = '';
    document.getElementById('rs-form-title-lbl').textContent = 'Tambah Research Baru';
    document.getElementById('rs-judul').value = '';
    document.getElementById('rs-tgl').value = new Date().toISOString().slice(0,10);
    document.getElementById('rs-akses').value = 'vip';
    document.getElementById('rs-ringkasan').value = '';
    document.getElementById('rs-konten').value = '';
    document.getElementById('rs-thumbnail-url').value = '';
    document.getElementById('rs-thumb-prev').innerHTML = '';
    document.getElementById('rs-save-err').style.display = 'none';
    rsUpdateLembarCount();
    if(editData){
      document.getElementById('rs-edit-id').value = editData.id;
      document.getElementById('rs-form-title-lbl').textContent = 'Edit Research';
      document.getElementById('rs-judul').value = editData.judul||'';
      if(editData.tgl){ document.getElementById('rs-tgl').value = editData.tgl; }
      document.getElementById('rs-akses').value = editData.akses||'vip';
      document.getElementById('rs-ringkasan').value = editData.ringkasan||'';
      document.getElementById('rs-konten').value = editData.konten||'';
      // Restore thumbnail
      if(editData.thumbnail){
        _rsThumbSlot = {file:null, url:editData.thumbnail};
        document.getElementById('rs-thumbnail-url').value = editData.thumbnail;
        document.getElementById('rs-thumb-prev').innerHTML = '<img src="'+editData.thumbnail+'" style="max-width:100%;max-height:120px;object-fit:contain;border-radius:12px;border:1px solid var(--card-border)">';
      }
      // Restore lembaran (block-based, with legacy fallback)
      var lembaran = editData.lembaran||[];
      // fallback: old images array
      if(!lembaran.length && (editData.images||[]).length){
        lembaran = (editData.images||[]).map(function(url){ return {blocks:[{type:'gambar',url:url,caption:''}]}; });
      }
      lembaran.forEach(function(l){
        // Convert legacy format {gambar, header, teks} -> blocks
        var blocks = l.blocks;
        if(!blocks){
          blocks = [];
          if(l.gambar) blocks.push({type:'gambar', url:l.gambar, caption:l.caption||l.info||''});
          if(l.header) blocks.push({type:'h2', value:l.header});
          if(l.teks)   blocks.push({type:'teks', value:l.teks});
        }
        var idx = _rsLembarSlots.length;
        _rsLembarSlots.push({_removed:false, blocks: blocks.map(function(b){ return Object.assign({},b); })});
        var wrap = document.getElementById('rs-lembar-wrap');
        var div = document.createElement('div');
        div.id = 'rs-lembar-slot-'+idx;
        div.style.cssText = 'border:1px solid var(--gold-border);border-radius:18px;padding:16px;background:var(--bg3);margin-bottom:12px';
        div.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
          +'<span style="font-size:.6rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)">Lembar '+(idx+1)+'</span>'
          +'<button type="button" onclick="rsRemoveLembar('+idx+')" style="background:rgba(224,90,90,.08);border:1px solid rgba(224,90,90,.25);color:var(--red);cursor:pointer;font-size:.58rem;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:var(--radius)">Hapus</button>'
          +'</div>'
          +'<div id="rs-lembar-blocks-'+idx+'"></div>'
          +'<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
          +'<button type="button" onclick="rsAddBlock('+idx+',\'gambar\')" style="display:flex;align-items:center;gap:5px;background:rgba(201,168,76,.06);border:1px dashed var(--gold-border);color:var(--text2);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:7px 14px;border-radius:var(--radius);cursor:pointer">+ Gambar</button>'
          +'<button type="button" onclick="rsAddBlock('+idx+',\'h2\')" style="display:flex;align-items:center;gap:5px;background:rgba(201,168,76,.06);border:1px dashed var(--gold-border);color:var(--text2);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:7px 14px;border-radius:var(--radius);cursor:pointer">+ H2</button>'
          +'<button type="button" onclick="rsAddBlock('+idx+',\'teks\')" style="display:flex;align-items:center;gap:5px;background:rgba(201,168,76,.06);border:1px dashed var(--gold-border);color:var(--text2);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;padding:7px 14px;border-radius:var(--radius);cursor:pointer">+ Teks</button>'
          +'</div>';
        wrap.appendChild(div);
        rsRenderLembarBlocks(idx);
      });
      rsUpdateLembarCount();
    }
    document.getElementById('rs-form-wrap').style.display = 'block';
    document.getElementById('rs-form-wrap').scrollIntoView({behavior:'smooth'});
  };

  window.rsHideForm = function(){
    document.getElementById('rs-form-wrap').style.display = 'none';
    _rsLembarSlots = [];
    _rsThumbSlot = {file:null, url:''};
  };

  /* ── SAVE ── */
  window.rsSaveResearch = async function(){
    var btn = document.getElementById('rs-save-btn');
    var errEl = document.getElementById('rs-save-err');
    errEl.style.display = 'none';
    var judul = document.getElementById('rs-judul').value.trim();
    var tgl = document.getElementById('rs-tgl').value;
    var akses = document.getElementById('rs-akses').value;
    var ringkasan = document.getElementById('rs-ringkasan').value.trim();
    var konten = document.getElementById('rs-konten').value.trim();
    if(!judul||!tgl){ errEl.textContent='⚠ Judul dan tanggal wajib diisi.'; errEl.style.display='block'; return; }
    btn.disabled = true;
    btn.innerHTML = '<div class="spin" style="border-top-color:var(--bg)"></div>';
    try{
      // Upload lembaran (block-based)
      var lembaranData = [];
      for(var i=0;i<_rsLembarSlots.length;i++){
        var slot = _rsLembarSlots[i];
        if(!slot || slot._removed) continue;
        var blocks = slot.blocks||[];
        var uploadedBlocks = [];
        for(var bi=0;bi<blocks.length;bi++){
          var block = blocks[bi];
          if(block.type==='gambar'){
            var imgUrl = block.url||'';
            if(block.file){
              toast('Research','Mengupload gambar lembar '+(i+1)+' blok '+(bi+1)+'...','var(--gold)');
              imgUrl = await rsUploadImg(block.file, i*100+bi);
              block.url = imgUrl; block.file = null;
            }
            uploadedBlocks.push({type:'gambar', url:imgUrl, caption:block.caption||''});
          } else if(block.type==='h2'){
            uploadedBlocks.push({type:'h2', value:block.value||''});
          } else if(block.type==='teks'){
            uploadedBlocks.push({type:'teks', value:block.value||''});
          }
        }
        lembaranData.push({blocks:uploadedBlocks});
      }
      // Upload thumbnail
      var thumbUrl = _rsThumbSlot.url||'';
      if(_rsThumbSlot.file){
        toast('Research','Mengupload thumbnail...','var(--gold)');
        thumbUrl = await rsUploadImg(_rsThumbSlot.file, 99);
      }
      // Fallback thumbnail = gambar pertama dari blocks
      if(!thumbUrl && lembaranData.length){
        for(var _li=0;_li<lembaranData.length;_li++){
          var _bl = (lembaranData[_li].blocks||[]).find(function(b){return b.type==='gambar'&&b.url;});
          if(_bl){ thumbUrl=_bl.url; break; }
        }
      }
      var {collection, addDoc, updateDoc, doc, serverTimestamp} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      var db = getDB();
      var editId = document.getElementById('rs-edit-id').value||null;
      var _fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      var payload = {judul, tgl, akses, ringkasan, thumbnail:thumbUrl, lembarCount:lembaranData.length, updatedAt:serverTimestamp()};
      var rsId = editId;
      if(editId){ payload.konten=_fs.deleteField(); payload.lembaran=_fs.deleteField(); payload.images=_fs.deleteField(); await updateDoc(doc(db,'research',editId), payload); }
      else { payload.createdAt = serverTimestamp(); var _ref = await addDoc(collection(db,'research'), payload); rsId = _ref.id; }
      await _fs.setDoc(_fs.doc(db,'research',rsId,'private','content'), {konten:konten, lembaran:lembaranData, updatedAt:serverTimestamp()});
      toast('Research', editId?'Research diperbarui!':'Research ditambahkan!','#3DBA7A');
      window.rsHideForm();
      await window.rsLoadResearch();
      window.rsRenderAdminList();
    } catch(e){
      console.error('[rsSave]',e);
      errEl.textContent='⚠ '+(e.message||'Gagal menyimpan.');
      errEl.style.display='block';
    } finally {
      btn.disabled=false;
      btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Research';
    }
  };

  /* ── DELETE ── */
  window.rsDeleteResearch = async function(id){
    if(!confirm('Hapus research ini secara permanen?')) return;
    try{
      var {deleteDoc, doc} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      await deleteDoc(doc(getDB(),'research',id));
      toast('Research','Research dihapus','#E05A5A');
      await window.rsLoadResearch();
      window.rsRenderAdminList();
      window.rsRenderPublic();
    } catch(e){ toast('Error',e.message,'#E05A5A'); }
  };

  /* ── LOAD FROM FIREBASE ── */
  window.rsMigrateAll = async function(){
    if(!window._isAdmin){ console.warn('Khusus admin'); return; }
    var fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'); var db = getDB(); var n = 0;
    var snap = await fs.getDocs(fs.collection(db,'research'));
    for(var i=0;i<snap.docs.length;i++){
      var d = snap.docs[i], x = d.data();
      if(x.lembaran===undefined && x.konten===undefined && x.images===undefined) continue;
      await fs.setDoc(fs.doc(db,'research',d.id,'private','content'), {konten:x.konten||'', lembaran:x.lembaran||[], images:x.images||[]});
      await fs.updateDoc(fs.doc(db,'research',d.id), {lembarCount:(x.lembaran||[]).length||(x.images||[]).length, konten:fs.deleteField(), lembaran:fs.deleteField(), images:fs.deleteField()});
      n++;
    }
    console.log('Migrasi research selesai:', n); toast('Admin','Migrasi research selesai: '+n,'#3DBA7A');
    await window.rsLoadResearch();
  };

  window.rsLoadResearch = async function(){
    try{
      var {collection, getDocs, query, orderBy} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      var q = query(collection(getDB(),'research'), orderBy('tgl','desc'));
      var snap = await getDocs(q);
      _rsCache = snap.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
    } catch(e){ console.error('[rsLoad]',e); _rsCache=[]; }
    window.rsRenderPublic();
    if(window._isAdmin) window.rsRenderAdminList();
  };

  /* ── RENDER ADMIN LIST ── */
  window.rsRenderAdminList = function(){
    var el = document.getElementById('rs-admin-list');
    if(!el) return;
    if(!_rsCache.length){ el.innerHTML='<div class="empty-state">Belum ada research.</div>'; return; }
    // Simpan cache ke window supaya bisa dipanggil dari onclick tanpa JSON.stringify
    window._rsCacheMap = {};
    _rsCache.forEach(function(r){ window._rsCacheMap[r.id] = r; });
    el.innerHTML = _rsCache.map(function(r){
      var lembarCount = r.lembarCount!=null ? r.lembarCount : ((r.lembaran||[]).length || (r.images||[]).length);
      var thumb = r.thumbnail || '';
      if(!thumb && r.lembaran && r.lembaran[0]){
        var _lb = r.lembaran[0];
        if(_lb.blocks){ var _gb=(_lb.blocks||[]).find(function(b){return b.type==='gambar'&&b.url;}); if(_gb) thumb=_gb.url; }
        else { thumb = _lb.gambar||''; }
      }
      if(!thumb && r.images && r.images[0]) thumb = r.images[0];
      return '<div style="background:var(--bg3);border:1px solid var(--card-border);border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">'
        +(thumb?'<div style="width:52px;height:52px;flex-shrink:0;border-radius:12px;overflow:hidden;background:var(--bg4);border:1px solid var(--card-border)"><img src="'+thumb+'" style="width:100%;height:100%;object-fit:cover" loading="lazy"></div>':'')
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:.72rem;font-weight:500;color:var(--text);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+r.judul+'</div>'
        +'<div style="font-size:.6rem;color:var(--text3);display:flex;gap:8px;flex-wrap:wrap">'

        +'<span>'+fmtDate(r.tgl||r.createdAt)+'</span>'
        +'<span style="color:'+(r.akses==='vip'?'var(--gold)':'var(--green)')+'">'+( r.akses==='vip'?'VIP':'FREE')+'</span>'
        +(lembarCount?'<span style="color:var(--text2)">📄 '+lembarCount+' lembar</span>':'<span style="color:var(--text3)">— belum ada lembar</span>')
        +'</div></div>'
        +'<div style="display:flex;gap:6px;flex-shrink:0">'
        +'<button onclick="rsEditById(\''+r.id+'\')" style="background:transparent;border:1px solid var(--card-border);color:var(--text2);font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;padding:5px 10px;border-radius:var(--radius);cursor:pointer">Edit</button>'
        +'<button onclick="rsDeleteResearch(\''+r.id+'\')" style="background:transparent;border:1px solid rgba(224,90,90,.25);color:var(--red);font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;padding:5px 10px;border-radius:var(--radius);cursor:pointer">Hapus</button>'
        +'</div></div>';
    }).join('');
  };

  window._rsHydrate = async function(r){
    if(r._hyd) return r;
    if(!r.lembaran && !r.konten && !(r.images||[]).length){
      var c = await window._loadPrivate('research', r.id);
      if(c){ r.konten=c.konten||''; r.lembaran=c.lembaran||[]; r.images=c.images||[]; }
    }
    r._hyd = true; return r;
  };
  window.rsEditById = async function(id){
    var r = window._rsCacheMap && window._rsCacheMap[id];
    if(r){ await window._rsHydrate(r); window.rsShowForm(r); }
  };

  /* ── FILTER (public) ── */
  var _rsPage = 0;
  var RS_PER_PAGE = 5;

  /* ── RENDER PUBLIC LIST ── */
  window.rsRenderPublic = function(){
    var el = document.getElementById('rs-public-list');
    if(!el) return;
    var isVip = window._isVip || window._isAdmin;
    var data = _rsCache.slice();
    if(!data.length){ el.innerHTML='<div class="empty-state">Belum ada research tersedia.</div>'; return; }

    el.innerHTML = data.map(function(r){
      var locked = (r.akses==='vip') && !isVip;
      var thumb = r.thumbnail || (r.lembaran&&r.lembaran[0]&&r.lembaran[0].gambar) || (r.images&&r.images[0]) || '';
      var lembarCount = r.lembarCount!=null ? r.lembarCount : ((r.lembaran||[]).length || (r.images||[]).length);
      return '<div onclick="rsOpenDetail(\''+r.id+'\')" style="cursor:pointer;background:var(--bg3);border:1px solid var(--card-border);border-radius:16px;overflow:hidden;margin-bottom:12px;transition:border-color .2s" onmouseover="this.style.borderColor=\'var(--gold)\'" onmouseout="this.style.borderColor=\'var(--card-border)\'">'
        +(thumb
          ?'<div style="width:100%;aspect-ratio:16/9;overflow:hidden;background:var(--bg4);position:relative">'
            +'<img src="'+thumb+'" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy">'
            +(lembarCount>1?'<div style="position:absolute;bottom:8px;right:10px;background:rgba(10,10,13,.75);backdrop-filter:blur(4px);border:1px solid var(--card-border);border-radius:26px;padding:3px 10px;font-size:.55rem;letter-spacing:.1em;color:var(--gold);display:flex;align-items:center;gap:4px">'
              +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8M12 3v4"/></svg>'
              +lembarCount+' lembar</div>':'')
            +'</div>'
          :'')
        +'<div style="padding:14px 16px">'
        +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">'

        +(locked?'<span style="font-size:.52rem;background:rgba(201,168,76,.12);color:var(--gold);padding:2px 7px;border-radius:20px;border:1px solid var(--gold-border)">VIP</span>':'')
        +'<span style="font-size:.58rem;color:var(--text3);margin-left:auto">'+fmtDate(r.tgl||r.createdAt)+'</span>'
        +'</div>'
        +'<div style="font-size:.8rem;font-weight:500;color:var(--text);margin-bottom:6px">'+r.judul+'</div>'
        +(locked?'<div style="font-size:.65rem;color:var(--text3)">🔒 Konten khusus member VIP — <span style="color:var(--gold);cursor:pointer" onclick="event.stopPropagation();goPage(\'vip\')">Upgrade gratis →</span></div>'
          :'<div style="font-size:.65rem;color:var(--text2);line-height:1.6">'+r.ringkasan+'</div>')
        +'</div></div>';
    }).join('');
  };

  window.rsGoPage = function(p){
    _rsPage = p;
    window.rsRenderPublic();
    window.scrollTo(0,0);
  };

  /* ── OPEN / CLOSE DETAIL ── */
  var _rsDetailId = null;
  var _rsCurrentLembar = 0;

  window.rsOpenDetail = function(id){
    var r = _rsCache.find(function(x){ return x.id===id; });
    if(!r) return;
    var isVip = window._isVip || window._isAdmin;
    var locked = (r.akses==='vip') && !isVip;
    if(!locked && !r._hyd){ window._rsHydrate(r).then(function(){ window.rsOpenDetail(id); }); return; }
    var el = document.getElementById('rs-detail-content');
    if(!el) return;

    _rsDetailId = id;
    _rsCurrentLembar = 0;

    var navHtml = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px">'
      +'<button onclick="rsCloseDetail()" style="background:transparent;border:1px solid var(--card-border);color:var(--text2);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;padding:8px 14px;border-radius:var(--radius);cursor:pointer;transition:all .2s">← Kembali</button>'
      +'<div style="display:flex;align-items:center;gap:6px">'
      +'<span style="font-size:.6rem;color:var(--text3)">'+fmtDate(r.tgl||r.createdAt)+'</span>'

      +'</div></div>';

    if(locked){
      el.innerHTML = navHtml
        +'<div style="text-align:center;padding:48px 24px">'
        +''
        +'<div style="font-size:.9rem;font-weight:500;color:var(--text);margin-bottom:8px">Konten VIP Terkunci</div>'
        +'<div style="font-size:.72rem;color:var(--text2);margin-bottom:20px">Research ini hanya untuk member VIP. Upgrade gratis sekarang!</div>'
        +'<button onclick="goPage(\'vip\')" class="btn-hero-primary">JOIN VIP GRATIS</button></div>';
    } else {
      var lembaran = (r.lembaran||[]);
      // Fallback: jika data lama (pakai images array), jadikan lembaran single
      if(!lembaran.length && (r.images||[]).length){
        lembaran = (r.images||[]).map(function(url,i){ return {gambar:url, teks:''}; });
      }

      var headerHtml = navHtml
        +'<h2 style="font-family:\'Space Grotesk\',sans-serif;font-size:1.7rem;font-weight:600;color:var(--text);margin-bottom:10px;line-height:1.3">'+r.judul+'</h2>'
        +'<div style="background:rgba(201,168,76,.06);border-left:3px solid var(--gold);padding:12px 16px;border-radius:0 4px 4px 0;margin-bottom:20px;font-size:.75rem;color:var(--text2);line-height:1.75">'+r.ringkasan+'</div>';

      if(!lembaran.length){
        // Tidak ada lembaran — tampilkan konten biasa
        el.innerHTML = headerHtml
          +(r.konten?'<div style="font-size:.76rem;color:var(--text2);line-height:1.9;white-space:pre-line">'+r.konten+'</div>':'<div style="font-size:.72rem;color:var(--text3);text-align:center;padding:32px 0">Belum ada lembaran.</div>');
      } else {
        el.innerHTML = headerHtml + '<div id="rs-lembar-viewer"></div>';
        rsRenderLembar(lembaran, 0);
      }
    }
    document.getElementById('rs-list-view').style.display = 'none';
    document.getElementById('rs-detail-view').style.display = 'block';
    window.scrollTo(0,0);
  };

  function rsGetLembarThumb(l){
    if(l.blocks){ var gb=(l.blocks||[]).find(function(b){return b.type==='gambar'&&b.url;}); return gb?gb.url:''; }
    return l.gambar||'';
  }

  function rsRenderLembarBlocksHtml(blocks, legacy){
    if(!blocks && legacy){
      blocks = [];
      if(legacy.gambar) blocks.push({type:'gambar',url:legacy.gambar,caption:legacy.caption||legacy.info||''});
      if(legacy.header) blocks.push({type:'h2',value:legacy.header});
      if(legacy.teks)   blocks.push({type:'teks',value:legacy.teks});
    }
    if(!blocks||!blocks.length) return '<div style="height:100px;border-radius:16px;background:var(--bg4);border:1px dashed var(--card-border);display:flex;align-items:center;justify-content:center;font-size:.65rem;color:var(--text3)">Lembar kosong</div>';
    return (blocks||[]).map(function(b){
      if(b.type==='gambar') return '<div style="margin-bottom:12px">'
        +'<div style="width:100%;border-radius:18px;overflow:hidden;background:var(--bg4);border:1px solid var(--card-border)">'
        +'<img src="'+b.url+'" style="width:100%;display:block;object-fit:contain;max-height:520px" loading="lazy"></div>'
        +(b.caption?'<div style="font-size:.62rem;color:var(--text3);text-align:center;padding:6px 4px;letter-spacing:.03em;font-style:italic">'+b.caption+'</div>':'')
        +'</div>';
      if(b.type==='h2') return '<h3 style="font-family:\'Space Grotesk\',sans-serif;font-size:1.25rem;font-weight:600;color:var(--text);margin:16px 0 10px;line-height:1.3">'+b.value+'</h3>';
      if(b.type==='teks') return '<div style="font-size:.78rem;color:var(--text2);line-height:2;white-space:pre-line;margin-bottom:16px">'+b.value+'</div>';
      return '';
    }).join('');
  }

  function rsRenderLembar(lembaran, idx){
    var viewer = document.getElementById('rs-lembar-viewer');
    if(!viewer) return;
    var total = lembaran.length;
    var lembar = lembaran[idx];
    var pct = Math.round(((idx+1)/total)*100);

    viewer.innerHTML =
      '<div style="margin-bottom:16px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
      +'<span style="font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text3)">Lembaran</span>'
      +'<span style="font-size:.72rem;font-weight:500;color:var(--gold)">'+(idx+1)+' / '+total+'</span>'
      +'</div>'
      +'<div style="height:3px;background:var(--bg4);border-radius:8px;overflow:hidden">'
      +'<div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--gold-d),var(--gold));transition:width .3s"></div>'
      +'</div></div>'
      + rsRenderLembarBlocksHtml(lembar.blocks||null, lembar.blocks?null:lembar)
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:20px">'
      +(idx>0
        ?'<button onclick="rsNavLembar(-1)" style="background:transparent;border:1px solid var(--card-border);color:var(--text2);font-size:.62rem;padding:9px 18px;border-radius:var(--radius);cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:6px" onmouseover="this.style.borderColor=\'var(--gold)\'" onmouseout="this.style.borderColor=\'var(--card-border)\'">'
          +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="15 18 9 12 15 6"/></svg> Sebelumnya</button>'
        :'<span></span>')
      +'<div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 0">'
      +lembaran.map(function(l,i){
        var active = i===idx;
        var thumb = rsGetLembarThumb(l);
        return '<div onclick="rsGoLembar('+i+')" style="flex-shrink:0;width:44px;height:44px;border-radius:12px;overflow:hidden;border:2px solid '+(active?'var(--gold)':'var(--card-border)')+';cursor:pointer;background:var(--bg4);transition:border-color .2s;position:relative">'
          +(thumb?'<img src="'+thumb+'" style="width:100%;height:100%;object-fit:cover">':'<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:.5rem;color:var(--text3)">'+(i+1)+'</div>')
          +'</div>';
      }).join('')
      +'</div>'
      +(idx<total-1
        ?'<button onclick="rsNavLembar(1)" style="background:linear-gradient(135deg,rgba(201,168,76,.15),rgba(201,168,76,.08));border:1px solid var(--gold-border);color:var(--gold);font-size:.62rem;padding:9px 18px;border-radius:var(--radius);cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:6px" onmouseover="this.style.background=\'rgba(201,168,76,.25)\'" onmouseout="this.style.background=\'linear-gradient(135deg,rgba(201,168,76,.15),rgba(201,168,76,.08))\'">'
          +'Selanjutnya <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg></button>'
        :'<button style="background:rgba(61,186,122,.1);border:1px solid rgba(61,186,122,.3);color:var(--green);font-size:.62rem;padding:9px 18px;border-radius:var(--radius);cursor:default;display:flex;align-items:center;gap:6px">'
          +'✓ Selesai</button>')
      +'</div>'
      +(total>1
        ?'<div style="display:flex;gap:5px;justify-content:center;margin-top:14px">'
          +lembaran.map(function(l,i){
            return '<div style="width:'+(i===idx?'20px':'6px')+';height:6px;border-radius:10px;background:'+(i===idx?'var(--gold)':'var(--text3)')+';transition:all .3s;cursor:pointer" onclick="rsGoLembar('+i+')"></div>';
          }).join('')
          +'</div>'
        :'');
    viewer._lembaran = lembaran;
    viewer._idx = idx;
  }
  window.rsNavLembar = function(delta){
    var viewer = document.getElementById('rs-lembar-viewer');
    if(!viewer||!viewer._lembaran) return;
    var newIdx = viewer._idx + delta;
    if(newIdx<0||newIdx>=viewer._lembaran.length) return;
    rsRenderLembar(viewer._lembaran, newIdx);
    window.scrollTo({top:document.getElementById('rs-detail-view').offsetTop - 80, behavior:'smooth'});
  };

  window.rsGoLembar = function(idx){
    var viewer = document.getElementById('rs-lembar-viewer');
    if(!viewer||!viewer._lembaran) return;
    rsRenderLembar(viewer._lembaran, idx);
  };

  window.rsCloseDetail = function(){
    document.getElementById('rs-detail-view').style.display = 'none';
    document.getElementById('rs-list-view').style.display = 'block';
  };

  /* ── Init: poll for Firebase ── */
  (function waitRs(){
    if(window._db){ window.rsLoadResearch(); }
    else { setTimeout(waitRs, 400); }
  })();
})();
