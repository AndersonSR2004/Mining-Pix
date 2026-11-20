create table mining_competition.leagues (
  name text primary key check (char_length(name) between 1 and 32),
  minimum_hashrate numeric(30,6) not null unique check (minimum_hashrate >= 0)
);

alter table mining_competition.leagues enable row level security;
revoke all on mining_competition.leagues from public, anon, authenticated, service_role;

-- These thresholds are for initial sandbox balancing. Rank and league change
-- as server-side eligibility changes, including when temporary HASH expires.
insert into mining_competition.leagues (name, minimum_hashrate) values
  ('Bronze', 0), ('Prata', 25), ('Ouro', 100),
  ('Platina', 250), ('Diamante', 600), ('Titã', 1500);

create function public.get_competition_ranking(p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  player_id uuid := auth.uid();
  result jsonb;
begin
  if player_id is null or not exists (
    select 1 from auth.users u
    where u.id = player_id and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'Conta ativa obrigatória' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Posição de início inválida' using errcode = '22023';
  end if;

  with ranked as materialized (
    select h.user_id, h.hashrate, rank() over (order by h.hashrate desc) as position
    from public.competition_hashrates(now()) h
  ),
  totals as (
    select count(*) as participants, coalesce(sum(hashrate), 0) as network_hashrate from ranked
  ),
  previous as materialized (
    select a.user_id, rank() over (order by a.hashrate desc) as position
    from depix_sandbox.pool_allocations a
    where a.cycle_date = (select max(c.cycle_date) from depix_sandbox.pool_cycles c)
      and a.hashrate > 0
  ),
  page as (
    select r.user_id, r.hashrate, r.position
    from ranked r
    order by r.position, r.user_id
    limit 25 offset p_offset
  ),
  visible as (
    select p.user_id,
      jsonb_build_object(
        'position', p.position,
        'name', case when btrim(profile.display_name) ~ '^[^@[:cntrl:]]+$'
          then btrim(profile.display_name) else 'Minerador' end,
        'hashrate', p.hashrate::text,
        'league', league.name,
        'movement', previous.position - p.position
      ) as item,
      p.position
    from page p
    join public.profiles profile on profile.user_id = p.user_id
    cross join lateral (
      select l.name from mining_competition.leagues l
      where l.minimum_hashrate <= p.hashrate
      order by l.minimum_hashrate desc limit 1
    ) league
    left join previous on previous.user_id = p.user_id
  ),
  personal_history as (
    select a.cycle_date, a.hashrate, a.reward_units
    from depix_sandbox.pool_allocations a
    where a.user_id = player_id
    order by a.cycle_date desc limit 10
  )
  select jsonb_build_object(
    'players', coalesce((select jsonb_agg(v.item order by v.position, v.user_id) from visible v), '[]'::jsonb),
    'leagues', (select jsonb_agg(jsonb_build_object('name', l.name, 'minimum_hashrate', l.minimum_hashrate::text)
      order by l.minimum_hashrate) from mining_competition.leagues l),
    'participants', totals.participants,
    'network_hashrate', totals.network_hashrate::text,
    'me', jsonb_build_object(
      'position', me.position,
      'hashrate', coalesce(me.hashrate, 0)::text,
      'participation', coalesce(round(100 * me.hashrate / nullif(totals.network_hashrate, 0), 4), 0)::text,
      'league', (select l.name from mining_competition.leagues l where l.minimum_hashrate <= coalesce(me.hashrate, 0)
        order by l.minimum_hashrate desc limit 1),
      'movement', previous.position - me.position,
      'starter_claimed', exists (select 1 from mining_competition.starter_miners s where s.user_id = player_id),
      'history', coalesce((select jsonb_agg(jsonb_build_object(
        'cycle_date', h.cycle_date, 'hashrate', h.hashrate::text, 'reward_units', h.reward_units::text
      ) order by h.cycle_date desc) from personal_history h), '[]'::jsonb)
    )
  )
  into result
  from totals
  left join ranked me on me.user_id = player_id
  left join previous on previous.user_id = player_id;
  return result;
end;
$$;

revoke all on function public.get_competition_ranking(integer) from public, anon, authenticated, service_role;
grant execute on function public.get_competition_ranking(integer) to authenticated;
