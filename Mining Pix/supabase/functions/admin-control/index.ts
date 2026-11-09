import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

const allowedOrigin = 'https://andersonsr2004.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  if (origin && origin !== allowedOrigin) return json({ error: 'Origin not allowed' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

    const url = Deno.env.get('SUPABASE_URL')
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
    const publishableKey = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !publishableKey || !serviceRoleKey) {
      return json({ error: 'Server configuration is incomplete' }, 500)
    }

    const token = authorization.slice('Bearer '.length)
    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'Invalid session' }, 401)
    if (authData.user.app_metadata?.admin !== true) {
      return json({ error: 'Administrative permission required' }, 403)
    }

    const rawBody = await req.text()
    if (rawBody.length > 12000) return json({ error: 'Request too large' }, 413)
    const body = JSON.parse(rawBody)
    if (body?.action !== 'create_player_note') return json({ error: 'Unsupported action' }, 400)

    const targetUserId = typeof body.target_user_id === 'string' ? body.target_user_id : ''
    const requestId = typeof body.request_id === 'string' ? body.request_id : ''
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!uuidPattern.test(targetUserId) || !uuidPattern.test(requestId)) {
      return json({ error: 'Invalid player or request identifier' }, 400)
    }
    if (note.length < 5 || note.length > 1500 || reason.length < 3 || reason.length > 500) {
      return json({ error: 'Check note and reason lengths' }, 400)
    }

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await adminClient.rpc('admin_create_player_note', {
      p_actor_user_id: authData.user.id,
      p_target_user_id: targetUserId,
      p_note: note,
      p_reason: reason,
      p_request_id: requestId,
    })
    if (error) {
      const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 400
      return json({ error: status === 404 ? 'Player not found' : status === 403 ? 'Administrative permission required' : 'Could not save the internal note' }, status)
    }

    return json({ event_id: data.event_id, duplicate: data.duplicate === true }, 201)
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
})
