begin;
do $$
declare
  viewer constant uuid := 'bc60c0dd-bace-4e7f-9362-7e81a7fced11';
  test_day constant date := date '2040-01-01';
  test_start timestamptz := test_day::timestamp at time zone 'UTC';
  i integer;
begin
  insert into auth.users(id,email) values(viewer,'block-cadence-fixture@example.invalid');
  insert into mining_competition.starter_miners(user_id,claimed_at) values(viewer,now());
  -- Simulate an approval and fund only 145 smallest wallet units.
  insert into depix_sandbox.pool_day_approvals(day,budget_units,approved_by) values(test_day,145,viewer);
  perform depix_sandbox.post(gen_random_uuid(),'pool_funding',null,'platform_pool_source','platform_pool',145);
  for i in 0..143 loop
    if not depix_sandbox.settle_pool_block(test_start + i*interval '10 minutes') then raise exception 'Block missing'; end if;
    if depix_sandbox.settle_pool_block(test_start + i*interval '10 minutes 1 second') then raise exception 'Duplicate block'; end if;
  end loop;
  if (select count(*) from depix_sandbox.pool_blocks where block_at>=test_start and block_at<test_start+interval '24 hours')<>144
   or (select sum(distributed_units) from depix_sandbox.pool_blocks where block_at>=test_start and block_at<test_start+interval '24 hours')<>145
   or (select sum(reward_units) from depix_sandbox.pool_block_rewards where block_at>=test_start and block_at<test_start+interval '24 hours')<>145 then
    raise exception 'Block schedule or ledger not reconciled';
  end if;
  if has_function_privilege('authenticated','depix_sandbox.settle_pool_block(timestamptz)','execute') then raise exception 'Client settlement allowed'; end if;
end;
$$;
rollback;
