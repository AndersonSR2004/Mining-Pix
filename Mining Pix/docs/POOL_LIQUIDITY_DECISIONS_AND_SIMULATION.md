# Mining Pix — Pool Funding, Reward Release and Withdrawal Queue

**Decision record:** D-042 to D-044  
**Recorded:** 10 Nov 2026  
**Branch:** `codex/mining-pix-work`  
**Status:** Approved policy direction; numerical and legal implementation details remain pending.  
**Implementation status:** Documentation only. No code, database migration, MC conversion, cash valuation, real withdrawal, or official monetary distribution was enabled.

## 1. Approved decisions

| ID | Decision | Approved rule | Still pending |
|---|---|---|---|
| D-042 | Pool funding ceiling | Allocate up to 30% of eligible net revenue (RLE) to the Mining Pool, always limited by actually settled and available cash after taxes, refunds/chargebacks, payment costs, due operating obligations and required reserves. | Exact RLE source scope, accounting close, cash waterfall, and liquidity reserve thresholds. |
| D-043 | Reward release cadence | Release the approved monthly Pool budget linearly throughout the distribution month, in 600-second PIX BLOCK intervals; each block's reward share is proportional to eligible HASH for that block. | Whether the budget is based on the previous closed month or another settled-revenue window; calendar-period handling and rounding/residual rules. |
| D-044 | Withdrawal queue and maturity | Future withdrawals use a transparent queue, subject to eligibility checks and available reserved liquidity. MC rewards have a 7-day maturity period before becoming withdrawal-eligible. | Queue ordering and service levels, exact maturity timestamp, KYC/anti-fraud/legal requirements, withdrawal minimum/maximum, fees, payout windows, and circuit-breaker thresholds. |

These decisions approve the policy direction only. They do not activate redemption, promise a BRL value for MC, or authorize real-money payouts.

## 2. Interpretation and safeguards

### 2.1 Pool is a monthly budget, not a single block payment

The Pool allocation is a ceiling for a distribution period, not an instruction to pay the full amount in one block. Under a 30-day example there are 4,320 ten-minute blocks. If the monthly BRL budget were R$30,000, the average budget reference would be R$6.9444 per block.

Actual block reward allocation remains proportional to eligible HASH:
`player_block_share = block_budget × player_eligible_HASH_time / total_eligible_HASH_time`

This is a BRL budget illustration only. It must not be translated into MC until a separate MC issuance/conversion policy is approved.

### 2.2 Revenue recognition and timing

Recommended conservative operating assumption for future design: calculate RLE only from receipts that have settled and reconciled, net of payment fees, taxes, refunds and chargebacks. Forecast revenue, pending invoices, unsold PC, and unredeemed PC balances are not cash.

A monthly close followed by a subsequent distribution period is safer than issuing rewards against same-month forecasts. The exact reference period and close timetable remain pending under D-043.

Potential eligible revenue sources for deliberation:
- Premium Pass receipts;
- VIP receipts;
- PIX COIN pack receipts;
- advertising receipts actually paid.

The inclusion, exclusions, accounting treatment and allocation base for each source require explicit approval. PC remains a closed-use currency: no PC-to-MC conversion and no redemption of PC.

### 2.3 Cash availability gate

The 30% calculation is a maximum allocation, not an unconditional payment obligation. The amount authorized for a period must not exceed the lesser of:
1. 30% of RLE; and
2. cash genuinely available for Pool funding after taxes, refunds/chargebacks, payment costs, due commitments and approved reserve floors.

Do not count the same cash simultaneously as Pool backing, operating reserve, withdrawal reserve, or operating funds. The existing D-019 allocation plan (30% Pool / 30% reserve / 30% operations and development / 10% administration) remains a planning allocation and must be reconciled with actual cash obligations before use.

The existing D-015 target of three months of operating expenses is not automatically sufficient as a withdrawal-liquidity reserve. A separate reserve target must be calculated from outstanding eligible claims, all credited MC exposure under any future redemption promise, withdrawal stress, and revenue volatility.

### 2.4 Seven-day maturity is not a solvency solution

The full amount of every credited MC reward must be included in outstanding reward exposure from the time it is credited, even while it is immature and cannot yet be withdrawn. Maturity may provide time for settlement checks, anti-fraud review and transaction finality; it does not erase or reduce the underlying exposure.

No retroactive confiscation or arbitrary forfeiture of earned rewards is permitted by this design. Any future hold or dispute process requires published rules, objective grounds, evidence, review and appeal.

### 2.5 Queue integrity

A future queue should be auditable, show request status and an estimated processing window, use objective and non-discriminatory ordering, and reserve funds when a request is accepted for processing. Anti-fraud and legal checks may delay an individual request only under published criteria. The exact FIFO/priority model and service levels are not yet approved.

A circuit breaker may pause new redemptions when predefined solvency, fraud or legal triggers are reached. It must not be an arbitrary mechanism to avoid valid obligations. Existing claims must remain recorded and auditable, with clear status communication and a defined recovery/reopening process.

Withdrawal fees should reflect disclosed, verifiable processing costs. Fees must not be set punitively to discourage withdrawals or conceal insufficient liquidity.

