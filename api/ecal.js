/* Cadangan jadwal kalender ekonomi (gratis) saat kuota FCS habis.
   Sumber: feed mingguan Forex Factory (impact sudah dinilai: High/Medium/Low).
   Hanya USD + High yang dikembalikan. Feed ini tidak memuat nilai Actual. */
/* ── JADWAL RESMI (USD, High Impact) — sumber: BLS, BEA, Census, Federal Reserve ──
   Waktu dalam UTC. 08:30 ET = 12:30Z (sebelum 1 Nov, EDT) / 13:30Z (sesudahnya, EST).
   14:00 ET = 18:00Z (EDT). Tambah/ubah baris di sini tiap awal bulan. Forecast/Previous kosong. */
const SCHEDULE = [
  ['2026-10-14T12:30:00Z', 'CPI m/m'], ['2026-10-14T12:30:00Z', 'Core CPI m/m'],
  ['2026-10-15T12:30:00Z', 'PPI m/m'], ['2026-10-15T12:30:00Z', 'Retail Sales m/m'],
  ['2026-10-28T18:00:00Z', 'FOMC Rate Decision (Federal Funds Rate)'], ['2026-10-28T18:30:00Z', 'FOMC Press Conference'],
  ['2026-10-29T12:30:00Z', 'Advance GDP q/q (Q3)'], ['2026-10-29T12:30:00Z', 'Core PCE Price Index m/m'],
  ['2026-11-06T13:30:00Z', 'Non-Farm Employment Change'], ['2026-11-06T13:30:00Z', 'Unemployment Rate'],
  ['2026-11-10T13:30:00Z', 'CPI m/m'], ['2026-11-10T13:30:00Z', 'Core CPI m/m'],
  ['2026-11-13T13:30:00Z', 'PPI m/m'],
  ['2026-11-17T13:30:00Z', 'Retail Sales m/m'],
];
const seedEvents = () => SCHEDULE.map(([d, t]) => ({
  id: 'sch-' + d + '-' + t.replace(/\W+/g, '').slice(0, 20), title: t, country: 'USD', date: d,
  impact: 'High', forecast: '', previous: '', actual: ''
}));

let memo = { at: 0, data: null };

/* ── Proxy FCS: key disimpan di env Vercel FCS_KEYS (pisahkan dengan koma), tidak lagi di kode publik ── */
const fcsCache = new Map();
let fcsGoodIdx = 0;
async function fcsHandler(req, res) {
  const from = String(req.query.from || ''), to = String(req.query.to || '');
  const okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const span = (new Date(to) - new Date(from)) / 864e5;
  if (!okDate(from) || !okDate(to) || !(span >= 0 && span <= 45)) return res.status(400).json({ error: 'Rentang tanggal tidak valid (maks 45 hari)' });
  const keys = (process.env.FCS_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!keys.length) return res.status(500).json({ error: 'FCS_KEYS belum di-set di Vercel' });
  const ck = from + '|' + to, hit = fcsCache.get(ck);
  if (hit && Date.now() - hit.at < 60000) return res.status(200).json({ response: hit.response, cached: true });
  for (let i = 0; i < keys.length; i++) {
    const idx = (fcsGoodIdx + i) % keys.length;
    try {
      const r = await fetch(`https://fcsapi.com/api-v3/forex/economy_cal?country=US&from=${from}&to=${to}&access_key=${encodeURIComponent(keys[idx])}`, { signal: AbortSignal.timeout(9000) });
      if (!r.ok) continue;
      const j = await r.json();
      const msg = typeof j.msg === 'string' ? j.msg.toLowerCase() : '';
      if (j.status === false || j.status === 0 || /limit|exceed|invalid|credit/.test(msg)) { console.warn('[fcs] key', idx + 1, 'limit/invalid:', j.msg); continue; }
      if (!Array.isArray(j.response)) continue;
      fcsGoodIdx = idx;
      fcsCache.set(ck, { at: Date.now(), response: j.response });
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      return res.status(200).json({ response: j.response });
    } catch (e) { console.warn('[fcs] key', idx + 1, e.message); }
  }
  return res.status(429).json({ error: 'Kuota semua key FCS habis atau tidak valid' });
}

export default async function handler(req, res) {
  if (req.query && req.query.src === 'fcs') return fcsHandler(req, res);
  try {
    if (!memo.data || Date.now() - memo.at > 20 * 60 * 1000) {
      const get = async u => {
        const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MayoraGoldFX/1.0)', 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (!Array.isArray(j)) throw new Error('format tidak dikenal');
        return j;
      };
      const base = 'https://nfs.faireconomy.media/ff_calendar_';
      const [tw, nw] = await Promise.allSettled([get(base + 'thisweek.json'), get(base + 'nextweek.json')]);
      const raw = (tw.status === 'fulfilled' ? tw.value : []).concat(nw.status === 'fulfilled' ? nw.value : []);
      const feed = raw
        .filter(e => e && e.country === 'USD' && e.impact === 'High' && e.date)
        .map(e => ({
          id: 'ff-' + new Date(e.date).getTime() + '-' + String(e.title || '').replace(/\W+/g, '').slice(0, 24),
          title: String(e.title || ''), country: 'USD', date: new Date(e.date).toISOString(),
          impact: 'High', forecast: e.forecast || '', previous: e.previous || '', actual: ''
        }));
      const last = feed.reduce((m, e) => Math.max(m, new Date(e.date).getTime()), 0);
      const extra = seedEvents().filter(e => new Date(e.date).getTime() > last);
      memo = { at: Date.now(), feedOk: tw.status === 'fulfilled', data: feed.concat(extra).sort((x, y) => x.date.localeCompare(y.date)) };
    }
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=43200');
    return res.status(200).json({ data: memo.data });
  } catch (e) {
    console.warn('[ecal]', e.message);
    if (memo.data) return res.status(200).json({ data: memo.data, stale: true });
    return res.status(502).json({ error: 'Sumber kalender tidak tersedia' });
  }
}
