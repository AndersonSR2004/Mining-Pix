begin;
set local lock_timeout='1s';
insert into auth.users (id,email) values ('ed58e86a-dffc-4ca7-b89a-3ebd43dab020','royalty-test@example.invalid');
insert into depix_sandbox.requests(id,user_id,kind,amount,status)
values ('ed58e86a-dffc-4ca7-b89a-3ebd43dab028','ed58e86a-dffc-4ca7-b89a-3ebd43dab020','deposit',20000000000,'credited');
select depix_sandbox.post('ed58e86a-dffc-4ca7-b89a-3ebd43dab021','deposit',
 'ed58e86a-dffc-4ca7-b89a-3ebd43dab020','platform_deposit_source','player_available',20000000000,'ed58e86a-dffc-4ca7-b89a-3ebd43dab028');
insert into public.player_rooms(user_id,room_number,name,active)
 values ('ed58e86a-dffc-4ca7-b89a-3ebd43dab020',1,'Sala de teste',true) on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','ed58e86a-dffc-4ca7-b89a-3ebd43dab020',true);
select public.depix_sandbox_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab022','genesis-miner-iii','9.99');
select public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab023','rack-i','2.99');
select public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab024','rack-ii','5.99');
select public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab025','rack-iii','10.99');
do $$
declare machine uuid; room uuid;
begin
  select id into strict machine from public.player_equipment where user_id=auth.uid() and catalog_sku='genesis-miner-iii';
  select id into strict room from public.player_rooms where user_id=auth.uid() and room_number=1;
  perform public.install_player_equipment(machine,room,'royalty-test-install');
  perform public.royalty_mount(machine,'ed58e86a-dffc-4ca7-b89a-3ebd43dab025');
end;
$$;
reset role;
do $$
begin
  if (select hashrate from public.competition_hashrates(clock_timestamp()) where user_id=auth.uid()) is distinct from 13 then
     raise exception 'Rack and VIP bonuses did not add on base HASH';
  end if;
end;
$$;
set local role authenticated;
do $$
begin
  if public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab023','rack-i','2.99')
    or (public.depix_sandbox_wallet_snapshot()->>'available')::numeric <> 170.04 then
    raise exception 'Rack idempotency or balance incorrect';
  end if;
end;
$$;


do $$
declare
  machine uuid;
  rack uuid := 'ed58e86a-dffc-4ca7-b89a-3ebd43dab025';
begin
  select id into strict machine from public.player_equipment where user_id=auth.uid() and catalog_sku='genesis-miner-iii';
  begin
    perform public.genesis_disassemble('machine',machine);
    raise exception 'Installed machine accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.genesis_disassemble('rack',rack);
    raise exception 'Occupied rack accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  perform public.uninstall_player_equipment(machine,'genesis-parts-test');
  if not public.genesis_disassemble('machine',machine) or public.genesis_disassemble('machine',machine) then
    raise exception 'Machine retry was not idempotent';
  end if;
  if not public.genesis_disassemble('rack',rack) or public.genesis_disassemble('rack',rack) then
    raise exception 'Rack retry was not idempotent';
  end if;
  if public.genesis_parts_inventory() is distinct from '{"cpu":"20","gpu":"20","motherboard":"20"}'::jsonb
    or exists(select from jsonb_array_elements(public.royalty_snapshot()->'racks') entry where entry->>'id'=rack::text)
    or (select status from public.player_equipment where id=machine) is distinct from 'retired' then
    raise exception 'Parts credits or inventory incorrect';
  end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='8d309d6b-c06c-4c6a-97b9-998329349fee';
do $$ begin
  if public.genesis_parts_inventory() is distinct from '{"cpu":"0","gpu":"0","motherboard":"0"}'::jsonb then
    raise exception 'Parts visible across accounts';
  end if;
  begin
    perform public.genesis_disassemble('rack','ed58e86a-dffc-4ca7-b89a-3ebd43dab024');
    raise exception 'Another player dismantled a rack';
  exception when no_data_found then null;
  end;
end $$;
rollback;
