create table depix_sandbox.catalog_seasons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 64),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  closed_at timestamptz,
  created_by uuid references auth.users(id),
  closed_by uuid references auth.users(id),
  check (ends_at = starts_at + interval '720 hours')
);

create table depix_sandbox.season_equipment (
  season_id uuid not null references depix_sandbox.catalog_seasons,
  sku text not null unique references public.equipment_catalog,
  tier smallint not null check (tier between 1 and 3),
  image_url text check (length(image_url) <= 500 and image_url ~ '^https://'),
  primary key (season_id, tier)
);

alter table depix_sandbox.catalog_seasons enable row level security;
alter table depix_sandbox.season_equipment enable row level security;
revoke all on depix_sandbox.catalog_seasons, depix_sandbox.season_equipment from public, anon, authenticated, service_role;

create function depix_sandbox.create_catalog_season(p_title text, p_starts_at timestamptz, p_items jsonb, p_actor uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  season_id uuid;
  item jsonb;
  sku text;
  tier integer := 0;
  power numeric;
  price bigint;
  ending timestamptz := p_starts_at + interval '720 hours';
begin
  if p_starts_at is null or not isfinite(p_starts_at)
      or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Temporada inválida.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) <> 3 then
    raise exception 'Informe exatamente três máquinas.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mining-pix-catalog-season', 0));
  if exists (select 1 from depix_sandbox.catalog_seasons s
    where s.starts_at < ending and greatest(s.starts_at, least(s.ends_at, coalesce(s.closed_at,s.ends_at))) > p_starts_at
      and (s.closed_at is null or s.closed_at > s.starts_at)) then
    raise exception 'Já existe uma temporada neste período.' using errcode = '22023';
  end if;
  insert into depix_sandbox.catalog_seasons (title, starts_at, ends_at, created_by)
  values (btrim(p_title), p_starts_at, ending, p_actor) returning id into season_id;
  for item in select value from jsonb_array_elements(p_items) loop
    tier := tier + 1;
    sku := item->>'sku';
    if sku is null or sku !~ '^[a-z0-9][a-z0-9_-]{2,47}$'
      or coalesce(item->>'hash','') !~ '^[0-9]{1,12}([.][0-9]{1,2})?$' then
      raise exception 'Identificador ou HASH inválido.' using errcode = '22023';
    end if;
    power := (item->>'hash')::numeric;
    price := depix_sandbox.amount_units(item->>'price');
    insert into public.equipment_catalog
      (sku, name, equipment_type, hashrate, price_pc, active, display_order, tier)
    values (sku, btrim(item->>'name'), 'Máquina de temporada', power, 1, false, tier, tier);
    insert into depix_sandbox.prices (product,category,label,amount)
    values (sku,'equipment',btrim(item->>'name'),price);
    insert into depix_sandbox.season_equipment (season_id,sku,tier,image_url)
    values (season_id,sku,tier,nullif(btrim(item->>'image_url'),''));
  end loop;
  return season_id;
end;
$$;
revoke all on function depix_sandbox.create_catalog_season(text,timestamptz,jsonb,uuid) from public, anon, authenticated, service_role;

select depix_sandbox.create_catalog_season('Genesis',now(), '[
  {"sku":"genesis-miner-i","name":"Genesis Miner I","hash":"1","price":"1.99"},
  {"sku":"genesis-miner-ii","name":"Genesis Miner II","hash":"5","price":"4.99"},
  {"sku":"genesis-miner-iii","name":"Genesis Miner III","hash":"10","price":"9.99"}
]'::jsonb,null);

create function public.admin_genesis_catalog(p_action text, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := depix_sandbox.require_admin();
  result jsonb;
begin
  if p_action = 'create' then
    perform depix_sandbox.create_catalog_season(p_payload->>'title',(p_payload->>'starts_at')::timestamptz,p_payload->'items',actor);
  elsif p_action = 'close' then
    perform pg_advisory_xact_lock(hashtextextended('mining-pix-catalog-season', 0));
    update depix_sandbox.catalog_seasons set closed_at = statement_timestamp(), closed_by = actor
    where id = (p_payload->>'id')::uuid and closed_at is null and ends_at > statement_timestamp();
  elsif p_action is distinct from 'list' then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(
    to_jsonb(s) || jsonb_build_object('items', (
      select jsonb_agg(jsonb_build_object('sku',e.sku,'name',e.name,'hash',e.hashrate,
                 'price',depix_sandbox.decimal_amount(p.amount),'image_url',i.image_url) order by i.tier)
      from depix_sandbox.season_equipment i join public.equipment_catalog e using (sku)
      join depix_sandbox.prices p on p.product = i.sku where i.season_id = s.id
    )) order by s.starts_at desc),'[]') into result
  from (select * from depix_sandbox.catalog_seasons order by starts_at desc limit 30) s;
  return result;
