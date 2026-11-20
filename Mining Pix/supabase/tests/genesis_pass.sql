begin;
insert into auth.users(id,email) values
 ('ed58e86a-dffc-4ca7-b89a-3ebd43dab030','genesis-pass@example.invalid'),
 ('ed58e86a-dffc-4ca7-b89a-3ebd43dab031','genesis-full@example.invalid');
select depix_sandbox.post('ed58e86a-dffc-4ca7-b89a-3ebd43dab032','deposit','ed58e86a-dffc-4ca7-b89a-3ebd43dab030',
 'platform_deposit_source','player_available',10000000000);
set local role authenticated;
select set_config('request.jwt.claim.sub','ed58e86a-dffc-4ca7-b89a-3ebd43dab030',true);
do $$
declare pass uuid := (public.genesis_pass_snapshot()->>'id')::uuid; n integer; totals jsonb;
begin
  perform public.genesis_pass_action('ed58e86a-dffc-4ca7-b89a-3ebd43dab033',pass,'premium',null,'60');
  perform public.genesis_pass_action('ed58e86a-dffc-4ca7-b89a-3ebd43dab034',pass,'skip',null,'1.99');
  if (public.genesis_pass_snapshot()->>'level')::integer is distinct from 1 then raise exception 'Skip count incorrect'; end if;
  perform public.genesis_pass_action('ed58e86a-dffc-4ca7-b89a-3ebd43dab035',pass,'full',null,'38.01');
  if public.genesis_pass_action('ed58e86a-dffc-4ca7-b89a-3ebd43dab035',pass,'full',null,'38.01')
    or (public.depix_sandbox_wallet_snapshot()->>'available')::numeric is distinct from 0::numeric
    or (public.genesis_pass_snapshot()->>'level')::integer is distinct from 30 then raise exception 'Complete pass cost or replay incorrect'; end if;
  for n in 1..30 loop
    perform public.genesis_pass_action(gen_random_uuid(),pass,'claim',n);
    if public.genesis_pass_action(gen_random_uuid(),pass,'claim',n) then raise exception 'Reward duplicated'; end if;
  end loop;
  select jsonb_object_agg(kind,quantity) into totals from (
    select c->>'kind' kind,sum((c->>'quantity')::int) quantity
    from jsonb_array_elements(public.genesis_pass_snapshot()->'claimed') c group by c->>'kind'
  ) q;
  if totals is distinct from '{"parts":100,"rack":10,"equipment":10}'::jsonb then raise exception 'Wrong rewards'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','ed58e86a-dffc-4ca7-b89a-3ebd43dab031',true);
do $$
begin
  begin
    perform public.genesis_pass_action(gen_random_uuid(),(public.genesis_pass_snapshot()->>'id')::uuid,'full',null,'100');
    raise exception 'Insufficient funds accepted';
  exception when invalid_parameter_value then
    if sqlerrm not ilike '%insufficient%' then raise; end if;
  end;
end;
$$;
rollback;
