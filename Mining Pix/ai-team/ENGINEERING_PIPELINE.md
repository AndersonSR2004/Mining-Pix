# Mining Pix — Intelligence and Engineering Operations

## Purpose

This document defines the separation between recurring specialist diagnostics and controlled engineering automation.

## Intelligence layer

The existing \`.github/workflows/ai-team-shifts.yml\` runs one of six specialist roles every two hours and stores a report artifact. Its current workflow validates specialist configuration and creates a repository snapshot. Model-generated analysis is conditional on an explicitly configured external provider key and repository variable; when those are absent, the report must say that AI analysis was skipped.

A successful workflow run is not proof that an LLM reviewed the code. No paid model provider is enabled by this change.

## Engineering layer

The manual workflow \`.github/workflows/ai-engineering-pipeline.yml\` provides two operations:

- \`validate\`: installs locked dependencies and runs Oxlint, the TypeScript/Vite build, and Node tests when \`tests/*.test.mjs\` files are present.
- \`prepare_safe_fixes\`: explicitly opts into Oxlint safe autofixes limited to \`Mining Pix/src\`, then reruns the checks. If all configured blocking checks pass and a diff exists, the workflow opens or updates a pull request.

The engineering workflow:
- Checks out \`codex/mining-pix-work\`, not \`main\`.
- Targets pull requests to \`codex/mining-pix-work\`.
- Never merges a pull request.
- Does not deploy, write to Supabase, access player data, or perform wallet, PC, MC, pool, conversion, withdrawal, or payment operations.
- Does not generate arbitrary code or claim to be an LLM coding agent.
- Requires a human to inspect and approve every proposed change.

## Operating procedure

1. Open GitHub Actions and select **Mining Pix — Engineering Pipeline**.
2. Run \`validate\` first to obtain a diagnostic report.
3. Only when a safe lint cleanup is desired, manually run \`prepare_safe_fixes\`.
4. Inspect the artifact and any resulting PR diff.
5. Reject or revise unsafe/unnecessary changes. Merge only after explicit owner approval.

## Cost and limits

- No external AI API or paid model is used by this engineering workflow.
- GitHub Actions usage remains subject to the repository/account's GitHub plan limits.
- Oxlint autofix is deterministic tooling, not AI reasoning. It is intentionally restricted to safe lint fixes in the application source directory.
- The recurring specialist workflow remains read-only. The engineering workflow is separate and manually triggered.
