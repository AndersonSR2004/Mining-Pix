-- Mining Pix — Fase 2 / migration 0002
-- Persistent wallet ledger and safe player-initiated debits.
-- Apply only to the isolated Supabase DEV project.

begin;

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(20,0) not null check (amount <> 0),
  balance_after numeric(20,0) not null check (balance_after >= 0),
  transaction_type text not null
    check (transaction_type in ('debit', 'purchase', 'refund', 'reward', 'pool_reward', 'game_reward', 'admin_adjustment')),
  reference_type text,
  reference_id text,
  idempotency_key text not null
    check (char_length(idempotency_key) between 1 and 128),
  description text not null default ''
    check (char_length(description) <= 160),
  created_at timestamptz not null default now(),
  constraint wallet_transactions_user_idempotency_key_key
    unique (user_id, idempotency_key)
);

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

alter table public.wallet_transactions enable row level security;

drop policy if exists wallet_transactions_select_own on public.wallet_transactions;
create policy wallet_transactions_select_own
  on public.wallet_transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.wallet_transactions from anon, authenticated;
grant select on public.wallet_transactions to authenticated;

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

  select wt.*
    into v_existing
    from public.wallet_transactions as wt
   where wt.user_id = v_user_id
     and wt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.amount <> -p_amount or v_existing.transaction_type <> 'debit' then
      raise exception 'A chave de idempotência já foi usada em outra operação.' using errcode = '22023';
    end if;

    return query
      select v_existing.id, v_existing.balance_after, true;
    return;
  end if;

  select w.balance
    into v_balance
    from public.wallets as w
   where w.user_id = v_user_id
   for update;

  if not found then
    raise exception 'Carteira não encontrada.' using errcode = 'P0002';
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
    user_id, amount, balance_after, transaction_type,
    idempotency_key, description
  )
  values (
    v_user_id, -p_amount, v_balance, 'debit',
    p_idempotency_key, p_description
  )
  returning id into v_transaction_id;

  return query
    select v_transaction_id, v_balance, false;
end;
$$;

revoke all on function public.debit_wallet(numeric, text, text) from public, anon;
grant execute on function public.debit_wallet(numeric, text, text) to authenticated;

commit;
