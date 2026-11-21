begin;
insert into auth.users(id,email,raw_app_meta_data) values ('a24a9b37-5587-484f-b703-0bfa5a4d4a80','league-admin@example.invalid','{"admin":true}'),('a24a9b37-5587-484f-b703-0bfa5a4d4a81','league-player@example.invalid','{}');
set local role authenticated;
set local request.jwt.claim.sub='a24a9b37-5587-484f-b703-0bfa5a4d4a81';
do $$ begin begin perform public.preview_league_pools('12',array_fill('1'::text,array[12])); raise exception 'Access allowed'; exception when insufficient_privilege then null; end; end $$;
set local request.jwt.claim.sub='a24a9b37-5587-484f-b703-0bfa5a4d4a80';
do $$ declare s jsonb := public.preview_league_pools('97',array_fill('8'::text,array[12])); begin
if jsonb_array_length(s->'pools') <> 12 or s->>'unallocated' <> '1' or exists(select from jsonb_array_elements(s->'pools') a where (a->>'distributed')::numeric+(a->>'retained')::numeric+(a->>'rounding')::numeric<>(a->>'reserved')::numeric) then raise exception 'Invalid accounting'; end if;
begin perform public.preview_league_pools('95',array_fill('8'::text,array[12])); raise exception 'Exceeded cap'; exception when invalid_parameter_value then null; end;
end $$;
do $$ begin begin perform public.depix_treasury_review(); raise exception 'Accepted without MFA'; exception when insufficient_privilege then null; end; end $$;
set local request.jwt.claims='{"aal":"aal2","app_metadata":{"admin":true}}';
do $$ declare s jsonb := public.depix_treasury_review(); begin if (s->>'covered')::numeric+(s->>'uncovered')::numeric<>(s->>'obligations')::numeric or s->>'ledger_mismatches' is null then raise exception 'Invalid treasury'; end if; end $$;

rollback;
