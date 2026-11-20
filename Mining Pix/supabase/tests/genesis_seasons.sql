begin;
insert into auth.users (id, email)
values ('ed58e86a-dffc-4ca7-b89a-3ebd43dab010', 'genesis-release-test@example.invalid');
select depix_sandbox.post('ed58e86a-dffc-4ca7-b89a-3ebd43dab011', 'deposit',
  'ed58e86a-dffc-4ca7-b89a-3ebd43dab010', 'platform_deposit_source', 'player_available', 2000000000);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ed58e86a-dffc-4ca7-b89a-3ebd43dab010', true);
do $$
declare offers jsonb := public.depix_sandbox_shop_snapshot()->'offers';
begin
  if (select count(*) from jsonb_array_elements(offers) o where o->>'category' = 'equipment') <> 3
    or not offers @> '[{"product":"genesis-miner-i","price":"1.99000000","hashrate":1},{"product":"genesis-miner-ii","price":"4.99000000","hashrate":5},{"product":"genesis-miner-iii","price":"9.99000000","hashrate":10}]' then
    raise exception 'Unexpected catalog';
  end if;
  perform public.depix_sandbox_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab012','genesis-miner-i','1.99');
  perform public.depix_sandbox_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab013','genesis-miner-ii','4.99');
  perform public.depix_sandbox_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab014','genesis-miner-iii','9.99');
  if (public.depix_sandbox_wallet_snapshot()->>'available')::numeric <> 3.03 then raise exception 'Wrong debit'; end if;
  begin
    perform public.admin_genesis_catalog('list');
    raise exception 'Admin scope leaked';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
update depix_sandbox.catalog_seasons set closed_at = now() where title = 'Genesis';
set local role authenticated;
do $$
begin
  begin
    perform public.depix_sandbox_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab015','genesis-miner-i','1.99');
    raise exception 'Closed season was purchasable';
  exception when no_data_found then null;
  end;
  if (public.depix_sandbox_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab012','genesis-miner-i','1.99')->>'replayed') is distinct from 'true'
     or (select count(*) from public.player_equipment pe join public.equipment_catalog e on e.sku = pe.catalog_sku
         where pe.user_id = auth.uid() and e.sku like 'genesis-miner-%') <> 3 then
    raise exception 'Historical inventory or idempotency lost';
  end if;
end
$$;
rollback;