end;
$$;
revoke all on function public.admin_genesis_catalog(text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_genesis_catalog(text,jsonb) to authenticated;

create or replace function public.depix_sandbox_shop_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  player uuid := depix_sandbox.require_player();
  result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'product', p.product, 'category', p.category, 'name', p.label,
    'image_url', se.image_url, 'ends_at', season.ends_at,
    'price', depix_sandbox.decimal_amount(p.amount), 'description', e.description,
    'hashrate', e.hashrate, 'tier', e.tier,
    'valid_until', (
      select max(buy.valid_until) from depix_sandbox.purchases buy
      where buy.user_id = player and buy.product = p.product and buy.valid_until > now()
    )
  ) order by p.amount, p.product), '[]'::jsonb)
  into result
  from depix_sandbox.prices p
  left join public.equipment_catalog e on p.category = 'equipment' and e.sku = p.product
  left join depix_sandbox.season_equipment se on se.sku = p.product
  left join depix_sandbox.catalog_seasons season on season.id = se.season_id
  where p.active and (p.category <> 'equipment' or
    (season.closed_at is null and now() >= season.starts_at and now() < season.ends_at));
  return jsonb_build_object('offers', result);
end;
$$;

create or replace function public.depix_sandbox_purchase(p_request_id uuid, p_product text, p_expected_price text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  player uuid := depix_sandbox.require_player();
  expected bigint := depix_sandbox.amount_units(p_expected_price);
  price depix_sandbox.prices%rowtype;
  receipt depix_sandbox.purchases%rowtype;
  item public.equipment_catalog%rowtype;
  item_id uuid;
  room_no integer;
  expires_at timestamptz;
  season depix_sandbox.catalog_seasons%rowtype;
begin
  if p_request_id is null or p_product is null or char_length(p_product) not between 1 and 64 then
    raise exception 'Solicitação de compra inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(player::text || ':depix-sandbox-shop', 0));
  select * into receipt from depix_sandbox.purchases where request_id = p_request_id;
  if found then
    if receipt.user_id <> player or receipt.product <> p_product or receipt.amount <> expected then
      raise exception 'Chave de compra já utilizada.' using errcode = '22023';
    end if;
    return jsonb_build_object('replayed', true, 'room_number', receipt.room_number);
  end if;

  select * into price from depix_sandbox.prices where product = p_product and active for share;
  if not found then raise exception 'Oferta indisponível.' using errcode = 'P0002'; end if;
  if price.amount <> expected then
    raise exception 'O preço mudou. Atualize a oferta antes de comprar.' using errcode = '22023';
  end if;

  if price.category = 'equipment' then
    select cs.* into season
    from depix_sandbox.catalog_seasons cs
    join depix_sandbox.season_equipment se on se.season_id = cs.id
    where se.sku = p_product for share of cs;
    if not found or season.closed_at is not null or statement_timestamp() < season.starts_at
       or statement_timestamp() >= season.ends_at then
      raise exception 'Equipamento fora da temporada.' using errcode = 'P0002';
    end if;
    select * into strict item from public.equipment_catalog where sku = p_product;
  elsif price.category = 'room' then
    perform pg_advisory_xact_lock(hashtextextended(player::text || ':room-unlock', 0));
    select coalesce(max(room_number), 0) + 1 into room_no from public.player_rooms where user_id = player;
    if room_no > 4 then raise exception 'Limite de quatro salas atingido.' using errcode = 'P0001'; end if;
  else
    if exists (select 1 from depix_sandbox.purchases where user_id = player and product = p_product and valid_until > now()) then
      raise exception 'Benefício de demonstração já ativo.' using errcode = 'P0001';
    end if;
    expires_at := now() + interval '30 days';
  end if;

  if not depix_sandbox.post(p_request_id, 'purchase', player, 'player_available', 'platform_sales', price.amount) then
    raise exception 'Chave de compra já utilizada.' using errcode = '22023';
  end if;
  if price.category = 'equipment' then
    insert into public.player_equipment (user_id, catalog_sku, purchase_price_pc, blessing_percent)
    values (player, item.sku, 0, 0) returning id into item_id;
  elsif price.category = 'room' then
    insert into public.player_rooms (user_id, room_number, name, active, unlock_cost_pc, maintenance_rate_percent, grandfathered)
    values (player, room_no, 'Sala ' || room_no, true, 0, 0, false);
  end if;
  insert into depix_sandbox.purchases (request_id, user_id, product, amount, equipment_id, room_number, valid_until)
  values (p_request_id, player, p_product, price.amount, item_id, room_no, expires_at);
  return jsonb_build_object('replayed', false, 'room_number', room_no);
end;
$$;
