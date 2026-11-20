create schema if not exists mining_competition;
revoke all on schema mining_competition from public, anon, authenticated, service_role;

create table mining_competition.starter_miners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table mining_competition.starter_miners enable row level security;
revoke all on mining_competition.starter_miners from public, anon, authenticated, service_role;

create function public.claim_competition_starter()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
begin
  if player_id is null or not exists (
    select 1
    from auth.users u
    join public.profiles p on p.user_id = u.id
    where u.id = player_id and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'Conta ativa obrigatória' using errcode = '42501';
  end if;

  insert into mining_competition.starter_miners (user_id)
  values (player_id)
  on conflict (user_id) do nothing;
  return found;
end;
$$;

revoke all on function public.claim_competition_starter() from public, anon, authenticated, service_role;
grant execute on function public.claim_competition_starter() to authenticated;

create index if not exists player_xp_daily_login_recent_idx
  on public.player_xp_transactions (created_at desc, user_id)
  where source = 'daily_login';

-- The starter is permanently bound to an account. It has no catalog SKU,
-- transfer operation or cash value. Only the simulation consumes this power.
create function public.competition_hashrates(p_at timestamptz)
returns table(user_id uuid, hashrate numeric)
language sql
stable
set search_path = ''
as $$
  with sources as (
    select pe.user_id,
      c.hashrate * (1 + c.overclock_percent / 100 + pe.blessing_percent / 100) as power
    from public.player_equipment pe
    join public.equipment_catalog c on c.sku = pe.catalog_sku
    join public.player_rooms r on r.id = pe.room_id and r.user_id = pe.user_id
    where pe.status = 'installed' and r.active and pe.acquired_at <= p_at
    union all
    select b.user_id, b.active_hashrate
    from public.player_game_hash_boosts b
    where b.updated_at <= p_at and b.expires_at > p_at
    union all
    select m.user_id, 10::numeric
    from mining_competition.starter_miners m
    where m.claimed_at <= p_at
    union all
    select x.user_id, 2::numeric
    from public.player_xp_transactions x
    where x.source = 'daily_login' and x.created_at > p_at - interval '24 hours' and x.created_at <= p_at
    group by x.user_id
  )
  select s.user_id, sum(s.power)::numeric(30,6)
  from sources s
  join auth.users u on u.id = s.user_id
  join public.profiles p on p.user_id = s.user_id
  where not coalesce(u.is_anonymous, false) and (u.banned_until is null or u.banned_until <= p_at)
  group by s.user_id
  having sum(s.power) > 0
$$;

revoke all on function public.competition_hashrates(timestamptz) from public, anon, authenticated, service_role;
