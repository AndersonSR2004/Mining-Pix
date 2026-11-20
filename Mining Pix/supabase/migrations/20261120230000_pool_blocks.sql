-- DEV only. The existing daily history remains available after the cutover.
create table depix_sandbox.pool_day_approvals (
  day date primary key,
  budget_units bigint not null check (budget_units >= 0),
  approved_by uuid not null references auth.users,
  approved_at timestamptz not null default clock_timestamp()
);
create table depix_sandbox.pool_blocks (
  block_at timestamptz primary key,
  total_hashrate numeric not null check (total_hashrate >= 0),
  participants integer not null check (participants >= 0),
  distributed_units bigint not null check (distributed_units >= 0)
);
create table depix_sandbox.pool_block_rewards (
  block_at timestamptz not null references depix_sandbox.pool_blocks,
  user_id uuid not null references auth.users,
  hashrate numeric not null check (hashrate > 0),
  reward_units bigint not null check (reward_units > 0),
  posting_id uuid not null unique references depix_sandbox.journal,
  primary key (block_at,user_id)
);
create index pool_block_rewards_player_idx on depix_sandbox.pool_block_rewards(user_id,block_at desc);

alter table depix_sandbox.pool_day_approvals enable row level security;
alter table depix_sandbox.pool_blocks enable row level security;
alter table depix_sandbox.pool_block_rewards enable row level security;
revoke all on depix_sandbox.pool_day_approvals,depix_sandbox.pool_blocks,depix_sandbox.pool_block_rewards
from public,anon,authenticated,service_role;

create function depix_sandbox.settle_pool_block(p_at timestamptz default clock_timestamp())
returns boolean language plpgsql set search_path='' as $$
declare
  slot timestamptz := date_bin(interval '10 minutes',p_at,'2000-01-01 00:00 UTC'::timestamptz);
  day_utc date := (slot at time zone 'UTC')::date;
  slot_number integer := floor(extract(epoch from ((slot at time zone 'UTC')::time))/600);
  approved bigint;
  already_paid numeric;
  payable bigint;
  players jsonb;
  player_count integer;
  network_hash numeric;
  item record;
  posting uuid;
begin
  -- Share the existing operator lock order with pool funding and settings.
  perform 1 from depix_sandbox.pool_settings for update;
  if exists(select 1 from depix_sandbox.pool_blocks where block_at=slot) then return false; end if;
  select budget_units into approved from depix_sandbox.pool_day_approvals where day=day_utc;
  select coalesce(sum(distributed_units),0) into already_paid from depix_sandbox.pool_blocks
  where block_at >= (day_utc::timestamp at time zone 'UTC')
    and block_at < ((day_utc+1)::timestamp at time zone 'UTC');
  already_paid := already_paid + coalesce((select distributed_units from depix_sandbox.pool_cycles where cycle_date=day_utc),0);
  payable := greatest(0,least(
    coalesce(approved,0)/144 + case when slot_number < coalesce(approved,0)%144 then 1 else 0 end,
    coalesce(approved,0)-already_paid,
    coalesce((select amount from depix_sandbox.positions where account_key='platform_pool'),0)
  ));
  -- Record the network snapshot once, at the actual settlement time.
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'hashrate',hashrate)),'[]'),
    count(*)::integer,coalesce(sum(hashrate),0)
  into players,player_count,network_hash from public.competition_hashrates(p_at) where hashrate>0;

  insert into depix_sandbox.pool_blocks values(slot,network_hash,player_count,case when player_count>0 then payable else 0 end);
  if payable=0 or player_count=0 then return true; end if;
  for item in select * from depix_sandbox.allocate_pool(payable,players) where reward_units>0 order by user_id loop
    posting := gen_random_uuid();
    if not depix_sandbox.post(posting,'pool_reward',item.user_id,'platform_pool','player_available',item.reward_units) then
      raise exception 'Lançamento de bloco duplicado.';
    end if;
    insert into depix_sandbox.pool_block_rewards values(slot,item.user_id,item.hashrate,item.reward_units,posting);
  end loop;
  return true;
end;
$$;
revoke all on function depix_sandbox.settle_pool_block(timestamptz) from public,anon,authenticated,service_role;

