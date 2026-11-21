-- Sandbox only. A recharge qualifies after the existing admin credit posts it.
update depix_sandbox.royalty_offers set active = false where family = 'vip' and active;
update depix_sandbox.prices set active = false where category = 'vip' and active;

create table depix_sandbox.vip_topup_reversals (
  id uuid primary key,
  deposit_id uuid not null references depix_sandbox.requests(id),
  amount bigint not null check (amount > 0),
  kind text not null check (kind in ('refund', 'chargeback')),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default statement_timestamp()
);
create index vip_topup_reversals_deposit_idx on depix_sandbox.vip_topup_reversals(deposit_id, created_at);
alter table depix_sandbox.vip_topup_reversals enable row level security;
revoke all on depix_sandbox.vip_topup_reversals from public, anon, authenticated, service_role;

create index depix_sandbox_journal_deposit_reference_idx on depix_sandbox.journal(reference_id, created_at)
  where kind = 'deposit';

-- Apply recorded sandbox reversals to VIP eligibility only. This never moves funds.
create function public.depix_sandbox_record_vip_reversal(
  p_id uuid, p_deposit uuid, p_amount text, p_kind text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := depix_sandbox.require_admin();
  units bigint := depix_sandbox.amount_units(p_amount);
  deposit depix_sandbox.requests%rowtype;
  existing depix_sandbox.vip_topup_reversals%rowtype;
begin
  if p_id is null or p_kind is null or p_kind not in ('refund', 'chargeback') then
    raise exception 'Estorno inválido.' using errcode = '22023';
  end if;
  select * into deposit from depix_sandbox.requests
  where id = p_deposit and kind = 'deposit' and status = 'credited' for update;
  if not found or not exists (
    select 1 from depix_sandbox.journal j where j.reference_id = p_deposit
      and j.kind = 'deposit' and j.user_id = deposit.user_id and j.amount = deposit.amount
  ) then
    raise exception 'Recarga liquidada não encontrada.' using errcode = '22023';
  end if;
  select * into existing from depix_sandbox.vip_topup_reversals where id = p_id;
  if found then
    if (existing.deposit_id, existing.amount, existing.kind) is distinct from (p_deposit, units, p_kind) then
      raise exception 'Identificador de estorno em uso.' using errcode = '22023';
    end if;
    return false;
  end if;
  if units + (select coalesce(sum(r.amount), 0) from depix_sandbox.vip_topup_reversals r
              where r.deposit_id = p_deposit) > deposit.amount then
    raise exception 'O total estornado excede a recarga.' using errcode = '22023';
  end if;
  insert into depix_sandbox.vip_topup_reversals(id, deposit_id, amount, kind, actor_id)
  values (p_id, p_deposit, units, p_kind, actor);
  return true;
end;
$$;
revoke all on function public.depix_sandbox_record_vip_reversal(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.depix_sandbox_record_vip_reversal(uuid,uuid,text,text) to authenticated;

create function depix_sandbox.vip_levels()
returns table(tier integer, label text, threshold bigint, hash_bonus integer, xp_bonus integer, forge_discount integer)
language sql immutable set search_path = '' as $$
  values (0, 'FREE', 0::bigint, 0, 0, 0),
         (1, 'VIP 1', 10000000000, 10, 15, 5),
         (2, 'VIP 2', 25000000000, 20, 25, 10),
         (3, 'VIP 3', 50000000000, 40, 45, 20),
         (4, 'VIP 4', 100000000000, 70, 80, 30),
         (5, 'REI', 200000000000, 95, 100, 50)
$$;

create function depix_sandbox.vip_qualification(p_player uuid, p_at timestamptz)
returns table(tier integer, total_units numeric, hash_bonus integer, xp_bonus integer)
language sql stable set search_path = '' as $$
  with net as (
    select coalesce(sum(d.amount - coalesce((
      select sum(r.amount) from depix_sandbox.vip_topup_reversals r
      where r.deposit_id = d.id and r.created_at <= p_at
    ), 0)), 0) as amount
    from depix_sandbox.requests d
    where d.user_id = p_player and d.kind = 'deposit' and d.status = 'credited'
      and exists (
        select 1 from depix_sandbox.journal j where j.reference_id = d.id
          and j.kind = 'deposit' and j.user_id = p_player and j.amount = d.amount and j.created_at <= p_at
      )
  )
  select l.tier, net.amount, l.hash_bonus, l.xp_bonus
  from net cross join depix_sandbox.vip_levels() l
  where l.threshold <= net.amount
  order by l.tier desc limit 1
$$;
revoke all on function depix_sandbox.vip_levels(), depix_sandbox.vip_qualification(uuid,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_vip_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'vip_tier', q.tier,
    'qualifying_units', q.total_units::text,
    'levels', (select jsonb_agg(to_jsonb(l) || jsonb_build_object('threshold', l.threshold::text) order by l.tier)
               from depix_sandbox.vip_levels() l)
  )
  from depix_sandbox.vip_qualification(depix_sandbox.require_player(), statement_timestamp()) q
$$;

create or replace function public.royalty_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare player uuid := depix_sandbox.require_player();
begin
  return jsonb_build_object(
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('sku',sku,'family',family,'title',title,'tier',tier,'bonus',bonus,
      'price',depix_sandbox.decimal_amount(amount)) order by family,tier),'[]') from depix_sandbox.royalty_offers where active and family='rack'),
    'vip', null,
    'racks', (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'bonus',r.bonus,
      'room_id',(select m.room_id from depix_sandbox.rack_mounts m where m.rack_id=r.id limit 1))
      order by r.started_at,r.id),'[]') from depix_sandbox.royalty_receipts r where r.user_id=player and r.family='rack'),
    'mounts', (select coalesce(jsonb_object_agg(m.equipment_id,m.rack_id),'{}')
      from depix_sandbox.rack_mounts m join depix_sandbox.royalty_receipts r on r.id=m.rack_id where r.user_id=player)
  );
