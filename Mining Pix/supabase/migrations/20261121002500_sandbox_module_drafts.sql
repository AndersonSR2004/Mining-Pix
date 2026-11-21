-- Configuration proposals only. No player RPC, RNG, or item transfer is
-- enabled by writing these drafts.
create table depix_sandbox.module_drafts (
  module text not null check (module in ('events','lucky_boxes','forge','marketplace')),
  revision bigint generated always as identity,
  settings jsonb not null check (jsonb_typeof(settings)='object' and octet_length(settings::text)<=64000),
  authored_by uuid references auth.users,
  authored_at timestamptz not null default clock_timestamp(),
  primary key (module,revision)
);
alter table depix_sandbox.module_drafts enable row level security;
revoke all on depix_sandbox.module_drafts from public,anon,authenticated,service_role;
insert into depix_sandbox.module_drafts(module,settings) values
('events','{"finished_game_milestones":[10,50,100],"sandbox_purchase_milestones":[1,5,10],"shop_points_per_depix":1000,"deposit_multipliers":null,"puzzle":null}'),
('lucky_boxes','{"boxes":[{"tier":1,"price":"0.99","test_return_percent":80},{"tier":2,"price":"2.99","test_return_percent":80},{"tier":3,"price":"4.99","test_return_percent":85}],"probabilities":null,"rewards":null}'),
('forge','{"recipes":null,"upgrades":null}'),
('marketplace','{"fees":null,"eligibility":null}');

create function public.admin_sandbox_module_draft(p_module text,p_expected_revision bigint default null,p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := depix_sandbox.require_admin(); draft depix_sandbox.module_drafts%rowtype;
begin
  if p_module is null or p_module not in ('events','lucky_boxes','forge','marketplace') then
    raise exception 'Módulo desconhecido.' using errcode='22023';
  end if;
  if p_settings is not null then perform pg_advisory_xact_lock(hashtextextended('sandbox-module:' || p_module,0)); end if;
  select * into strict draft from depix_sandbox.module_drafts where module=p_module order by revision desc limit 1;
  if p_settings is not null then
    if p_expected_revision is distinct from draft.revision then
      raise exception 'O rascunho mudou. Atualize antes de salvar.' using errcode='22023';
    end if;
    insert into depix_sandbox.module_drafts(module,settings,authored_by)
    values (p_module,p_settings,actor) returning * into draft;
  end if;
  return to_jsonb(draft);
end;
$$;
revoke all on function public.admin_sandbox_module_draft(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.admin_sandbox_module_draft(text,bigint,jsonb) to authenticated;
