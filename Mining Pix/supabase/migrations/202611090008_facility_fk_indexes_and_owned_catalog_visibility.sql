create index if not exists player_equipment_room_owner_idx on public.player_equipment(room_id,user_id);
create index if not exists player_equipment_operations_equipment_owner_idx on public.player_equipment_operations(equipment_id,user_id);
create index if not exists player_equipment_operations_room_owner_idx on public.player_equipment_operations(room_id,user_id);

drop policy if exists "Authenticated users can view active equipment" on public.equipment_catalog;
create policy "Authenticated users can view active or owned equipment"
on public.equipment_catalog for select to authenticated
using (
 active=true or exists (
  select 1 from public.player_equipment pe
  where pe.catalog_sku=equipment_catalog.sku and pe.user_id=(select auth.uid())
 )
);
