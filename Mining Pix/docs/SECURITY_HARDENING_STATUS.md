# Mining Pix — Security Hardening Status

## Completed in DEV

- Added indexes covering four previously unindexed foreign-key access paths:
  - private.financial_admin_events(actor_user_id, created_at DESC)
  - private.financial_commitment_events(actor_user_id, created_at DESC)
  - private.financial_expense_month_closings(closed_by, month_start DESC)
  - private.operational_expense_entries(created_by, expense_date DESC)
- Applied as additive migration `20261111170000_financial_admin_foreign_key_indexes.sql`.
- Migration is versioned in the feature branch.
- No financial rows, player balances, MC issuance, Pool cycles or payout state were modified.

## Pending platform-level actions

### GitHub branch protection

The connected GitHub integration can inspect repository metadata but does not expose a write operation for branch protection/rulesets. The repository currently reports no rulesets. Configure protection for `main` in GitHub repository Settings:
- Require pull requests before merging.
- Require CI, Dependency Audit and CodeQL checks.
- Require conversation resolution.
- Block force pushes and branch deletion.
- Restrict direct pushes where practical.

Do not merge PR #1 until the required checks pass and the changes are reviewed.

### Supabase Auth password protection

The project is on the Free plan. Supabase documentation states leaked-password protection is available on Pro and above. This cannot be enabled by a SQL migration. Reassess after a plan upgrade; meanwhile keep strong minimum password requirements where supported and encourage MFA for administrators.

### Follow-up verification

- Re-run Supabase advisors after normal workload; newly added indexes may initially appear unused.
- Review SECURITY DEFINER functions and grants whenever a new RPC is added.
- Keep private schemas inaccessible to client roles.
- Review Edge Function origins, methods, payload size, JWT and role validation.
- Treat client-reported gameplay telemetry as analytics only, never as authoritative reward evidence.
