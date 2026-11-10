-- Daily free cosmetic boxes only. No paid openings or economic rewards.
create table if not exists public.cosmetic_catalog (
 id text primary key, name text not null, description text not null,
 rarity text not null check (rarity in ('comum','incomum','raro')),
 drop_weight integer not null check (drop_weight > 0), active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.player_cosmetic_inventory (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 cosmetic_id text not null references public.cosmetic_catalog(id),
 source text not null check (source = 'daily_free_box'), acquired_at timestamptz not null default now()
);
create index if not exists player_cosmetic_inventory_user_acquired_idx on public.player_cosmetic_inventory(user_id, acquired_at desc);
create table if not exists public.daily_free_box_claims (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 claim_date date not null, cosmetic_inventory_id uuid not null references public.player_cosmetic_inventory(id),
 created_at timestamptz not null default now(), unique(user_id, claim_date), unique(cosmetic_inventory_id)
);
insert into public.cosmetic_catalog(id,name,description,rarity,drop_weight) values
('neon-frame','Moldura Neon','Moldura visual para o perfil do minerador.','comum',40),
('pixel-drone','Drone Pixel','Companheiro visual decorativo.','comum',30),
('aurora-banner','Banner Aurora','Banner decorativo para o perfil.','incomum',15),
('golden-badge','Insígnia Dourada','Insígnia visual de coleção.','incomum',10),
('founder-emblem','Emblema Fundador','Emblema cosmético de coleção.','raro',5)
on conflict(id) do update set name=excluded.name,description=excluded.description,rarity=excluded.rarity,drop_weight=excluded.drop_weight,active=true;
alter table public.cosmetic_catalog enable row level security;
alter table public.player_cosmetic_inventory enable row level security;
alter table public.daily_free_box_claims enable row level security;
drop policy if exists "Authenticated players can read active cosmetics" on public.cosmetic_catalog;
create policy "Authenticated players can read active cosmetics" on public.cosmetic_catalog for select to authenticated using(active=true);
drop policy if exists "Players can read their own cosmetic inventory" on public.player_cosmetic_inventory;
create policy "Players can read their own cosmetic inventory" on public.player_cosmetic_inventory for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "Players can read their own daily box claims" on public.daily_free_box_claims;
create policy "Players can read their own daily box claims" on public.daily_free_box_claims for select to authenticated using((select auth.uid())=user_id);
revoke all on public.cosmetic_catalog from anon,authenticated; grant select on public.cosmetic_catalog to authenticated;
revoke all on public.player_cosmetic_inventory from anon,authenticated; grant select on public.player_cosmetic_inventory to authenticated;
revoke all on public.daily_free_box_claims from anon,authenticated; grant select on public.daily_free_box_claims to authenticated;
create or replace function public.claim_daily_free_box() returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_user_id uuid:=auth.uid(); v_claim_date date:=(now() at time zone 'utc')::date;
 v_existing record; v_cosmetic record; v_inventory_id uuid; v_total_weight integer; v_roll integer;
begin
 if v_user_id is null then raise exception 'Autenticação necessária.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text,0));
 select c.id,c.name,c.description,c.rarity,p.acquired_at into v_existing
 from public.daily_free_box_claims b join public.player_cosmetic_inventory p on p.id=b.cosmetic_inventory_id
 join public.cosmetic_catalog c on c.id=p.cosmetic_id where b.user_id=v_user_id and b.claim_date=v_claim_date;
 if found then return jsonb_build_object('claimed',false,'already_claimed',true,'claim_date',v_claim_date,
 'reward',jsonb_build_object('id',v_existing.id,'name',v_existing.name,'description',v_existing.description,'rarity',v_existing.rarity),'acquired_at',v_existing.acquired_at); end if;
 select coalesce(sum(drop_weight),0)::integer into v_total_weight from public.cosmetic_catalog where active=true;
 if v_total_weight<=0 then raise exception 'Nenhuma recompensa cosmética disponível.'; end if;
 v_roll:=1+floor(pg_catalog.random()*v_total_weight)::integer;
 select id,name,description,rarity into v_cosmetic from (
 select id,name,description,rarity,drop_weight,sum(drop_weight) over(order by id) cumulative_weight
 from public.cosmetic_catalog where active=true) weighted where cumulative_weight>=v_roll order by cumulative_weight limit 1;
 insert into public.player_cosmetic_inventory(user_id,cosmetic_id,source) values(v_user_id,v_cosmetic.id,'daily_free_box') returning id into v_inventory_id;
 insert into public.daily_free_box_claims(user_id,claim_date,cosmetic_inventory_id) values(v_user_id,v_claim_date,v_inventory_id);
 return jsonb_build_object('claimed',true,'already_claimed',false,'claim_date',v_claim_date,
 'reward',jsonb_build_object('id',v_cosmetic.id,'name',v_cosmetic.name,'description',v_cosmetic.description,'rarity',v_cosmetic.rarity),
 'next_claim_at',((v_claim_date+1)::timestamp at time zone 'utc'));
end; $$;
revoke all on function public.claim_daily_free_box() from public,anon;
grant execute on function public.claim_daily_free_box() to authenticated;
