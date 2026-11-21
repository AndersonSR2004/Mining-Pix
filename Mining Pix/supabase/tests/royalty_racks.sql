begin;
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
rollback;
