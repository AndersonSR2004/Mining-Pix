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


reset role;
do $$ declare i integer; id uuid; begin
for i in 1..18 loop
 id:=gen_random_uuid();
 if not depix_sandbox.grant_parts_pack('ed58e86a-dffc-4ca7-b89a-3ebd43dab020',id,i)
 or depix_sandbox.grant_parts_pack('ed58e86a-dffc-4ca7-b89a-3ebd43dab020',id,i) then raise exception 'Pack retry'; end if;
end loop;
end $$;
set local role authenticated;
do $$ declare i integer; asset uuid; req uuid; begin
select id into strict asset from public.player_equipment where user_id=auth.uid() and catalog_sku='genesis-miner-iii';
for i in 1..10 loop
 req:=gen_random_uuid();
 if public.genesis_forge_quote(asset)->>'parts' is distinct from (10*i)::text or not public.genesis_forge(req,asset,i,'0.00000000') or public.genesis_forge(req,asset,i,'0') then raise exception 'Wrong price or replay'; end if;
end loop;
if public.genesis_parts_inventory() is distinct from '{"cpu":"50","gpu":"50","motherboard":"50"}'::jsonb
 or (select forge_level from public.player_equipment where id=asset) is distinct from 10::smallint
 or (select total_hashrate from public.get_player_room_summaries() where installed_count=1) is distinct from 15 then
 raise exception 'Inventory or HASH incorrect';
end if;
end $$;
reset role;
do $$ begin
if (select hashrate from public.competition_hashrates(clock_timestamp()) where user_id=auth.uid()) is distinct from 18 then raise exception 'Pool HASH incorrect'; end if;
end $$;
set local role authenticated;
do $$ begin begin perform public.genesis_set_forge_fee(1,'1','Taxa de teste'); raise exception 'Unauthorized change'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
