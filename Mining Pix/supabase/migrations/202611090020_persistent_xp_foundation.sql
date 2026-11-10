-- Mining Pix Phase 8A: server-authoritative account XP foundation.
begin;

create table if not exists public.player_xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount bigint not null check (amount > 0),
  source text not null check (source in ('daily_login', 'mission', 'battle_pass_admin_adjustment')),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  description text not null default '' check (char_length(description) <= 160),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

comment on table public.player_xp_transactions is
  'Append-only ledger for authoritative player XP. Client roles may read their own entries but cannot write or mutate XP.';

alter table public.player_xp_transactions enable row level security;
revoke all on table public.player_xp_transactions from public, anon, authenticated;
grant select on table public.player_xp_transactions to authenticated;

drop policy if exists player_xp_transactions_select_own on public.player_xp_transactions;
create policy player_xp_transactions_select_own
  on public.player_xp_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists player_xp_transactions_user_created_idx
  on public.player_xp_transactions (user_id, created_at desc);

create or replace function public.claim_daily_login_xp()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_transaction_id uuid;
  v_xp bigint;
  v_level integer;
  v_awarded boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- UTC day boundary is authoritative and cannot be supplied by the browser.
  v_key := 'daily-login:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.player_xp_transactions (
    user_id, amount, source, idempotency_key, description
  )
  values (
    v_user_id, 100, 'daily_login', v_key, 'Recompensa diária de acesso'
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_transaction_id;

  if v_transaction_id is not null then
    update public.player_progress
    set xp = xp + 100,
        level = ((xp + 100) / 1000)::integer + 1,
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
    'amount', case when v_awarded then 100 else 0 end,
    'xp', v_xp,
    'level', v_level,
    'period', v_key
  );
end;
$$;

revoke all on function public.claim_daily_login_xp() from public, anon;
grant execute on function public.claim_daily_login_xp() to authenticated;

comment on function public.claim_daily_login_xp() is
  'Awards at most 100 XP per authenticated user per UTC day. User identity and period are derived server-side; the unique ledger key prevents retries and concurrent double claims.';

commit;
