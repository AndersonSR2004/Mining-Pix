create or replace function public.finish_player_game_attempt(p_attempt_id uuid,p_won boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user_id uuid:=auth.uid(); v_attempt public.player_game_attempts%rowtype; v_hash numeric(10,2):=0; v_active_hash numeric(10,2):=0; v_expires_at timestamptz; v_today_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; v_daily_used integer;
begin
 if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='28000'; end if;
 if p_attempt_id is null or p_won is null then raise exception 'Resultado inválido.' using errcode='22023'; end if;
 select * into v_attempt from public.player_game_attempts where id=p_attempt_id and user_id=v_user_id for update;
 if not found then raise exception 'Partida não encontrada.' using errcode='P0002'; end if;
 if v_attempt.finished_at is not null then
  select active_hashrate,expires_at into v_active_hash,v_expires_at from public.player_game_hash_boosts where user_id=v_user_id;
  select count(*) into v_daily_used from public.player_game_attempts where user_id=v_user_id and game_id=v_attempt.game_id and started_at>=v_today_start;
  return jsonb_build_object('replayed',true,'won',v_attempt.won,'pc_awarded',v_attempt.pc_awarded,'hash_awarded',v_attempt.hash_awarded,'active_hashrate',case when v_expires_at>now() then v_active_hash else 0 end,'expires_at',v_expires_at,'daily_used',v_daily_used,'daily_remaining',greatest(0,30-v_daily_used));
 end if;
 if v_attempt.started_at<now()-interval '2 minutes' then raise exception 'A partida expirou. Inicie uma nova partida.' using errcode='P0001'; end if;
 if p_won and now()-v_attempt.started_at<interval '1 second' then raise exception 'Resultado de vitória recebido cedo demais.' using errcode='22023'; end if;
 select active_hashrate,expires_at into v_active_hash,v_expires_at from public.player_game_hash_boosts where user_id=v_user_id for update;
 if p_won then
  v_hash:=1;
  if v_expires_at is null or v_expires_at<=now() then v_active_hash:=0; end if;
  v_active_hash:=v_active_hash+1; v_expires_at:=now()+interval '24 hours';
  insert into public.player_game_hash_boosts(user_id,active_hashrate,expires_at,updated_at) values(v_user_id,v_active_hash,v_expires_at,now()) on conflict(user_id) do update set active_hashrate=excluded.active_hashrate,expires_at=excluded.expires_at,updated_at=now();
 elsif v_active_hash>0 and v_expires_at>now() then
  update public.player_game_hash_boosts set expires_at=now()+interval '24 hours',updated_at=now() where user_id=v_user_id; v_expires_at:=now()+interval '24 hours';
 end if;
 update public.player_game_attempts set finished_at=now(),won=p_won,pc_awarded=0,hash_awarded=v_hash where id=p_attempt_id and user_id=v_user_id;
 select count(*) into v_daily_used from public.player_game_attempts where user_id=v_user_id and game_id=v_attempt.game_id and started_at>=v_today_start;
 return jsonb_build_object('replayed',false,'won',p_won,'pc_awarded',0,'hash_awarded',v_hash,'active_hashrate',case when v_expires_at>now() then v_active_hash else 0 end,'expires_at',v_expires_at,'daily_used',v_daily_used,'daily_remaining',greatest(0,30-v_daily_used));
end; $$;
revoke all on function public.finish_player_game_attempt(uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_player_game_attempt(uuid,boolean) to authenticated,service_role;
comment on function public.finish_player_game_attempt(uuid,boolean) is 'Game victories grant temporary HASH only. PIX COIN is purchase-only and is never issued by gameplay.';
