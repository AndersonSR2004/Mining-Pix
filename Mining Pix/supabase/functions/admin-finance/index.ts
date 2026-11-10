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
const integerPattern = /^\d{1,18}$/
const signedIntegerPattern = /^-?\d{1,18}$/

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  if (origin !== allowedOrigin) return json({ error: 'Origin not allowed' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415)
  }
  const declaredLength = Number(req.headers.get('Content-Length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > 12000) return json({ error: 'Request too large' }, 413)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
    const url = Deno.env.get('SUPABASE_URL')
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
    const publishableKey = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !publishableKey || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500)

    const token = authorization.slice('Bearer '.length)
    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await userClient.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'Invalid session' }, 401)
    if (authData.user.app_metadata?.admin !== true) return json({ error: 'Administrative permission required' }, 403)

    const rawBody = await req.text()
    if (rawBody.length > 12000) return json({ error: 'Request too large' }, 413)
    const body = JSON.parse(rawBody)
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const actorId = authData.user.id

    if (body?.action === 'record_expense') {
      const amount = String(body.amount_cents ?? '')
      if (!integerPattern.test(amount) || BigInt(amount) <= 0n) return json({ error: 'Invalid BRL amount in cents' }, 400)
      if (typeof body.expense_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.expense_date)) return json({ error: 'Invalid expense date' }, 400)
      if (typeof body.idempotency_key !== 'string' || body.idempotency_key.length > 160) return json({ error: 'Invalid idempotency key' }, 400)
      const { data, error } = await admin.rpc('admin_record_operational_expense', {
        p_actor_user_id: actorId,
        p_category: body.category,
        p_description: body.description,
        p_amount_cents: amount,
        p_expense_date: body.expense_date,
        p_source_reference: body.source_reference,
        p_idempotency_key: body.idempotency_key,
        p_reason: body.reason,
        p_vendor_reference: body.vendor_reference ?? null,
      })
      if (error) return json({ error: 'Could not record the operational expense', detail: error.message }, 400)
      return json({ ...data, status: 'succeeded', currency: 'BRL' }, 201)
    }

    if (body?.action === 'create_commitment') {
      const amountCents = body.amount_cents === null || body.amount_cents === undefined ? null : String(body.amount_cents)
      const amountMc = body.amount_mc === null || body.amount_mc === undefined ? null : String(body.amount_mc)
      if (amountCents !== null && (!integerPattern.test(amountCents) || BigInt(amountCents) <= 0n)) return json({ error: 'Invalid BRL commitment amount' }, 400)
      if (amountMc !== null && (!/^\d{1,22}(\.\d{1,8})?$/.test(amountMc) || Number(amountMc) <= 0)) return json({ error: 'Invalid MC commitment amount' }, 400)
      if (!uuidPattern.test(String(body.idempotency_key ?? '')) && (typeof body.idempotency_key !== 'string' || body.idempotency_key.length < 1 || body.idempotency_key.length > 160)) return json({ error: 'Invalid idempotency key' }, 400)
      if (typeof body.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) return json({ error: 'Invalid due date' }, 400)
      const { data, error } = await admin.rpc('admin_create_financial_commitment', {
        p_actor_user_id: actorId,
        p_commitment_type: body.commitment_type,
        p_category: body.category,
        p_description: body.description,
        p_amount_cents: amountCents,
        p_amount_mc: amountMc,
        p_due_date: body.due_date,
        p_source_reference: body.source_reference,
        p_idempotency_key: body.idempotency_key,
        p_reason: body.reason,
      })
      if (error) return json({ error: 'Could not create financial commitment', detail: error.message }, 400)
      return json({ ...data, status: 'succeeded' }, 201)
    }

    if (body?.action === 'record_reserve_movement') {
      const amount = String(body.signed_amount_cents ?? '')
      if (!signedIntegerPattern.test(amount) || BigInt(amount) === 0n) return json({ error: 'Invalid signed BRL amount in cents' }, 400)
      const { data, error } = await admin.rpc('admin_record_reserve_movement', {
        p_actor_user_id: actorId,
        p_movement_type: body.movement_type,
        p_signed_amount_cents: amount,
        p_source_reference: body.source_reference,
        p_idempotency_key: body.idempotency_key,
        p_reason: body.reason,
      })
      if (error) return json({ error: 'Could not record reserve movement', detail: error.message }, 400)
      return json({ ...data, status: 'succeeded', currency: 'BRL' }, 201)
    }

    if (body?.action === 'close_expense_month') {
      if (typeof body.month !== 'string' || !/^\\d{4}-\\d{2}$/.test(body.month)) return json({ error: 'Invalid month' }, 400)
      if (typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 500) return json({ error: 'Month close reason must contain at least 10 characters' }, 400)
      if (typeof body.idempotency_key !== 'string' || body.idempotency_key.trim().length < 1 || body.idempotency_key.length > 160) return json({ error: 'Invalid idempotency key' }, 400)
      const { data, error } = await admin.rpc('admin_close_expense_month', {
        p_actor_user_id: actorId,
        p_month_start: body.month + '-01',
        p_idempotency_key: body.idempotency_key,
        p_reason: body.reason.trim(),
      })
      if (error) return json({ error: 'Could not close expense month', detail: error.message }, 400)
      return json({ ...data, status: 'succeeded' }, 201)
    }

    if (body?.action === 'transition_commitment') {
      if (!uuidPattern.test(String(body.commitment_id ?? ''))) return json({ error: 'Invalid commitment identifier' }, 400)
      if (body.new_status !== 'paid' && body.new_status !== 'cancelled') return json({ error: 'Invalid commitment status' }, 400)
      if (body.paid_expense_entry_id && !uuidPattern.test(String(body.paid_expense_entry_id))) return json({ error: 'Invalid expense identifier' }, 400)
      const { data, error } = await admin.rpc('admin_transition_financial_commitment', {
        p_actor_user_id: actorId,
        p_commitment_id: body.commitment_id,
        p_new_status: body.new_status,
        p_paid_expense_entry_id: body.paid_expense_entry_id ?? null,
        p_reason: body.reason,
      })
      if (error) return json({ error: 'Could not transition financial commitment', detail: error.message }, 400)
      return json({ ...data, status: 'succeeded' }, 200)
    }

    return json({ error: 'Unsupported financial action' }, 400)
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
})
