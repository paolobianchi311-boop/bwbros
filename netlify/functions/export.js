import { getStore } from '@netlify/blobs';

export const config = { path: '/api/export' };

export default async (req) => {
  const url = new URL(req.url);
  const adminKey = process.env.ADMIN_KEY;
  const sent = url.searchParams.get('key') || req.headers.get('x-admin-key') || '';
  if (!adminKey) return new Response('ADMIN_KEY no configurada', { status: 500 });
  if (sent !== adminKey) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const store = getStore('scores');
  const { blobs } = await store.list();
  let recs = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })))).filter(Boolean);

  if (url.searchParams.get('emails') === '1') recs = recs.filter(r => r.email);
  recs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (url.searchParams.get('format') === 'json') {
    const withEmail = recs.filter(r => r.email).length;
    const redeemed = recs.filter(r => r.redeemed).length;
    const uniqueEmails = new Set(recs.filter(r => r.email).map(r => r.email)).size;
    const byTeam = { 'ALITAS FC': 0, 'CLUB CHUNKS': 0, 'PICANTE CF': 0 };
    const byGender = { M: 0, F: 0 };
    recs.forEach(r => {
      if (byTeam[r.team] != null) byTeam[r.team]++;
      if (r.gender === 'F') byGender.F++; else byGender.M++;
    });
    return new Response(JSON.stringify({
      total: recs.length, withEmail, uniqueEmails, redeemed, byTeam, byGender, records: recs
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const csvCell = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = ['id','apodo','genero','email','equipo','puntos','monedas','postes','rojas','penales','empates','modo','canjeado','fecha_canje','fecha','token'];
  const lines = [header.join(',')];
  for (const r of recs) {
    const e = r.events || {};
    lines.push([
      r.id || '', r.name || '', r.gender || 'M', r.email || '', r.team || '',
      r.score || 0, r.coins || 0,
      e.poste || 0, e.roja || 0, e.penal || 0, e.empate || 0,
      r.mode || (r.email ? 'qr' : 'rank'),
      r.redeemed ? 'SI' : 'NO', r.redeemedAt || '', r.date || '', r.token || ''
    ].map(csvCell).join(','));
  }
  const csv = '\uFEFF' + lines.join('\r\n');
  const fname = 'bw-socazone-' + new Date().toISOString().slice(0, 10) + '.csv';
  return new Response(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fname}"` }
  });
};
