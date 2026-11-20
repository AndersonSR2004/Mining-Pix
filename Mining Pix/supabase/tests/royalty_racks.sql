begin;
insert into auth.users (id,email) values ('ed58e86a-dffc-4ca7-b89a-3ebd43dab020','royalty-test@example.invalid');
select depix_sandbox.post('ed58e86a-dffc-4ca7-b89a-3ebd43dab021','deposit',
 'ed58e86a-dffc-4ca7-b89a-3ebd43dab020','platform_deposit_source','player_available',20000000000);
insert into public.player_rooms(user_id,room_number,name,active)
 values ('ed58e86a-dffc-4ca7-b89a-3ebd43dab020',1,'Sala de teste',true) on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','ed58e86a-dffc-4ca7-b89a-3ebd43dab020',true);
select public.depix_sandbox_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab022','genesis-miner-iii','9.99');
select public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab023','rack-i','2.99');
select public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab024','rack-ii','5.99');
select public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab025','rack-iii','10.99');
select public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab026','vip-barao','30');
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
  if (select hashrate from public.competition_hashrates(clock_timestamp()) where user_id=auth.uid()) is distinct from 13.2 then
     raise exception 'Rack and Barão HASH incorrect';
  end if;
end;
$$;
set local role authenticated;
select public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab027','vip-rei','100');
do $$
begin
  if public.royalty_purchase('ed58e86a-dffc-4ca7-b89a-3ebd43dab027','vip-rei','100')
    or (public.depix_sandbox_wallet_snapshot()->>'available')::numeric <> 40.04 then
    raise exception 'Idempotency or balance incorrect';
  end if;
end;
$$;
reset role;
do $$
begin
  if (select hashrate from public.competition_hashrates(clock_timestamp()) where user_id=auth.uid()) is distinct from 15.6
    or (select hashrate from public.competition_hashrates(clock_timestamp()+interval '31 days') where user_id=auth.uid()) is distinct from 12 then
    raise exception 'Rei HASH or expiration incorrect';
  end if;
end;
$$;
rollback;
