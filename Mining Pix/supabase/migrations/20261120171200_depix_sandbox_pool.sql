-- Daily settlement and funding controls for the isolated DePix sandbox.
create table depix_sandbox.pool_settings (
  singleton boolean primary key default true check (singleton),
  daily_budget_units bigint not null default 0 check (daily_budget_units >= 0)
);
insert into depix_sandbox.pool_settings default values;

create table depix_sandbox.pool_admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  kind text not null check (kind in ('daily_budget', 'funding')),
  previous_units bigint check (previous_units >= 0),
  units bigint not null check (units >= 0),
  created_at timestamptz not null default now()
);

create table depix_sandbox.pool_cycles (
  cycle_date date primary key,
  settled_at timestamptz not null,
  total_hashrate numeric not null check (total_hashrate >= 0),
  participants integer not null check (participants >= 0),
  budget_units bigint not null check (budget_units > 0),
  distributed_units bigint not null check (distributed_units between 0 and budget_units),
  check (
    (participants = 0 and total_hashrate = 0 and distributed_units = 0)
    or (participants > 0 and total_hashrate > 0 and distributed_units = budget_units)
  )
);

create table depix_sandbox.pool_allocations (
  cycle_date date not null references depix_sandbox.pool_cycles(cycle_date),
  user_id uuid not null references auth.users(id),
  hashrate numeric not null check (hashrate > 0),
  reward_units bigint not null check (reward_units >= 0),
  posting_id uuid unique references depix_sandbox.journal(id),
  check ((reward_units > 0) = (posting_id is not null)),
  primary key (cycle_date, user_id)
);

create index depix_pool_user_history_idx
  on depix_sandbox.pool_allocations (user_id, cycle_date desc);
create index depix_pool_admin_actor_idx on depix_sandbox.pool_admin_events (actor_id);

alter table depix_sandbox.pool_settings enable row level security;
alter table depix_sandbox.pool_admin_events enable row level security;
alter table depix_sandbox.pool_cycles enable row level security;
alter table depix_sandbox.pool_allocations enable row level security;
revoke all on depix_sandbox.pool_settings, depix_sandbox.pool_admin_events,
  depix_sandbox.pool_cycles, depix_sandbox.pool_allocations from public, anon, authenticated, service_role;

-- div/mod use an exact quotient and remainder. Numeric division can round
-- a quotient just below an integer up when the configured budget is large.
create function depix_sandbox.allocate_pool(p_budget bigint, p_participants jsonb)
returns table (user_id uuid, hashrate numeric, reward_units bigint)
language sql immutable strict set search_path = ''
as $$
  with players as (
    select p.user_id, p.hashrate, sum(p.hashrate) over () as total
    from jsonb_to_recordset(p_participants) as p(user_id uuid, hashrate numeric)
    where p.hashrate > 0
  ),
  quotients as (
    select user_id, hashrate, div(p_budget * hashrate, total) as whole_units,
      mod(p_budget * hashrate, total) as remainder
    from players
  ),
  priorities as (
    select *, sum(whole_units) over () as assigned,
      row_number() over (order by remainder desc, user_id) as priority
    from quotients
  )
  select user_id, hashrate,
    (whole_units + case when priority <= p_budget - assigned then 1 else 0 end)::bigint
  from priorities
$$;

-- Executes atomically. A repeated scheduler tick for the same UTC day returns
-- before querying participants. If settlement fails, no cycle or posting persists.
create function depix_sandbox.settle_pool(p_at timestamptz default now())
returns boolean language plpgsql set search_path = ''
as $$
declare
  cycle_day date := (p_at at time zone 'UTC')::date;
  daily_limit bigint;
  budget bigint;
  players jsonb;
  player_count integer;
  network_hash numeric;
  iteration record;
  posting uuid;
  allocated bigint := 0;
begin
  select daily_budget_units into strict daily_limit
  from depix_sandbox.pool_settings for update;

  if daily_limit = 0 or exists (
    select 1 from depix_sandbox.pool_cycles where cycle_date = cycle_day
  ) then return false; end if;

  select least(daily_limit, coalesce((
    select amount from depix_sandbox.positions where account_key = 'platform_pool'
  ), 0)) into budget;
  if budget <= 0 then return false; end if;

  -- Capture eligible power exactly once and reuse that snapshot for allocation.
  select coalesce(jsonb_agg(jsonb_build_object('user_id', h.user_id, 'hashrate', h.hashrate)), '[]'::jsonb),
    count(*)::integer, coalesce(sum(h.hashrate), 0)
  into players, player_count, network_hash
  from public.competition_hashrates(p_at) h where h.hashrate > 0;

  insert into depix_sandbox.pool_cycles
    (cycle_date, settled_at, total_hashrate, participants, budget_units, distributed_units)
  values (cycle_day, p_at, network_hash, player_count, budget, case when player_count > 0 then budget else 0 end);

  for iteration in select * from depix_sandbox.allocate_pool(budget, players) order by user_id
  loop
    posting := case when iteration.reward_units > 0 then gen_random_uuid() end;
    if posting is not null then
      if not depix_sandbox.post(posting, 'pool_reward', iteration.user_id, 'platform_pool',
        'player_available', iteration.reward_units) then
        raise exception 'Publicação duplicada no ciclo DePix sandbox';
      end if;
    end if;
    insert into depix_sandbox.pool_allocations (cycle_date, user_id, hashrate, reward_units, posting_id)
    values (cycle_day, iteration.user_id, iteration.hashrate, iteration.reward_units, posting);
    allocated := allocated + iteration.reward_units;
  end loop;

  if player_count > 0 and allocated <> budget then
    raise exception 'Distribuição DePix sandbox não conciliada';
  end if;
  return true;
