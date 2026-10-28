// Edge Function «invite-member» — the admin's «ادعُ عضواً» button (2026-10-28).
//
//  1. The caller's own JWT calls the SQL function invite_user(): the database decides who is an
//     admin (profiles.role via current_role_()), validates role/client, and writes the invitation row.
//     Nothing here trusts the request body for authorisation.
//  2. Only then does the service-role key (never leaves this function) send the Auth invitation e-mail,
//     carrying role / name / client name as *display* metadata for the e-mail template. RLS never reads it.
//  3. Honest status: `sent:false` + reason when the row exists but the e-mail could not be sent.
//
// Deploy: Supabase dashboard → Edge Functions → invite-member (verify JWT on). Env vars SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase; nothing to configure.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SITE_URL = Deno.env.get('HAMSHA_SITE_URL') ?? 'https://hamsha.studio'
const ROLES = new Set(['admin', 'creative', 'client'])
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })
  try {
    return await handle(req)
  } catch (e) {
    // Never a silent failure: the row may or may not exist — the UI says "could not send, try again"
    // (a retry is safe: invite_user() updates the open invitation instead of duplicating it).
    return json(500, { error: e instanceof Error ? e.message : 'unexpected error' })
  }
})

async function handle(req: Request): Promise<Response> {

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'missing token' })

  let body: { action?: unknown; email?: unknown; role?: unknown; name?: unknown; clientId?: unknown }
  try {
    const parsed: unknown = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json(400, { error: 'invalid json' })
    body = parsed as typeof body
  } catch {
    return json(400, { error: 'invalid json' })
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'invalid email' })
  if (body.action === 'resend') return resend(req, auth, email)
  const role = typeof body.role === 'string' ? body.role : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const clientId = typeof body.clientId === 'string' && body.clientId ? body.clientId : null
  if (!ROLES.has(role)) return json(400, { error: 'invalid role' })
  if ((role === 'client') !== !!clientId) return json(400, { error: 'client needs a client; team must not have one' })

  const url = Deno.env.get('SUPABASE_URL')!
  // --- 1. as the caller: the database enforces "admins only" and records the invitation
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: inv, error: rpcErr } = await asCaller
    .rpc('invite_user', { p_email: email, p_role: role, p_client_id: clientId, p_name: name || null })
    .single<{ id: string; email: string; role: string; client_id: string | null; name: string | null; expires_at: string }>()
  if (rpcErr) {
    const m = rpcErr.message ?? 'invite failed'
    const status = /only admins|42501|permission denied/i.test(m) ? 403 : 400
    return json(status, { error: m })
  }

  // --- 2. as the service role: send the Auth invitation e-mail (display metadata only)
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  // The client's display name is read AS THE CALLER (an admin sees their org's clients through RLS);
  // the service role deliberately has no SELECT grant on public tables.
  let clientName: string | null = null
  if (clientId) {
    const { data: c } = await asCaller.from('clients').select('name').eq('id', clientId).maybeSingle<{ name: string }>()
    clientName = c?.name ?? null
  }
  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/welcome`,
    data: { role, name: name || null, client_name: clientName },
  })
  if (sendErr) {
    // Auth API error codes are stable (email_exists); the message regex is only a fallback.
    const code = (sendErr as { code?: string }).code ?? ''
    const already = code === 'email_exists' || /already|registered|exists/i.test(sendErr.message)
    // sent:false = the send request failed (the invitation row exists; retry is safe). It does not
    // claim knowledge of delivery — `sent:true` means Auth accepted the send, not that it was delivered.
    return json(200, { ok: true, sent: false, reason: already ? 'already_registered' : 'send_failed', error: sendErr.message, invitation: inv })
  }
  return json(200, { ok: true, sent: true, invitation: inv })
}

// ---------- action=resend: re-send the invitation e-mail to a member who has not set a password yet ----------
// Authorisation again comes from the database: pending_members() returns rows ONLY for an admin of the
// member's own organization (security definer, see 0005: invited + no password yet). Auth re-invites an
// unconfirmed user; one who already opened the link gets the password-set (recovery) mail instead.
async function resend(_req: Request, auth: string, email: string): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL')!
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: rows, error: pendErr } = await asCaller.rpc('pending_members')
  if (pendErr) return json(/42501|permission denied/i.test(pendErr.message) ? 403 : 400, { error: pendErr.message })
  const member = (rows as Array<{ id: string; email: string; name: string | null; role: string; client_id: string | null }> | null)?.find((r) => r.email === email)
  if (!member) return json(404, { error: 'not pending' })
  let clientName: string | null = null
  if (member.client_id) {
    const { data: c } = await asCaller.from('clients').select('name').eq('id', member.client_id).maybeSingle<{ name: string }>()
    clientName = c?.name ?? null
  }
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/welcome`,
    data: { role: member.role, name: member.name, client_name: clientName },
  })
  if (sendErr) {
    const code = (sendErr as { code?: string }).code ?? ''
    const already = code === 'email_exists' || /already|registered|exists|confirmed/i.test(sendErr.message)
    if (!already) return json(200, { ok: true, sent: false, reason: 'send_failed', error: sendErr.message })
    // The person opened the first link (e-mail confirmed) but never chose a password: Auth refuses a
    // second invite, so send the password-set link instead — it lands on /welcome exactly like the invite.
    const { error: recErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/welcome` })
    if (recErr) return json(200, { ok: true, sent: false, reason: 'send_failed', error: recErr.message })
    return json(200, { ok: true, sent: true, via: 'recovery' })
  }
  return json(200, { ok: true, sent: true })
}
