begin;
insert into auth.users(id,email) values ('9d415007-2960-4bea-ae55-0b1695cbde10','royalty-xp-fixture@example.invalid');
select depix_sandbox.post(gen_random_uuid(),'deposit','9d415007-2960-4bea-ae55-0b1695cbde10','platform_deposit_source','player_available',10000000000);
set local role authenticated;
select set_config('request.jwt.claim.sub','9d415007-2960-4bea-ae55-0b1695cbde10',true);
select public.royalty_purchase('9d415007-2960-4bea-ae55-0b1695cbde11','vip-rei','100');
reset role;
update depix_sandbox.royalty_receipts set started_at=now()-interval '1 hour' where id='9d415007-2960-4bea-ae55-0b1695cbde11';
set local role authenticated;
do $$
declare first_claim jsonb; repeat_claim jsonb;
begin
  first_claim:=public.claim_daily_login_xp();
  repeat_claim:=public.claim_daily_login_xp();
  if first_claim->>'amount' is distinct from '130' or repeat_claim->>'amount' is distinct from '0' then
    raise exception 'XP VIP or replay incorrect';
  end if;
end;
$$;
rollback;
