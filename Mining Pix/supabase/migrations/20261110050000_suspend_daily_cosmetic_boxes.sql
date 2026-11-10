-- Suspend the superseded daily cosmetic Lucky Box in DEV.
-- Preserve catalog, inventory, and claim history for auditability.
update public.cosmetic_catalog set active = false where id in
 ('neon-frame','pixel-drone','aurora-banner','golden-badge','founder-emblem');

create or replace function public.claim_daily_free_box()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'A Lucky Box cosmética diária está temporariamente suspensa.';
end;
$$;

revoke all on function public.claim_daily_free_box() from public, anon, authenticated;