end
$$;

create function depix_sandbox.pool_cycle_json(p_cycle depix_sandbox.pool_cycles)
returns jsonb language sql stable strict set search_path = ''
as $$
  select jsonb_build_object(
    'cycle_date', p_cycle.cycle_date, 'settled_at', p_cycle.settled_at,
    'total_hashrate', p_cycle.total_hashrate::text, 'participants', p_cycle.participants,
    'budget_units', p_cycle.budget_units::text, 'distributed_units', p_cycle.distributed_units::text
  )
$$;

create function public.get_my_depix_pool()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  player_id uuid := depix_sandbox.require_player();
  player_hash numeric;
  network_hash numeric;
  latest_cycle jsonb;
  reward_history jsonb;
begin
  select coalesce(sum(hashrate) filter (where user_id = player_id), 0), coalesce(sum(hashrate), 0)
  into player_hash, network_hash
  from public.competition_hashrates(now());

  select depix_sandbox.pool_cycle_json(c) into latest_cycle
  from depix_sandbox.pool_cycles c order by cycle_date desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'cycle_date', a.cycle_date, 'hashrate', a.hashrate::text, 'reward_units', a.reward_units::text
  ) order by a.cycle_date desc), '[]'::jsonb) into reward_history
  from (
    select cycle_date, hashrate, reward_units from depix_sandbox.pool_allocations
    where user_id = player_id order by cycle_date desc limit 20
  ) a;

  return jsonb_build_object(
    'player_hashrate', player_hash::text, 'network_hashrate', network_hash::text,
    'participation', coalesce(player_hash / nullif(network_hash, 0), 0)::text,
    'latest_cycle', latest_cycle, 'history', reward_history
  );
end
$$;

create function public.admin_depix_pool_snapshot()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  has_scheduler boolean := false;
  cycles jsonb;
  settings bigint;
  available bigint;
begin
  perform depix_sandbox.require_admin();
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = $1 and active)'
      into has_scheduler using 'mining-pix-depix-sandbox-pool';
  end if;
  select daily_budget_units into strict settings from depix_sandbox.pool_settings;
  select amount into available from depix_sandbox.positions where account_key = 'platform_pool';
  select coalesce(jsonb_agg(depix_sandbox.pool_cycle_json(c) order by c.cycle_date desc), '[]'::jsonb)
  into cycles
  from (select * from depix_sandbox.pool_cycles order by cycle_date desc limit 20) c;
  return jsonb_build_object(
    'daily_budget_units', settings::text, 'available_budget_units', coalesce(available, 0)::text,
    'cycles', cycles, 'scheduler_installed', has_scheduler
  );
end
$$;

create function public.admin_configure_depix_pool_budget(p_daily_units text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := depix_sandbox.require_admin();
  new_limit bigint;
  old_limit bigint;
begin
  if p_daily_units is null or p_daily_units !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Limite diário inválido' using errcode = '22023';
  end if;
  new_limit := p_daily_units::bigint;

  select daily_budget_units into strict old_limit from depix_sandbox.pool_settings for update;
  if new_limit <> old_limit then
    update depix_sandbox.pool_settings set daily_budget_units = new_limit;
    insert into depix_sandbox.pool_admin_events (actor_id, kind, previous_units, units)
    values (actor, 'daily_budget', old_limit, new_limit);
  end if;
end
$$;

create function public.admin_fund_depix_pool(p_operation_id uuid, p_units text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := depix_sandbox.require_admin();
  units bigint;
  previous depix_sandbox.pool_admin_events%rowtype;
begin
  if p_operation_id is null or p_units is null or p_units !~ '^[1-9][0-9]{0,18}$' then
    raise exception 'Crédito simulado inválido' using errcode = '22023';
  end if;
  units := p_units::bigint;
  perform 1 from depix_sandbox.pool_settings for update;
  select * into previous from depix_sandbox.pool_admin_events where id = p_operation_id;
  if found then
    if previous.actor_id <> actor or previous.kind <> 'funding' or previous.units <> units then
      raise exception 'Identificador já usado para outra operação' using errcode = '22023';
    end if;
    return;
  end if;

  if not depix_sandbox.post(p_operation_id, 'pool_funding', null, 'platform_pool_source',
    'platform_pool', units) then
    raise exception 'Identificador já usado para outro lançamento' using errcode = '22023';
  end if;
  insert into depix_sandbox.pool_admin_events (id, actor_id, kind, units)
  values (p_operation_id, actor, 'funding', units);
end
$$;

revoke execute on function depix_sandbox.allocate_pool(bigint, jsonb),
  depix_sandbox.settle_pool(timestamptz), depix_sandbox.pool_cycle_json(depix_sandbox.pool_cycles)
  from public, anon, authenticated, service_role;
revoke execute on function public.get_my_depix_pool(), public.admin_depix_pool_snapshot(),
  public.admin_configure_depix_pool_budget(text), public.admin_fund_depix_pool(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_my_depix_pool(), public.admin_depix_pool_snapshot(),
  public.admin_configure_depix_pool_budget(text), public.admin_fund_depix_pool(uuid, text)
  to authenticated;
