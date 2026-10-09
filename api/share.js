/* Halaman bagikan berita: https://mayoragoldfx.com/b/<slug>
   Crawler WhatsApp/Telegram/Facebook tidak menjalankan JavaScript, jadi di sini
   judul, deskripsi, dan GAMBAR artikel ditulis langsung ke HTML (Open Graph).
   Pengunjung manusia langsung diarahkan ke /berita?artikel=<slug>. */

const SITE = 'https://mayoragoldfx.com';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function initAdmin() {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  if (getApps().length) return;
  let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT belum di-set');
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(raw);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  initializeApp({ credential: cert(sa) });
}

// Gambar 1200x630 WebP (kecil) untuk preview (Cloudinary); sumber lain dipakai apa adanya
function ogImage(url) {
  if (!url || !/^https:\/\//i.test(url)) return SITE + '/logomayora.jpeg';
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
  return m ? m[1] + 'c_fill,w_1200,h_630,f_webp,q_auto:eco/' + m[2].replace(/^(?:[a-z]_[^/]+,?)+\//, '') : url;
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').trim().slice(0, 200);
  const target = `${SITE}/berita${slug ? '?artikel=' + encodeURIComponent(slug) : ''}`;
  let n = null;
  if (slug) {
    // Jalur cepat: REST Firestore (data berita publik) — tanpa memuat SDK admin
    try {
      const r = await fetch('https://firestore.googleapis.com/v1/projects/journal-97254/databases/(default)/documents:runQuery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(3500),
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'news' }], limit: 1,
          where: { fieldFilter: { field: { fieldPath: 'slug' }, op: 'EQUAL', value: { stringValue: slug } } } } })
      });
      const j = r.ok ? await r.json() : [];
      const f = j && j[0] && j[0].document && j[0].document.fields;
      if (f) { const v = k => (f[k] && f[k].stringValue) || ''; n = { title: v('title'), excerpt: v('excerpt'), imageUrl: v('imageUrl') }; }
    } catch (e) { console.warn('[share] REST gagal:', e.message); }
    // Cadangan: Admin SDK
    if (!n) {
      try {
        await initAdmin();
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        const q = await db.collection('news').where('slug', '==', slug).limit(1).get();
        if (!q.empty) n = q.docs[0].data();
        else { const d = await db.doc('news/' + slug.replace(/\//g, '')).get(); if (d.exists) n = d.data(); }
      } catch (e) { console.warn('[share] admin gagal:', e.message); }
    }
  }

  if (!n) { res.setHeader('Location', SITE + '/berita'); return res.status(302).end(); }

  const title = (n.title || 'Berita Mayora Gold FX') + ' | Mayora Gold FX';
  const desc = (n.excerpt || '').slice(0, 200) || 'Berita dan analisa pasar emas XAU/USD dari Mayora Gold FX.';
  const img = ogImage(n.imageUrl);
  const shareUrl = `${SITE}/b/${encodeURIComponent(slug)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(target)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Mayora Gold FX">
<meta property="og:title" content="${esc(n.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:type" content="image/webp">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(n.title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
</head><body>
<script>location.replace(${JSON.stringify(target)});</script>
<noscript><p><a href="${esc(target)}">${esc(n.title)}</a></p></noscript>
</body></html>`);
}
