create table depix_sandbox.battle_passes (
  id uuid primary key references depix_sandbox.catalog_seasons,
  xp_per_level integer not null default 100 check (xp_per_level between 1 and 10000)
);
insert into depix_sandbox.battle_passes(id)
select id from depix_sandbox.catalog_seasons where title='Genesis';

create table depix_sandbox.pass_players (
  pass_id uuid not null references depix_sandbox.battle_passes,
  player_id uuid not null references auth.users,
  premium boolean not null default false,
  full_pass boolean not null default false,
  skips integer not null default 0 check (skips between 0 and 30),
  spent bigint not null default 0,
  primary key(pass_id,player_id)
);
create table depix_sandbox.pass_orders (
  request_id uuid primary key,
  pass_id uuid not null,
  player_id uuid not null,
  action text not null,
  amount bigint not null,
  created_at timestamptz not null default now(),
  foreign key(pass_id,player_id) references depix_sandbox.pass_players
);
create table depix_sandbox.pass_rewards (
  pass_id uuid not null references depix_sandbox.battle_passes,
  level integer not null check(level between 1 and 30),
  equipment_sku text references public.equipment_catalog,
  rack_sku text references depix_sandbox.royalty_offers,
  check ((equipment_sku is null or level % 3 = 0) and (rack_sku is null or level % 3 = 2)),
  primary key(pass_id,level)
);
create table depix_sandbox.pass_claims (
  pass_id uuid not null,
  player_id uuid not null,
  level integer not null,
  kind text not null,
  label text not null,
  quantity integer not null,
  created_at timestamptz not null default now(),
  foreign key (pass_id,player_id) references depix_sandbox.pass_players,
  foreign key (pass_id,level) references depix_sandbox.pass_rewards,
  primary key(pass_id,player_id,level)
);
insert into depix_sandbox.pass_rewards(pass_id,level)
select id, n from depix_sandbox.battle_passes cross join generate_series(1,30) n;

alter table depix_sandbox.battle_passes enable row level security;
alter table depix_sandbox.pass_players enable row level security;
alter table depix_sandbox.pass_rewards enable row level security;
alter table depix_sandbox.pass_orders enable row level security;
alter table depix_sandbox.pass_claims enable row level security;
revoke all on depix_sandbox.battle_passes,depix_sandbox.pass_players,depix_sandbox.pass_rewards,depix_sandbox.pass_orders,depix_sandbox.pass_claims
from public,anon,authenticated,service_role;

create function depix_sandbox.pass_xp(p_player uuid,p_start timestamptz,p_end timestamptz)
returns numeric language sql stable set search_path='' as $$
 select coalesce(sum(amount),0) from public.player_xp_transactions
 where user_id=p_player and created_at >= p_start and created_at < p_end
