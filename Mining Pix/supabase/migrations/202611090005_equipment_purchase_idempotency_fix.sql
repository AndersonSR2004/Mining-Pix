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
       or v_existing.reference_id <> p_sku then
      raise exception 'Chave de idempotência já utilizada em outra operação.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'success', true,
      'replayed', true,
      'sku', p_sku,
      'price_pc', abs(v_existing.amount),
      'balance_after', v_existing.balance_after
    );
  end if;

  if v_wallet.balance < v_item.price_pc then
    raise exception 'Saldo insuficiente.' using errcode = 'P0001';
  end if;

  v_balance_after := v_wallet.balance - v_item.price_pc;
  update public.wallets
  set balance = v_balance_after,
      version = version + 1,
      updated_at = now()
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
    'equipment', p_sku, p_idempotency_key,
    'Compra de ' || v_item.name
  );

  return jsonb_build_object(
    'success', true,
    'replayed', false,
    'equipment_id', v_equipment_id,
    'sku', p_sku,
    'price_pc', v_item.price_pc,
    'balance_after', v_balance_after
  );
end;
$$;

revoke all on function public.purchase_equipment(text, text) from public, anon;
grant execute on function public.purchase_equipment(text, text) to authenticated;
