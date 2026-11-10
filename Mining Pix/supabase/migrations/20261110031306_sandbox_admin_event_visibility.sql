create or replace function public.admin_sandbox_snapshot(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_session private.sandbox_sessions%rowtype; v_block private.sandbox_blocks%rowtype;
begin
 v_actor:=private.assert_sandbox_admin();
 select * into v_session from private.sandbox_sessions where id=p_session_id and admin_user_id=v_actor;
 if not found then raise exception 'Sandbox session not found' using errcode='P0002'; end if;
 select * into v_block from private.sandbox_blocks where session_id=p_session_id and status='open' order by block_number desc limit 1;
 return jsonb_build_object(
  'session',to_jsonb(v_session),
  'bots',(select coalesce(jsonb_agg(to_jsonb(b) order by bot_number),'[]'::jsonb) from private.sandbox_miners b where b.session_id=p_session_id),
  'blocks',(select coalesce(jsonb_agg(to_jsonb(x) order by block_number desc),'[]'::jsonb) from (select * from private.sandbox_blocks where session_id=p_session_id order by block_number desc limit 20)x),
  'allocations',(select coalesce(jsonb_agg(jsonb_build_object('block_id',a.block_id,'miner_id',a.miner_id,'display_name',m.display_name,'hashrate',a.hashrate_snapshot,'share',a.share,'pc',a.amount_pc,'mc',a.amount_mc) order by a.created_at desc),'[]'::jsonb) from private.sandbox_allocations a join private.sandbox_miners m on m.id=a.miner_id join private.sandbox_blocks bl on bl.id=a.block_id where bl.session_id=p_session_id),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'target_user_id',e.target_user_id,'reason',e.reason,'before_data',e.before_data,'after_data',e.after_data,'created_at',e.created_at) order by e.created_at desc),'[]'::jsonb) from (select * from private.sandbox_admin_events where actor_user_id=v_actor and (session_id=p_session_id or session_id is null) order by created_at desc limit 50)e),
  'network_hashrate',(select coalesce(sum(hashrate),0) from private.sandbox_miners where session_id=p_session_id and active),
  'open_block',case when v_block.id is null then null else to_jsonb(v_block) end
 );
end; $$;
revoke all on function public.admin_sandbox_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.admin_sandbox_snapshot(uuid) to authenticated,service_role;