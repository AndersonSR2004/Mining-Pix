-- Run as the migration operator. All fixtures are rolled back.
begin;

insert into auth.users (id, email)
values ('205769b0-80a8-46d9-bd0e-9510c6c321a1', 'depix-wallet-qa-a@example.invalid'),
       ('205769b0-80a8-46d9-bd0e-9510c6c321a2', 'depix-wallet-qa-b@example.invalid');

insert into public.depix_accounts (user_id, balance, reserved)
values ('205769b0-80a8-46d9-bd0e-9510c6c321a1', 90071992547.40993001, 0.00000001);

insert into public.depix_ledger (user_id, amount, entry_type, reference_id, idempotency_key)
values ('205769b0-80a8-46d9-bd0e-9510c6c321a1', -0.00000001, 'purchase', 'wallet-snapshot-qa', 'wallet-snapshot-qa');

set local role authenticated;
select set_config('request.jwt.claim.sub', '205769b0-80a8-46d9-bd0e-9510c6c321a1', true);
do $$
declare
  snapshot jsonb := public.depix_wallet_snapshot();
begin
  if snapshot->'total' is distinct from '"90071992547.40993001"'::jsonb
    or snapshot->'available' is distinct from '"90071992547.40993000"'::jsonb
    or snapshot->'reserved' is distinct from '"0.00000001"'::jsonb
    or snapshot#>'{entries,0,amount}' is distinct from '"-0.00000001"'::jsonb then
    raise exception 'Incorrect decimal serialization or available balance';
  end if;
  if has_table_privilege(current_user, 'public.depix_accounts', 'UPDATE')
    or has_table_privilege(current_user, 'public.depix_ledger', 'INSERT')
    or has_table_privilege(current_user, 'public.depix_deposits', 'INSERT')
    or has_table_privilege(current_user, 'public.depix_withdrawals', 'UPDATE') then
    raise exception 'Unexpected client write privilege';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '205769b0-80a8-46d9-bd0e-9510c6c321a2', true);
do $$
declare
  snapshot jsonb := public.depix_wallet_snapshot();
begin
  if snapshot->>'total' is distinct from '0' or snapshot->'entries' is distinct from '[]'::jsonb
    or exists (select 1 from public.depix_accounts)
    or exists (select 1 from public.depix_ledger) then
    raise exception 'Cross-account data visible or empty wallet incorrect';
  end if;
end
$$;

reset role;
do $$
begin
  if has_function_privilege('anon', 'public.depix_wallet_snapshot()', 'EXECUTE') then
    raise exception 'Anonymous snapshot access';
  end if;
end
$$;

rollback;
