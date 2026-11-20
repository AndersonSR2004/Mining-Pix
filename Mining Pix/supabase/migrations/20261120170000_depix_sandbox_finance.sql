-- Fictitious accounting only. This schema has no wallet keys or on-chain connector.
create schema depix_sandbox;
revoke all on schema depix_sandbox from public, anon, authenticated;

create table depix_sandbox.positions (
  account_key text primary key,
  amount bigint not null default 0,
  check (amount >= 0 or account_key in ('platform_deposit_source', 'platform_pool_source'))
);

-- Each immutable posting records both legs with a shared amount.
create table depix_sandbox.journal (
  id uuid primary key,
  kind text not null,
  reference_id uuid,
  user_id uuid,
  debit_key text not null references depix_sandbox.positions(account_key),
  credit_key text not null references depix_sandbox.positions(account_key),
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default statement_timestamp(),
  check (debit_key <> credit_key)
);
create index depix_sandbox_journal_recent_idx on depix_sandbox.journal (created_at desc, id desc);
create index depix_sandbox_journal_player_idx on depix_sandbox.journal (user_id, created_at desc, id desc);

create table depix_sandbox.requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('deposit','withdrawal')),
  amount bigint not null check (amount > 0),
  status text not null check (status in ('pending','credited','requested','approved','rejected','settled')),
  destination_address text,
  created_at timestamptz not null default statement_timestamp(),
  check (
    (kind = 'deposit' and destination_address is null and status in ('pending','credited'))
    or (kind = 'withdrawal' and destination_address ~ '^sandbox:[a-zA-Z0-9_-]{3,64}$'
      and destination_address is not null and status in ('requested','approved','rejected','settled'))
  )
);
create index depix_sandbox_requests_player_idx on depix_sandbox.requests (user_id, kind, created_at desc, id desc);
create index depix_sandbox_requests_queue_idx on depix_sandbox.requests (kind, created_at, id)
  where status in ('pending','requested','approved');

create table depix_sandbox.admin_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references depix_sandbox.requests(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  created_at timestamptz not null default statement_timestamp(),
  unique (request_id, action)
);
create index depix_sandbox_admin_events_actor_idx on depix_sandbox.admin_events (actor_id);

alter table depix_sandbox.positions enable row level security;
alter table depix_sandbox.journal enable row level security;
alter table depix_sandbox.requests enable row level security;
alter table depix_sandbox.admin_events enable row level security;
revoke all on all tables in schema depix_sandbox from public, anon, authenticated, service_role;

create function depix_sandbox.require_player()
returns uuid language plpgsql stable set search_path = '' as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Login required' using errcode = '42501';
  end if;
  return viewer;
end;
$$;

create function depix_sandbox.require_admin()
returns uuid language plpgsql stable set search_path = '' as $$
declare
  viewer uuid := depix_sandbox.require_player();
begin
  if auth.jwt()->>'aal' is distinct from 'aal2'
    or auth.jwt()#>'{app_metadata,admin}' is distinct from 'true'::jsonb
    or not exists (
      select 1 from auth.users where id = viewer and raw_app_meta_data->'admin' = 'true'::jsonb
    ) then
    raise exception 'Administrator MFA required' using errcode = '42501';
  end if;
  return viewer;
end;
$$;

