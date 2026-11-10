-- Mining Pix — Fase 1 / migration 0001
-- Identity foundation: profiles, wallets and player progress.
-- Apply only to the isolated Supabase DEV project.

begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Minerador'
    check (char_length(display_name) between 1 and 32),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(20,0) not null default 0 check (balance >= 0),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  vip_tier smallint not null default 0 check (vip_tier between 0 and 3),
  premium_pass boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.player_progress enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own"
  on public.wallets for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "progress_select_own" on public.player_progress;
create policy "progress_select_own"
  on public.player_progress for select to authenticated
  using ((select auth.uid()) = user_id);

-- Revoke broad table privileges, then grant only the minimum required.
revoke all on public.profiles from anon, authenticated;
revoke all on public.wallets from anon, authenticated;
revoke all on public.player_progress from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant select on public.wallets to authenticated;
grant select on public.player_progress to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_display_name text;
begin
  safe_display_name := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 32), '');
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(safe_display_name, 'Minerador'))
  on conflict (user_id) do nothing;

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.player_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- The trigger can invoke this function, but API clients cannot call it as RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
