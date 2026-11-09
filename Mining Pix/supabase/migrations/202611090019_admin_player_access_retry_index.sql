-- Mining Pix Phase 7B follow-up: index access-operation targets and preserve retry state.
create index if not exists admin_player_access_operations_target_created_idx
  on public.admin_player_access_operations (target_user_id, created_at desc);

create or replace function public.admin_begin_player_access_change(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.admin_player_access_operations%rowtype;
  v_operation public.admin_player_access_operations%rowtype;
  v_banned_until timestamptz;
  v_target_is_admin boolean;
  v_blocked boolean;
  v_already_in_state boolean;
begin
  if p_actor_user_id is null or p_target_user_id is null or p_request_id is null
     or p_action is null or p_action not in ('block', 'unblock')
     or length(btrim(coalesce(p_reason, ''))) < 5
     or length(btrim(coalesce(p_reason, ''))) > 500 then
    raise exception 'Invalid access change request' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_actor_user_id
      and coalesce(u.raw_app_meta_data ->> 'admin', 'false') = 'true'
  ) then
    raise exception 'Administrative permission required' using errcode = '42501';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'Administrators cannot change their own access' using errcode = '42501';
  end if;

  select coalesce(u.raw_app_meta_data ->> 'admin', 'false') = 'true', u.banned_until
    into v_target_is_admin, v_banned_until
  from auth.users u
  where u.id = p_target_user_id;

  if not found then
    raise exception 'Target player not found' using errcode = 'P0002';
  end if;
  if v_target_is_admin then
    raise exception 'Administrative accounts cannot be changed through player controls' using errcode = '42501';
  end if;

  insert into public.admin_player_access_operations (
    actor_user_id, target_user_id, action, reason, request_id, before_banned_until
  )
  values (
    p_actor_user_id, p_target_user_id, p_action, btrim(p_reason), p_request_id, v_banned_until
  )
  on conflict (actor_user_id, request_id) do nothing
  returning * into v_operation;

  v_blocked := v_banned_until is not null and v_banned_until > now();
  v_already_in_state := (p_action = 'block' and v_blocked)
                     or (p_action = 'unblock' and not v_blocked);

  if v_operation.id is null then
    select * into v_existing
    from public.admin_player_access_operations op
    where op.actor_user_id = p_actor_user_id and op.request_id = p_request_id;

    if not found
       or v_existing.target_user_id is distinct from p_target_user_id
       or v_existing.action <> p_action
       or v_existing.reason <> btrim(p_reason) then
      raise exception 'Idempotency key already used for a different request' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'operation_id', v_existing.id,
      'status', v_existing.status,
      'duplicate', true,
      'already_in_state', v_already_in_state,
      'before_banned_until', v_existing.before_banned_until,
      'current_banned_until', v_banned_until,
      'after_banned_until', v_existing.after_banned_until,
      'error_code', v_existing.error_code
    );
  end if;

  return jsonb_build_object(
    'operation_id', v_operation.id,
    'status', v_operation.status,
    'duplicate', false,
    'already_in_state', v_already_in_state,
    'before_banned_until', v_banned_until,
    'current_banned_until', v_banned_until
  );
end;
$$;

comment on function public.admin_begin_player_access_change(uuid, uuid, text, text, uuid) is
  'Service-role-only idempotent access operation initializer. Revalidates current admin, prevents self-lockout and protects admin accounts; retry responses include current Auth state.';
