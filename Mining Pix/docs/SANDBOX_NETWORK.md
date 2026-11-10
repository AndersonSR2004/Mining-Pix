# Sandbox Network and Administrative Power Tools

## Scope and environment

This feature is deployed only to the Supabase DEV project and the `codex/mining-pix-work` preview branch. It is not a production release. All synthetic miner balances and payouts are stored in the private `private.sandbox_*` tables and never write to real player wallets or the official Mining Pool ledgers.

## Sandbox sessions

Opening the Admin Center creates a fresh sandbox session for the authenticated administrator. Each session generates exactly 10 synthetic miners with independently randomized HASH from 0.00 to 100.00 H/s. The previous active sandbox session belonging to that administrator is closed. Each session begins with block #1.

## PIX BLOCK test cadence

Sandbox blocks use a fixed 600-second interval. While the Admin Center is open, the control panel refreshes its clock and state and automatically settles the block at the end of the 600 seconds. An administrator may accelerate a block with a reason of at least 10 characters. The next block is opened automatically using the same reward budget.

Sandbox PC and MC rewards are configured per open block. The settlement routine allocates rewards proportional to each bot's HASH and assigns rounding residuals to the highest-HASH bot so the full configured PC and MC budgets are distributed exactly. A block can only settle once.

## Synthetic balances

Each bot has its own sandbox PC and MC balances and cumulative earnings. These are test-only balances and are not redeemable, transferable, or visible as player wallet balances.

## Administrative controls

Sandbox default reward budget for a new block is 100 PC and 1 MC; these are test defaults only, editable per open block, and not a proposed production reward rate.

- PC balance adjustment for real DEV player wallets is ledger-backed, idempotent, rejects negative resulting balances, and requires a reason.
- Artificial machine grants create inventory items without charging PC. They are marked `admin_granted=true` and audited.
- Administrative PC credits/debits affect real DEV player balances only, create a ledger transaction, require a reason, and reject negative resulting balances. Machine grants are added to the player's inventory, not auto-installed.
- Real MINING COIN issuance remains restricted to the official Mining Pool policy. The admin console does not bypass the existing MC issuance lock. Sandbox bots can earn simulated MC independently.
- Sandbox reward edits and accelerated settlements are audited with before/after values, actor, reason, and request identifier.

## Important boundaries

- The official PIX BLOCK settlement guard now enforces a minimum of 600 seconds. This changes the timing rule but does not activate MC payouts or create a scheduler that opens and settles official blocks automatically.
- The official Mining Pool now accepts settlement after 600 seconds, but block opening/settlement still requires the existing trusted pool-operator process. An automated operator/scheduler is a separate dependency. The official MC distribution lock remains enabled until the funding and conversion policy is approved.
- No sandbox PC/MC balances are written to `wallets`, `wallet_transactions`, `mining_coin_wallets`, or `mining_coin_transactions`.
- No service-role key is exposed to the browser.
