create index if not exists game_events_created_by_idx on public.game_events(created_by);
create index if not exists game_events_updated_by_idx on public.game_events(updated_by);

create or replace function public.admin_set_game_event_status(p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.game_events%rowtype; v_before jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'admin','false')<>'true' then
  raise exception 'Administrative permission required' using errcode='42501';
 end if;
 if p_id is null or p_status not in ('draft','scheduled','live','ended','cancelled') then
  raise exception 'Transição de evento inválida.' using errcode='22023';
 end if;
 select * into v_event from public.game_events where id=p_id for update;
 if not found then raise exception 'Evento não encontrado.' using errcode='P0002'; end if;
 v_before:=to_jsonb(v_event);
 if v_event.status<>p_status and not (
   (v_event.status='draft' and p_status in ('scheduled','live','cancelled')) or
   (v_event.status='scheduled' and p_status in ('draft','live','cancelled')) or
   (v_event.status='live' and p_status in ('ended','cancelled'))
 ) then
  raise exception 'Transição não permitida para o estado atual do evento.' using errcode='P0001';
 end if;
 if p_status='live' and (now()<v_event.starts_at or now()>=v_event.ends_at) then
  raise exception 'O evento só pode ser iniciado dentro da janela configurada.' using errcode='P0001';
 end if;
 if p_status='scheduled' and v_event.ends_at<=now() then
  raise exception 'Não é possível agendar um evento com término no passado.' using errcode='P0001';
 end if;
 update public.game_events set status=p_status,updated_by=auth.uid(),updated_at=now(),
  published_at=case when p_status in ('scheduled','live') then coalesce(published_at,now()) else published_at end
 where id=p_id returning * into v_event;
 insert into public.admin_audit_logs(actor_user_id,action,entity_type,entity_id,reason,before_data,after_data,metadata)
 values(auth.uid(),'game_event.status_changed','game_event',p_id::text,'Alteração manual do estado do evento',v_before,to_jsonb(v_event),jsonb_build_object('status',p_status));
 return jsonb_build_object('success',true,'id',p_id,'status',p_status);
end $$;
revoke all on function public.admin_set_game_event_status(uuid,text) from public,anon;
grant execute on function public.admin_set_game_event_status(uuid,text) to authenticated;
