-- Mining Pix Phase 5: append-only administrative audit foundation.
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  entity_type text not null check (length(entity_type) between 1 and 80),
  entity_id text,
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is
  'Append-only audit trail for privileged Mining Pix administrative operations. Never store passwords, tokens, payment credentials, or other secrets.';
comment on column public.admin_audit_logs.metadata is
  'Non-sensitive operational context only. Do not store credentials, access tokens, or payment secrets.';

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_created_idx
  on public.admin_audit_logs (actor_user_id, created_at desc);
create index if not exists admin_audit_logs_target_created_idx
  on public.admin_audit_logs (target_user_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

revoke all on table public.admin_audit_logs from public, anon, authenticated, service_role;
grant insert on table public.admin_audit_logs to service_role;

create or replace function public.admin_audit_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_app_metadata jsonb := auth.jwt() -> 'app_metadata';
  v_snapshot jsonb;
begin
  if auth.uid() is null
     or coalesce(v_app_metadata ->> 'admin', 'false') <> 'true' then
    raise exception 'Administrative permission required'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'total_events', (select count(*) from public.admin_audit_logs),
    'events', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select
          log.id,
          log.actor_user_id,
          coalesce(actor.display_name, 'Administrador') as actor_display_name,
          log.target_user_id,
          coalesce(target.display_name, '—') as target_display_name,
          log.action,
          log.entity_type,
          log.entity_id,
          log.reason,
          log.before_data,
          log.after_data,
          log.metadata,
          log.request_id,
          log.created_at
        from public.admin_audit_logs log
        left join public.profiles actor on actor.user_id = log.actor_user_id
        left join public.profiles target on target.user_id = log.target_user_id
        order by log.created_at desc
        limit 50
      ) recent
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function public.admin_audit_snapshot() from public, anon;
grant execute on function public.admin_audit_snapshot() to authenticated;
