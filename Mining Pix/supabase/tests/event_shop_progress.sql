begin;
insert into auth.users(id,email) values ('bc60c0dd-bace-4e7f-9362-7e81a7fced21','event-shop-fixture@example.invalid'),
 ('bc60c0dd-bace-4e7f-9362-7e81a7fced24','event-shop-observer@example.invalid');
insert into public.game_events(id,title,event_type,status,starts_at,ends_at,payload,created_by,updated_by)
values ('bc60c0dd-bace-4e7f-9362-7e81a7fced22','Teste','event','live',now()-interval '1 minute',now()+interval '1 minute','{"mechanic":"progression"}',
 'bc60c0dd-bace-4e7f-9362-7e81a7fced21','bc60c0dd-bace-4e7f-9362-7e81a7fced21');
select depix_sandbox.post(gen_random_uuid(),'deposit','bc60c0dd-bace-4e7f-9362-7e81a7fced21','platform_deposit_source','player_available',500000000);
update depix_sandbox.prices set amount=499999999 where product='room';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc60c0dd-bace-4e7f-9362-7e81a7fced21',true);
do $$
declare event uuid := 'bc60c0dd-bace-4e7f-9362-7e81a7fced22';
begin
  if public.get_event_shop_progress(event)->>'points' is distinct from '0' then raise exception 'Deposit credited event'; end if;
  perform public.depix_sandbox_purchase('bc60c0dd-bace-4e7f-9362-7e81a7fced23','room','4.99999999');
  perform public.depix_sandbox_purchase('bc60c0dd-bace-4e7f-9362-7e81a7fced23','room','4.99999999');
  if public.get_event_shop_progress(event)->>'points' is distinct from '4999'
      or public.get_event_shop_progress(event)->>'exact_points' is distinct from '4999.99999'
      or public.get_event_shop_progress(event)->'ranking' is distinct from '[]'::jsonb then raise exception 'Incorrect score'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','bc60c0dd-bace-4e7f-9362-7e81a7fced24',true);
do $$
begin
  if public.get_event_shop_progress('bc60c0dd-bace-4e7f-9362-7e81a7fced22')
    is distinct from '{"points":"0","exact_points":"0","ranking":[]}'::jsonb then
    raise exception 'Another player’s score was returned';
  end if;
end;
$$;
rollback;