create function depix_sandbox.amount_units(p_amount text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare
  units bigint;
begin
  if p_amount is null or p_amount !~ '^[0-9]{1,10}([.][0-9]{1,8})?$' then
    raise exception 'Invalid sandbox amount' using errcode = '22023';
  end if;
  units := (p_amount::numeric * 100000000)::bigint;
  if units <= 0 then
    raise exception 'Sandbox amount must be positive' using errcode = '22023';
  end if;
  return units;
end;
$$;

create function depix_sandbox.decimal_amount(p_amount numeric)
returns text language sql immutable strict set search_path = '' as $$
  select (p_amount * 0.00000001)::text
$$;

create function depix_sandbox.post(
  p_id uuid, p_kind text, p_user uuid, p_from text, p_to text, p_amount bigint, p_reference uuid default null
)
returns boolean language plpgsql set search_path = '' as $$
declare
  debit_account text;
  credit_account text;
  existing depix_sandbox.journal%rowtype;
begin
  if p_id is null or p_amount is null or p_amount <= 0 or not coalesce((
    case p_kind
      when 'deposit' then p_user is not null and p_from = 'platform_deposit_source' and p_to = 'player_available'
      when 'reserve' then p_user is not null and p_from = 'player_available' and p_to = 'player_reserved'
      when 'release' then p_user is not null and p_from = 'player_reserved' and p_to = 'player_available'
      when 'withdrawal' then p_user is not null and p_from = 'player_reserved' and p_to = 'platform_paid'
      when 'purchase' then p_user is not null and p_from = 'player_available' and p_to = 'platform_sales'
      when 'pool_funding' then p_user is null and p_from = 'platform_pool_source' and p_to = 'platform_pool'
      when 'pool_reward' then p_user is not null and p_from = 'platform_pool' and p_to = 'player_available'
      else false
    end
  ), false) then
    raise exception 'Invalid sandbox posting' using errcode = '22023';
  end if;

  debit_account := case when p_from in ('player_available','player_reserved') then p_from || ':' || p_user else p_from end;
  credit_account := case when p_to in ('player_available','player_reserved') then p_to || ':' || p_user else p_to end;

  -- Lock shared positions in a canonical order across all operations.
  insert into depix_sandbox.positions (account_key)
    select account_key from unnest(array[debit_account, credit_account]) as keys(account_key)
    order by account_key on conflict do nothing;
  perform 1 from depix_sandbox.positions where account_key in (debit_account, credit_account)
    order by account_key for update;

  insert into depix_sandbox.journal (id, kind, reference_id, user_id, debit_key, credit_key, amount)
    values (p_id, p_kind, p_reference, p_user, debit_account, credit_account, p_amount)
    on conflict (id) do nothing;
  if not found then
    select * into strict existing from depix_sandbox.journal where id = p_id;
    if (existing.kind, existing.reference_id, existing.user_id, existing.debit_key, existing.credit_key, existing.amount)
      is distinct from (p_kind, p_reference, p_user, debit_account, credit_account, p_amount) then
      raise exception 'Sandbox posting reference already used' using errcode = '22023';
    end if;
    return false;
  end if;

  update depix_sandbox.positions set amount = amount - p_amount
    where account_key = debit_account
      and (amount >= p_amount or account_key in ('platform_deposit_source','platform_pool_source'));
  if not found then
    raise exception 'Insufficient sandbox balance' using errcode = '22023';
  end if;
  update depix_sandbox.positions set amount = amount + p_amount where account_key = credit_account;
  return true;
end;
$$;

create function depix_sandbox.create_request(p_request_id uuid, p_kind text, p_amount text, p_destination text)
returns text language plpgsql set search_path = '' as $$
declare
  viewer uuid := depix_sandbox.require_player();
  units bigint := depix_sandbox.amount_units(p_amount);
  request depix_sandbox.requests%rowtype;
  initial_status text := case p_kind when 'deposit' then 'pending' else 'requested' end;
begin
  if p_request_id is null or (p_kind = 'withdrawal'
    and (p_destination is null or p_destination !~ '^sandbox:[a-zA-Z0-9_-]{3,64}$')) then
    raise exception 'Invalid sandbox request or destination' using errcode = '22023';
  end if;

  insert into depix_sandbox.requests (id, user_id, kind, amount, status, destination_address)
    values (p_request_id, viewer, p_kind, units, initial_status, p_destination)
    on conflict (id) do nothing;
  if not found then
    select * into strict request from depix_sandbox.requests where id = p_request_id for update;
    if (request.user_id, request.kind, request.amount, request.destination_address)
      is distinct from (viewer, p_kind, units, p_destination) then
      raise exception 'Sandbox request reference already used' using errcode = '22023';
    end if;
    return request.status;
  end if;
  if p_kind = 'withdrawal' then
    perform depix_sandbox.post(gen_random_uuid(), 'reserve', viewer, 'player_available', 'player_reserved', units, p_request_id);
  end if;
  return initial_status;
end;
$$;

create function public.depix_sandbox_request_deposit(p_request_id uuid, p_amount text)
returns text language sql security definer set search_path = '' as $$
  select depix_sandbox.create_request(p_request_id, 'deposit', p_amount, null)
$$;

create function public.depix_sandbox_request_withdrawal(p_request_id uuid, p_amount text, p_destination text)
returns text language sql security definer set search_path = '' as $$
  select depix_sandbox.create_request(p_request_id, 'withdrawal', p_amount, p_destination)
$$;

create function public.depix_sandbox_admin_deposit(p_request_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := depix_sandbox.require_admin();
  request depix_sandbox.requests%rowtype;
begin
  select * into request from depix_sandbox.requests where id = p_request_id and kind = 'deposit' for update;
  if not found then
    raise exception 'Sandbox deposit not found' using errcode = '22023';
  end if;
  if request.status = 'credited' then
    return request.status;
  end if;
  perform depix_sandbox.post(gen_random_uuid(), 'deposit', request.user_id, 'platform_deposit_source', 'player_available', request.amount, p_request_id);
  update depix_sandbox.requests set status = 'credited' where id = p_request_id;
  insert into depix_sandbox.admin_events (request_id, actor_id, action) values (p_request_id, actor, 'credit');
  return 'credited';
end;
$$;

create function public.depix_sandbox_admin_withdrawal(p_request_id uuid, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := depix_sandbox.require_admin();
  request depix_sandbox.requests%rowtype;
  next_status text;
begin
  select * into request from depix_sandbox.requests where id = p_request_id and kind = 'withdrawal' for update;
  if not found then
    raise exception 'Sandbox withdrawal not found' using errcode = '22023';
  end if;
  if exists (select 1 from depix_sandbox.admin_events where request_id = p_request_id and action = p_action) then
    return request.status;
  end if;
  if p_action = 'approve' and request.status = 'requested' then
    next_status := 'approved';
  elsif p_action = 'reject' and request.status in ('requested','approved') then
    next_status := 'rejected';
    perform depix_sandbox.post(gen_random_uuid(), 'release', request.user_id, 'player_reserved', 'player_available', request.amount, p_request_id);
  elsif p_action = 'settle' and request.status = 'approved' then
    next_status := 'settled';
    perform depix_sandbox.post(gen_random_uuid(), 'withdrawal', request.user_id, 'player_reserved', 'platform_paid', request.amount, p_request_id);
  else
    raise exception 'Invalid sandbox withdrawal transition' using errcode = '22023';
  end if;
  update depix_sandbox.requests set status = next_status where id = p_request_id;
  insert into depix_sandbox.admin_events (request_id, actor_id, action) values (p_request_id, actor, p_action);
  return next_status;
end;
$$;

create function depix_sandbox.wallet_data(p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'available', depix_sandbox.decimal_amount(totals.available),
    'reserved', depix_sandbox.decimal_amount(totals.reserved),
    'total', depix_sandbox.decimal_amount(totals.available + totals.reserved)
  ) from (
    select coalesce(sum(amount) filter (where account_key like 'player_available:%'), 0) as available,
           coalesce(sum(amount) filter (where account_key like 'player_reserved:%'), 0) as reserved
    from depix_sandbox.positions
    where p_user is null or account_key in ('player_available:' || p_user, 'player_reserved:' || p_user)
  ) totals
$$;

create function depix_sandbox.request_history(p_user uuid, p_kind text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  result jsonb;
begin
  if p_user is null then
    -- Oldest actionable requests appear first. Closed requests fill the remainder.
    select coalesce(jsonb_agg(to_jsonb(items) - 'pending' order by pending desc,
      case when pending then created_at end asc, created_at desc, id), '[]'::jsonb) into result
    from (
      select id, user_id, status, depix_sandbox.decimal_amount(amount) as amount, destination_address, created_at,
        status in ('pending','requested','approved') as pending
      from depix_sandbox.requests where kind = p_kind
      order by pending desc, case when status in ('pending','requested','approved') then created_at end asc, created_at desc, id limit 50
    ) items;
  else
    select coalesce(jsonb_agg(to_jsonb(items) order by created_at desc, id desc), '[]'::jsonb) into result
    from (
      select id, status, depix_sandbox.decimal_amount(amount) as amount, destination_address, created_at
      from depix_sandbox.requests where user_id = p_user and kind = p_kind order by created_at desc, id desc limit 20
    ) items;
  end if;
  return result;
end;
$$;

create function depix_sandbox.recent_entries(p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(items) order by created_at desc, id desc), '[]'::jsonb)
  from (
    select id, kind as entry_type, reference_id,
      depix_sandbox.decimal_amount(case when kind in ('purchase','withdrawal') then -amount else amount end) as amount,
      created_at
    from depix_sandbox.journal
    where p_user is null or user_id = p_user
    order by created_at desc, id desc limit 20
  ) items
$$;

create function public.depix_sandbox_wallet_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := depix_sandbox.require_player();
begin
  return depix_sandbox.wallet_data(viewer) || jsonb_build_object(
    'entries', depix_sandbox.recent_entries(viewer),
    'deposits', depix_sandbox.request_history(viewer, 'deposit'),
    'withdrawals', depix_sandbox.request_history(viewer, 'withdrawal')
  );
end;
$$;

create function public.depix_sandbox_admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform depix_sandbox.require_admin();
  return jsonb_build_object(
    'balances', depix_sandbox.wallet_data(null),
    'entries', depix_sandbox.recent_entries(null),
    'deposits', depix_sandbox.request_history(null, 'deposit'),
    'withdrawals', depix_sandbox.request_history(null, 'withdrawal'),
    'audit', coalesce((select jsonb_agg(to_jsonb(event) order by created_at desc, id desc)
      from (select id, request_id, actor_id, action, created_at from depix_sandbox.admin_events
        order by created_at desc, id desc limit 50) event), '[]'::jsonb)
  );
end;
$$;

revoke execute on all functions in schema depix_sandbox from public, anon, authenticated, service_role;
revoke execute on function public.depix_sandbox_wallet_snapshot(),
  public.depix_sandbox_admin_snapshot(), public.depix_sandbox_request_deposit(uuid,text),
  public.depix_sandbox_request_withdrawal(uuid,text,text), public.depix_sandbox_admin_deposit(uuid),
  public.depix_sandbox_admin_withdrawal(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.depix_sandbox_wallet_snapshot(),
  public.depix_sandbox_admin_snapshot(), public.depix_sandbox_request_deposit(uuid,text),
  public.depix_sandbox_request_withdrawal(uuid,text,text), public.depix_sandbox_admin_deposit(uuid),
  public.depix_sandbox_admin_withdrawal(uuid,text) to authenticated;
