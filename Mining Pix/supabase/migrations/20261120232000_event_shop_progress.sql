-- Score only settled, server-authored store receipts. Passes, VIP,
-- wallet funding, and unverified browser game results do not enter this score.
create function public.get_event_shop_progress(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  viewer uuid := depix_sandbox.require_player();
  event public.game_events%rowtype;
  result jsonb;
begin
  select * into event from public.game_events
  where id=p_event and event_type='event' and status='live' and starts_at<=now() and ends_at>now()
    and payload->>'mechanic'='progression';
  if not found then raise exception 'Evento indisponível.' using errcode='P0002'; end if;
  with verified as (
    select p.user_id,j.amount from depix_sandbox.purchases p
    join depix_sandbox.prices s on s.product=p.product and s.category in ('equipment','room')
    join depix_sandbox.journal j on j.id=p.request_id and j.kind='purchase' and j.user_id=p.user_id
    where j.created_at>=event.starts_at and j.created_at<event.ends_at
    union all
    select r.user_id,j.amount from depix_sandbox.royalty_receipts r
    join depix_sandbox.journal j on j.id=r.id and j.kind='purchase' and j.user_id=r.user_id
    where r.family='rack' and j.created_at>=event.starts_at and j.created_at<event.ends_at
  ), scores as (
    select user_id,div(sum(amount),100000) points from verified group by user_id
  ), board as (
    select s.*,dense_rank() over(order by s.points desc) position,coalesce(nullif(p.display_name,''),'Jogador') name
    from scores s join public.profiles p on p.user_id=s.user_id where s.points>0
  )
  select jsonb_build_object('points',coalesce((select points from scores where user_id=viewer),0)::text,
    'ranking',coalesce((select jsonb_agg(jsonb_build_object('position',position,'name',name,'points',points::text,'is_you',user_id=viewer)
      order by position,user_id) from (select * from board order by position,user_id limit 25) top_players),'[]'))
  into result;
  return result;
end;
$$;
revoke all on function public.get_event_shop_progress(uuid) from public,anon,authenticated;
grant execute on function public.get_event_shop_progress(uuid) to authenticated;
