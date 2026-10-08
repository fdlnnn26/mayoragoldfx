/* Helper modul — didefinisikan di script biasa (global) supaya bisa dipakai script biasa & module */
function modCount(m){return m.lessonCount!=null?m.lessonCount:(m.lessons||[]).length;}
async function modHydrate(mod){
  if(mod._hyd)return mod;
  if(!mod.lessons){const c=await window._loadPrivate('modules',mod.id);if(c&&c.lessons)mod.lessons=c.lessons;}
  mod._hyd=true;return mod;
}

/* ── Module state ── */
window._modAllModules=[];
window._modProgress={};
window._modFilterLevel='all';
window._modCurModule=null;
window._modCurLesson=0;

/* ── Tab switching ── */
window.modSwitchTab=function(t){
  ['all','my','admin','leaderboard'].forEach(n=>{
    const el=document.getElementById('mod-sec-'+n);
    if(el) el.classList.toggle('on',n===t);
  });
  document.querySelectorAll('.mod-app-tab').forEach(el=>el.classList.remove('on'));
  const map={all:'mat-all',my:'mat-my',admin:'mat-adm',leaderboard:'mat-lb'};
  if(document.getElementById(map[t]))document.getElementById(map[t]).classList.add('on');
  if(t==='my')modRenderMyModules();
  if(t==='admin')modRenderAdminList();
  if(t==='all')modCloseReader();
  if(t==='leaderboard')modLoadLeaderboard();
  window.scrollTo(0,0);
};

