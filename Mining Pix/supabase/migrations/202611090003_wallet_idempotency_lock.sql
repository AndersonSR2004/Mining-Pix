-- Serialize same-wallet requests before checking idempotency keys.
-- This makes concurrent retries return the original transaction instead of
-- racing into a unique-constraint error after a second balance mutation.

begin;

create or replace function public.debit_wallet(
  p_amount numeric,
  p_idempotency_key text,
  p_description text default 'Débito'
)
returns table (
  transaction_id uuid,
  new_balance numeric,
  was_duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_balance numeric(20,0);
  v_existing public.wallet_transactions%rowtype;
  v_transaction_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'O valor do débito deve ser um inteiro positivo.' using errcode = '22023';
  end if;
  if p_amount > 99999999999999999999 then
    raise exception 'Valor do débito fora do limite permitido.' using errcode = '22003';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128 then
    raise exception 'Chave de idempotência inválida.' using errcode = '22023';
  end if;
  if p_description is null or char_length(p_description) > 160 then
    raise exception 'Descrição inválida.' using errcode = '22023';
  end if;

  -- Lock the account row first. Concurrent requests for this wallet serialize here.
  select w.balance into v_balance
    from public.wallets as w
   where w.user_id = v_user_id
   for update;
  if not found then
    raise exception 'Carteira não encontrada.' using errcode = 'P0002';
  end if;

  select wt.* into v_existing
    from public.wallet_transactions as wt
   where wt.user_id = v_user_id
     and wt.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.amount <> -p_amount or v_existing.transaction_type <> 'debit' then
      raise exception 'A chave de idempotência já foi usada em outra operação.' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.balance_after, true;
    return;
  end if;

  if v_balance < p_amount then
    raise exception 'Saldo insuficiente.' using errcode = 'P0001';
  end if;

  v_balance := v_balance - p_amount;
  update public.wallets as w
     set balance = v_balance,
         version = w.version + 1,
         updated_at = now()
   where w.user_id = v_user_id;

  insert into public.wallet_transactions (
    user_id, amount, balance_after, transaction_type, idempotency_key, description
  )
  values (
    v_user_id, -p_amount, v_balance, 'debit', p_idempotency_key, p_description
  )
  returning id into v_transaction_id;

  return query select v_transaction_id, v_balance, false;
end;
$$;

commit;
