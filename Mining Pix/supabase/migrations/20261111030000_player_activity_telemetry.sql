create or replace function public.record_player_activity_event(
  p_event_type text,
  p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_event_type not in (
    'session_seen','game_started','game_completed','shop_opened',
    'equipment_installed','room_opened'
  ) then
    raise exception 'Unsupported client telemetry event' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 1 and 160 then
    raise exception 'Invalid telemetry idempotency key' using errcode = '22023';
  end if;

  if p_event_type = 'session_seen' and exists (
    select 1 from private.player_activity_events
    where user_id=v_user_id and event_type='session_seen'
      and created_at >= now()-interval '15 minutes'
  ) then
    return false;
  end if;

  insert into private.player_activity_events(user_id,event_type,idempotency_key,source)
  values(v_user_id,p_event_type,trim(p_idempotency_key),'client_telemetry')
  on conflict(idempotency_key) do nothing
  returning id into v_inserted;

  return v_inserted is not null;
end;
$$;

revoke all on function public.record_player_activity_event(text,text) from public, anon;
grant execute on function public.record_player_activity_event(text,text) to authenticated;

comment on function public.record_player_activity_event(text,text) is
  'Records non-financial client telemetry for the authenticated user only. Client-reported activity is analytics, never proof of gameplay success, HASH eligibility, or reward entitlement.';