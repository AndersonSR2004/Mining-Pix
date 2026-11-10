create or replace function private.guard_pool_cycle_settlement()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_distribution_enabled boolean; v_policy_version text;
begin
 if old.status='open' and new.status='settled' then
  if new.opened_at > now() - interval '10 minutes' then
   raise exception 'PIX BLOCK cannot be settled before 600 seconds have elapsed' using errcode='check_violation';
  end if;
  if new.budget_pc<>0 then raise exception 'Mining Pool is MINING COIN only; PIX COIN budgets are not permitted' using errcode='check_violation'; end if;
  if new.budget_mc>0 then
   select distribution_enabled,mc_budget_policy_version into v_distribution_enabled,v_policy_version from private.pool_distribution_controls where id=1;
   if coalesce(v_distribution_enabled,false) is not true or nullif(trim(v_policy_version),'') is null then
    raise exception 'MINING COIN distribution is locked until the financial funding and conversion policy is approved' using errcode='55000';
   end if;
  end if;
 end if;
 return new;
end; $$;
revoke all on function private.guard_pool_cycle_settlement() from public,anon,authenticated;
comment on function private.guard_pool_cycle_settlement() is 'Official PIX BLOCK timing: a pool cycle can settle after 600 seconds; PC remains disabled and MC settlement remains fail-closed until the approved funding policy is configured.';