end;
$$;

create or replace function public.royalty_purchase(p_request_id uuid,p_sku text,p_price text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  player uuid := depix_sandbox.require_player();
  expected bigint := depix_sandbox.amount_units(p_price);
  offer depix_sandbox.royalty_offers%rowtype;
  receipt depix_sandbox.royalty_receipts%rowtype;
  started timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(player::text || ':royalty',0));
  started := clock_timestamp();
  select * into receipt from depix_sandbox.royalty_receipts where id=p_request_id;
  if found then
    if receipt.user_id <> player or receipt.sku is distinct from p_sku or receipt.amount <> expected then
      raise exception 'Identificador de compra em uso.' using errcode='22023';
    end if;
    return false;
  end if;
  select * into offer from depix_sandbox.royalty_offers where sku=p_sku and active and family='rack' for share;
  if not found or offer.amount <> expected then raise exception 'Oferta mudou. Atualize a página.' using errcode='22023'; end if;
  if not depix_sandbox.post(p_request_id,'purchase',player,'player_available','platform_sales',offer.amount) then
    raise exception 'Identificador de compra em uso.' using errcode='22023';
  end if;
  insert into depix_sandbox.royalty_receipts(id,user_id,sku,amount,title,family,bonus,started_at)
  values (p_request_id,player,offer.sku,offer.amount,offer.title,offer.family,offer.bonus,started);
  return true;
end;
$$;

create or replace function public.competition_hashrates(p_at timestamptz)
returns table(user_id uuid, hashrate numeric)
language sql
stable
set search_path = ''
as $$
  with sources as (
    select pe.user_id,
      c.hashrate * (1 + c.overclock_percent / 100 + pe.blessing_percent / 100 + coalesce(rack.bonus,0)::numeric / 100) as power, c.hashrate as vip_base
    from public.player_equipment pe
    join public.equipment_catalog c on c.sku = pe.catalog_sku
    join public.player_rooms r on r.id = pe.room_id and r.user_id = pe.user_id
    left join depix_sandbox.rack_mounts m on m.equipment_id=pe.id and m.room_id=r.id
    left join depix_sandbox.royalty_receipts rack on rack.id=m.rack_id and rack.started_at <= p_at
    where pe.status = 'installed' and r.active and pe.acquired_at <= p_at
    union all
    select b.user_id, b.active_hashrate, 0::numeric
    from public.player_game_hash_boosts b
    where b.updated_at <= p_at and b.expires_at > p_at
    union all
    select m.user_id, 10::numeric, 10::numeric
    from mining_competition.starter_miners m
    where m.claimed_at <= p_at
    union all
    select x.user_id, 2::numeric, 0::numeric
    from public.player_xp_transactions x
    where x.source = 'daily_login' and x.created_at > p_at - interval '24 hours' and x.created_at <= p_at
    group by x.user_id
  ), player_power as (
    select user_id, sum(power) as power, sum(vip_base) as vip_base
    from sources group by user_id having sum(power) > 0
  )
  select s.user_id, (s.power + s.vip_base * vip.hash_bonus / 100)::numeric(30,6)
  from player_power s
  join auth.users u on u.id = s.user_id
  join public.profiles p on p.user_id = s.user_id
  cross join lateral depix_sandbox.vip_qualification(s.user_id, p_at) vip
  where not coalesce(u.is_anonymous, false) and (u.banned_until is null or u.banned_until <= p_at)
$$;
create or replace function public.claim_daily_login_xp()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := depix_sandbox.require_player();
  v_amount bigint;
  v_key text;
  v_transaction_id uuid;
  v_xp bigint;
  v_level integer;
  v_awarded boolean := false;
begin
  select 100 + xp_bonus into v_amount
  from depix_sandbox.vip_qualification(v_user_id, statement_timestamp());

  -- UTC day boundary is authoritative and cannot be supplied by the browser.
  v_key := 'daily-login:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.player_xp_transactions (
    user_id, amount, source, idempotency_key, description
  )
  values (
    v_user_id, v_amount, 'daily_login', v_key, 'Recompensa diária de acesso'
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_transaction_id;

  if v_transaction_id is not null then
    update public.player_progress
    set xp = xp + v_amount,
        level = ((xp + v_amount) / 1000)::integer + 1,
        updated_at = now()
    where user_id = v_user_id
    returning xp, level into v_xp, v_level;

    if not found then
      raise exception 'Player progress record not found' using errcode = 'P0002';
    end if;
    v_awarded := true;
  else
    select pp.xp, pp.level
      into v_xp, v_level
    from public.player_progress pp
    where pp.user_id = v_user_id;

    if not found then
      raise exception 'Player progress record not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'awarded', v_awarded,
    'amount', case when v_awarded then v_amount else 0 end,
    'xp', v_xp,
    'level', v_level,
    'period', v_key
  );
end;
$$;
