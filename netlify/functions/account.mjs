/* Account actions for a signed-in user. Right now: delete my account.
   Deleting the login also deletes the user's profile, journal, shelf and AI
   usage rows (the tables are set to cascade). Photos are stored inside those
   rows, so they go too. */
const env = k => process.env[k] || '';
const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { message: 'Use POST' });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await fetch(env('SUPABASE_URL') + '/auth/v1/user', { headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: 'Bearer ' + token } });
  const user = u.ok ? await u.json() : null;
  if (!user?.id) return json(401, { code: 'http_401', message: 'Please sign in again.' });
  let b = {}; try { b = await req.json(); } catch {}
  if (b.action !== 'delete' || b.confirm !== 'DELETE') return json(400, { message: 'Type DELETE to confirm.' });
  const r = await fetch(`${env('SUPABASE_URL')}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY') } });
  if (!r.ok) { console.error('delete failed', r.status, await r.text()); return json(502, { message: 'Couldn’t delete the account. Email hello@coffeeko.in and we’ll do it by hand.' }); }
  return json(200, { deleted: true });
};