## 3. Illustrative 12-month financial simulation

### 3.1 Model assumptions

This is a deterministic planning simulation, not a forecast or proof of solvency.

- Values are monthly **RLE**, not gross sales.
- Pool allocation is 30% of each month's RLE.
- All other allocations, taxes and expenses are excluded from the arithmetic below because RLE is assumed to be net of transaction-level deductions; the cash availability gate still applies.
- The simulation assumes the monthly budget is fully funded and linearly released during that same illustrative month.
- A 30-day period has 4,320 blocks of 600 seconds.
- No MC/BRL exchange rate is assumed. Results are BRL budget references, not MC quantities or player cash earnings.
- No player-count, HASH concentration, redemption behavior or opening cash reserve is assumed; those require separate inputs.

### 3.2 Revenue scenarios

| Scenario | Monthly RLE path | 12-month RLE | 12-month Pool ceiling | Month 12 Pool ceiling |
|---|---:|---:|---:|---:|
| Stable | R$100,000 every month | R$1,200,000 | R$360,000 | R$30,000 |
| Growth | Starts at R$100,000, grows 5% monthly | R$1,591,713 | R$477,514 | R$51,310 |
| Gradual contraction | Starts at R$100,000, falls 10% monthly | R$717,570 | R$215,271 | R$9,414 |
| Sudden shock | R$100,000 for 3 months; R$50,000 for 3; R$30,000 for 6 | R$630,000 | R$189,000 | R$9,000 |

The contraction scenario shows why a fixed MC reward per block is dangerous: the monthly Pool ceiling falls from R$30,000 to about R$9,414 by month 12. The reward budget must flex with funded revenue rather than remain fixed.

### 3.3 Stable scenario — monthly release

| Month | RLE | Pool ceiling | Average BRL budget per 600s block* |
|---:|---:|---:|---:|
| 1–12, each month | R$100,000 | R$30,000 | R$6.94 |

*Assumes a 30-day period with 4,320 blocks. Real calendar months contain different numbers of 600-second intervals; the budget-per-block calculation must use the actual approved period boundaries.

### 3.4 Gradual contraction — monthly Pool ceilings

| Month | RLE | 30% Pool ceiling |
|---:|---:|---:|
| 1 | R$100,000 | R$30,000 |
| 2 | R$90,000 | R$27,000 |
| 3 | R$81,000 | R$24,300 |
| 4 | R$72,900 | R$21,870 |
| 5 | R$65,610 | R$19,683 |
| 6 | R$59,049 | R$17,715 |
| 7 | R$53,144 | R$15,943 |
| 8 | R$47,830 | R$14,349 |
| 9 | R$43,047 | R$12,914 |
| 10 | R$38,742 | R$11,623 |
| 11 | R$34,868 | R$10,460 |
| 12 | R$31,381 | R$9,414 |

This scenario assumes no minimum reward guarantee. A larger eligible HASH base divides a smaller Pool budget into smaller individual shares; it does not increase the total budget.

### 3.5 Sandbox reward mismatch warning

The existing sandbox default of 100 MC per 600-second block is a test fixture only. At 4,320 blocks per 30 days, that setting would simulate 432,000 MC per 30-day month. If (and only if) a future policy promised R$1 per MC, that would imply R$432,000 of monthly redemption exposure—14.4 times the R$30,000 Pool ceiling in the R$100,000 RLE example.

Therefore:
- Keep the 100 MC/block value sandbox-only.
- Do not copy it into production.
- Do not infer a BRL value for MC.
- Do not enable official MC issuance until the BRL budget, MC issuance formula, redemption terms and liquidity backing reconcile.

## 4. Required next simulations before any redemption decision

1. Model MC issuance under several explicitly hypothetical conversion ratios, without selecting one as policy.
2. Model player growth and HASH concentration (including top 1%, 5%, 10%, Gini and HHI) against a fixed monthly Pool budget.
3. Stress withdrawals at 5%, 15%, 30% and 50% of credited MC exposure, including simultaneous requests and delayed revenue.
4. Model a complete sales interruption for 1, 2 and 3 months, chargeback spikes, and reserve depletion.
5. Calculate a separate withdrawal reserve target and compare it with D-015's operating reserve.
6. Define a non-discriminatory queue, service-level windows, request reservation semantics, cancellation and dispute states.
7. Define the actual eligible RLE source mix and monthly close timetable.
8. Obtain Brazilian legal, tax, accounting and regulatory review before any cash redemption, advertised cash value, or payout promise.

## 5. Current status

- D-042: approved direction — Pool ceiling of 30% of RLE, gated by real liquidity.
- D-043: approved direction — linear release of a monthly budget across 600-second blocks.
- D-044: approved direction — future withdrawal queue and 7-day reward maturity.
- RLE source scope, accounting period, liquidity reserve target, MC conversion/issuance ratio, BRL redemption value, withdrawal minimum/maximum, fees, queue SLA, circuit-breaker thresholds and legal review: pending.
- MC remains without a promised BRL value.
- No PC-to-MC conversion, real withdrawal, real payout, official MC distribution or scheduler activation is authorized by this record.
- This commit changes documentation only; no application code, database schema, migration, wallet balance or production setting is changed.
