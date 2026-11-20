begin;

insert into auth.users (id, email)
values ('ad00931f-3ecd-4fc5-b2f3-d964bfb1fac1', 'depix-sandbox-shop@example.invalid');

select depix_sandbox.post('ad00931f-3ecd-4fc5-b2f3-d964bfb1fac2', 'deposit',
  'ad00931f-3ecd-4fc5-b2f3-d964bfb1fac1', 'platform_deposit_source', 'player_available', 700000000);
select depix_sandbox.post('ad00931f-3ecd-4fc5-b2f3-d964bfb1fac3', 'reserve',
  'ad00931f-3ecd-4fc5-b2f3-d964bfb1fac1', 'player_available', 'player_reserved', 300000000);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad00931f-3ecd-4fc5-b2f3-d964bfb1fac1', true);
do $$
begin
  begin
    perform public.depix_sandbox_purchase('ad00931f-3ecd-4fc5-b2f3-d964bfb1fac4', 'room', '5.00');
    raise exception 'Reserved DePix paid for a purchase';
  exception when invalid_parameter_value then
    if sqlerrm not ilike '%insufficient%' and sqlerrm not ilike '%saldo insuficiente%' then raise; end if;
  end;
end;
$$;

reset role;
select depix_sandbox.post('ad00931f-3ecd-4fc5-b2f3-d964bfb1fac5', 'release',
  'ad00931f-3ecd-4fc5-b2f3-d964bfb1fac1', 'player_reserved', 'player_available', 300000000);

set local role authenticated;
do $$
declare
  request_id constant uuid := 'ad00931f-3ecd-4fc5-b2f3-d964bfb1fac4';
  first_purchase jsonb := public.depix_sandbox_purchase(request_id, 'room', '5.00');
  retry jsonb := public.depix_sandbox_purchase(request_id, 'room', '5.00');
begin
  if (first_purchase->>'replayed')::boolean or not (retry->>'replayed')::boolean then
    raise exception 'Incorrect purchase replay';
  end if;
  begin
    perform public.depix_sandbox_purchase(request_id, 'room', '6.00');
    raise exception 'Idempotency accepted a changed price';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

reset role;
do $$
begin
  if (select amount from depix_sandbox.positions where account_key = 'player_available:ad00931f-3ecd-4fc5-b2f3-d964bfb1fac1') is distinct from 200000000
    or (select count(*) from depix_sandbox.journal where id = 'ad00931f-3ecd-4fc5-b2f3-d964bfb1fac4') <> 1
    or (select count(*) from depix_sandbox.purchases where user_id = 'ad00931f-3ecd-4fc5-b2f3-d964bfb1fac1') <> 1
    or (select count(*) from public.player_rooms where user_id = 'ad00931f-3ecd-4fc5-b2f3-d964bfb1fac1' and not grandfathered) <> 1 then
    raise exception 'Purchase and delivery did not reconcile';
  end if;
end;
$$;
rollback;
