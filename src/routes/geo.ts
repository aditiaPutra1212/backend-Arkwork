// backend/src/routes/geo.ts
import { Router } from 'express';

const G = Router();

// helper fetch JSON (Node 18+ sudah ada global fetch)
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** GET /api/geo/provinces */
G.get('/provinces', async (_req, res, next) => {
  try {
    const data = await getJson<Array<{ id: string; name: string }>>(
      'https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json'
    );
    res.json(data);
  } catch (e) { next(e); }
});

/** GET /api/geo/regencies?province_id=31 */
G.get('/regencies', async (req, res, next) => {
  try {
    const pid = String(req.query.province_id || '').trim();
    if (!pid) return res.status(400).json({ error: 'province_id required' });

    const data = await getJson<Array<{ id: string; name: string }>>(
      `https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${encodeURIComponent(pid)}.json`
    );
    res.json(data);
  } catch (e) { next(e); }
});

// (opsional) districts & villages juga bisa kamu tambahkan serupa:
// /districts?regency_id=.. , /villages?district_id=..

export default G;
