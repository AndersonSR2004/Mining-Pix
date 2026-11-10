begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.sandbox_sessions (
 id uuid primary key default gen_random_uuid(),
 session_key uuid not null unique,
 admin_user_id uuid not null references auth.users(id),
 status text not null default 'active' check(status in ('active','closed')),
 created_at timestamptz not null default now(),
 closed_at timestamptz
);
create index if not exists sandbox_sessions_admin_created_idx on private.sandbox_sessions(admin_user_id,created_at desc);
create table if not exists private.sandbox_miners (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references private.sandbox_sessions(id) on delete cascade,
 bot_number smallint not null check(bot_number between 1 and 10),
 display_name text not null,
 hashrate numeric(10,2) not null check(hashrate between 0 and 100),
 pc_balance numeric(20,0) not null default 0 check(pc_balance>=0),
 mc_balance numeric(30,8) not null default 0 check(mc_balance>=0),
 total_pc_earned numeric(30,0) not null default 0,
 total_mc_earned numeric(30,8) not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(session_id,bot_number)
);
create index if not exists sandbox_miners_session_active_idx on private.sandbox_miners(session_id,active);
create table if not exists private.sandbox_blocks (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references private.sandbox_sessions(id) on delete cascade,
 block_number integer not null,
 status text not null default 'open' check(status in ('open','settled')),
 opened_at timestamptz not null default now(),
 closed_at timestamptz,
 duration_seconds integer not null default 600 check(duration_seconds=600),
 reward_pc numeric(20,0) not null default 100 check(reward_pc>=0),
 reward_mc numeric(30,8) not null default 1 check(reward_mc>=0),
 total_hashrate numeric(20,2) not null default 0,
 participant_count integer not null default 0,
 accelerated boolean not null default false,
 unique(session_id,block_number)
);
create unique index if not exists sandbox_one_open_block_per_session_idx on private.sandbox_blocks(session_id) where status='open';
create table if not exists private.sandbox_allocations (
 id uuid primary key default gen_random_uuid(),
 block_id uuid not null references private.sandbox_blocks(id) on delete cascade,
 miner_id uuid not null references private.sandbox_miners(id),
 hashrate_snapshot numeric(10,2) not null,
 share numeric(20,12) not null,
 amount_pc numeric(20,0) not null default 0,
 amount_mc numeric(30,8) not null default 0,
 created_at timestamptz not null default now(),
 unique(block_id,miner_id)
);
create table if not exists private.sandbox_admin_events (
 id uuid primary key default gen_random_uuid(),
 actor_user_id uuid not null references auth.users(id),
 session_id uuid references private.sandbox_sessions(id),
 block_id uuid references private.sandbox_blocks(id),
 action text not null,
 reason text not null,
 before_data jsonb,
 after_data jsonb,
 request_id uuid not null unique,
 created_at timestamptz not null default now()
);
revoke all on all tables in schema private from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema private to service_role;

create or replace function private.assert_sandbox_admin()
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not exists(select 1 from auth.users u where u.id=v_actor and coalesce((u.raw_app_meta_data->>'admin')::boolean,false)) then
  raise exception 'Administrative permission required' using errcode='42501';
 end if;
 return v_actor;
end; $$;
revoke all on function private.assert_sandbox_admin() from public,anon,authenticated;

