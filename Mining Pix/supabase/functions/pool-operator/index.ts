import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (req: Request) => {
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

    // Authorization is read only from server-managed app_metadata, never user_metadata.
    if (authData.user.app_metadata?.pool_operator !== true) {
      return json({ error: 'Pool operator permission required' }, 403)
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const body = await req.json()
    if (body?.action === 'open_cycle') {
      const cycleKey = typeof body.cycle_key === 'string' ? body.cycle_key.trim() : ''
      const budget = typeof body.budget_mc === 'string' ? body.budget_mc : String(body.budget_mc ?? '')
      if (!cycleKey || cycleKey.length > 100 || !/^\d{1,20}$/.test(budget)) {
        return json({ error: 'Invalid cycle key or integer MINING COIN budget' }, 400)
      }
      const { data, error } = await admin.rpc('open_pool_cycle', {
        p_cycle_key: cycleKey,
        p_budget_mc: budget,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ cycle_id: data, status: 'open', currency: 'MC' }, 201)
    }

    if (body?.action === 'settle_cycle') {
      const cycleId = typeof body.cycle_id === 'string' ? body.cycle_id : ''
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cycleId)) {
        return json({ error: 'Invalid cycle id' }, 400)
      }
      const { data, error } = await admin.rpc('settle_pool_cycle', { p_cycle_id: cycleId })
      if (error) return json({ error: error.message }, 400)
      return json(data)
    }

    return json({ error: 'Unsupported action' }, 400)
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
})
