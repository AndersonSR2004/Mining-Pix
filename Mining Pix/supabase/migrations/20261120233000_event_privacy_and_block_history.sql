create or replace function public.get_event_shop_progress(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  viewer uuid := depix_sandbox.require_player();
  event public.game_events%rowtype;
  result jsonb;
begin
  select * into event from public.game_events
  where id=p_event and event_type='event' and status='live' and starts_at<=now() and ends_at>now()
    and payload->>'mechanic'='progression';
  if not found then raise exception 'Evento indisponível.' using errcode='P0002'; end if;
  with verified as (
    select p.user_id,j.amount from depix_sandbox.purchases p
    join depix_sandbox.prices s on s.product=p.product and s.category in ('equipment','room')
    join depix_sandbox.journal j on j.id=p.request_id and j.kind='purchase' and j.user_id=p.user_id
    where j.created_at>=event.starts_at and j.created_at<event.ends_at
    union all
    select r.user_id,j.amount from depix_sandbox.royalty_receipts r
    join depix_sandbox.journal j on j.id=r.id and j.kind='purchase' and j.user_id=r.user_id
    where r.family='rack' and j.created_at>=event.starts_at and j.created_at<event.ends_at
  ), scores as (
    select user_id,div(sum(amount),100000) points from verified group by user_id
  ), board as (
    select s.*,dense_rank() over(order by s.points desc) position,case when btrim(p.display_name) ~ '^[^@[:cntrl:]]+$' then btrim(p.display_name) else 'Jogador' end name
    from scores s join public.profiles p on p.user_id=s.user_id where s.points>0
  )
  select jsonb_build_object('points',coalesce((select points from scores where user_id=viewer),0)::text,
    'ranking',coalesce((select jsonb_agg(jsonb_build_object('position',position,'name',name,'points',points::text,'is_you',user_id=viewer)
      order by position,user_id) from (select * from board order by position,user_id limit 25) top_players),'[]'))
  into result;
  return result;
end;
$$;

create or replace function public.get_competition_ranking(p_offset integer default 0)
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
    from (
      select user_id,hashrate from depix_sandbox.pool_block_rewards
      where block_at=(select max(block_at) from depix_sandbox.pool_block_rewards)
      union all
      select user_id,hashrate from depix_sandbox.pool_allocations
      where cycle_date=(select max(cycle_date) from depix_sandbox.pool_cycles)
        and not exists(select 1 from depix_sandbox.pool_block_rewards)
    ) a
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
    select * from (
      select a.block_at as cycle_date,a.hashrate,a.reward_units,
        (select count(*)+1 from depix_sandbox.pool_block_rewards c where c.block_at=a.block_at and c.hashrate>a.hashrate) position
      from depix_sandbox.pool_block_rewards a where a.user_id=player_id
      union all
      select a.cycle_date::timestamp at time zone 'UTC',a.hashrate,a.reward_units,
        (select count(*)+1 from depix_sandbox.pool_allocations c where c.cycle_date=a.cycle_date and c.hashrate>a.hashrate)
      from depix_sandbox.pool_allocations a where a.user_id=player_id
    ) entries order by cycle_date desc limit 10
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
        'cycle_date', h.cycle_date, 'hashrate', h.hashrate::text, 'reward_units', h.reward_units::text, 'position', h.position
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
