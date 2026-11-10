-- Mining Pix Phase 7B: audited player access controls with retry-safe operation records.
create table if not exists public.admin_player_access_operations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('block', 'unblock')),
  reason text not null check (length(btrim(reason)) between 5 and 500),
  request_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  before_banned_until timestamptz,
  after_banned_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_user_id, request_id)
);

comment on table public.admin_player_access_operations is
  'Internal idempotency and recovery journal for privileged Auth access changes. No secrets or user credentials are stored.';

alter table public.admin_player_access_operations enable row level security;
revoke all on table public.admin_player_access_operations from public, anon, authenticated, service_role;
grant select, insert, update on table public.admin_player_access_operations to service_role;

create or replace function public.admin_begin_player_access_change(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.admin_player_access_operations%rowtype;
  v_operation public.admin_player_access_operations%rowtype;
  v_banned_until timestamptz;
  v_target_is_admin boolean;
  v_blocked boolean;
  v_already_in_state boolean;
begin
  if p_actor_user_id is null or p_target_user_id is null or p_request_id is null
     or p_action not in ('block', 'unblock')
     or length(btrim(coalesce(p_reason, ''))) < 5
     or length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'Invalid access change request' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_actor_user_id
      and coalesce(u.raw_app_meta_data ->> 'admin', 'false') = 'true'
  ) then
    raise exception 'Administrative permission required' using errcode = '42501';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'Administrators cannot change their own access' using errcode = '42501';
  end if;

  select coalesce(u.raw_app_meta_data ->> 'admin', 'false') = 'true', u.banned_until
    into v_target_is_admin, v_banned_until
  from auth.users u
  where u.id = p_target_user_id;

  if not found then
    raise exception 'Target player not found' using errcode = 'P0002';
  end if;
  if v_target_is_admin then
    raise exception 'Administrative accounts cannot be changed through player controls' using errcode = '42501';
  end if;

  insert into public.admin_player_access_operations (
    actor_user_id, target_user_id, action, reason, request_id, before_banned_until
  )
  values (
    p_actor_user_id, p_target_user_id, p_action, btrim(p_reason), p_request_id, v_banned_until
  )
  on conflict (actor_user_id, request_id) do nothing
  returning * into v_operation;

  if v_operation.id is null then
    select * into v_existing
    from public.admin_player_access_operations op
    where op.actor_user_id = p_actor_user_id and op.request_id = p_request_id;

    if not found
       or v_existing.target_user_id is distinct from p_target_user_id
       or v_existing.action <> p_action
       or v_existing.reason <> btrim(p_reason) then
      raise exception 'Idempotency key already used for a different request' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'operation_id', v_existing.id,
      'status', v_existing.status,
      'duplicate', true,
      'already_in_state', false,
      'before_banned_until', v_existing.before_banned_until,
      'after_banned_until', v_existing.after_banned_until,
      'error_code', v_existing.error_code
    );
  end if;

  v_blocked := v_banned_until is not null and v_banned_until > now();
  v_already_in_state := (p_action = 'block' and v_blocked)
                     or (p_action = 'unblock' and not v_blocked);

  return jsonb_build_object(
    'operation_id', v_operation.id,
    'status', v_operation.status,
    'duplicate', false,
    'already_in_state', v_already_in_state,
    'before_banned_until', v_banned_until
  );
end;
$$;

