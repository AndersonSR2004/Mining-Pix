create or replace function private.enforce_sandbox_mc_only()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_table_name='sandbox_blocks' then
  if new.reward_pc<>0 then raise exception 'PIX COIN is purchase-only and cannot be distributed by sandbox blocks' using errcode='check_violation'; end if;
 elsif tg_table_name='sandbox_allocations' then
  if new.amount_pc<>0 then raise exception 'PIX COIN cannot be allocated as a sandbox block reward' using errcode='check_violation'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.enforce_sandbox_mc_only() from public,anon,authenticated;