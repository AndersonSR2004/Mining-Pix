begin;
set local lock_timeout='1s';
insert into auth.users(id,email,raw_app_meta_data) values
('9daa2336-cce3-434c-9410-42b07da9cdba','genesis-shop-admin@example.invalid','{"admin":true}'),
('9daa2336-cce3-434c-9410-42b07da9cdbb','genesis-shop-a@example.invalid','{}'),
('9daa2336-cce3-434c-9410-42b07da9cdbc','genesis-shop-b@example.invalid','{}');
update depix_sandbox.catalog_seasons set closed_at=starts_at where closed_at is null and exists (select 1 from depix_sandbox.season_equipment e where e.season_id=catalog_seasons.id and e.sku='genesis-miner-i');
select depix_sandbox.post(gen_random_uuid(),'deposit',id,'platform_deposit_source','player_available',1000000000)
from auth.users where id in ('9daa2336-cce3-434c-9410-42b07da9cdbb','9daa2336-cce3-434c-9410-42b07da9cdbc');
set local role authenticated;
set local request.jwt.claims='{"sub":"9daa2336-cce3-434c-9410-42b07da9cdbb","aal":"aal1"}';
do $$ begin begin perform public.admin_schedule_genesis_season(now()); raise exception 'Unauthorized schedule'; exception when insufficient_privilege then null; end; end $$;
set local request.jwt.claims='{"sub":"9daa2336-cce3-434c-9410-42b07da9cdba","aal":"aal2","app_metadata":{"admin":true}}';
select public.admin_schedule_genesis_season(now()-interval '1 hour');
select public.admin_schedule_genesis_season(now()-interval '1 hour');
reset role;
do $$ begin
if (select count(*) from depix_sandbox.season_equipment e join depix_sandbox.catalog_seasons s on s.id=e.season_id join depix_sandbox.prices p on p.product=e.sku join public.equipment_catalog c on c.sku=e.sku where s.ends_at-s.starts_at=interval '1008 hours' and (c.hashrate,p.amount,e.monthly_stock) in ((1000,99000000,1000),(5000,499000000,500),(10000,1099000000,100))) <> 3 then raise exception 'Catalog mismatch'; end if;
end $$;
update depix_sandbox.season_equipment set monthly_stock=1 where sku='genesis-s1-i';
set local role authenticated;
set local request.jwt.claims='{"sub":"9daa2336-cce3-434c-9410-42b07da9cdbb","aal":"aal1"}';
select public.depix_sandbox_purchase('9daa2336-cce3-434c-9410-42b07da9cdbd','genesis-s1-i','0.99');
do $$ begin if public.depix_sandbox_purchase('9daa2336-cce3-434c-9410-42b07da9cdbd','genesis-s1-i','0.99')->>'replayed' <> 'true' then raise exception 'Replay failed'; end if; end $$;
set local request.jwt.claims='{"sub":"9daa2336-cce3-434c-9410-42b07da9cdbc","aal":"aal1"}';
do $$ begin begin perform public.depix_sandbox_purchase('9daa2336-cce3-434c-9410-42b07da9cdbe','genesis-s1-i','0.99'); raise exception 'Accepted oversell' using errcode='22023'; exception when raise_exception then if sqlerrm <> 'Estoque mensal esgotado.' then raise; end if; end; end $$;
reset role;
do $$ begin
if exists(select from depix_sandbox.journal where id='9daa2336-cce3-434c-9410-42b07da9cdbe') or
(select count(*) from public.player_equipment where catalog_sku='genesis-s1-i')<>1 or
(select sum(sold) from depix_sandbox.season_monthly_sales where sku='genesis-s1-i')<>1 then raise exception 'Failed purchase left state'; end if;
end $$;
rollback;
