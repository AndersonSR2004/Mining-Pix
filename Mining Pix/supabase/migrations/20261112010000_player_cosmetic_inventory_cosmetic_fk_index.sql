-- Support lookups and referential checks on the cosmetic catalog foreign key.
-- Safe additive index; existing player inventory rows and balances are untouched.
create index if not exists player_cosmetic_inventory_cosmetic_id_idx
  on public.player_cosmetic_inventory (cosmetic_id);
