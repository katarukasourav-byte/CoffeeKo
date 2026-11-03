/* Manual catalogue refresh, for the site owner only.
   POST /.netlify/functions/catalog-sync  with header  x-admin-token: <the private key; its fingerprint is in config/catalog.json>
   body: {"action":"sync","roaster":"Blue Tokai"} | {"action":"extract","n":6} | {"action":"status"} */
import { createHash } from 'node:crypto';
import cfg from '../../config/catalog.json';
import { syncRoaster, extractBatch, status } from '../lib/catalog.mjs';

const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-admin-token' } });

export default async (req) => {
  if (req.method === 'OPTIONS') return json(204, {});
  const given = req.headers.get('x-admin-token') || '';
  const ok = given && (given === process.env.CATALOG_ADMIN_TOKEN || createHash('sha256').update(given).digest('hex') === cfg.adminTokenSha256);
  if (!ok) return json(401, { error: 'not allowed' });
  let b = {}; try { b = await req.json(); } catch {}
  try {
    if (b.action === 'sync') return json(200, await syncRoaster(b.roaster));
    if (b.action === 'extract') return json(200, await extractBatch(b.n));
    return json(200, await status());
  } catch (e) { return json(500, { error: e.message }); }
};
