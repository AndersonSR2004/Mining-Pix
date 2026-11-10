begin;
update private.sandbox_allocations set amount_pc=0 where amount_pc<>0;
update private.sandbox_miners set pc_balance=0,total_pc_earned=0 where pc_balance<>0 or total_pc_earned<>0;
update private.sandbox_blocks set reward_pc=0 where reward_pc<>0;
alter table private.sandbox_blocks alter column reward_pc set default 0;
alter table private.sandbox_blocks alter column reward_mc set default 100;
update private.sandbox_blocks set reward_pc=0,reward_mc=100 where status='open';
create or replace function private.enforce_sandbox_mc_only()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_table_name='sandbox_blocks' and new.reward_pc<>0 then raise exception 'PIX COIN is purchase-only and cannot be distributed by sandbox blocks' using errcode='check_violation'; end if;
 if tg_table_name='sandbox_allocations' and new.amount_pc<>0 then raise exception 'PIX COIN cannot be allocated as a sandbox block reward' using errcode='check_violation'; end if;
 return new;
end; $$;
revoke all on function private.enforce_sandbox_mc_only() from public,anon,authenticated;
drop trigger if exists sandbox_blocks_mc_only on private.sandbox_blocks;
create trigger sandbox_blocks_mc_only before insert or update of reward_pc on private.sandbox_blocks for each row execute function private.enforce_sandbox_mc_only();
drop trigger if exists sandbox_allocations_mc_only on private.sandbox_allocations;
create trigger sandbox_allocations_mc_only before insert or update of amount_pc on private.sandbox_allocations for each row execute function private.enforce_sandbox_mc_only();
create or replace function public.admin_sandbox_set_rewards(p_session_id uuid,p_block_id uuid,p_reward_pc numeric,p_reward_mc numeric,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_before jsonb; v_after jsonb;
begin
 v_actor:=private.assert_sandbox_admin();
 if p_reward_pc is distinct from 0::numeric then raise exception 'PIX COIN is purchase-only; sandbox block PC reward must be zero' using errcode='22023'; end if;
 if p_reward_mc is null or p_reward_mc<0 or p_reward_mc>99999999999999999999 or length(trim(coalesce(p_reason,'')))<5 or p_request_id is null then raise exception 'Invalid MC reward parameters' using errcode='22023'; end if;
 select jsonb_build_object('reward_pc',reward_pc,'reward_mc',reward_mc) into v_before from private.sandbox_blocks where id=p_block_id and session_id=p_session_id and status='open' for update;
 if not found then raise exception 'Open sandbox block not found' using errcode='P0002'; end if;
 update private.sandbox_blocks set reward_pc=0,reward_mc=p_reward_mc where id=p_block_id returning jsonb_build_object('reward_pc',reward_pc,'reward_mc',reward_mc) into v_after;
 insert into private.sandbox_admin_events(actor_user_id,session_id,block_id,action,reason,before_data,after_data,request_id) values(v_actor,p_session_id,p_block_id,'mc_reward_changed',trim(p_reason),v_before,v_after,p_request_id);
 return jsonb_build_object('success',true,'before',v_before,'after',v_after);
end; $$;
create or replace function public.admin_sandbox_settle_block(p_session_id uuid,p_block_id uuid,p_accelerate boolean,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_block private.sandbox_blocks%rowtype; v_total numeric(20,2); v_row record; v_primary uuid; v_mc numeric(30,8); v_share numeric(20,12); v_paid_mc numeric(30,8):=0; v_count integer:=0; v_next uuid; v_remaining_mc numeric(30,8); v_replay jsonb;
begin
 v_actor:=private.assert_sandbox_admin();
 if p_request_id is null or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Reason and request id required' using errcode='22023'; end if;
 select after_data into v_replay from private.sandbox_admin_events where request_id=p_request_id;
 if found then return coalesce(v_replay,'{}'::jsonb)||jsonb_build_object('status','settled','replayed',true); end if;
 select * into v_block from private.sandbox_blocks where id=p_block_id and session_id=p_session_id for update;
 if not found then raise exception 'Sandbox block not found' using errcode='P0002'; end if;
 if v_block.status='settled' then return jsonb_build_object('status','settled','already_settled',true,'block_id',p_block_id); end if;
 if not p_accelerate and now()<v_block.opened_at+make_interval(secs=>v_block.duration_seconds) then raise exception 'Block cannot be settled before 600 seconds' using errcode='55000'; end if;
 if p_accelerate and length(trim(p_reason))<10 then raise exception 'Accelerated settlement requires a 10-character reason' using errcode='22023'; end if;
 if v_block.reward_pc<>0 then raise exception 'PIX COIN block reward must remain zero' using errcode='check_violation'; end if;
 select coalesce(sum(hashrate),0) into v_total from private.sandbox_miners where session_id=p_session_id and active;
 select id into v_primary from private.sandbox_miners where session_id=p_session_id and active order by hashrate desc,id limit 1;
 if v_total>0 and v_primary is not null then
  for v_row in select id,hashrate from private.sandbox_miners where session_id=p_session_id and active and id<>v_primary order by id loop
   v_share:=v_row.hashrate/v_total; v_mc:=floor(v_block.reward_mc*v_share*100000000)/100000000;
   insert into private.sandbox_allocations(block_id,miner_id,hashrate_snapshot,share,amount_pc,amount_mc) values(p_block_id,v_row.id,v_row.hashrate,v_share,0,v_mc);
   update private.sandbox_miners set mc_balance=mc_balance+v_mc,total_mc_earned=total_mc_earned+v_mc where id=v_row.id;
   v_paid_mc:=v_paid_mc+v_mc; v_count:=v_count+1;
  end loop;
  v_remaining_mc:=round(v_block.reward_mc-v_paid_mc,8);
  select hashrate into v_row from private.sandbox_miners where id=v_primary; v_share:=v_row.hashrate/v_total;
  insert into private.sandbox_allocations(block_id,miner_id,hashrate_snapshot,share,amount_pc,amount_mc) values(p_block_id,v_primary,v_row.hashrate,v_share,0,v_remaining_mc);
  update private.sandbox_miners set mc_balance=mc_balance+v_remaining_mc,total_mc_earned=total_mc_earned+v_remaining_mc where id=v_primary;
  v_paid_mc:=v_paid_mc+v_remaining_mc; v_count:=v_count+1;
 end if;
 update private.sandbox_blocks set status='settled',closed_at=now(),total_hashrate=v_total,participant_count=v_count,accelerated=p_accelerate where id=p_block_id;
 insert into private.sandbox_admin_events(actor_user_id,session_id,block_id,action,reason,before_data,after_data,request_id)
 values(v_actor,p_session_id,p_block_id,case when p_accelerate then 'block_accelerated' else 'block_settled' end,trim(p_reason),jsonb_build_object('status','open','reward_pc',0,'reward_mc',v_block.reward_mc),jsonb_build_object('status','settled','block_id',p_block_id,'total_hashrate',v_total,'participants',v_count,'pc_distributed',0,'mc_distributed',v_paid_mc),p_request_id);
 insert into private.sandbox_blocks(session_id,block_number,reward_pc,reward_mc) values(p_session_id,v_block.block_number+1,0,v_block.reward_mc) returning id into v_next;
 return jsonb_build_object('status','settled','block_id',p_block_id,'next_block_id',v_next,'total_hashrate',v_total,'participants',v_count,'pc_distributed',0,'mc_distributed',v_paid_mc,'accelerated',p_accelerate);
end; $$;
revoke all on function public.admin_sandbox_set_rewards(uuid,uuid,numeric,numeric,text,uuid) from public,anon,authenticated;
revoke all on function public.admin_sandbox_settle_block(uuid,uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_sandbox_set_rewards(uuid,uuid,numeric,numeric,text,uuid) to authenticated,service_role;
grant execute on function public.admin_sandbox_settle_block(uuid,uuid,boolean,text,uuid) to authenticated,service_role;
commit;