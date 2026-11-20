-- Run as migration operator. All assertions and fixtures use one rolled-back transaction.
begin;

insert into auth.users (id, email, raw_app_meta_data) values
  ('205769b0-80a8-46d9-bd0e-9510c6c322a1', 'sandbox-finance-player@example.invalid', '{}'),
  ('205769b0-80a8-46d9-bd0e-9510c6c322a2', 'sandbox-finance-admin@example.invalid', '{"admin":true}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"205769b0-80a8-46d9-bd0e-9510c6c322a1","aal":"aal1"}';
do $$
begin
  if public.depix_sandbox_request_deposit('205769b0-80a8-46d9-bd0e-9510c6c323a1', '10.00000001') is distinct from 'pending' then
    raise exception 'Deposit did not start pending';
  end if;
  if public.depix_sandbox_wallet_snapshot()->>'available' is distinct from '0.00000000' then
    raise exception 'Unconfirmed deposit funded the wallet';
  end if;
  begin
    perform public.depix_sandbox_admin_deposit('205769b0-80a8-46d9-bd0e-9510c6c323a1');
    raise exception 'Ordinary player credited deposit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.depix_sandbox_request_deposit('205769b0-80a8-46d9-bd0e-9510c6c323a1', '11');
    raise exception 'Changed payload accepted for existing reference';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.depix_sandbox_request_deposit('205769b0-80a8-46d9-bd0e-9510c6c323aa', '1.000000001');
    raise exception 'Excess precision accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

set local request.jwt.claims = '{"sub":"205769b0-80a8-46d9-bd0e-9510c6c322a2","aal":"aal1","app_metadata":{"admin":true}}';
do $$
begin
  begin
    perform public.depix_sandbox_admin_snapshot();
    raise exception 'Admin snapshot bypassed MFA';
  exception when insufficient_privilege then null;
  end;
  if public.depix_sandbox_wallet_snapshot()->'deposits' is distinct from '[]'::jsonb then
    raise exception 'Player wallet exposed another account';
  end if;
end;
$$;

set local request.jwt.claims = '{"sub":"205769b0-80a8-46d9-bd0e-9510c6c322a2","aal":"aal2","app_metadata":{"admin":true}}';
select public.depix_sandbox_admin_deposit('205769b0-80a8-46d9-bd0e-9510c6c323a1');
select public.depix_sandbox_admin_deposit('205769b0-80a8-46d9-bd0e-9510c6c323a1');
select public.depix_sandbox_admin_snapshot();

set local request.jwt.claims = '{"sub":"205769b0-80a8-46d9-bd0e-9510c6c322a1","aal":"aal1"}';
do $$
begin
  if public.depix_sandbox_wallet_snapshot()->>'available' is distinct from '10.00000001' then
    raise exception 'Deposit credit was omitted or duplicated';
  end if;
  begin
    perform public.depix_sandbox_request_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a4', '1', 'not-a-sandbox-destination');
    raise exception 'Non-sandbox destination accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.depix_sandbox_request_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a2', '3', 'sandbox:player');
  perform public.depix_sandbox_request_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a2', '3', 'sandbox:player');
  perform public.depix_sandbox_request_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a3', '4', 'sandbox:player');
  begin
    perform public.depix_sandbox_request_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a4', '4', 'sandbox:player');
    raise exception 'Overdraw accepted';
  exception when invalid_parameter_value then null;
  end;
  if public.depix_sandbox_wallet_snapshot()->>'reserved' is distinct from '7.00000000' then
    raise exception 'Withdrawal reserve was omitted or duplicated';
  end if;
end;
$$;

set local request.jwt.claims = '{"sub":"205769b0-80a8-46d9-bd0e-9510c6c322a2","aal":"aal2","app_metadata":{"admin":true}}';
do $$
begin
  begin
    perform public.depix_sandbox_admin_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a2', 'settle');
    raise exception 'Unapproved withdrawal settled';
  exception when invalid_parameter_value then null;
  end;
  perform public.depix_sandbox_admin_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a2', 'approve');
  perform public.depix_sandbox_admin_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a2', 'settle');
  perform public.depix_sandbox_admin_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a2', 'settle');
  perform public.depix_sandbox_admin_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a3', 'reject');
  perform public.depix_sandbox_admin_withdrawal('205769b0-80a8-46d9-bd0e-9510c6c323a3', 'reject');
end;
$$;

set local request.jwt.claims = '{"sub":"205769b0-80a8-46d9-bd0e-9510c6c322a1","aal":"aal1"}';
do $$
declare snapshot jsonb := public.depix_sandbox_wallet_snapshot();
begin
  if snapshot->>'reserved' is distinct from '0.00000000'
    or snapshot->>'available' is distinct from '7.00000001'
    or snapshot->>'total' is distinct from '7.00000001' then
    raise exception 'Settlement or failed-withdrawal release left bad balances';
  end if;
end;
$$;

reset role;
do $$
begin
  if exists (
    select 1 from depix_sandbox.positions as positions
    left join (
      select account_key, sum(delta) as net from (
        select debit_key as account_key, -amount as delta from depix_sandbox.journal
        union all
        select credit_key, amount from depix_sandbox.journal
      ) legs group by account_key
    ) posted using (account_key)
    where positions.amount is distinct from coalesce(posted.net, 0)
  ) or (select sum(amount) from depix_sandbox.positions) is distinct from 0::numeric then
    raise exception 'Sandbox positions do not reconcile to the journal';
  end if;
  if exists (select 1 from depix_sandbox.requests where id = '205769b0-80a8-46d9-bd0e-9510c6c323a4')
    or (select count(*) from depix_sandbox.admin_events where request_id in (
      '205769b0-80a8-46d9-bd0e-9510c6c323a1','205769b0-80a8-46d9-bd0e-9510c6c323a2','205769b0-80a8-46d9-bd0e-9510c6c323a3'
    )) <> 4 then
    raise exception 'Failed request or duplicate audit event persisted';
  end if;
  if has_schema_privilege('authenticated', 'depix_sandbox', 'USAGE')
    or has_function_privilege('anon', 'public.depix_sandbox_wallet_snapshot()', 'EXECUTE')
    or has_table_privilege('authenticated', 'depix_sandbox.journal', 'INSERT') then
    raise exception 'Sandbox privileges are too broad';
  end if;
end;
$$;
rollback;
