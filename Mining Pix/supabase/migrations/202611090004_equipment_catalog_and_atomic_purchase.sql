create table public.equipment_catalog (
  sku text primary key,
  name text not null check (char_length(name) between 1 and 64),
  description text not null default '' check (char_length(description) <= 240),
  equipment_type text not null check (char_length(equipment_type) between 1 and 64),
  hashrate numeric(20,2) not null check (hashrate > 0),
  price_pc numeric(20,0) not null check (price_pc > 0),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.equipment_catalog enable row level security;
revoke all on public.equipment_catalog from public, anon, authenticated;
grant select on public.equipment_catalog to authenticated;
create policy "Authenticated users can view active equipment"
  on public.equipment_catalog for select to authenticated
  using (active = true);

insert into public.equipment_catalog
  (sku, name, description, equipment_type, hashrate, price_pc, active, display_order)
values
  ('pix_miner_ii', 'PIX Miner II', 'Equipamento intermediário para ampliar sua capacidade de mineração.', 'Equipamento intermediário', 250, 2500, true, 20),
  ('pix_miner_iii', 'PIX Miner III', 'Equipamento avançado de alto desempenho.', 'Equipamento avançado', 600, 5000, true, 30)
on conflict (sku) do update set
  name = excluded.name,
  description = excluded.description,
  equipment_type = excluded.equipment_type,
  hashrate = excluded.hashrate,
  price_pc = excluded.price_pc,
  active = excluded.active,
  display_order = excluded.display_order,
  updated_at = now();

create table public.player_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_sku text not null references public.equipment_catalog(sku) on update restrict on delete restrict,
  purchase_price_pc numeric(20,0) not null check (purchase_price_pc > 0),
  status text not null default 'inventory' check (status in ('inventory', 'installed', 'retired')),
  acquired_at timestamptz not null default now()
);

create index player_equipment_user_acquired_idx
  on public.player_equipment(user_id, acquired_at desc);

alter table public.player_equipment enable row level security;
revoke all on public.player_equipment from public, anon, authenticated;
grant select on public.player_equipment to authenticated;
create policy "Players can view their own equipment"
  on public.player_equipment for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.purchase_equipment(
  p_sku text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.equipment_catalog%rowtype;
  v_wallet public.wallets%rowtype;
  v_existing public.wallet_transactions%rowtype;
  v_equipment_id uuid;
  v_balance_after numeric(20,0);
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '28000';
  end if;
  if p_sku is null or char_length(p_sku) not between 1 and 64 then
    raise exception 'Equipamento inválido.' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then
    raise exception 'Chave de compra inválida.' using errcode = '22023';
  end if;

  select * into v_item
  from public.equipment_catalog
  where sku = p_sku and active = true
  for share;
  if not found then
    raise exception 'Equipamento indisponível.' using errcode = 'P0002';
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = v_user_id
  for update;
  if not found then
    raise exception 'Carteira não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.wallet_transactions
  where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.transaction_type <> 'purchase'
       or v_existing.reference_type <> 'equipment'
       or v_existing.reference_id <> p_sku
       or v_existing.amount <> -v_item.price_pc then
      raise exception 'Chave de idempotência já utilizada em outra operação.' using errcode = '22023';
    end if;
    select id into v_equipment_id
    from public.player_equipment
    where user_id = v_user_id and catalog_sku = p_sku
      and acquired_at = v_existing.created_at
    order by acquired_at desc limit 1;
    return jsonb_build_object(
      'success', true, 'replayed', true, 'equipment_id', v_equipment_id,
      'sku', p_sku, 'price_pc', v_item.price_pc, 'balance_after', v_existing.balance_after
    );
  end if;

  if v_wallet.balance < v_item.price_pc then
    raise exception 'Saldo insuficiente.' using errcode = 'P0001';
  end if;

  v_balance_after := v_wallet.balance - v_item.price_pc;
  update public.wallets
  set balance = v_balance_after, version = version + 1, updated_at = now()
  where user_id = v_user_id;

  insert into public.player_equipment(user_id, catalog_sku, purchase_price_pc)
  values (v_user_id, p_sku, v_item.price_pc)
  returning id into v_equipment_id;

  insert into public.wallet_transactions(
    user_id, amount, balance_after, transaction_type,
    reference_type, reference_id, idempotency_key, description
  )
  values (
    v_user_id, -v_item.price_pc, v_balance_after, 'purchase',
    'equipment', p_sku, p_idempotency_key, 'Compra de ' || v_item.name
  );

  return jsonb_build_object(
    'success', true, 'replayed', false, 'equipment_id', v_equipment_id,
    'sku', p_sku, 'price_pc', v_item.price_pc, 'balance_after', v_balance_after
  );
end;
$$;

revoke all on function public.purchase_equipment(text, text) from public, anon;
grant execute on function public.purchase_equipment(text, text) to authenticated;
