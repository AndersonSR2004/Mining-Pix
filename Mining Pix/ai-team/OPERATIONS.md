# AI Operations — Shift Roster and Activation

## Purpose

The Mining Pix AI Team runs one specialist shift every four hours. Six specialists rotate through a 24-hour cycle; each specialist is scheduled once per day and has approximately 20 hours between shifts.

This is scheduled execution, not continuous background thinking. Each run performs repository tests/build and then, if configured, one model-assisted read-only specialist review.

## Shift roster

GitHub Actions cron is defined in UTC. Recife uses America/Recife (UTC−3).

| UTC | Recife time | Specialist | Focus |
|---|---:|---|---|
| 00:00 | 21:00 (previous day) | Architect | Architecture and product |
| 04:00 | 01:00 | Developer | Engineering |
| 08:00 | 05:00 | Security | Security and access control |
| 12:00 | 09:00 | Finance | Financial intelligence |
| 16:00 | 13:00 | Game Economy | Progression and economic balance |
| 20:00 | 17:00 | QA | Quality and release readiness |

The workflow selects the specialist based on the UTC hour. GitHub scheduled events may be delayed during high platform load.

## Activation requirements

1. The workflow file must exist on the repository's default branch. GitHub does not start scheduled workflows from an unmerged feature branch.
2. The repository must have Actions enabled.
3. The workflow requires no write permissions and does not change repository files.
4. The workflow always runs `npm ci`, `npm test`, and `npm run build` before preparing the specialist report.
5. To enable model-assisted analysis, add a provider API key as the GitHub Actions repository secret `GEMINI_API_KEY`. Without it, the shift still runs tests/build and publishes a report explicitly stating that AI analysis was skipped.
6. Provider API usage is billed separately from a ChatGPT subscription. Do not add a key until its pricing and budget have been reviewed.

## Safety boundaries

- Read-only repository access (`contents: read`).
- No Supabase service-role key, database connection, live player data, payment provider, or production access.
- No wallet or ledger writes, PC/MC issuance, conversions, withdrawals, or payments.
- No automatic code edits, branches, issues, pull requests, merges, or deployments.
- Reports are uploaded as workflow artifacts for 30 days.
- All findings are proposals for human review; static/model analysis is not a formal security, financial, legal, or accounting audit.

## Future expansion

Only after the first scheduled runs are validated:
- Add explicit GitHub security and dependency signals to specialist reports.
- Add a daily coordinator digest that summarizes the six shift artifacts.
- Consider a separately budgeted provider integration for deeper analysis.
- Add Supabase read-only metrics only through a dedicated least-privilege view/RPC and a narrowly scoped secret, after separate approval.
