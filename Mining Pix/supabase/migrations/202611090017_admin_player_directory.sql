-- Mining Pix Phase 7A: admin-only, read-only paginated player directory.
create or replace function public.admin_player_directory(
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_limit integer := coalesce(p_limit, 25);
  v_offset integer := coalesce(p_offset, 0);
  v_total bigint;
  v_players jsonb;
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'admin', 'false') <> 'true' then
    raise exception 'Administrative permission required'
      using errcode = '42501';
  end if;

  if length(v_search) > 80 or v_limit < 1 or v_limit > 50 or v_offset < 0 or v_offset > 100000 then
    raise exception 'Invalid directory pagination or search parameters'
      using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.profiles p
  where v_search = ''
     or strpos(lower(p.display_name), lower(v_search)) > 0
     or left(p.user_id::text, length(v_search)) = lower(v_search);

  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.user_id), '[]'::jsonb)
    into v_players
  from (
    select
      p.user_id,
      p.display_name,
      p.created_at,
      coalesce(w.balance, 0) as wallet_balance_pc,
      coalesce(pp.level, 1) as level,
      coalesce(pp.xp, 0) as xp,
      coalesce(pp.vip_tier, 0) as vip_tier,
      coalesce(pp.premium_pass, false) as premium_pass,
      coalesce(eq.equipment_count, 0) as installed_equipment_count,
      coalesce(eq.hashrate, 0) as installed_hashrate
    from public.profiles p
    left join public.wallets w on w.user_id = p.user_id
    left join public.player_progress pp on pp.user_id = p.user_id
    left join lateral (
      select count(*) as equipment_count, coalesce(sum(c.hashrate), 0) as hashrate
      from public.player_equipment pe
      join public.equipment_catalog c on c.sku = pe.catalog_sku
      join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
      where pe.user_id = p.user_id
        and pe.status = 'installed'
        and pr.active = true
    ) eq on true
    where v_search = ''
       or strpos(lower(p.display_name), lower(v_search)) > 0
       or left(p.user_id::text, length(v_search)) = lower(v_search)
    order by p.created_at desc, p.user_id
    limit v_limit offset v_offset
  ) page_row;

  return jsonb_build_object(
    'generated_at', now(),
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'players', v_players
  );
end;
$$;

revoke all on function public.admin_player_directory(text, integer, integer) from public, anon;
grant execute on function public.admin_player_directory(text, integer, integer) to authenticated;

comment on function public.admin_player_directory(text, integer, integer) is
  'Admin-only read-only paginated player directory. Exposes operational profile and game summary fields, never email, credentials, or auth metadata.';
