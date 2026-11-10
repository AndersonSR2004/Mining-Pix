-- Mining Pix: fail-closed daily Mining Pool settlement controls.
-- MINING COIN distribution remains disabled until the BRL funding and MC conversion policy is formally approved.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.pool_distribution_controls (
  id smallint primary key default 1 check (id = 1),
  distribution_enabled boolean not null default false,
  mc_budget_policy_version text,
  updated_at timestamptz not null default now()
);

alter table private.pool_distribution_controls enable row level security;
revoke all on table private.pool_distribution_controls from public, anon, authenticated;
grant select, insert, update, delete on table private.pool_distribution_controls to service_role;

insert into private.pool_distribution_controls (id, distribution_enabled, mc_budget_policy_version)
values (1, false, null)
on conflict (id) do nothing;

comment on table private.pool_distribution_controls is
  'Fail-closed control for Mining Pool MINING COIN settlement. Distribution remains disabled until the approved BRL-to-MC funding policy is configured through a reviewed migration.';

create or replace function private.guard_pool_cycle_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_distribution_enabled boolean;
  v_policy_version text;
begin
  if old.status = 'open' and new.status = 'settled' then
    if new.opened_at > now() - interval '24 hours' then
      raise exception 'Daily Mining Pool cycle cannot be settled before 24 hours have elapsed'
        using errcode = 'check_violation';
    end if;

    if new.budget_pc <> 0 then
      raise exception 'Mining Pool is MINING COIN only; PIX COIN budgets are not permitted'
        using errcode = 'check_violation';
    end if;

    if new.budget_mc > 0 then
      select distribution_enabled, mc_budget_policy_version
        into v_distribution_enabled, v_policy_version
      from private.pool_distribution_controls
      where id = 1;

      if coalesce(v_distribution_enabled, false) is not true
         or nullif(trim(v_policy_version), '') is null then
        raise exception 'MINING COIN distribution is locked until the financial funding and conversion policy is approved'
          using errcode = '55000';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_pool_cycle_settlement() from public, anon, authenticated;

drop trigger if exists pool_cycle_settlement_guard on public.pool_cycles;
create trigger pool_cycle_settlement_guard
before update of status on public.pool_cycles
for each row
execute function private.guard_pool_cycle_settlement();

create unique index if not exists pool_cycles_single_open_idx
  on public.pool_cycles ((status))
  where status = 'open';

alter table public.pool_cycles
  add constraint pool_cycles_pc_budget_disabled_check
  check (budget_pc = 0);

alter table public.pool_allocations
  add constraint pool_allocations_pc_distribution_disabled_check
  check (amount_pc = 0);

comment on index public.pool_cycles_single_open_idx is
  'Guarantees at most one open daily Mining Pool cycle at a time.';

commit;
