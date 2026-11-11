create or replace function private.vip_hash_multiplier(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
 with qualifying as (
  select coalesce(sum(amount_brl_cents),0)::bigint as total_cents
  from private.vip_topup_events
  where user_id=p_user_id and status='confirmed'
    and confirmed_at>=now()-interval '30 days' and confirmed_at<=now()
 )
 select case
  when total_cents>=6000 then 1.30::numeric
  when total_cents>=5000 then 1.25::numeric
  when total_cents>=4500 then 1.20::numeric
  when total_cents>=4000 then 1.15::numeric
  when total_cents>=3000 then 1.10::numeric
  else 1.00::numeric end
 from qualifying;
$$;
revoke all on function private.vip_hash_multiplier(uuid) from public,anon,authenticated;