-- The displayed legacy setting remains the proposed daily amount. Approval
-- is scoped to one UTC day and never moves any funds.
create function public.admin_approve_pool_day(p_day date,p_expected_units text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := depix_sandbox.require_admin(); proposed bigint;
begin
  if p_day is null or p_day not between (now() at time zone 'UTC')::date and (now() at time zone 'UTC')::date+1 then
    raise exception 'Aprovação disponível para hoje ou amanhã UTC.' using errcode='22023';
  end if;
  select daily_budget_units into strict proposed from depix_sandbox.pool_settings for update;
  if proposed::text is distinct from p_expected_units then raise exception 'Limite alterado. Atualize o painel.' using errcode='22023'; end if;
  if proposed < (
    select coalesce(sum(distributed_units),0)
      from depix_sandbox.pool_blocks
      where block_at >= (p_day::timestamp at time zone 'UTC')
        and block_at < ((p_day+1)::timestamp at time zone 'UTC')
  ) + coalesce((select distributed_units from depix_sandbox.pool_cycles where cycle_date=p_day),0) then
    raise exception 'O limite não pode ser menor que o total já distribuído.' using errcode='22023';
  end if;
  insert into depix_sandbox.pool_day_approvals(day,budget_units,approved_by) values(p_day,proposed,actor)
  on conflict(day) do update set budget_units=excluded.budget_units,approved_by=excluded.approved_by,approved_at=clock_timestamp()
  where depix_sandbox.pool_day_approvals.budget_units is distinct from excluded.budget_units;
  if found then
    insert into depix_sandbox.pool_admin_events(actor_id,kind,units) values(actor,'daily_budget',proposed);
  end if;
end;
$$;
revoke all on function public.admin_approve_pool_day(date,text) from public,anon,authenticated;
grant execute on function public.admin_approve_pool_day(date,text) to authenticated;

create or replace function public.get_my_depix_pool()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  viewer uuid := depix_sandbox.require_player();
  player_hash numeric;
  network_hash numeric;
  latest jsonb;
  history jsonb;
begin
  select coalesce(sum(hashrate) filter(where user_id=viewer),0),coalesce(sum(hashrate),0)
  into player_hash,network_hash from public.competition_hashrates(now());
  select jsonb_build_object('cycle_date',b.block_at,'settled_at',b.block_at,'participants',b.participants)
  into latest from depix_sandbox.pool_blocks b order by block_at desc limit 1;
  select coalesce(jsonb_agg(to_jsonb(h) order by cycle_date desc),'[]') into history from (
    select * from (
      select block_at as cycle_date,hashrate::text,reward_units::text from depix_sandbox.pool_block_rewards where user_id=viewer
      union all
      select cycle_date::timestamp at time zone 'UTC',hashrate::text,reward_units::text
      from depix_sandbox.pool_allocations where user_id=viewer
    ) entries order by cycle_date desc limit 20
  ) h;
  return jsonb_build_object('player_hashrate',player_hash::text,'network_hashrate',network_hash::text,
    'participation',coalesce(player_hash/nullif(network_hash,0),0)::text,'latest_cycle',latest,'history',history);
end;
$$;

select cron.schedule('mining-pix-depix-sandbox-pool','*/10 * * * *','select depix_sandbox.settle_pool_block()');

-- Display recent budget settings and sandbox funding changes to authorized administrators.
create or replace function public.admin_depix_pool_snapshot()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  has_scheduler boolean := false;
  cycles jsonb;
  audit jsonb;
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
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'actor_id', e.actor_id, 'kind', e.kind, 'units', e.units::text,
    'previous_units', e.previous_units::text, 'created_at', e.created_at
  ) order by e.created_at desc, e.id desc), '[]'::jsonb) into audit
  from (select * from depix_sandbox.pool_admin_events order by created_at desc, id desc limit 20) e;
  return jsonb_build_object(
    'daily_budget_units', settings::text, 'available_budget_units', coalesce(available, 0)::text,
    'cycles', cycles,
    'blocks', coalesce((select jsonb_agg(to_jsonb(b) order by b.block_at desc)
      from (select block_at,total_hashrate::text,participants,distributed_units::text
        from depix_sandbox.pool_blocks order by block_at desc limit 20) b),'[]'),
    'approved_today', (select budget_units::text from depix_sandbox.pool_day_approvals where day=(now() at time zone 'UTC')::date),
    'approved_tomorrow', (select budget_units::text from depix_sandbox.pool_day_approvals where day=(now() at time zone 'UTC')::date+1),
    'scheduler_installed', has_scheduler, 'audit', audit
  );
end
$$;
