begin;

create policy revenue_ledger_service_role_select
  on private.revenue_ledger_entries
  for select
  to service_role
  using (true);

grant select on private.revenue_ledger_entries to service_role;

commit;