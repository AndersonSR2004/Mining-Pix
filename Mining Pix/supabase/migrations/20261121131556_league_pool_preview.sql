create function depix_sandbox.league_divisions()
returns table(division integer, label text, minimum_hash bigint, percent integer)
language sql immutable set search_path = '' as $$
  values (1,'Bronze I',0::bigint,100), (2,'Bronze II',1000,100),
  (3,'Bronze III',10000,100), (4,'Prata I',25000,90),
  (5,'Prata II',75000,90), (6,'Prata III',150000,90),
  (7,'Ouro I',300000,80), (8,'Ouro II',800000,80),
  (9,'Ouro III',1500000,80), (10,'Diamante I',3000000,70),
  (11,'Diamante II',10000000,70), (12,'Diamante III',25000000,70)
$$;
revoke all on function depix_sandbox.league_divisions() from public, anon, authenticated, service_role;

-- Preview only: budgets are hypothetical and never debited or credited.
create function public.preview_league_pools(p_cap text, p_reserves text[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  viewer uuid := depix_sandbox.require_player();
  cap numeric;
  reserves numeric[];
  result jsonb;
begin
  if not exists (select 1 from auth.users u where u.id = viewer
    and u.raw_app_meta_data->'admin' = 'true'::jsonb
    and (u.banned_until is null or u.banned_until <= statement_timestamp())) then
    raise exception 'Administrative permission required' using errcode = '42501';
  end if;
  if p_cap is null or p_cap !~ '^[0-9]{1,18}$'
    or coalesce(cardinality(p_reserves),0) <> 12
    or array_ndims(p_reserves) <> 1 or array_lower(p_reserves,1) <> 1
    or exists (select 1 from unnest(p_reserves) value where value is null or value !~ '^[0-9]{1,18}$') then
    raise exception 'Informe um teto e 12 reservas inteiras em unidades mínimas.' using errcode = '22023';
  end if;
  cap := p_cap::numeric;
  reserves := p_reserves::numeric[];
  if (select sum(value) from unnest(reserves) value) > cap then
    raise exception 'Soma das reservas excede o teto.' using errcode = '22023';
  end if;
  with members as (
    select league.division, p.hashrate
    from public.competition_hashrates(statement_timestamp()) p
    cross join lateral (
      select d.division from depix_sandbox.league_divisions() d
      where d.minimum_hash <= p.hashrate order by d.minimum_hash desc limit 1
    ) league
  ), totals as (
    select division, count(*) as participants, sum(hashrate) as hash from members group by division
  ), pools as (
    select d.*, coalesce(t.participants,0) as participants, coalesce(t.hash,0) as hash,
      reserves[d.division] as reserved,
      case when t.hash > 0 then floor(reserves[d.division] * d.percent / 100) else 0 end as payable
    from depix_sandbox.league_divisions() d left join totals t using(division)
  ), payments as (
    select p.division, sum(floor(p.payable * m.hashrate / p.hash)) as distributed
    from pools p join members m using(division) group by p.division
  )
  select jsonb_build_object('cap',cap::text, 'unallocated',(cap-sum(p.reserved))::text,
    'pools',jsonb_agg(jsonb_build_object(
      'label',p.label,'minimum_hash',p.minimum_hash,'percent',p.percent,'participants',p.participants,
      'hash',p.hash::text,'reserved',p.reserved::text,'distributed',coalesce(x.distributed,0)::text,
      'retained',(p.reserved-p.payable)::text,'rounding',(p.payable-coalesce(x.distributed,0))::text
    ) order by p.division))
  into result from pools p left join payments x using(division);
  return result;
end;
$$;
revoke all on function public.preview_league_pools(text,text[]) from public, anon, authenticated;
grant execute on function public.preview_league_pools(text,text[]) to authenticated;

create function public.depix_treasury_review()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  viewer uuid := depix_sandbox.require_admin();
  result jsonb;
begin
  with entries as (
    select credit_key as account, amount::numeric as delta from depix_sandbox.journal
    union all
    select debit_key, -amount::numeric from depix_sandbox.journal
  ), balances as (
    select account, sum(delta) as amount from entries group by account
  ), ledger as (
    select coalesce(b.account, p.account_key) as account, coalesce(b.amount,0) as expected,
      coalesce(p.amount,0)::numeric as recorded
    from balances b full join depix_sandbox.positions p on p.account_key=b.account
  ), requests as (
    select user_id, sum(amount) as amount from depix_sandbox.requests
    where kind='withdrawal' and status in ('requested','approved') group by user_id
  ), backing as (
    select coalesce(r.amount,0) as obligation, coalesce(l.recorded,0) as reserved
    from requests r full join (select * from ledger where account like 'player_reserved:%') l
      on l.account='player_reserved:' || r.user_id::text
  )
  select jsonb_build_object(
    'pool_balance', coalesce((select recorded from ledger where account='platform_pool'),0)::text,
    'obligations', coalesce((select sum(obligation) from backing),0)::text,
    'reserved', coalesce((select sum(reserved) from backing),0)::text,
    'covered', coalesce((select sum(least(obligation,reserved)) from backing),0)::text,
    'uncovered', coalesce((select sum(greatest(obligation-reserved,0)) from backing),0)::text,
    'ledger_mismatches', (select count(*) from ledger where expected <> recorded)
  ) into result;
  return result;
end;
$$;
revoke all on function public.depix_treasury_review() from public, anon, authenticated;
grant execute on function public.depix_treasury_review() to authenticated;
