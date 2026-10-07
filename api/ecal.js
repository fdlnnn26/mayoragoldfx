/* Cadangan jadwal kalender ekonomi (gratis) saat kuota FCS habis.
   Sumber: feed mingguan Forex Factory (impact sudah dinilai: High/Medium/Low).
   Hanya USD + High yang dikembalikan. Feed ini tidak memuat nilai Actual. */
let memo = { at: 0, data: null };

export default async function handler(req, res) {
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
      if (tw.status !== 'fulfilled') throw tw.reason;           // minggu depan boleh gagal (belum terbit)
      const raw = tw.value.concat(nw.status === 'fulfilled' ? nw.value : []);
      memo = {
        at: Date.now(),
        data: raw
          .filter(e => e && e.country === 'USD' && e.impact === 'High' && e.date)
          .map(e => ({
            id: 'ff-' + new Date(e.date).getTime() + '-' + String(e.title || '').replace(/\W+/g, '').slice(0, 24),
            title: String(e.title || ''), country: 'USD', date: new Date(e.date).toISOString(),
            impact: 'High', forecast: e.forecast || '', previous: e.previous || '', actual: ''
          }))
          .sort((x, y) => x.date.localeCompare(y.date))
      };
    }
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=43200');
    return res.status(200).json({ data: memo.data });
  } catch (e) {
    console.warn('[ecal]', e.message);
    if (memo.data) return res.status(200).json({ data: memo.data, stale: true });
    return res.status(502).json({ error: 'Sumber kalender tidak tersedia' });
  }
}
