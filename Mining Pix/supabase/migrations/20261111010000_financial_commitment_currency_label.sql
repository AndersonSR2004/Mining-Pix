begin;
alter table private.financial_commitments
  drop constraint financial_commitments_commitment_type_check;
alter table private.financial_commitments
  add constraint financial_commitments_commitment_type_check
  check (commitment_type in ('operational','contractor','tax','player_reward_mc','other'));
alter table private.financial_commitments
  drop constraint financial_commitments_check;
alter table private.financial_commitments
  add constraint financial_commitments_amount_unit_check check (
    (commitment_type = 'player_reward_mc' and amount_mc is not null and amount_mc > 0 and amount_cents is null)
    or (commitment_type <> 'player_reward_mc' and amount_cents is not null and amount_cents > 0 and amount_mc is null)
  );
commit;