create or replace function public.admin_sandbox_start_session(p_session_key uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_session private.sandbox_sessions%rowtype; v_bot record; v_hash numeric(10,2); v_block uuid;
begin
 v_actor:=private.assert_sandbox_admin();
 if p_session_key is null or length(trim(coalesce(p_reason,'')))<5 or length(p_reason)>500 then raise exception 'Invalid session key or reason' using errcode='22023'; end if;
 select * into v_session from private.sandbox_sessions where session_key=p_session_key;
 if found then return jsonb_build_object('session_id',v_session.id,'status',v_session.status,'replayed',true); end if;
 update private.sandbox_sessions set status='closed',closed_at=now() where admin_user_id=v_actor and status='active';
 insert into private.sandbox_sessions(session_key,admin_user_id) values(p_session_key,v_actor) returning * into v_session;
 for v_bot in select generate_series(1,10) n loop
  v_hash:=round((random()*100)::numeric,2);
  insert into private.sandbox_miners(session_id,bot_number,display_name,hashrate) values(v_session.id,v_bot.n,'SANDBOX BOT '||lpad(v_bot.n::text,2,'0'),v_hash);
 end loop;
 insert into private.sandbox_blocks(session_id,block_number) values(v_session.id,1) returning id into v_block;
 insert into private.sandbox_admin_events(actor_user_id,session_id,action,reason,after_data,request_id)
 values(v_actor,v_session.id,'session_started',trim(p_reason),jsonb_build_object('bots_created',10,'hashrate_min',0,'hashrate_max',100,'block_duration_seconds',600),gen_random_uuid());
 return jsonb_build_object('session_id',v_session.id,'status','active','bots_created',10,'first_block_id',v_block,'replayed',false);
end; $$;

create or replace function public.admin_sandbox_snapshot(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_session private.sandbox_sessions%rowtype; v_block private.sandbox_blocks%rowtype;
begin
 v_actor:=private.assert_sandbox_admin();
 select * into v_session from private.sandbox_sessions where id=p_session_id and admin_user_id=v_actor;
 if not found then raise exception 'Sandbox session not found' using errcode='P0002'; end if;
 select * into v_block from private.sandbox_blocks where session_id=p_session_id and status='open' order by block_number desc limit 1;
 return jsonb_build_object('session',to_jsonb(v_session),
  'bots',(select coalesce(jsonb_agg(to_jsonb(b) order by bot_number),'[]'::jsonb) from private.sandbox_miners b where b.session_id=p_session_id),
  'blocks',(select coalesce(jsonb_agg(to_jsonb(x) order by block_number desc),'[]'::jsonb) from (select * from private.sandbox_blocks where session_id=p_session_id order by block_number desc limit 20)x),
  'allocations',(select coalesce(jsonb_agg(jsonb_build_object('block_id',a.block_id,'miner_id',a.miner_id,'display_name',m.display_name,'hashrate',a.hashrate_snapshot,'share',a.share,'pc',a.amount_pc,'mc',a.amount_mc) order by a.created_at desc),'[]'::jsonb) from private.sandbox_allocations a join private.sandbox_miners m on m.id=a.miner_id join private.sandbox_blocks bl on bl.id=a.block_id where bl.session_id=p_session_id),
  'network_hashrate',(select coalesce(sum(hashrate),0) from private.sandbox_miners where session_id=p_session_id and active),
  'open_block',case when v_block.id is null then null else to_jsonb(v_block) end);
end; $$;

create or replace function public.admin_sandbox_set_rewards(p_session_id uuid,p_block_id uuid,p_reward_pc numeric,p_reward_mc numeric,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid; v_before jsonb; v_after jsonb;
begin
 v_actor:=private.assert_sandbox_admin();
 if p_reward_pc is null or p_reward_pc<0 or p_reward_pc<>trunc(p_reward_pc) or p_reward_pc>999999999999999999 or p_reward_mc is null or p_reward_mc<0 or p_reward_mc>99999999999999999999 or length(trim(coalesce(p_reason,'')))<5 or p_request_id is null then raise exception 'Invalid reward parameters' using errcode='22023'; end if;
 select jsonb_build_object('reward_pc',reward_pc,'reward_mc',reward_mc) into v_before from private.sandbox_blocks where id=p_block_id and session_id=p_session_id and status='open' for update;
 if not found then raise exception 'Open sandbox block not found' using errcode='P0002'; end if;
 update private.sandbox_blocks set reward_pc=p_reward_pc,reward_mc=p_reward_mc where id=p_block_id returning jsonb_build_object('reward_pc',reward_pc,'reward_mc',reward_mc) into v_after;
 insert into private.sandbox_admin_events(actor_user_id,session_id,block_id,action,reason,before_data,after_data,request_id) values(v_actor,p_session_id,p_block_id,'reward_changed',trim(p_reason),v_before,v_after,p_request_id);
 return jsonb_build_object('success',true,'before',v_before,'after',v_after);
end; $$;

revoke all on function public.admin_sandbox_start_session(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_sandbox_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.admin_sandbox_set_rewards(uuid,uuid,numeric,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_sandbox_start_session(uuid,text) to authenticated,service_role;
grant execute on function public.admin_sandbox_snapshot(uuid) to authenticated,service_role;
grant execute on function public.admin_sandbox_set_rewards(uuid,uuid,numeric,numeric,text,uuid) to authenticated,service_role;
commit;
