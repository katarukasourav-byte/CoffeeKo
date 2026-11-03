/* Runs every hour on Netlify (production only): refreshes one roaster's
   coffees, then lets AI read a few new descriptions. Nothing to edit here;
   the roaster list is in config/catalog.json. */
import { syncRoaster, extractBatch } from '../lib/catalog.mjs';

export default async () => {
  const out = {};
  try { out.sync = await syncRoaster(); } catch (e) { out.syncError = e.message; }
  try { out.extract = await extractBatch(); } catch (e) { out.extractError = e.message; }
  console.log(JSON.stringify(out));
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
};
export const config = { schedule: '@hourly' };
