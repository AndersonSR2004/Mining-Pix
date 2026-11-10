create or replace function public.admin_sandbox_settle_block(p_session_id uuid,p_block_id uuid,p_accelerate boolean,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_block private.sandbox_blocks%rowtype; v_total numeric(20,2); v_row record; v_primary uuid; v_pc numeric(20,0); v_mc numeric(30,8); v_share numeric(20,12); v_paid_pc numeric(20,0):=0; v_paid_mc numeric(30,8):=0; v_count integer:=0; v_next uuid; v_remaining_pc numeric(20,0); v_remaining_mc numeric(30,8); v_replay jsonb;
begin
 v_actor:=private.assert_sandbox_admin();
 if p_request_id is null or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Reason and request id required' using errcode='22023'; end if;
 select after_data into v_replay from private.sandbox_admin_events where request_id=p_request_id;
 if found then return coalesce(v_replay,'{}'::jsonb)||jsonb_build_object('status','settled','replayed',true); end if;
 select * into v_block from private.sandbox_blocks where id=p_block_id and session_id=p_session_id for update;
 if not found then raise exception 'Sandbox block not found' using errcode='P0002'; end if;
 if v_block.status='settled' then return jsonb_build_object('status','settled','already_settled',true,'block_id',p_block_id); end if;
 if not p_accelerate and now()<v_block.opened_at+make_interval(secs=>600) then raise exception 'Block cannot be settled before 600 seconds' using errcode='55000'; end if;
 if p_accelerate and length(trim(p_reason))<10 then raise exception 'Accelerated settlement requires a 10-character reason' using errcode='22023'; end if;
 select coalesce(sum(hashrate),0) into v_total from private.sandbox_miners where session_id=p_session_id and active;
 select id into v_primary from private.sandbox_miners where session_id=p_session_id and active order by hashrate desc,id limit 1;
 if v_total>0 and v_primary is not null then
  for v_row in select id,hashrate from private.sandbox_miners where session_id=p_session_id and active and id<>v_primary order by id loop
   v_share:=v_row.hashrate/v_total; v_pc:=floor(v_block.reward_pc*v_share); v_mc:=round(v_block.reward_mc*v_share,8);
   insert into private.sandbox_allocations(block_id,miner_id,hashrate_snapshot,share,amount_pc,amount_mc) values(p_block_id,v_row.id,v_row.hashrate,v_share,v_pc,v_mc);
   update private.sandbox_miners set pc_balance=pc_balance+v_pc,mc_balance=mc_balance+v_mc,total_pc_earned=total_pc_earned+v_pc,total_mc_earned=total_mc_earned+v_mc where id=v_row.id;
   v_paid_pc:=v_paid_pc+v_pc; v_paid_mc:=v_paid_mc+v_mc; v_count:=v_count+1;
  end loop;
  v_remaining_pc:=v_block.reward_pc-v_paid_pc; v_remaining_mc:=round(v_block.reward_mc-v_paid_mc,8);
  select hashrate into v_row from private.sandbox_miners where id=v_primary; v_share:=v_row.hashrate/v_total;
  insert into private.sandbox_allocations(block_id,miner_id,hashrate_snapshot,share,amount_pc,amount_mc) values(p_block_id,v_primary,v_row.hashrate,v_share,v_remaining_pc,v_remaining_mc);
  update private.sandbox_miners set pc_balance=pc_balance+v_remaining_pc,mc_balance=mc_balance+v_remaining_mc,total_pc_earned=total_pc_earned+v_remaining_pc,total_mc_earned=total_mc_earned+v_remaining_mc where id=v_primary;
  v_paid_pc:=v_paid_pc+v_remaining_pc; v_paid_mc:=v_paid_mc+v_remaining_mc; v_count:=v_count+1;
 end if;
 update private.sandbox_blocks set status='settled',closed_at=now(),total_hashrate=v_total,participant_count=v_count,accelerated=p_accelerate where id=p_block_id;
 insert into private.sandbox_admin_events(actor_user_id,session_id,block_id,action,reason,before_data,after_data,request_id) values(v_actor,p_session_id,p_block_id,case when p_accelerate then 'block_accelerated' else 'block_settled' end,trim(p_reason),jsonb_build_object('status','open','reward_pc',v_block.reward_pc,'reward_mc',v_block.reward_mc),jsonb_build_object('status','settled','block_id',p_block_id,'total_hashrate',v_total,'participants',v_count,'pc_distributed',v_paid_pc,'mc_distributed',v_paid_mc),p_request_id);
 insert into private.sandbox_blocks(session_id,block_number,reward_pc,reward_mc) values(p_session_id,v_block.block_number+1,v_block.reward_pc,v_block.reward_mc) returning id into v_next;
 return jsonb_build_object('status','settled','block_id',p_block_id,'next_block_id',v_next,'total_hashrate',v_total,'participants',v_count,'pc_distributed',v_paid_pc,'mc_distributed',v_paid_mc,'accelerated',p_accelerate);
end; $$;
revoke all on function public.admin_sandbox_settle_block(uuid,uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_sandbox_settle_block(uuid,uuid,boolean,text,uuid) to authenticated,service_role;