create or replace function public.admin_complete_player_access_change(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_success boolean,
  p_after_banned_until timestamptz default null,
  p_error_code text default null,
  p_no_op boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.admin_player_access_operations%rowtype;
  v_event_id uuid;
  v_action text;
  v_after timestamptz;
begin
  if p_actor_user_id is null or p_operation_id is null then
    raise exception 'Invalid operation reference' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_actor_user_id
      and coalesce(u.raw_app_meta_data ->> 'admin', 'false') = 'true'
  ) then
    raise exception 'Administrative permission required' using errcode = '42501';
  end if;

  select * into v_operation
  from public.admin_player_access_operations op
  where op.id = p_operation_id and op.actor_user_id = p_actor_user_id
  for update;

  if not found then
    raise exception 'Access operation not found' using errcode = 'P0002';
  end if;

  if v_operation.status <> 'pending' then
    return jsonb_build_object(
      'operation_id', v_operation.id,
      'status', v_operation.status,
      'duplicate', true
    );
  end if;

  v_after := case when p_success then p_after_banned_until else v_operation.before_banned_until end;
  update public.admin_player_access_operations
  set status = case when p_success then 'succeeded' else 'failed' end,
      after_banned_until = v_after,
      error_code = case when p_success then null else left(coalesce(p_error_code, 'auth_operation_failed'), 80) end,
      completed_at = now()
  where id = v_operation.id;

  v_action := case
    when not p_success then 'player.access.change_failed'
    when v_operation.action = 'block' then 'player.access.blocked'
    else 'player.access.unblocked'
  end;

  insert into public.admin_audit_logs (
    actor_user_id, target_user_id, action, entity_type, entity_id,
    reason, before_data, after_data, metadata, request_id
  )
  values (
    p_actor_user_id,
    v_operation.target_user_id,
    v_action,
    'player',
    v_operation.target_user_id::text,
    v_operation.reason,
    jsonb_build_object(
      'access_status', case when v_operation.before_banned_until is not null and v_operation.before_banned_until > now() then 'blocked' else 'active' end,
      'banned_until', v_operation.before_banned_until
    ),
    jsonb_build_object(
      'access_status', case when p_success and v_after is not null and v_after > now() then 'blocked' else 'active' end,
      'banned_until', v_after
    ),
    jsonb_build_object(
      'source', 'admin-center',
      'operation_id', v_operation.id,
      'result', case when p_success then 'succeeded' else 'failed' end,
      'no_op', p_no_op,
      'error_code', case when p_success then null else left(coalesce(p_error_code, 'auth_operation_failed'), 80) end,
      'ban_duration', case when v_operation.action = 'block' then '720h' else 'none' end
    ),
    v_operation.request_id
  )
  on conflict (actor_user_id, request_id) where request_id is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select log.id into v_event_id
    from public.admin_audit_logs log
    where log.actor_user_id = p_actor_user_id
      and log.request_id = v_operation.request_id;
  end if;

  return jsonb_build_object(
    'operation_id', v_operation.id,
    'event_id', v_event_id,
    'status', case when p_success then 'succeeded' else 'failed' end,
    'duplicate', false
  );
end;
$$;

revoke all on function public.admin_begin_player_access_change(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_complete_player_access_change(uuid, uuid, boolean, timestamptz, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_begin_player_access_change(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.admin_complete_player_access_change(uuid, uuid, boolean, timestamptz, text, boolean) to service_role;

comment on function public.admin_begin_player_access_change(uuid, uuid, text, text, uuid) is
  'Service-role-only idempotent access operation initializer. Revalidates current admin, prevents self-lockout and protects admin accounts.';
comment on function public.admin_complete_player_access_change(uuid, uuid, boolean, timestamptz, text, boolean) is
  'Service-role-only completion endpoint. Finalizes operation state and immutable audit event in one transaction.';

create or replace function public.admin_player_directory(
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_limit integer := coalesce(p_limit, 25);
  v_offset integer := coalesce(p_offset, 0);
  v_total bigint;
  v_players jsonb;
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'admin', 'false') <> 'true' then
    raise exception 'Administrative permission required' using errcode = '42501';
  end if;

  if length(v_search) > 80 or v_limit < 1 or v_limit > 50 or v_offset < 0 or v_offset > 100000 then
    raise exception 'Invalid directory pagination or search parameters' using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.profiles p
  where v_search = ''
     or strpos(lower(p.display_name), lower(v_search)) > 0
     or left(p.user_id::text, length(v_search)) = lower(v_search);

  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.user_id), '[]'::jsonb)
    into v_players
  from (
    select
      p.user_id,
      p.display_name,
      p.created_at,
      coalesce(w.balance, 0) as wallet_balance_pc,
      coalesce(pp.level, 1) as level,
      coalesce(pp.xp, 0) as xp,
      coalesce(pp.vip_tier, 0) as vip_tier,
      coalesce(pp.premium_pass, false) as premium_pass,
      coalesce(eq.equipment_count, 0) as installed_equipment_count,
      coalesce(eq.hashrate, 0) as installed_hashrate,
      (coalesce(u.raw_app_meta_data ->> 'admin', 'false') = 'true') as is_admin,
      u.banned_until,
      case when u.banned_until is not null and u.banned_until > now() then 'blocked' else 'active' end as access_status
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.wallets w on w.user_id = p.user_id
    left join public.player_progress pp on pp.user_id = p.user_id
    left join lateral (
      select count(*) as equipment_count, coalesce(sum(c.hashrate), 0) as hashrate
      from public.player_equipment pe
      join public.equipment_catalog c on c.sku = pe.catalog_sku
      join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
      where pe.user_id = p.user_id and pe.status = 'installed' and pr.active = true
    ) eq on true
    where v_search = ''
       or strpos(lower(p.display_name), lower(v_search)) > 0
       or left(p.user_id::text, length(v_search)) = lower(v_search)
    order by p.created_at desc, p.user_id
    limit v_limit offset v_offset
  ) page_row;

  return jsonb_build_object(
    'generated_at', now(),
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'players', v_players
  );
end;
$$;

revoke all on function public.admin_player_directory(text, integer, integer) from public, anon;
grant execute on function public.admin_player_directory(text, integer, integer) to authenticated;

comment on function public.admin_player_directory(text, integer, integer) is
  'Admin-only player directory. Exposes operational profile summary and account access status, never email, credentials, or auth metadata.';
