import { getStore } from '@netlify/blobs';

export const config = { path: '/api/score' };

export default async (req) => {
  const store = getStore('scores');
  const url = new URL(req.url);

  // ===== GUARDAR (fin de partida) =====
  if (req.method === 'POST') {
    const d = await req.json();
    const token = (d.token || 'x').toString();
    const id = token + '-' + Date.now().toString(36);
    const rec = {
      id,
      email: (d.email || '').toLowerCase().trim(),
      name: (d.name || '').trim().slice(0, 24),
      gender: (d.gender === 'F' ? 'F' : 'M'),
      score: +d.score || 0,
      coins: +d.coins || 0,
      team: d.team || '',
      events: d.events || {},
      mode: d.mode || (d.email ? 'qr' : 'rank'),
      token,
      redeemed: false,
      redeemedAt: null,
      date: new Date().toISOString()
    };
    await store.setJSON(id, rec);
    return Response.json({ ok: true, id, rec });
  }

  // ===== LEER (verificación en caja) o RANKING GLOBAL =====
  if (req.method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) {
      const r = await store.get(id, { type: 'json' });
      return r ? Response.json(r) : new Response('not found', { status: 404 });
    }
    const { blobs } = await store.list();
    const all = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }))))
      .filter(Boolean);
    all.sort((a, b) => (b.score || 0) - (a.score || 0));
    // Solo mandamos lo público (sin email)
    const publicRecs = all.slice(0, 50).map(r => ({
      id: r.id,
      name: r.name || 'SOCAZONE',
      gender: r.gender || 'M',
      team: r.team || '',
      score: r.score || 0,
      coins: r.coins || 0,
      events: r.events || {},
      date: r.date
    }));
    return Response.json(publicRecs);
  }

  // ===== MARCAR CANJEADO (PIN cajero) =====
  if (req.method === 'PUT') {
    const requiredPin = process.env.CASHIER_PIN;
    if (requiredPin) {
      const sentPin = req.headers.get('x-cashier-pin') || '';
      if (sentPin !== requiredPin) {
        return Response.json({ ok: false, error: 'invalid pin' }, { status: 403 });
      }
    }
    const id = url.searchParams.get('id');
    const r = await store.get(id, { type: 'json' });
    if (!r) return new Response('404', { status: 404 });
    if (!r.redeemed) {
      r.redeemed = true;
      r.redeemedAt = new Date().toISOString();
      await store.setJSON(id, r);
    }
    return Response.json({ ok: true, rec: r });
  }

  // ===== BORRAR (admin) =====
  if (req.method === 'DELETE') {
    const adminKey = process.env.ADMIN_KEY;
    const sent = url.searchParams.get('key') || req.headers.get('x-admin-key') || '';
    if (!adminKey || sent !== adminKey) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const id = url.searchParams.get('id');
    const wipeAll = url.searchParams.get('all') === '1';
    if (wipeAll) {
      const { blobs } = await store.list();
      let deleted = 0;
      for (const b of blobs) { await store.delete(b.key); deleted++; }
      return Response.json({ ok: true, deleted });
    }
    if (id) {
      await store.delete(id);
      return Response.json({ ok: true, deleted: 1, id });
    }
    return Response.json({ ok: false, error: 'missing id or ?all=1' }, { status: 400 });
  }

  return new Response('405', { status: 405 });
};
