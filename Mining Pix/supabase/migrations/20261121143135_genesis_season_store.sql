alter table depix_sandbox.catalog_seasons
  drop constraint catalog_seasons_check,
  add constraint catalog_seasons_duration_check
    check (ends_at in (starts_at + interval '720 hours', starts_at + interval '1008 hours'));

alter table depix_sandbox.season_equipment
  add column monthly_stock integer check (monthly_stock > 0);

create table depix_sandbox.season_monthly_sales (
  sku text not null references depix_sandbox.season_equipment(sku),
  month_utc date not null,
  sold integer not null check (sold > 0),
  primary key (sku, month_utc)
);
alter table depix_sandbox.season_monthly_sales enable row level security;
revoke all on depix_sandbox.season_monthly_sales from public, anon, authenticated, service_role;

create function depix_sandbox.reserve_season_monthly_stock()
returns trigger language plpgsql set search_path = '' as $$
declare
  limit_month integer;
  purchase_month date := date_trunc('month', new.created_at at time zone 'UTC')::date;
begin
  select monthly_stock into limit_month from depix_sandbox.season_equipment where sku = new.product for share;
  if limit_month is null then return new; end if;

  insert into depix_sandbox.season_monthly_sales as sales(sku, month_utc, sold)
  values (new.product, purchase_month, 1)
  on conflict (sku, month_utc) do update set sold = sales.sold + 1
    where sales.sold < limit_month;
  if not found then
    raise exception 'Estoque mensal esgotado.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function depix_sandbox.reserve_season_monthly_stock() from public, anon, authenticated, service_role;
create trigger reserve_season_monthly_stock before insert on depix_sandbox.purchases
  for each row execute function depix_sandbox.reserve_season_monthly_stock();

create function public.admin_schedule_genesis_season(p_start timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := depix_sandbox.require_admin();
  season uuid;
  existing_start timestamptz;
  ending timestamptz;
  item record;
begin
  if p_start is null or not isfinite(p_start) then
    raise exception 'Data inicial inválida.' using errcode = '22023';
  end if;
  ending := p_start + interval '1008 hours';
  perform pg_advisory_xact_lock(hashtextextended('mining-pix-catalog-season', 0));
  select s.id, s.starts_at into season, existing_start from depix_sandbox.catalog_seasons s
    join depix_sandbox.season_equipment e on e.season_id = s.id where e.sku = 'genesis-s1-i';
  if found then
    if existing_start = p_start then return season; end if;
    raise exception 'A Temporada 1 GENESIS já está cadastrada.' using errcode = '22023';
  end if;

  if ending <= statement_timestamp() then
    raise exception 'A temporada deve ter uma data de encerramento futura.' using errcode = '22023';
  end if;
  if exists (
    select 1 from depix_sandbox.catalog_seasons s
    where s.starts_at < ending and least(s.ends_at, coalesce(s.closed_at, s.ends_at)) > p_start
      and (s.closed_at is null or s.closed_at > s.starts_at)
  ) then
    raise exception 'Já existe uma temporada neste período.' using errcode = '22023';
  end if;

  insert into depix_sandbox.catalog_seasons(title, starts_at, ends_at, created_by)
  values ('GENESIS — Temporada 1', p_start, ending, actor) returning id into season;
  for item in select * from (values
    (1,'genesis-s1-i','GENESIS I',1000,99000000,1000),
    (2,'genesis-s1-ii','GENESIS II',5000,499000000,500),
    (3,'genesis-s1-iii','GENESIS III',10000,1099000000,100)
  ) machines(tier,sku,name,hash,price,stock) loop
    insert into public.equipment_catalog(sku,name,equipment_type,hashrate,price_pc,active,display_order,tier)
    values (item.sku,item.name,'Máquina de temporada',item.hash,1,false,item.tier,item.tier);
    insert into depix_sandbox.prices(product,category,label,amount)
    values (item.sku,'equipment',item.name,item.price);
    insert into depix_sandbox.season_equipment(season_id,sku,tier,monthly_stock)
    values (season,item.sku,item.tier,item.stock);
  end loop;
  return season;
end;
$$;
revoke all on function public.admin_schedule_genesis_season(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_schedule_genesis_season(timestamptz) to authenticated;
