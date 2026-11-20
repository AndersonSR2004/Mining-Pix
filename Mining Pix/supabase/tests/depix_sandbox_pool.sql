-- Run as migration owner in DEV after the finance, competition and pool migrations.
-- All fixtures and the eligible HASH stub are rolled back.
begin;

insert into auth.users (id, email, raw_app_meta_data)
values ('9aafaf02-57e3-4504-af74-63d299633801', 'depix-pool-first@example.invalid', '{"admin":true}'),
       ('9aafaf02-57e3-4504-af74-63d299633802', 'depix-pool-second@example.invalid', '{}');

create or replace function public.competition_hashrates(p_at timestamptz)
returns table(user_id uuid, hashrate numeric)
language sql stable set search_path = ''
as $$
  select v.user_id, v.hashrate
  from (values
    ('9aafaf02-57e3-4504-af74-63d299633801'::uuid, 5.0::numeric),
    ('9aafaf02-57e3-4504-af74-63d299633802'::uuid, 3.0::numeric)
  ) v(user_id, hashrate)
  where p_at < '2100-01-03 00:00:00+00'
$$;

-- Lock scheduler workers out while the budget fixtures replace the current values.
update depix_sandbox.pool_settings set daily_budget_units = 100;
insert into depix_sandbox.positions(account_key, amount) values ('platform_pool', 0)
on conflict(account_key) do update set amount = excluded.amount;

do $$
declare
  first_user constant uuid := '9aafaf02-57e3-4504-af74-63d299633801';
  second_user constant uuid := '9aafaf02-57e3-4504-af74-63d299633802';
  first_key text := 'player_available:' || first_user;
  second_key text := 'player_available:' || second_user;
  funding_id constant uuid := '9aafaf02-57e3-4504-af74-63d299633803';
  network_state jsonb;
  postings numeric;
begin
  if has_function_privilege('authenticated', 'depix_sandbox.settle_pool(timestamptz)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_my_depix_pool()', 'EXECUTE')
    or has_table_privilege('authenticated', 'depix_sandbox.pool_settings', 'UPDATE') then
    raise exception 'Unexpected sandbox pool privileges';
  end if;

  if depix_sandbox.settle_pool('2100-01-01T00:05:00Z') then
    raise exception 'Pool must wait for authorized funds';
  end if;
  perform set_config('request.jwt.claim.sub', first_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', first_user, 'aal', 'aal1', 'app_metadata', '{"admin":true}'::jsonb
  )::text, true);
  begin
    perform public.admin_configure_depix_pool_budget('99');
    raise exception 'AAL1 admin unexpectedly allowed to configure the budget';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', first_user, 'aal', 'aal2', 'app_metadata', '{"admin":true}'::jsonb
  )::text, true);
  perform public.admin_configure_depix_pool_budget('99');
  perform public.admin_fund_depix_pool(funding_id, '7');
  perform public.admin_fund_depix_pool(funding_id, '7');
  if (select amount from depix_sandbox.positions where account_key = 'platform_pool') is distinct from 7
    or (select count(*) from depix_sandbox.pool_admin_events where id = funding_id) <> 1 then
    raise exception 'Sandbox funding retry changed the budget or audit history';
  end if;

  -- The second posting fails after the first has already been written.
  insert into depix_sandbox.positions(account_key, amount) values (second_key, 9223372036854775807);
  begin
    perform depix_sandbox.settle_pool('2100-01-01T00:05:00Z');
    raise exception 'Expected forced sandbox posting failure';
  exception when numeric_value_out_of_range then
    null;
  end;
  if exists (select 1 from depix_sandbox.pool_cycles where cycle_date = '2100-01-01')
    or exists (select 1 from depix_sandbox.positions where account_key = first_key)
    or exists (select 1 from depix_sandbox.journal where user_id in (first_user, second_user))
    or (select amount from depix_sandbox.positions where account_key = 'platform_pool') is distinct from 7 then
    raise exception 'Partial failed settlement persisted';
  end if;
  update depix_sandbox.positions set amount = 0 where account_key = second_key;

  if not depix_sandbox.settle_pool('2100-01-01T00:05:00Z') then
    raise exception 'Pool did not recover on repeat';
  end if;
  if depix_sandbox.settle_pool('2100-01-01T23:05:00Z') then
    raise exception 'Same UTC day settled twice';
  end if;
  if not exists (
    select 1 from depix_sandbox.pool_cycles
    where cycle_date = '2100-01-01' and budget_units = 7 and total_hashrate = 8
      and participants = 2 and distributed_units = 7
  ) then raise exception 'Cycle totals incorrect'; end if;

  select sum(amount) into postings from depix_sandbox.journal where kind = 'pool_reward' and user_id in (first_user, second_user);
  if postings is distinct from 7::numeric
    or (select amount from depix_sandbox.positions where account_key = first_key) is distinct from 4
    or (select amount from depix_sandbox.positions where account_key = second_key) is distinct from 3
    or (select amount from depix_sandbox.positions where account_key = 'platform_pool') is distinct from 0 then
    raise exception 'Largest remainder or ledger reconciliation incorrect';
  end if;

  perform depix_sandbox.post(gen_random_uuid(), 'pool_funding', null, 'platform_pool_source', 'platform_pool', 5);
  if not depix_sandbox.settle_pool('2100-01-03T00:05:00Z') then
    raise exception 'Empty cycle was not recorded';
  end if;
  if not exists (
      select 1 from depix_sandbox.pool_cycles
      where cycle_date = '2100-01-03' and budget_units = 5 and total_hashrate = 0
        and participants = 0 and distributed_units = 0
    )
    or (select amount from depix_sandbox.positions where account_key = 'platform_pool') is distinct from 5 then
    raise exception 'Empty cycle consumed a budget';
  end if;

  perform set_config('request.jwt.claim.sub', first_user::text, true);
  network_state := public.get_my_depix_pool();
  if network_state#>>'{history,0,reward_units}' is distinct from '4'
    or jsonb_array_length(network_state->'history') is distinct from 1 then
    raise exception 'Personal reward data incorrect or exposed';
  end if;
end
$$;

rollback;
