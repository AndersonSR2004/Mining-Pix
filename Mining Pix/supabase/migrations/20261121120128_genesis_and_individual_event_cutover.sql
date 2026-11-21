-- Retire pilot Genesis mutations while approved seasonal rewards are configured.
-- Existing orders, unlocks, and claims remain readable and unchanged.
create or replace function public.genesis_pass_action(
  p_request uuid, p_pass uuid, p_action text,
  p_level integer default null, p_expected_price text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  viewer uuid := depix_sandbox.require_player();
  previous_order depix_sandbox.pass_orders%rowtype;
begin
  if p_request is null or p_pass is null or p_action is null then
    raise exception 'Solicitação inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(viewer::text || ':genesis-pass', 0));
  select * into previous_order from depix_sandbox.pass_orders where request_id = p_request;
  if found then
    if previous_order.player_id is distinct from viewer
      or previous_order.pass_id is distinct from p_pass
      or previous_order.action is distinct from p_action
      or (p_expected_price::numeric * 100000000) is distinct from previous_order.amount::numeric then
      raise exception 'Identificador em uso com outros dados.' using errcode = '22023';
    end if;
    return false;
  end if;

  if p_action = 'claim' and exists (
    select 1 from depix_sandbox.pass_claims
    where pass_id = p_pass and player_id = viewer and level = p_level
  ) then
    return false;
  end if;

  raise exception 'Compras e novos resgates do Genesis aguardam a nova temporada.'
    using errcode = '55000';
end;
$$;

-- Keep the existing spend calculation for active sandbox progression events.
-- Return only the authenticated player's points.
create or replace function public.get_event_shop_progress(p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  viewer uuid := depix_sandbox.require_player();
  event public.game_events%rowtype;
  points numeric;
begin
  select * into event from public.game_events
  where id = p_event and event_type = 'event' and status = 'live'
    and starts_at <= now() and ends_at > now()
    and payload->>'mechanic' = 'progression';
  if not found then
    raise exception 'Evento indisponível.' using errcode = 'P0002';
  end if;

  with verified as (
    select j.amount from depix_sandbox.purchases p
    join depix_sandbox.prices s on s.product = p.product and s.category in ('equipment', 'room')
    join depix_sandbox.journal j on j.id = p.request_id and j.kind = 'purchase' and j.user_id = p.user_id
    where p.user_id = viewer and j.created_at >= event.starts_at and j.created_at < event.ends_at
    union all
    select j.amount from depix_sandbox.royalty_receipts r
    join depix_sandbox.journal j on j.id = r.id and j.kind = 'purchase' and j.user_id = r.user_id
    where r.user_id = viewer and r.family = 'rack'
      and j.created_at >= event.starts_at and j.created_at < event.ends_at
  )
  select coalesce(div(sum(amount), 100000), 0) into points from verified;
  -- Keep the empty field for already loaded clients during deployment.
  return jsonb_build_object('points', points::text, 'ranking', '[]'::jsonb);
end;
$$;
