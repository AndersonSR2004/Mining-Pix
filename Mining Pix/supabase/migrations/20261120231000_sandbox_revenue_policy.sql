-- Version policy inputs separately from wallet deposits, the ledger and actual cash.
create table depix_sandbox.revenue_policy (
  revision bigint generated always as identity primary key,
  pool_bps integer not null check (pool_bps between 0 and 10000),
  guarantee_bps integer not null check (guarantee_bps between 0 and 10000),
  maintenance_bps integer not null check (maintenance_bps between 0 and 10000),
  administration_bps integer not null check (administration_bps between 0 and 10000),
  actor_id uuid references auth.users,
  created_at timestamptz not null default clock_timestamp(),
  check (pool_bps + guarantee_bps + maintenance_bps + administration_bps = 10000)
);
alter table depix_sandbox.revenue_policy enable row level security;
revoke all on depix_sandbox.revenue_policy from public,anon,authenticated,service_role;
insert into depix_sandbox.revenue_policy(pool_bps,guarantee_bps,maintenance_bps,administration_bps)
values(3333,4000,1500,1167);

create function public.admin_sandbox_revenue_policy(p_expected_revision bigint default null,p_weights integer[] default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := depix_sandbox.require_admin(); current_policy depix_sandbox.revenue_policy%rowtype;
begin
  if p_weights is not null then
    if cardinality(p_weights) <> 4 or array_ndims(p_weights) <> 1 or array_lower(p_weights,1) <> 1 then
      raise exception 'Informe quatro percentuais válidos.' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('sandbox-revenue-policy',0));
  end if;
  select * into strict current_policy from depix_sandbox.revenue_policy order by revision desc limit 1;
  if p_weights is not null then
    if p_expected_revision is distinct from current_policy.revision then
      raise exception 'A política mudou. Atualize os dados.' using errcode='22023';
    end if;
    insert into depix_sandbox.revenue_policy(pool_bps,guarantee_bps,maintenance_bps,administration_bps,actor_id)
    values (p_weights[1],p_weights[2],p_weights[3],p_weights[4],actor) returning * into current_policy;
  end if;
  return to_jsonb(current_policy);
end;
$$;
revoke all on function public.admin_sandbox_revenue_policy(bigint,integer[]) from public,anon,authenticated;
grant execute on function public.admin_sandbox_revenue_policy(bigint,integer[]) to authenticated;
