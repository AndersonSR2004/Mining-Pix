# Mining Pix — Economy, Liquidity and Gameplay Policy (Draft)

Status: design baseline only. No withdrawal, cash conversion, prize cash value, or automatic monetary distribution is authorized by this document.

## Product objective

Build a sustainable game economy that rewards participation without creating uncontrolled currency inflation, protects the project's solvency, and gives players clear, predictable and fair expectations about any future eligible withdrawal process.

The design should encourage voluntary, healthy liquidity retention through useful in-game progression and transparent value exchange—not through hidden fees, arbitrary lockups, misleading earnings claims, or obstructive withdrawal friction.

## Existing approved boundaries

- PIX COIN (PC) is purchased and consumed inside the game; it is not withdrawable.
- MINING COIN (MC) is a distinct reward ledger intended to be funded initially only by the Mining Pool.
- No PC-to-MC conversion.
- Lucky Boxes do not award PC, MC, cash, or withdrawable prizes.
- Missions, events, tournaments and advertisements do not issue MC in the initial model.
- The Mining Pool is daily and proportionate to eligible HASH-hours, subject to the approved accounting and safety rules.
- No withdrawals, redemption, or cash valuation are active.
- A 30% pool allocation is based on eligible net revenue after fees, taxes, refunds and chargebacks, with the approved reserve and operating allocations kept separate.

## Economy model — variables to simulate before choosing values

### Currency flows

Track separately:
- PC issuance: confirmed purchases and any explicitly approved grants.
- PC sinks: equipment, VIP, Premium Pass, Lucky Boxes, boosts and consumables.
- MC issuance: settled Mining Pool cycles only in the initial design.
- MC outflows: future approved redemptions only; do not count gameplay spending as an MC sink unless the currency's role is formally changed.
- Outstanding player liabilities: eligible MC balances and approved pending obligations.
- Treasury/reserve liquidity: cash actually settled and available, not forecast revenue or unsold PC.

### Inflation and price stability

Do not use circulating supply alone as an inflation index. Build a versioned representative basket of equipment, upgrades, services and recurring gameplay costs. Track:
- Median and weighted price changes by category.
- PC supply growth, issuance, sinks and velocity.
- Cost to reach key progression milestones.
- HASH capacity growth and reward output per eligible HASH-hour.
- Reward-to-sink ratio and concentration of balances.
- New-player affordability versus veteran progression.

Report PC price inflation separately from MC issuance/liability growth. Never imply that MC has a redemption value before a legally and financially approved redemption policy exists.

## Gameplay systems to design

### Machines and HASH

Create a machine taxonomy with distinct roles, not only larger HASH numbers:
- Entry machines: affordable onboarding and modest capacity.
- Efficiency machines: lower operating cost or better progression utility, without unlimited reward multipliers.
- Specialized machines: event, mission, room or strategy bonuses with explicit limits.
- Premium machines: convenience, cosmetics or capacity; avoid pay-to-win guarantees.
- Seasonal/limited machines: time-bounded availability, with a published lifecycle and no artificial scarcity claims.

Every machine specification must define price in PC, HASH output, acquisition path, upgrade curve, durability/maintenance if any, room footprint, VIP restrictions if any, supply cap if justified, and effect on reward concentration. Simulate the payback/progression impact without presenting it as a financial return.

### Events, missions and tournaments

Use pre-funded, capped PC/item budgets for events. Define duration, eligibility, anti-bot controls, reward tables, per-account limits, duplicate handling and audit trail before launch. Events must not silently create MC issuance. Prefer cosmetics, consumables and progression utility over permanent HASH inflation.

### Lucky Boxes

Keep rewards non-cash and non-withdrawable: machines/equipment, temporary boosts, cosmetics and utility items. Publish versioned probabilities, resolve outcomes server-side, log every opening, enforce inventory/ownership checks and define fair duplicate compensation. No PC or MC prizes in the approved baseline. Paid random rewards require legal and consumer-protection review before release.

### PC sinks and retention

Retention should be driven by desirable, fairly priced utility: upgrades, room customization, cosmetics, convenience and event participation. Avoid forced spending, hidden expiry, confusing conversion, or mechanics that make users feel compelled to buy PC to recover prior spending.

## Future withdrawal design — not active

Before any redemption launch, model and approve:
- Legal classification, consumer disclosures, tax/accounting treatment and jurisdictional restrictions.
- Eligible MC source, maturity/settlement status, minimum/maximum amounts and account verification.
- Available settled liquidity after taxes, refunds, chargebacks, operating obligations and reserve floor.
- Transparent fee components: payment processor cost, network/bank cost, and any explicitly justified service fee.
- A published fee formula, caps and examples; no fee rate is selected in this draft.
- Predictable processing windows and a linear/queued payout schedule tied to actual available liquidity, with transparent queue position/ETA and no discriminatory priority.
- Anti-fraud review, sanctions/KYC obligations where applicable, dispute handling and appeal process.
- Stress tests for mass withdrawal, revenue interruption, chargeback spikes and reserve depletion.
- A hard circuit breaker that pauses new redemptions when solvency or legal conditions fail, while preserving auditable player claims and communicating status.

Do not use artificial delays or punitive withdrawal fees to force retention. Retention must come from in-game utility and trust. Do not promise instant, guaranteed or fixed-value withdrawals.

## Required simulations and acceptance criteria

Before approving numeric balances or rates, simulate at minimum:
1. Conservative, base and optimistic revenue scenarios.
2. Player growth, churn and concentration of HASH/MC.
3. PC issuance and sink balance under different purchase mixes.
4. Event and Lucky Box expected item supply.
5. Machine upgrades and HASH growth over 30/90/365 days.
6. Pool budget volatility and per-player MC distribution.
7. 5%, 15%, 30% and 50% eligible-balance redemption stress scenarios (scenario inputs only, not policy limits).
8. Reserve coverage after refunds, taxes, fees and operating commitments.

A design passes only if ledgers reconcile, reward budgets cannot exceed funded budgets, duplicate requests are idempotent, outcomes are auditable, and no scenario creates an unbacked cash liability.

## Decisions intentionally left open

No withdrawal fee, minimum withdrawal, maximum withdrawal, payout cadence, event prize budget, Lucky Box odds, machine price, HASH output, PC distribution rate, or MC conversion value is fixed here. These require a separate balancing meeting and documented approval.
