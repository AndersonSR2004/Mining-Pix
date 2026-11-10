-- Mining Pix Phase 6: audited internal player notes (no gameplay/economy mutation).
create unique index if not exists admin_audit_logs_actor_request_uidx
  on public.admin_audit_logs (actor_user_id, request_id)
  where request_id is not null;

create or replace function public.admin_create_player_note(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_note text,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.admin_audit_logs%rowtype;
  v_event_id uuid;
  v_note text := btrim(coalesce(p_note, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_actor_user_id is null or p_target_user_id is null or p_request_id is null then
    raise exception 'Actor, target and request id are required'
      using errcode = '22023';
  end if;
  if length(v_note) < 5 or length(v_note) > 1500 then
    raise exception 'Note must contain between 5 and 1500 characters'
      using errcode = '22023';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'Reason must contain between 3 and 500 characters'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = p_actor_user_id
      and coalesce(u.raw_app_meta_data ->> 'admin', 'false') = 'true'
  ) then
    raise exception 'Administrative permission required'
      using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'Target player not found'
      using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs (
    actor_user_id, target_user_id, action, entity_type, entity_id,
    reason, after_data, metadata, request_id
  )
  values (
    p_actor_user_id, p_target_user_id, 'player.note.created', 'player',
    p_target_user_id::text, v_reason,
    jsonb_build_object('note', v_note),
    jsonb_build_object('source', 'admin-center', 'effect', 'internal-note-only'),
    p_request_id
  )
  on conflict (actor_user_id, request_id) where request_id is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    return jsonb_build_object('event_id', v_event_id, 'duplicate', false);
  end if;

  select * into v_existing
  from public.admin_audit_logs log
  where log.actor_user_id = p_actor_user_id
    and log.request_id = p_request_id;

  if not found
     or v_existing.target_user_id is distinct from p_target_user_id
     or v_existing.action <> 'player.note.created'
     or v_existing.reason <> v_reason
     or v_existing.after_data ->> 'note' is distinct from v_note then
    raise exception 'Idempotency key already used for a different request'
      using errcode = '23505';
  end if;

  return jsonb_build_object('event_id', v_existing.id, 'duplicate', true);
end;
$$;

revoke all on function public.admin_create_player_note(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_player_note(uuid, uuid, text, text, uuid) to service_role;

comment on function public.admin_create_player_note(uuid, uuid, text, text, uuid) is
  'Service-role-only transactional endpoint for creating internal player notes with immutable audit records. Revalidates current admin app_metadata and supports idempotent retries.';
