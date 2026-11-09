-- Restrict the private pool control row to the backend service role.
create policy pool_distribution_controls_service_role_only
on private.pool_distribution_controls
for all
to service_role
using (true)
with check (true);
