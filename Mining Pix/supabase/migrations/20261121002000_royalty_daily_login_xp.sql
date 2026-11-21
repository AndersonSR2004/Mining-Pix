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
  select 100 + coalesce(max(bonus), 0) into v_amount
  from depix_sandbox.royalty_receipts
  where user_id = v_user_id and family = 'vip'
    and started_at <= statement_timestamp() and valid_until > statement_timestamp()
    and (replaced_at is null or replaced_at > statement_timestamp());

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
