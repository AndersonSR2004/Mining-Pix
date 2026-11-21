create function public.game_master_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  viewer uuid := depix_sandbox.require_player();
  captured_at timestamptz := statement_timestamp();
  result jsonb;
begin
  if not exists (select 1 from auth.users u where u.id = viewer
    and u.raw_app_meta_data->'admin' = 'true'::jsonb
    and (u.banned_until is null or u.banned_until <= captured_at)) then
    raise exception 'Administrative permission required' using errcode = '42501';
  end if;

  with players as (
    select p.user_id, qualification.tier, qualification.total_units
    from public.profiles p
    join auth.users u on u.id = p.user_id
    cross join lateral depix_sandbox.vip_qualification(p.user_id, captured_at) qualification
    where not coalesce(u.is_anonymous, false)
  ), power as (
    select hashrate, row_number() over(order by hashrate desc) as position,
      count(*) over() as participants
    from public.competition_hashrates(captured_at)
  )
  select jsonb_build_object(
    'captured_at', captured_at,
    'players', (select count(*) from players),
    'active_players_7d', (select count(distinct a.user_id) from private.player_activity_events a
      join players p using(user_id) where a.created_at >= captured_at - interval '7 days'),
    'sandbox_payers', (select count(*) from players where total_units > 0),
    'eligible_topups', (select coalesce(sum(total_units),0)::text from players),
    'vip_counts', (select jsonb_agg(jsonb_build_object('label', l.label, 'count', n.total) order by l.tier)
      from depix_sandbox.vip_levels() l
      cross join lateral (select count(*) as total from players p where p.tier = l.tier) n),
    'circulation', (select coalesce(sum(amount),0)::text from depix_sandbox.positions
      where account_key like 'player_available:%' or account_key like 'player_reserved:%'),
    'withdrawal_queue', (select coalesce(sum(amount),0)::text from depix_sandbox.requests
      where kind = 'withdrawal' and status in ('requested','approved')),
    'network_hashrate', (select coalesce(sum(hashrate),0)::text from power),
    'top_decile_share', (select round(100 * sum(hashrate) filter(where position <= ceil(participants / 10.0))
      / nullif(sum(hashrate),0), 2) from power),
    'live_events', (select count(*) from public.game_events
      where status='live' and starts_at <= captured_at and ends_at > captured_at),
    'pool_distributed', (select coalesce(sum(distributed_units),0)::text from depix_sandbox.pool_blocks),
    'pool_budget_today', (select budget_units::text from depix_sandbox.pool_day_approvals
      where day=(captured_at at time zone 'UTC')::date)
  ) into result;
  return result;
end;
$$;
revoke all on function public.game_master_overview() from public, anon, authenticated;
grant execute on function public.game_master_overview() to authenticated;
