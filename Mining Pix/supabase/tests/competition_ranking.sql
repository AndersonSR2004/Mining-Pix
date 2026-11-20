-- Run as the migration operator. Accounts and competition fixtures are rolled back.
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('f71ca99c-6ada-4e05-90f3-e6e0c4013301', 'competition-a@example.invalid', '{"display_name":"Ranking QA Alpha"}'),
  ('f71ca99c-6ada-4e05-90f3-e6e0c4013302', 'competition-b@example.invalid', '{"display_name":"ranking@example.invalid"}'),
  ('f71ca99c-6ada-4e05-90f3-e6e0c4013303', 'competition-c@example.invalid', '{"display_name":"Ranking QA Visitante"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f71ca99c-6ada-4e05-90f3-e6e0c4013301', true);
do $$
declare
  snapshot jsonb;
begin
  if not public.claim_competition_starter() or public.claim_competition_starter() then
    raise exception 'Starter claim is not idempotent';
  end if;
  snapshot := public.get_competition_ranking();
  if (snapshot#>>'{me,hashrate}')::numeric is distinct from 10
    or snapshot#>>'{me,league}' is distinct from 'Bronze'
    or snapshot#>>'{me,starter_claimed}' is distinct from 'true'
    or snapshot#>>'{me,position}' is null then
    raise exception 'Free starter does not create ranking power';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'f71ca99c-6ada-4e05-90f3-e6e0c4013302', true);
select public.claim_competition_starter();
reset role;

do $$
declare
  places bigint;
begin
  select count(distinct r.position) into places
  from (
    select h.user_id, rank() over (order by h.hashrate desc) as position
    from public.competition_hashrates(now()) h
  ) r
  where r.user_id in ('f71ca99c-6ada-4e05-90f3-e6e0c4013301', 'f71ca99c-6ada-4e05-90f3-e6e0c4013302');
  if places <> 1 then raise exception 'Unequal positions on tied HASH'; end if;
  if has_function_privilege('anon', 'public.get_competition_ranking(integer)', 'execute')
    or has_function_privilege('authenticated', 'public.competition_hashrates(timestamptz)', 'execute')
    or has_schema_privilege('authenticated', 'mining_competition', 'usage') then
    raise exception 'Overbroad competition access';
  end if;
end;
$$;

-- Active temporary HASH promotes the player; expiry restores their previous league.
insert into public.player_game_hash_boosts (user_id, active_hashrate, expires_at)
values ('f71ca99c-6ada-4e05-90f3-e6e0c4013302', 15, now() + interval '1 minute');

set local role authenticated;
do $$
declare
  snapshot jsonb := public.get_competition_ranking();
begin
  if (snapshot#>>'{me,hashrate}')::numeric is distinct from 25
    or snapshot#>>'{me,league}' is distinct from 'Prata'
    or snapshot::text like '%f71ca99c%'
    or snapshot::text like '%example.invalid%'
    or exists (
      select 1 from jsonb_array_elements(snapshot->'players') item
      where item ? 'user_id' or item ? 'email'
    ) then
    raise exception 'Incorrect league promotion or private ranking data leaked';
  end if;
  perform public.claim_daily_login_xp();
  if (public.get_competition_ranking()#>>'{me,hashrate}')::numeric is distinct from 27 then
    raise exception 'Daily XP did not supply temporary HASH';
  end if;
end;
$$;

reset role;
update public.player_game_hash_boosts
set expires_at = now() - interval '1 second'
where user_id = 'f71ca99c-6ada-4e05-90f3-e6e0c4013302';

set local role authenticated;
do $$
begin
  if public.get_competition_ranking()#>>'{me,league}' is distinct from 'Bronze'
    or (public.get_competition_ranking()#>>'{me,hashrate}')::numeric is distinct from 12 then
    raise exception 'Expired boost still counted or relegation failed';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'f71ca99c-6ada-4e05-90f3-e6e0c4013303', true);
do $$
begin
  if public.get_competition_ranking()#>>'{me,position}' is not null then
    raise exception 'Inactive player unexpectedly ranked';
  end if;
end;
$$;

rollback;
