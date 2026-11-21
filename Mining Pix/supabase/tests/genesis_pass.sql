begin;
insert into auth.users(id,email) values
 ('ed58e86a-dffc-4ca7-b89a-3ebd43dab030','genesis-pass@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub','ed58e86a-dffc-4ca7-b89a-3ebd43dab030',true);
do $$
declare
  pass_id uuid := 'ed58e86a-dffc-4ca7-b89a-3ebd43dab031';
  request_id uuid := 'ed58e86a-dffc-4ca7-b89a-3ebd43dab033';
  action text;
  before_wallet jsonb := public.depix_sandbox_wallet_snapshot();
begin
  foreach action in array array['premium','skip','full','claim'] loop
    begin
      perform public.genesis_pass_action(request_id,pass_id,action,1,'100');
      raise exception 'New Genesis mutation accepted for %', action;
    exception when object_not_in_prerequisite_state then
      if sqlerrm not like 'Compras e novos resgates do Genesis%' then raise; end if;
    end;
  end loop;
  if (public.depix_sandbox_wallet_snapshot()->>'available') is distinct from (before_wallet->>'available') then
    raise exception 'Rejected action changed the wallet';
  end if;
end;
$$;
rollback;