$$;
revoke all on function depix_sandbox.pass_xp(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;

create function public.genesis_pass_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid := depix_sandbox.require_player(); result jsonb;
begin
  select jsonb_build_object('id',bp.id,'title',s.title,'ends_at',s.ends_at,
    'premium',coalesce(p.premium,false),'full',coalesce(p.full_pass,false),
    'level',case when p.full_pass then 30 else least(30,floor(depix_sandbox.pass_xp(viewer,s.starts_at,s.ends_at)/bp.xp_per_level)+coalesce(p.skips,0)) end,
    'xp_per_level',bp.xp_per_level,'premium_price','60.00','skip_price','1.99',
    'full_price',depix_sandbox.decimal_amount(greatest(0,10000000000-coalesce(p.spent,0))),
    'claimed',coalesce((select jsonb_agg(to_jsonb(c) - 'player_id' - 'pass_id' order by level)
      from depix_sandbox.pass_claims c where c.player_id=viewer and c.pass_id=bp.id),'[]'))
  into result from depix_sandbox.battle_passes bp join depix_sandbox.catalog_seasons s on s.id=bp.id
  left join depix_sandbox.pass_players p on p.pass_id=bp.id and p.player_id=viewer
  where now()>=s.starts_at and now()<s.ends_at
  order by s.starts_at desc limit 1;
  return result;
end;
$$;

create function public.genesis_pass_action(p_request uuid,p_pass uuid,p_action text,p_level integer default null,p_expected_price text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  viewer uuid := depix_sandbox.require_player();
  p depix_sandbox.pass_players%rowtype;
  order_row depix_sandbox.pass_orders%rowtype;
  season depix_sandbox.catalog_seasons%rowtype;
  transition_at timestamptz;
  threshold integer;
  unlocked integer;
  charge bigint;
  kind text;
  label text;
begin
  if p_request is null or p_pass is null or p_action is null then raise exception 'Solicitação inválida.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(viewer::text || ':genesis-pass',0));
  transition_at := clock_timestamp();
  select * into order_row from depix_sandbox.pass_orders where request_id=p_request;
  if found then
    if order_row.player_id<>viewer or order_row.pass_id<>p_pass or order_row.action<>p_action then
      raise exception 'Identificador em uso.' using errcode='22023';
    end if;
    if (p_expected_price::numeric*100000000) is distinct from order_row.amount::numeric then
      raise exception 'Identificador em uso com outro preço.' using errcode='22023';
    end if;
    return false;
  end if;
  if p_action='claim' and exists(select 1 from depix_sandbox.pass_claims where pass_id=p_pass and player_id=viewer and level=p_level) then return false; end if;

  select * into season from depix_sandbox.catalog_seasons where id=p_pass;
  select xp_per_level into threshold from depix_sandbox.battle_passes where id=p_pass;
  if threshold is null or transition_at<season.starts_at or transition_at>=season.ends_at then
    raise exception 'Passe fora da temporada.' using errcode='22023';
  end if;
  insert into depix_sandbox.pass_players(pass_id,player_id) values(p_pass,viewer) on conflict do nothing;
  select * into strict p from depix_sandbox.pass_players where pass_id=p_pass and player_id=viewer;
  unlocked := case when p.full_pass then 30 else least(30,floor(depix_sandbox.pass_xp(viewer,season.starts_at,season.ends_at)/threshold)+p.skips) end;

  if p_action = 'claim' then
    if not p.premium or p_level is null or p_level not between 1 and unlocked then
      raise exception 'Recompensa ainda não disponível.' using errcode='22023';
    end if;
    kind := case p_level%3 when 1 then 'parts' when 2 then 'rack' else 'equipment' end;
    label := case kind when 'parts' then 'Parts' when 'rack' then 'Rack de passe · placeholder sandbox'
      else 'Máquina de passe · placeholder sandbox' end;
    insert into depix_sandbox.pass_claims(pass_id,player_id,level,kind,label,quantity)
    values (p_pass,viewer,p_level,kind,label,case when kind='parts' then 10 else 1 end);
    return true;
  end if;
  if p_action='premium' and not p.premium then charge := 6000000000;
  elsif p_action='skip' and p.premium and unlocked<30 then charge := 199000000;
  elsif p_action='full' and not p.full_pass then charge := greatest(0,10000000000-p.spent);
  else raise exception 'Compra indisponível.' using errcode='22023';
  end if;

  if coalesce(p_expected_price,'') !~ '^[0-9]{1,10}([.][0-9]{1,8})?$'
    or (p_expected_price::numeric * 100000000) is distinct from charge::numeric then
    raise exception 'O preço mudou. Atualize o passe.' using errcode='22023';
  end if;
  if charge>0 and not depix_sandbox.post(p_request,'purchase',viewer,'player_available','platform_sales',charge) then
    raise exception 'Identificador em uso.' using errcode='22023';
  end if;
  insert into depix_sandbox.pass_orders (request_id,pass_id,player_id,action,amount) values(p_request,p_pass,viewer,p_action,charge);
  update depix_sandbox.pass_players set premium=true, full_pass=(p_action='full'),
    skips=skips+case when p_action='skip' then 1 else 0 end, spent=spent+charge
  where pass_id=p_pass and player_id=viewer;
  return true;
end;
$$;
revoke all on function public.genesis_pass_snapshot(),public.genesis_pass_action(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.genesis_pass_snapshot(),public.genesis_pass_action(uuid,uuid,text,integer,text) to authenticated;

-- Preserve pilot receipts while retiring superseded demonstration offers.
update depix_sandbox.prices set active=false where product in ('vip','pass') and category in ('vip','pass');
