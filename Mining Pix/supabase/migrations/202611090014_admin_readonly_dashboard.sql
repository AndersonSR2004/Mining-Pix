-- Mining Pix Phase 4: read-only administrative overview.
-- Authorization is based exclusively on server-managed app_metadata.admin.
create or replace function public.admin_dashboard_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_app_metadata jsonb := auth.jwt() -> 'app_metadata';
  v_snapshot jsonb;
begin
  if auth.uid() is null
     or coalesce(v_app_metadata ->> 'admin', 'false') <> 'true' then
    raise exception 'Administrative permission required'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'players_count', (select count(*) from public.profiles),
    'wallets_count', (select count(*) from public.wallets),
    'wallet_balance_pc', (select coalesce(sum(balance), 0) from public.wallets),
    'installed_equipment_count', (
      select count(*) from public.player_equipment where status = 'installed'
    ),
    'installed_hashrate', (
      select coalesce(sum(c.hashrate), 0)
      from public.player_equipment pe
      join public.equipment_catalog c on c.sku = pe.catalog_sku
      join public.player_rooms pr on pr.id = pe.room_id and pr.user_id = pe.user_id
      where pe.status = 'installed' and pr.active = true
    ),
    'pool_open_cycles', (
      select count(*) from public.pool_cycles where status = 'open'
    ),
    'pool_settled_cycles', (
      select count(*) from public.pool_cycles where status = 'settled'
    ),
    'pool_distributed_pc', (
      select coalesce(sum(amount_pc), 0) from public.pool_allocations
    ),
    'latest_transactions', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select
          wt.id,
          wt.user_id,
          coalesce(p.display_name, 'Jogador') as display_name,
          wt.amount,
          wt.balance_after,
          wt.transaction_type,
          wt.description,
          wt.created_at
        from public.wallet_transactions wt
        left join public.profiles p on p.user_id = wt.user_id
        order by wt.created_at desc
        limit 20
      ) recent
    ), '[]'::jsonb),
    'recent_players', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
      from (
        select user_id, display_name, created_at
        from public.profiles
        order by created_at desc
        limit 10
      ) recent
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function public.admin_dashboard_snapshot() from public, anon;
grant execute on function public.admin_dashboard_snapshot() to authenticated;
