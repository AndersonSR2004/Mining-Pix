drop function public.get_player_room_summaries();
create function public.get_player_room_summaries()
returns table(id uuid,room_number smallint,name text,installed_count bigint,total_hashrate numeric,capacity integer)
language sql stable security invoker set search_path='' as $$
 select pr.id,pr.room_number,pr.name,count(pe.id),coalesce(sum(ec.hashrate),0)::numeric,10
 from public.player_rooms pr
 left join public.player_equipment pe on pe.user_id=pr.user_id and pe.room_id=pr.id and pe.status='installed'
 left join public.equipment_catalog ec on ec.sku=pe.catalog_sku
 where pr.user_id=(select auth.uid()) and pr.active=true
 group by pr.id,pr.room_number,pr.name
 order by pr.room_number;
$$;
revoke all on function public.get_player_room_summaries() from public,anon;
grant execute on function public.get_player_room_summaries() to authenticated;
