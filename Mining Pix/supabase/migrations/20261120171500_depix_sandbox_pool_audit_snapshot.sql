-- Display recent budget settings and sandbox funding changes to authorized administrators.
create or replace function public.admin_depix_pool_snapshot()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  has_scheduler boolean := false;
  cycles jsonb;
  audit jsonb;
  settings bigint;
  available bigint;
begin
  perform depix_sandbox.require_admin();
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = $1 and active)'
      into has_scheduler using 'mining-pix-depix-sandbox-pool';
  end if;
  select daily_budget_units into strict settings from depix_sandbox.pool_settings;
  select amount into available from depix_sandbox.positions where account_key = 'platform_pool';
  select coalesce(jsonb_agg(depix_sandbox.pool_cycle_json(c) order by c.cycle_date desc), '[]'::jsonb)
  into cycles
  from (select * from depix_sandbox.pool_cycles order by cycle_date desc limit 20) c;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'actor_id', e.actor_id, 'kind', e.kind, 'units', e.units::text,
    'previous_units', e.previous_units::text, 'created_at', e.created_at
  ) order by e.created_at desc, e.id desc), '[]'::jsonb) into audit
  from (select * from depix_sandbox.pool_admin_events order by created_at desc, id desc limit 20) e;
  return jsonb_build_object(
    'daily_budget_units', settings::text, 'available_budget_units', coalesce(available, 0)::text,
    'cycles', cycles, 'scheduler_installed', has_scheduler, 'audit', audit
  );
end
$$;
