create table depix_sandbox.prices (
  product text primary key,
  category text not null check (category in ('equipment', 'room', 'vip', 'pass')),
  label text not null,
  amount bigint not null check (amount > 0),
  active boolean not null default true
);

create table depix_sandbox.purchases (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id),
  product text not null references depix_sandbox.prices(product),
  amount bigint not null check (amount > 0),
  equipment_id uuid references public.player_equipment(id),
  room_number integer,
  valid_until timestamptz,
  created_at timestamptz not null default now()
);
create index depix_sandbox_purchases_user_product_idx
  on depix_sandbox.purchases (user_id, product, valid_until desc);

alter table depix_sandbox.prices enable row level security;
alter table depix_sandbox.purchases enable row level security;
revoke all on depix_sandbox.prices, depix_sandbox.purchases from public, anon, authenticated;

-- Pilot prices in DePix atomic units, based on hash bands rather than legacy prices.
insert into depix_sandbox.prices (product, category, label, amount)
select sku, 'equipment', name,
  case when hashrate <= 25 then 100000000
       when hashrate <= 55 then 200000000
       when hashrate <= 250 then 500000000
       else 1000000000 end
from public.equipment_catalog where active;

insert into depix_sandbox.prices (product, category, label, amount) values
  ('room', 'room', 'Sala permanente', 500000000),
  ('vip', 'vip', 'VIP de demonstração · 30 dias', 1000000000),
  ('pass', 'pass', 'Passe de demonstração · 30 dias', 500000000);

create function public.depix_sandbox_shop_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  player uuid := depix_sandbox.require_player();
  result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'product', p.product, 'category', p.category, 'name', p.label,
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
  where p.active and (p.category <> 'equipment' or e.active);
  return jsonb_build_object('offers', result);
end;
$$;

create function public.depix_sandbox_purchase(p_request_id uuid, p_product text, p_expected_price text)
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
  blessing numeric(5,2) := 0;
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
    select * into item from public.equipment_catalog where sku = p_product and active for share;
    if not found then raise exception 'Equipamento indisponível.' using errcode = 'P0002'; end if;
    if item.blessing_min_percent is not null and item.blessing_max_percent is not null then
      blessing := round((item.blessing_min_percent + random() * (item.blessing_max_percent - item.blessing_min_percent))::numeric, 2);
    end if;
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
    values (player, item.sku, 0, blessing) returning id into item_id;
  elsif price.category = 'room' then
    insert into public.player_rooms (user_id, room_number, name, active, unlock_cost_pc, maintenance_rate_percent, grandfathered)
    values (player, room_no, 'Sala ' || room_no, true, 0, 0, false);
  end if;
  insert into depix_sandbox.purchases (request_id, user_id, product, amount, equipment_id, room_number, valid_until)
  values (p_request_id, player, p_product, price.amount, item_id, room_no, expires_at);
  return jsonb_build_object('replayed', false, 'room_number', room_no);
end;
$$;

revoke all on function public.depix_sandbox_shop_snapshot(), public.depix_sandbox_purchase(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.depix_sandbox_shop_snapshot(), public.depix_sandbox_purchase(uuid, text, text)
  to authenticated;