/* ── Filter ── */
window.modSetFilter=function(val,btn){
  window._modFilterLevel=val;
  if(btn){
    btn.closest('.mod-filter-bar').querySelectorAll('.flt-btn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
  }
  modRenderGrid();
};

/* Migrasi sekali jalan (admin): pindahkan lessons dari dokumen utama ke private/content. Aman diulang. */
window.modMigrateAll=async function(){
  if(!window._isAdmin){console.warn('Khusus admin');return;}
  const fs=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');const db=getDB();let n=0;
  const snap=await fs.getDocs(fs.collection(db,'modules'));
  for(const d of snap.docs){
    const data=d.data();if(!Array.isArray(data.lessons))continue;
    await fs.setDoc(fs.doc(db,'modules',d.id,'private','content'),{lessons:data.lessons});
    await fs.updateDoc(fs.doc(db,'modules',d.id),{lessonCount:data.lessons.length,lessons:fs.deleteField()});
    n++;
  }
  console.log('Migrasi modul selesai:',n);toast('Admin','Migrasi modul selesai: '+n,'#3DBA7A');
  await window.modLoadModules();
};

/* ── escHtml helper ── */
function mesc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ── Render grid ── */
window.modRenderGrid=function(){
  let mods=window._modAllModules||[];
  const lvl=window._modFilterLevel||'all';
  const q=(document.getElementById('mod-search-inp')?.value||'').toLowerCase().trim();
  if(lvl!=='all')mods=mods.filter(m=>m.level===lvl);
  if(q)mods=mods.filter(m=>(m.title||'').toLowerCase().includes(q)||(m.excerpt||'').toLowerCase().includes(q)||(m.cat||'').toLowerCase().includes(q));
  const grid=document.getElementById('mod-grid-main');if(!grid)return;
  const isVip=window._isVip||false,isAdmin=window._isAdmin||false,uid=window._curUser?.uid||null;
  if(!mods.length){grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:48px 24px;color:var(--text3)"><div style="font-size:.72rem;line-height:1.85">${window._modAllModules.length===0?'Belum ada modul.':'Tidak ada modul yang cocok.'}</div></div>`;return;}
  grid.innerHTML=mods.map(m=>{
    const thumb=m.coverUrl?m.coverUrl:'';
    const progress=window._modProgress[m.id]||{completedLessons:[]};
    const total=modCount(m)||1;
    const done=progress.completedLessons?.length||0;
    const pct=Math.round((done/total)*100);
    const locked=m.vip&&!isVip&&!isAdmin;
    return`<div class="mod-card" onclick="${locked?'window.modShowVipLock()':'window.modOpenById(\''+m.id+'\')'}">
      <div class="mod-card-thumb">
        ${thumb?`<img src="${thumb}" alt="${mesc(m.title)}" loading="lazy">`:`<div class="mod-card-thumb-placeholder"><svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="28" stroke="#C9A84C" stroke-width="1" fill="none" stroke-dasharray="4 4"/></svg></div>`}
        <div class="mod-num-badge">Modul ${m.num||'?'}</div>
        <div class="mod-level-badge ${m.level||'pemula'}">${(m.level||'pemula').charAt(0).toUpperCase()+(m.level||'pemula').slice(1)}</div>
        ${locked?`<div class="mod-lock-overlay"><div class="mod-lock-icon">🔒</div><div class="mod-lock-txt">VIP Only</div></div>`:''}
      </div>
      <div class="mod-card-body">
        <div class="mod-cat">${mesc(m.cat||'Edukasi')}</div>
        <div class="mod-title">${mesc(m.title||'Modul Trading')}</div>
        <div class="mod-excerpt">${mesc(m.excerpt||'')}</div>
        <div class="mod-meta">
          ${m.duration?`<span class="mod-meta-item">⏱ ${m.duration} mnt</span>`:''}
          <span class="mod-meta-item">📖 ${modCount(m)||0} pelajaran</span>
          ${m.vip?`<span class="mod-meta-item" style="color:var(--gold)">VIP</span>`:'<span class="mod-meta-item" style="color:var(--green)">✓ Gratis</span>'}
        </div>
        ${done>0?`<div class="mod-progress-bar"><div class="mod-progress-fill" style="width:${pct}%"></div></div>`:''}
      </div>
    </div>`;
  }).join('');
};

window.modShowVipLock=function(){
  toast('VIP','Modul ini untuk member VIP. Hubungi admin!','#C9A84C');
};

/* ── My modules ── */
window.modRenderMyModules=function(){
  const started=(window._modAllModules||[]).filter(m=>{
    const p=window._modProgress[m.id];return p&&p.completedLessons&&p.completedLessons.length>0;
  });
  const grid=document.getElementById('mod-grid-my');if(!grid)return;
  if(!started.length){grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:48px 24px;color:var(--text3)"><div style="font-size:.72rem">Belum ada progress. Mulai dari tab Semua Modul!</div></div>`;return;}
  const isVip=window._isVip||false,isAdmin=window._isAdmin||false;
  grid.innerHTML=started.map(m=>{
    const thumb=m.coverUrl||'';
    const progress=window._modProgress[m.id]||{completedLessons:[]};
    const total=modCount(m)||1;
    const done=progress.completedLessons?.length||0;
    const pct=Math.round((done/total)*100);
    return`<div class="mod-card" onclick="window.modOpenById('${m.id}')">
      <div class="mod-card-thumb">
        ${thumb?`<img src="${thumb}" alt="${mesc(m.title)}" loading="lazy">`:`<div class="mod-card-thumb-placeholder"><svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="28" stroke="#C9A84C" stroke-width="1" fill="none" stroke-dasharray="4 4"/></svg></div>`}
        <div class="mod-num-badge">Modul ${m.num||'?'}</div>
        <div class="mod-level-badge ${m.level||'pemula'}">${(m.level||'pemula').charAt(0).toUpperCase()+(m.level||'pemula').slice(1)}</div>
      </div>
      <div class="mod-card-body">
        <div class="mod-cat">${mesc(m.cat||'Edukasi')}</div>
        <div class="mod-title">${mesc(m.title||'Modul Trading')}</div>
        <div class="mod-meta"><span class="mod-meta-item">✓ ${done}/${total} pelajaran</span><span class="mod-meta-item">${pct}% selesai</span></div>
        <div class="mod-progress-bar"><div class="mod-progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join('');
};

/* ── Block renderer ── */
function modRenderBlock(bl){
  switch(bl.type){
    case 'text':return`<div class="mblock"><div class="mblock-text">${mesc(bl.content||bl.text||'')}</div></div>`;
    case 'h2':return`<div class="mblock"><div class="mblock-h2">${mesc(bl.text||'')}</div></div>`;
    case 'h3':return`<div class="mblock"><div class="mblock-h3">${mesc(bl.text||'')}</div></div>`;
    case 'image':return`<div class="mblock">${bl.imageUrl?`<div class="mblock-image"><img src="${bl.imageUrl}" alt="${mesc(bl.caption||'Gambar modul')}" loading="lazy"></div>`:'<div style="height:80px;background:var(--bg4);border-radius:16px;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:.7rem">Gambar tidak tersedia</div>'}${bl.caption?`<div class="mblock-caption">${mesc(bl.caption)}</div>`:''}</div>`;
    case 'callout':return`<div class="mblock"><div class="mblock-callout"><div class="mblock-callout-title">💡 ${mesc(bl.title||'Info')}</div><div class="mblock-callout-body">${mesc(bl.body||'')}</div></div></div>`;
    case 'tip':return`<div class="mblock"><div class="mblock-tip"><div class="mblock-tip-title">✅ ${mesc(bl.title||'Tips')}</div><div class="mblock-tip-body">${mesc(bl.body||'')}</div></div></div>`;
    case 'warning':return`<div class="mblock"><div class="mblock-warning"><div class="mblock-warning-title">⚠ ${mesc(bl.title||'Perhatian')}</div><div class="mblock-warning-body">${mesc(bl.body||'')}</div></div></div>`;
    case 'list':{const items=(bl.items||'').split('\n').filter(x=>x.trim());return`<div class="mblock"><ul class="mblock-list">${items.map(it=>`<li>${mesc(it.trim())}</li>`).join('')}</ul></div>`;}
    case 'term':return`<div class="mblock"><div class="mblock-term"><div class="mblock-term-symbol">${mesc(bl.symbol||'?')}</div><div><div class="mblock-term-name">${mesc(bl.name||'')}</div><div class="mblock-term-def">${mesc(bl.definition||bl.body||'')}</div></div></div></div>`;
    case 'divider':return`<div class="mblock"><div class="mblock-divider"></div></div>`;
    case 'quiz':{
      const qid='mq'+Math.random().toString(36).slice(2,8);
      const opts=(bl.options||bl.opts||'').split('\n').filter(x=>x.trim());
      const letters=['A','B','C','D','E','F'];
      return`<div class="mblock"><div class="mquiz-block" id="${qid}">
        <div class="mquiz-q">${mesc(bl.question||'')}</div>
        <div class="mquiz-opts">${opts.map((o,i)=>`<div class="mquiz-opt" onclick="modCheckQuiz('${qid}',${i+1},${parseInt(bl.correct)||1})">
          <div class="mquiz-opt-letter">${letters[i]||i+1}</div>${mesc(o.trim())}
        </div>`).join('')}</div>
        <div class="mquiz-result" id="${qid}-res"></div>
        ${bl.explanation?`<div id="${qid}-exp" style="display:none;font-size:.72rem;color:var(--text2);margin-top:10px;padding:10px 14px;background:var(--bg4);border-radius:var(--radius);line-height:1.9">${mesc(bl.explanation)}</div>`:''}
      </div></div>`;
    }
    default:return'';
  }
}

window.modCheckQuiz=function(qid,chosen,correct){
  const el=document.getElementById(qid);if(!el)return;
  const opts=el.querySelectorAll('.mquiz-opt');
  opts.forEach((o,i)=>{o.classList.add('disabled');o.onclick=null;if(i+1===correct)o.classList.add('correct');else if(i+1===chosen)o.classList.add('wrong');});
  const res=document.getElementById(qid+'-res'),exp=document.getElementById(qid+'-exp');
  if(res){res.classList.add('show',chosen===correct?'correct':'wrong');res.textContent=chosen===correct?'✓ Jawaban benar! Kerja bagus.':'✗ Kurang tepat. Jawaban yang benar ada di atas.';}
  if(exp)exp.style.display='block';
};

/* ── Module reader ── */
window.modOpenById=async function(id){
  const mod=(window._modAllModules||[]).find(m=>m.id===id);if(!mod)return;
  await modHydrate(mod);
  if(!(mod.lessons||[]).length){toast('MGF','Isi modul tidak bisa dimuat. Pastikan kamu sudah login & punya akses.','#E05A5A');return;}
  window._modCurModule=mod;window._modCurLesson=0;
  document.getElementById('mod-list-view').style.display='none';
  document.getElementById('mod-reader-view').style.display='block';
  modRenderReader();
  window.scrollTo(0,0);
};

window.modCloseReader=function(){
  window._modCurModule=null;window._modCurLesson=0;
  document.getElementById('mod-list-view').style.display='';
  document.getElementById('mod-reader-view').style.display='none';
};

function modRenderReader(){
  const mod=window._modCurModule;if(!mod)return;
  const lessons=mod.lessons||[];
  const li=window._modCurLesson;
  const lesson=lessons[li];if(!lesson)return;
  const progress=window._modProgress[mod.id]||{completedLessons:[]};
  const completed=progress.completedLessons||[];
  const total=lessons.length;
  const isDone=completed.includes(li);
  const sidebarItems=lessons.map((l,i)=>`
    <div class="mod-sidebar-item ${i===li?'active':''}" onclick="window.modGoLesson(${i})">
      <span class="msi-num">${String(i+1).padStart(2,'0')}</span>
      <span class="msi-title">${mesc(l.title||'Pelajaran '+(i+1))}</span>
      <span class="msi-check ${completed.includes(i)?'done':''}"></span>
    </div>`).join('');
  const blocksHtml=(lesson.blocks||[]).map(modRenderBlock).join('');
  document.getElementById('mod-reader-view').innerHTML=`
    <div class="mod-reader-wrap">
      <button class="mod-back" onclick="window.modCloseReader()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M19 12H5M5 12l7 7M5 12l7-7"/></svg>
        Kembali ke Modul
      </button>
      <div class="mod-reader-grid">
        <div class="mod-sidebar">
          <div class="mod-sidebar-title">Daftar Pelajaran</div>
          <div class="mod-sidebar-scroll">${sidebarItems}</div>
          <div class="mod-reader-nav">
            <button class="mod-nav-btn" onclick="window.modGoLesson(${li-1})" ${li===0?'disabled':''}>← Prev</button>
            <span class="mod-nav-prog">${li+1} / ${total}</span>
            <button class="mod-nav-btn" onclick="window.modGoLesson(${li+1})" ${li===total-1?'disabled':''}>Next →</button>
          </div>
        </div>
        <div class="mod-content-area">
          <div class="mod-content-header">
            <div class="mod-cat">${mesc(mod.cat||'')} · ${mesc(mod.title||'')}</div>
            <div class="mod-content-title">Pelajaran ${li+1}: ${mesc(lesson.title||'')}</div>
            <div class="mod-content-meta">
              ${lesson.duration?`<span class="mod-content-meta-item">⏱ ${lesson.duration} menit</span>`:''}
              <span class="mod-content-meta-item">📖 Pelajaran ${li+1} dari ${total}</span>
              <span class="mod-content-meta-item" style="color:var(--gold)">${mesc(mod.level||'pemula')}</span>
            </div>
          </div>
          ${blocksHtml||'<div style="text-align:center;padding:48px;color:var(--text3)"><div style="font-size:.72rem">Konten pelajaran sedang disiapkan.</div></div>'}
          <button class="btn-complete-mod ${isDone?'done':''}" onclick="window.modMarkDone(${li})">
            ${isDone?'✓ Pelajaran Selesai':'Tandai Selesai'}
          </button>
        </div>
      </div>
    </div>`;
}

window.modGoLesson=function(i){
  const mod=window._modCurModule;if(!mod)return;
  const lessons=mod.lessons||[];
  if(i<0||i>=lessons.length)return;
  window._modCurLesson=i;
  modRenderReader();window.scrollTo(0,0);
};

window.modMarkDone=async function(i){
  const mod=window._modCurModule;if(!mod)return;
  const uid=window._curUser?.uid;if(!uid){toast('Info','Login dulu ya!','#C9A84C');return;}
  let p=window._modProgress[mod.id]||{completedLessons:[]};
  if(!p.completedLessons.includes(i))p.completedLessons.push(i);
  window._modProgress[mod.id]=p;
  try{
    const {doc,setDoc}=await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    await setDoc(doc(window._db,'users',uid,'progress',mod.id),p,{merge:true});
  }catch(e){console.warn('mod progress save:',e);}
  modRenderReader();
  toast('Modul',`Pelajaran ${i+1} selesai!`,'#3DBA7A');
};

/* ── Admin module list ── */
window.modRenderAdminList=function(){
  const list=document.getElementById('adm-mod-list-m');if(!list)return;
  const mods=window._modAllModules||[];
  if(!mods.length){list.innerHTML='<div style="text-align:center;padding:48px 24px;color:var(--text3)"><div style="font-size:.72rem">Belum ada modul.</div></div>';return;}
  list.innerHTML=mods.map(m=>{
    const thumb=m.coverUrl||'';
    return`<div class="adm-mod-item-m">
      <div class="ami-thumb-m">${thumb?`<img src="${thumb}" alt="${mesc(m.title)}" loading="lazy">`:''}</div>
      <div class="ami-body-m">
        <div class="ami-top-m">
          <span class="ami-num-m">Modul ${m.num}</span>
          <span style="font-size:.52rem;letter-spacing:.16em;text-transform:uppercase;color:var(--text3)">${mesc(m.cat||'')}</span>
          <span class="mod-level-badge ${m.level||'pemula'}" style="position:static">${m.level||'pemula'}</span>
          ${m.vip?`<span style="font-size:.48rem;letter-spacing:.14em;text-transform:uppercase;padding:2px 7px;background:rgba(201,168,76,.1);border:1px solid var(--gold-border);color:var(--gold);border-radius:8px">VIP</span>`:''}
        </div>
        <div class="ami-title-m">${mesc(m.title||'—')}</div>
        <div class="ami-meta-m">${modCount(m)||0} pelajaran · ${m.duration||'?'} menit</div>
        <div class="ami-actions-m">
          <button class="btn-edit-m" onclick="modEditModule('${m.id}')">✎ Edit</button>
          <button class="btn-del-m" onclick="modDeleteModule('${m.id}')">✕ Hapus</button>
        </div>
      </div>
    </div>`;
  }).join('');
};

/* ── Admin form ── */
window.modShowForm=function(){
  window._modFormBlocks=[];
  ['mf-edit-id','mf-title','mf-num','mf-excerpt'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('mf-cat').value='Dasar Trading';
  document.getElementById('mf-level').value='pemula';
  document.getElementById('mf-duration').value='15';
  document.getElementById('mf-vip').value='false';
  document.getElementById('mf-cover').value='';
  document.getElementById('cover-preview-wrap-m').style.display='none';
  document.getElementById('mf-err-m').style.display='none';
  document.getElementById('mf-form-title').textContent='Tambah Modul Baru';
  modRenderLessonBuilder();
  document.getElementById('mod-form-card').classList.add('open');
  window.scrollTo(0,0);
};
window.modHideForm=function(){document.getElementById('mod-form-card').classList.remove('open');};

window.modPreviewCover=function(input){
  const file=input.files[0];if(!file)return;
  const wrap=document.getElementById('cover-preview-wrap-m'),img=document.getElementById('cover-preview-m');
  if(!wrap||!img)return;
  wrap.style.display='block';
  const url=URL.createObjectURL(file);img.onload=()=>URL.revokeObjectURL(url);img.src=url;
  const lbl=document.getElementById('cover-preview-label-m');
  if(lbl)lbl.innerHTML='<span style="color:var(--green)">✓ Gambar baru dipilih — akan diupload saat simpan</span>';
};
window.modClearCover=function(){
  const inp=document.getElementById('mf-cover');if(inp)inp.value='';
  document.getElementById('cover-preview-wrap-m').style.display='none';
  document.getElementById('cover-preview-m').src='';
  const lbl=document.getElementById('cover-preview-label-m');if(lbl)lbl.innerHTML='';
};

/* ── Lesson builder ── */
window._modFormBlocks=[];
function modRenderLessonBuilder(){
  const c=document.getElementById('mod-blocks-container');if(!c)return;
  c.innerHTML='';
  (window._modFormBlocks||[]).forEach((bl,i)=>{
    if(bl.type!=='_lesson')return;
    c.insertAdjacentHTML('beforeend',modBuildLessonUI(bl,i));
  });
}
function modBuildLessonUI(bl,i){
  const len=(window._modFormBlocks||[]).length;
  return`<div class="block-builder-m" id="mbb-${i}" style="border-color:rgba(201,168,76,.3)">
    <div class="block-builder-head-m">
      <span class="block-type-label-m">📚 Pelajaran ${i+1}</span>
      <div style="display:flex;gap:6px">
        ${i>0?`<button class="add-block-btn-m" onclick="modMoveLessonBlock(${i},-1)">↑</button>`:''}
        ${i<len-1?`<button class="add-block-btn-m" onclick="modMoveLessonBlock(${i},1)">↓</button>`:''}
        <button class="block-builder-del-m" onclick="modDelLessonBlock(${i})">✕ Hapus</button>
      </div>
    </div>
    <div style="margin-bottom:10px">
      <label class="form-lbl-m">Judul Pelajaran *</label>
      <input class="form-inp-m" type="text" placeholder="Contoh: Apa itu XAU/USD?" value="${mesc(bl.lessonTitle||'')}" oninput="window._modFormBlocks[${i}].lessonTitle=this.value">
    </div>
    <div style="margin-bottom:10px">
      <label class="form-lbl-m">Durasi Estimasi (menit)</label>
      <input class="form-inp-m" type="number" min="1" placeholder="10" value="${bl.lessonDuration||10}" oninput="window._modFormBlocks[${i}].lessonDuration=+this.value">
    </div>
    <div>
      <div class="form-lbl-m" style="margin-bottom:8px">Blok Konten</div>
      <div id="mlesson-blocks-${i}">${(bl.lessonBlocks||[]).map((sub,si)=>modBuildSubBlock(sub,i,si)).join('')}</div>
      <div class="add-block-row-m" style="margin-top:8px">
        <span style="font-size:.5rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text3)">+ Tambah:</span>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'text')">📝 Teks</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'h2')">H2</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'h3')">H3</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'image')">🖼 Gambar</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'callout')">💡 Callout</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'tip')">✅ Tip</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'warning')">⚠</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'list')">📋 Daftar</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'term')">📚 Istilah</button>
        <button class="add-block-btn-m" onclick="modAddSubBlock(${i},'quiz')">❓ Kuis</button>
      </div>
    </div>
  </div>`;
}

const MOD_BLOCK_DEFS={
  text:{label:'Teks',fields:[{id:'content',lbl:'Isi Teks',type:'textarea',rows:4,ph:'Tulis konten di sini...'}]},
  h2:{label:'Judul H2',fields:[{id:'text',lbl:'Teks',type:'text',ph:'Judul bagian...'}]},
  h3:{label:'Sub H3',fields:[{id:'text',lbl:'Teks',type:'text',ph:'Sub-judul...'}]},
  image:{label:'Gambar',fields:[]},/* handled separately */
  callout:{label:'Callout',fields:[{id:'title',lbl:'Judul',type:'text',ph:'Info Penting'},{id:'body',lbl:'Isi',type:'textarea',rows:3,ph:'Penjelasan...'}]},
  tip:{label:'Tips',fields:[{id:'title',lbl:'Judul',type:'text',ph:'Tips'},{id:'body',lbl:'Isi',type:'textarea',rows:2,ph:'...'}]},
  warning:{label:'Peringatan',fields:[{id:'title',lbl:'Judul',type:'text',ph:'Perhatian!'},{id:'body',lbl:'Isi',type:'textarea',rows:2,ph:'...'}]},
  list:{label:'Daftar',fields:[{id:'items',lbl:'Poin (satu baris = satu poin)',type:'textarea',rows:4,ph:'Poin satu\nPoin dua'}]},
  term:{label:'Istilah',fields:[{id:'symbol',lbl:'Singkatan',type:'text',ph:'SMC'},{id:'name',lbl:'Nama',type:'text',ph:'Smart Money Concept'},{id:'definition',lbl:'Definisi',type:'textarea',rows:3,ph:'Penjelasan...'}]},
  quiz:{label:'Kuis',fields:[{id:'question',lbl:'Pertanyaan',type:'text',ph:'Apa itu Order Block?'},{id:'options',lbl:'Pilihan (tiap baris = satu pilihan)',type:'textarea',rows:4,ph:'Pilihan A\nPilihan B\nPilihan C'},{id:'correct',lbl:'Nomor jawaban benar',type:'number',ph:'1'},{id:'explanation',lbl:'Penjelasan (opsional)',type:'textarea',rows:2,ph:'...'}]}
};

function modBuildSubBlock(bl,li,si){
  const def=MOD_BLOCK_DEFS[bl.type];if(!def)return'';
  let html=`<div class="block-builder-m" id="msb-${li}-${si}" style="background:var(--bg5);margin-bottom:8px;border-color:rgba(201,168,76,.1)">
    <div class="block-builder-head-m">
      <span class="block-type-label-m" style="font-size:.5rem">${def.label} ${si+1}</span>
      <button class="block-builder-del-m" onclick="modDelSubBlock(${li},${si})">✕</button>
    </div>`;

  if(bl.type==='image'){
    /* Image block — upload + caption */
    html+=`<div style="margin-bottom:8px">
      <label class="form-lbl-m">Upload Gambar</label>
      <input class="form-inp-m" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onchange="modSubBlockUploadImage(${li},${si},this)">
      <div class="uprog-wrap-m" id="msb-prog-${li}-${si}"><div class="uprog-bar-m" id="msb-prog-bar-${li}-${si}"></div></div>
      <div id="msb-img-preview-${li}-${si}" style="${bl.imageUrl?'display:block':'display:none'};margin-top:8px">
        ${bl.imageUrl?`<img src="${bl.imageUrl}" style="max-width:100%;max-height:160px;object-fit:contain;border-radius:16px;border:1px solid var(--card-border)">
        <div style="font-size:.58rem;color:var(--green);margin-top:4px">✓ Gambar terupload</div>`:''}
      </div>
    </div>
    <div style="margin-bottom:8px">
      <label class="form-lbl-m">Caption (opsional)</label>
      <input class="form-inp-m" type="text" placeholder="Keterangan gambar..." value="${mesc(bl.caption||'')}" oninput="modSetSubBlockVal(${li},${si},'caption',this.value)">
    </div>`;
  }else{
    def.fields.forEach(f=>{
      const val=bl[f.id]||'';
      html+=`<div style="margin-bottom:8px"><label class="form-lbl-m">${f.lbl}</label>`;
      if(f.type==='textarea')html+=`<textarea class="form-inp-m" style="min-height:${(f.rows||3)*24}px;resize:vertical" placeholder="${f.ph||''}" oninput="modSetSubBlockVal(${li},${si},'${f.id}',this.value)">${mesc(val)}</textarea>`;
      else if(f.type==='number')html+=`<input class="form-inp-m" type="number" placeholder="${f.ph||''}" value="${mesc(val)}" oninput="modSetSubBlockVal(${li},${si},'${f.id}',this.value)">`;
      else html+=`<input class="form-inp-m" type="text" placeholder="${f.ph||''}" value="${mesc(val)}" oninput="modSetSubBlockVal(${li},${si},'${f.id}',this.value)">`;
      html+='</div>';
    });
  }

  html+='</div>';return html;
}

window.modAddLesson=function(){
  if(!window._modFormBlocks)window._modFormBlocks=[];
  window._modFormBlocks.push({type:'_lesson',lessonTitle:'',lessonDuration:10,lessonBlocks:[]});
  modRenderLessonBuilder();
};
window.modMoveLessonBlock=function(i,dir){
  const ni=i+dir;if(ni<0||ni>=(window._modFormBlocks||[]).length)return;
  [window._modFormBlocks[i],window._modFormBlocks[ni]]=[window._modFormBlocks[ni],window._modFormBlocks[i]];
  modRenderLessonBuilder();
};
window.modDelLessonBlock=function(i){window._modFormBlocks.splice(i,1);modRenderLessonBuilder();};
window.modAddSubBlock=function(li,type){
  const def=MOD_BLOCK_DEFS[type];if(!def)return;
  const obj={type};def.fields.forEach(f=>obj[f.id]='');
  if(!window._modFormBlocks[li].lessonBlocks)window._modFormBlocks[li].lessonBlocks=[];
  window._modFormBlocks[li].lessonBlocks.push(obj);
  const c=document.getElementById(`mlesson-blocks-${li}`);
  if(c)c.insertAdjacentHTML('beforeend',modBuildSubBlock(obj,li,window._modFormBlocks[li].lessonBlocks.length-1));
};
window.modSetSubBlockVal=function(li,si,key,val){if(window._modFormBlocks[li]?.lessonBlocks)window._modFormBlocks[li].lessonBlocks[si][key]=val;};
window.modDelSubBlock=function(li,si){
  if(!window._modFormBlocks[li]?.lessonBlocks)return;
  window._modFormBlocks[li].lessonBlocks.splice(si,1);
  const c=document.getElementById(`mlesson-blocks-${li}`);
  if(c)c.innerHTML=window._modFormBlocks[li].lessonBlocks.map((b,idx)=>modBuildSubBlock(b,li,idx)).join('');
};
window.modEditModule=async function(id){
  const mod=(window._modAllModules||[]).find(m=>m.id===id);if(!mod)return;
  await modHydrate(mod);
  document.getElementById('mf-form-title').textContent='Edit Modul';
  document.getElementById('mf-edit-id').value=id;
  document.getElementById('mf-title').value=mod.title||'';
  document.getElementById('mf-num').value=mod.num||1;
  document.getElementById('mf-cat').value=mod.cat||'Dasar Trading';
  document.getElementById('mf-level').value=mod.level||'pemula';
  document.getElementById('mf-duration').value=mod.duration||15;
  document.getElementById('mf-vip').value=String(!!mod.vip);
  document.getElementById('mf-excerpt').value=mod.excerpt||'';
  document.getElementById('mf-cover').value='';
  document.getElementById('mf-err-m').style.display='none';
  if(mod.coverUrl){
    document.getElementById('cover-preview-wrap-m').style.display='block';
    document.getElementById('cover-preview-m').src=mod.coverUrl;
    const lbl=document.getElementById('cover-preview-label-m');
    if(lbl)lbl.innerHTML='<span style="color:var(--text3)">Cover saat ini (tidak akan diubah kecuali kamu pilih file baru)</span>';
  }
  else{document.getElementById('cover-preview-wrap-m').style.display='none';}
  window._modFormBlocks=(mod.lessons||[]).map(l=>({type:'_lesson',lessonTitle:l.title||'',lessonDuration:l.duration||10,lessonBlocks:l.blocks||[]}));
  modRenderLessonBuilder();
  document.getElementById('mod-form-card').classList.add('open');
  window.scrollTo(0,0);
};


/* ── Admin modul: susun modul dari arahan teks dengan AI (hasil jadi DRAFT di form, belum tersimpan) ── */
(function(){
  var OK={text:1,h2:1,h3:1,image:1,callout:1,tip:1,warning:1,list:1,term:1,quiz:1};
  function mount(){
    var t=document.getElementById('mf-form-title');
    if(!t||document.getElementById('mai-panel'))return;
    var d=document.createElement('div');d.id='mai-panel';
    d.style.cssText='margin:14px 0 18px;padding:14px;border:1px dashed rgba(201,168,76,.5);border-radius:14px;background:rgba(201,168,76,.06)';
    d.innerHTML='<div style="font-size:.78rem;font-weight:600;margin-bottom:6px">✨ Susun dengan AI</div>'+
      '<div style="font-size:.68rem;color:var(--text3);line-height:1.7;margin-bottom:8px">Tulis arahan bebas, mis: <i>Judul: Dasar Market Structure. Isi: HH/HL, LH/LL, BOS, CHoCH. 4 pelajaran. Gambar: tiap pelajaran 1 ilustrasi. Soal: 2 kuis per pelajaran.</i> Hasilnya masuk ke form sebagai draft. Cek dan unggah gambarnya, lalu simpan.</div>'+
      '<textarea id="mai-in" class="form-inp-m" rows="4" placeholder="Tulis arahan: judul, isi/poin yang dibahas, gambar, jumlah soal, level, dll." style="width:100%;resize:vertical"></textarea>'+
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px"><button type="button" id="mai-go" class="add-block-btn-m" style="padding:9px 16px">Susun dengan AI</button><span id="mai-st" style="font-size:.7rem;color:var(--text3);line-height:1.6">Butuh sekitar 20-60 detik.</span></div>';
    t.parentNode.insertBefore(d,t.nextSibling);
    document.getElementById('mai-go').onclick=run;
  }
  async function run(){
    var inp=document.getElementById('mai-in').value.trim(),st=document.getElementById('mai-st'),btn=document.getElementById('mai-go');
    if(inp.length<15){st.style.color='#E05A5A';st.textContent='Arahan terlalu pendek.';return;}
    if((window._modFormBlocks||[]).some(function(b){return b.type==='_lesson'&&(b.lessonBlocks||[]).length})&&!confirm('Form sudah berisi pelajaran. Ganti semuanya dengan hasil AI?'))return;
    st.style.color='var(--text3)';st.textContent='AI sedang menyusun modul…';btn.disabled=true;
    try{
      var h={'Content-Type':'application/json'};
      try{h['Authorization']='Bearer '+await window._curUser.getIdToken();}catch(_){}
      var r=await fetch('/api/gemini',{method:'POST',headers:h,body:JSON.stringify({mode:'modul',prompt:inp})});
      var j=await r.json();if(!r.ok)throw new Error(j.error||'Gagal');
      var d;try{d=JSON.parse(String(j.text).replace(/```json|```/g,'').trim());}catch(_){throw new Error('Hasil AI terpotong. Kurangi jumlah pelajaran atau pecah arahan jadi beberapa bagian.');}
      var set=function(id,v){var e=document.getElementById(id);if(e&&v!==undefined&&v!==null&&v!=='')e.value=v;};
      set('mf-title',d.title);set('mf-excerpt',String(d.excerpt||'').slice(0,300));set('mf-duration',Math.round(d.duration)||'');
      var cat=document.getElementById('mf-cat'),lv=document.getElementById('mf-level');
      if(cat&&[].some.call(cat.options,function(o){return o.value===d.cat}))cat.value=d.cat;
      if(lv&&[].some.call(lv.options,function(o){return o.value===d.level}))lv.value=d.level;
      var imgs=0;
      window._modFormBlocks=(d.lessons||[]).map(function(l){
        return{type:'_lesson',lessonTitle:String(l.title||'Pelajaran'),lessonDuration:Math.round(l.duration)||10,
          lessonBlocks:(l.blocks||[]).filter(function(b){return b&&OK[b.type]}).map(function(b){
            var o={type:b.type};
            Object.keys(b).forEach(function(k){if(k!=='type'&&b[k]!=null)o[k]=Array.isArray(b[k])?b[k].join('\n'):String(b[k]);});
            if(b.type==='image'){imgs++;o.imageUrl='';o.caption='Saran gambar: '+(o.caption||'');}
            if(b.type==='quiz'&&!o.correct)o.correct='1';
            return o;
          })};
      });
      modRenderLessonBuilder();
      st.style.color='#3DBA7A';
      st.textContent='Draft terisi: '+window._modFormBlocks.length+' pelajaran'+(imgs?', '+imgs+' penanda gambar (unggah gambarnya di blok 🖼)':'')+'. Cek dulu isi dan faktanya sebelum simpan.';
    }catch(e){st.style.color='#E05A5A';st.textContent=e.message||'Gagal';}
    btn.disabled=false;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
