begin;
insert into auth.users(id,email,raw_app_meta_data) values
 ('9d415007-2960-4bea-ae55-0b1695cbde10','permanent-vip-player@example.invalid','{}'),
 ('9d415007-2960-4bea-ae55-0b1695cbde12','permanent-vip-admin@example.invalid','{"admin":true}');
insert into depix_sandbox.requests(id,user_id,kind,amount,status)
values ('9d415007-2960-4bea-ae55-0b1695cbde11','9d415007-2960-4bea-ae55-0b1695cbde10','deposit',25000000000,'pending');
select depix_sandbox.post(gen_random_uuid(),'deposit','9d415007-2960-4bea-ae55-0b1695cbde10',
  'platform_deposit_source','player_available',10000000000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"9d415007-2960-4bea-ae55-0b1695cbde10","aal":"aal1"}';
do $$
begin
  if public.get_my_vip_status()->>'vip_tier' is distinct from '0'
     or public.royalty_snapshot()->'offers' @> '[{"family":"vip"}]'::jsonb then
    raise exception 'Pending/unlinked deposits or obsolete offers affected VIP';
  end if;
  begin
    perform public.royalty_purchase('9d415007-2960-4bea-ae55-0b1695cbde19','vip-rei','100');
    raise exception 'Direct VIP purchase accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.depix_sandbox_record_vip_reversal(gen_random_uuid(),'9d415007-2960-4bea-ae55-0b1695cbde11','1','refund');
    raise exception 'Player reversed deposit';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"9d415007-2960-4bea-ae55-0b1695cbde12","aal":"aal2","app_metadata":{"admin":true}}';
select public.depix_sandbox_admin_deposit('9d415007-2960-4bea-ae55-0b1695cbde11');
select public.depix_sandbox_admin_deposit('9d415007-2960-4bea-ae55-0b1695cbde11');

set local request.jwt.claims = '{"sub":"9d415007-2960-4bea-ae55-0b1695cbde10","aal":"aal1"}';
do $$
declare first_claim jsonb; replay jsonb;
begin
  if public.get_my_vip_status()->>'vip_tier' is distinct from '2'
     or public.get_my_vip_status()->>'qualifying_units' is distinct from '25000000000' then
    raise exception 'Settled deposit did not qualify exactly once';
  end if;
  first_claim := public.claim_daily_login_xp();
  replay := public.claim_daily_login_xp();
  if first_claim->>'amount' is distinct from '125' or replay->>'amount' is distinct from '0' then
    raise exception 'VIP XP or replay incorrect';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"9d415007-2960-4bea-ae55-0b1695cbde12","aal":"aal2","app_metadata":{"admin":true}}';
do $$
declare id uuid := '9d415007-2960-4bea-ae55-0b1695cbde17';
begin
  if not public.depix_sandbox_record_vip_reversal(id,'9d415007-2960-4bea-ae55-0b1695cbde11','0.01','refund')
     or public.depix_sandbox_record_vip_reversal(id,'9d415007-2960-4bea-ae55-0b1695cbde11','0.01','refund') then
    raise exception 'Reversal replay incorrect';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"9d415007-2960-4bea-ae55-0b1695cbde10","aal":"aal1"}';
do $$
begin
  if public.get_my_vip_status()->>'vip_tier' is distinct from '1' then
    raise exception 'Reversal did not recalculate VIP';
  end if;
end $$;
reset role;
do $$
begin
  if (select tier from depix_sandbox.vip_qualification('9d415007-2960-4bea-ae55-0b1695cbde10',now()+interval '1 year')) <> 1 then
    raise exception 'VIP expired with time';
  end if;
end $$;
rollback;
