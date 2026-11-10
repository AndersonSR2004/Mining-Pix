# Mining Pix — Economy, Liquidity and Gameplay Policy (Draft)

Status: design baseline only. No withdrawal, cash conversion, prize cash value, or automatic monetary distribution is authorized by this document.

## Product objective

Build a sustainable game economy that rewards participation without creating uncontrolled currency inflation, protects the project's solvency, and gives players clear, predictable and fair expectations about any future eligible withdrawal process.

The design should encourage voluntary, healthy liquidity retention through useful in-game progression and transparent value exchange—not through hidden fees, arbitrary lockups, misleading earnings claims, or obstructive withdrawal friction.

## Existing approved boundaries

- PIX COIN (PC) is acquired exclusively through purchases and consumed inside the game; it is not withdrawable. No gameplay, block, bot, mission, event, advertisement or Lucky Box reward issues PC. Explicit administrator balance adjustments are exceptional DEV/test operations, not an earning channel.
- MINING COIN (MC) is a distinct reward ledger intended to be funded initially only by the Mining Pool.
- No PC-to-MC conversion.
- Lucky Boxes do not award PC, MC, cash, or withdrawable prizes.
- Missions, events, tournaments and advertisements do not issue MC in the initial model.
- The official PIX BLOCK target interval is 600 seconds (10 minutes); MC reward is distributed proportionally to each player's eligible HASH for that block. Financial snapshots and treasury reconciliation may still be daily, but they are not the block reward interval.
- No withdrawals, redemption, or cash valuation are active.
- A 30% pool allocation is based on eligible net revenue after fees, taxes, refunds and chargebacks, with the approved reserve and operating allocations kept separate.

## Economy model — variables to simulate before choosing values

### Currency flows

Track separately:
- PC issuance: confirmed purchases and any explicitly approved grants.
- PC sinks: equipment, VIP, Premium Pass, Lucky Boxes, boosts and consumables.
- MC issuance: settled Mining Pool cycles only in the initial design.
- MC outflows: future approved redemptions only; do not count gameplay spending as an MC sink unless the currency's role is formally changed.
- PC purchases: record gross BRL collected, processor fees, taxes, refunds/chargebacks, and net proceeds separately. A displayed PC/BRL price is a sale price, not a redemption promise.
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

No withdrawal fee, minimum withdrawal, maximum withdrawal, payout cadence, event prize budget, Lucky Box odds, machine price, HASH output, PC/BRL sale price, or MC conversion/redemption value is fixed here. These require a separate balancing meeting and documented approval.

## Proposed nominal currency reference — pending decision

The user proposed the nominal relationship R$ 1 = 1 MC = 100 PC. This is not approved as a redemption peg or accounting guarantee. The safer initial posture is to price PC packs transparently in BRL (for example, a chosen number of PC per BRL after payment costs) while leaving MC without a promised BRL value until a fully funded, legally reviewed redemption policy is approved. Do not enable PC-to-MC conversion.

If the project later promises 1 MC = R$ 1, every outstanding redeemable MC becomes a BRL-denominated liability at that rate. The official Pool budget must be funded from settled net revenue and cash reserves; issuance must never exceed the cash actually allocated to rewards. A 30% revenue share is not by itself proof that any arbitrary fixed MC reward per block is affordable.

At a 600-second cadence there are 144 blocks/day. A production reward of 100 MC/block would create 14,400 MC/day. At a guaranteed R$1 redemption value, that is R$14,400/day (approximately R$432,000 per 30-day month) of gross redemption exposure, before fees and operating costs. If the Pool is capped at 30% of eligible net revenue, this rate would require at least R$48,000/day (R$1.44 million per 30-day month) of eligible net revenue merely to fund the Pool at that level. This is an illustrative stress calculation, not an approved production reward. The 100 MC/block value currently applies only to sandbox testing.

Do not call the proposed relationship an exchange rate until the PC sale price and MC redemption value are independently defined. 100 PC = R$1 can be a retail price reference for PC packs; 1 MC = R$1 is a redemption promise and needs separate backing, liquidity and legal approval.


## PIX BLOCK cadence clarification — approved target, operations pending

The user's latest specification sets the official block interval to 600 seconds (10 minutes), superseding the earlier daily Pool cycle interval as the reward-block cadence. The database guard enforces a minimum 600-second duration before official settlement. The automatic trusted operator/scheduler that opens and settles each official block every 600 seconds is not yet deployed, and official MC distribution remains disabled pending the funding and conversion policy. Sandbox uses the same 600-second interval with a 100 MC test budget.


## VIP — decisão D-047: qualificação por janela móvel (10 nov 2026)

**Estado: modelo de qualificação aprovado; benefícios e parâmetros econômicos continuam pendentes de simulação.**

- O Mining Pix não oferecerá VIP vitalício.
- A qualificação VIP será baseada em uma janela móvel dos 30 dias imediatamente anteriores à avaliação, e não em mês-calendário fixo.
- As recargas elegíveis serão acumuladas por jogador dentro dessa janela. O nível aplicável será o maior cujo limite de qualificação tenha sido alcançado.
- A concessão será automática após a confirmação da recarga elegível; o jogador não precisará escolher ou ativar manualmente o VIP.
- Recargas estornadas, contestadas, canceladas ou revertidas não contarão para a qualificação. Se uma reversão ou a saída de uma recarga da janela reduzir o acumulado abaixo do limite, o nível será recalculado e poderá diminuir.
- O acumulado não será vitalício nem transportado para além da janela de 30 dias.
- Os limites monetários por nível, a lista final de benefícios, as regras de renovação operacional, a nomenclatura dos níveis e o tratamento contábil das recargas ainda exigem validação e aprovação próprias.

**Salvaguardas econômicas obrigatórias antes da implementação:**

1. A qualificação comercial por recarga não transforma o valor bruto recebido em caixa livre. O ledger deverá separar valor bruto, liquidação, taxas, tributos, estornos/chargebacks e caixa efetivamente disponível.
2. O valor de recargas usado para qualificar VIP não pode ser contado duas vezes como receita quando o jogador consumir PIX COIN em itens ou serviços.
3. Bônus de HASH VIP devem ser simulados como redistribuição da participação proporcional na Pool, sem aumentar o orçamento financiado.
4. Descontos futuros de saque só poderão incidir sobre eventual tarifa de serviço da plataforma, nunca sobre custos externos, tributos ou tarifas de terceiros sem cobertura explícita.
5. Imunidade a anúncios, energia adicional e multiplicadores de pontos devem ter seus custos, impactos de atividade e fontes de recompensa mensurados. Nenhum benefício poderá emitir MC fora da Mining Pool.
6. Nenhum benefício VIP, desconto de saque, conversão, emissão de MC ou pagamento real é ativado por esta decisão.

**Precedência:** D-047 aprova exclusivamente a janela móvel de 30 dias e a não oferta de VIP vitalício. Ela não aprova automaticamente os limites R$30/R$40/R$45/R$50/R$60 nem os benefícios anteriormente propostos.


## Política VIP e Passe — esclarecimentos de design (10 nov 2026)

### D-047 — interpretação da vantagem VIP
O VIP é uma camada de monetização e conveniência para jogadores que voluntariamente contribuem financeiramente para sustentar o jogo. O produto não deve ser desenhado como bolsa de valores, investimento ou promessa de enriquecimento. Benefícios podem ser relevantes, inclusive um bônus proposto de até 30% no HASH, desde que:
- sejam apresentados como vantagens de jogo, não como retorno financeiro, juros, renda ou recuperação garantida da contribuição;
- a contribuição financeira e a qualificação VIP sejam transparentes;
- a distribuição da Pool permaneça proporcional ao HASH elegível e limitada ao orçamento efetivamente financiado;
- o bônus altere a participação relativa na Pool, não crie orçamento ou MC adicional;
- não exista prioridade de saque ou garantia de valor de resgate para VIPs.

O usuário esclareceu que a vantagem de HASH é intencionalmente vinculada à liquidez que o jogador contribui ao ecossistema. Os percentuais e a tabela de qualificação continuam sujeitos a simulação de sustentabilidade, concentração e divulgação adequada.

### D-048 — XP e Passe de Batalha
- Os multiplicadores VIP aplicam-se ao XP de missões, não a pontos genéricos, PC ou MC.
- XP mais alto acelera a progressão do Passe e pode antecipar a reivindicação de recompensas. O custo econômico dessas recompensas deve ser incluído no orçamento da temporada.
- O Passe poderá ser comprado em PC nas modalidades gratuito, Premium e Full. Full libera a trilha Premium e todos os níveis da temporada; níveis individuais também poderão ser comprados em PC.
- Nenhuma dessas compras emite MC. PC gasta em passe/níveis é sink de moeda interna e não é nova receita BRL.
- PC obtida como recompensa do Passe é faucet e deve ser limitada/orçada por temporada; evitar que uma compra de Passe devolva, em PC, valor igual ou superior ao seu custo de forma que crie arbitragem ou emissão líquida descontrolada.
- Preços, composição de recompensas, XP por missão, limites de compra e orçamento de PC ainda não foram aprovados.

### Proposta P-049 — alteração da alocação financeira
O usuário levantou uma alternativa à distribuição anterior D-019:
- 25% da Receita Líquida Elegível (RLE) para a Mining Pool;
- 35% para o Fundo de Garantia/Reserva;
- 30% para operação e desenvolvimento;
- 10% para administração.

**Estado: proposta para simulação, não aprovada como política financeira final.** Ela deslocaria 5 pontos percentuais da Pool para a reserva, aumentando a retenção de liquidez em 10 pontos percentuais em relação à alocação anterior de 30% Pool / 30% reserva. Os 30% de operação/desenvolvimento e 10% de administração permaneceriam iguais.

A simulação deve comparar pelo menos:
1. Política anterior: 30% Pool / 30% reserva / 30% operação e desenvolvimento / 10% administração.
2. Alternativa: 25% Pool / 35% reserva / 30% operação e desenvolvimento / 10% administração.

A comparação precisa considerar receita líquida após taxas, tributos, reembolsos e chargebacks; sazonalidade e queda de vendas; custos fixos e variáveis; passivos e compromissos futuros; concentração de HASH; e meses de cobertura da reserva. A reserva deve ter piso, política de uso, critérios de recomposição e trilha de auditoria. Percentuais são alocações de orçamento, não prova de que há caixa disponível: nenhum compromisso pode exceder caixa liquidado e livre.

A reserva não deve ser tratada como receita nem como lucro. Seu uso para financiar Pool, operação ou resgates exige regra aprovada, autorização e lançamento contábil específico. Não prometer proteção absoluta contra insolvência ou "garantia" de retorno.

**Salvaguarda de contabilização:** a compra de PC gera entrada financeira no momento de liquidação, sujeita ao tratamento contábil apropriado. O gasto posterior de PC no VIP, Passe, Full Pass, níveis ou máquinas não gera uma segunda receita em BRL. O valor nominal de PC em circulação não equivale a caixa, reserva ou liquidez sacável.

## Proposta P-049 — alocação alternativa da Receita Líquida Elegível (10 nov 2026)

**Estado: aprovada exclusivamente para simulação; não substitui a política histórica D-019 nem está ativa para lançamentos financeiros.**

Distribuição proposta sobre a Receita Líquida Elegível (RLE), depois de taxas, tributos, reembolsos e chargebacks:

| Destinação | Percentual |
|---|---:|
| Mining Pool | 25% |
| Fundo de Garantia | 35% |
| Operação e desenvolvimento | 30% |
| Administração | 10% |
| **Total** | **100%** |

Em comparação com a referência histórica D-019 (30% Pool, 30% reserva, 30% operação/desenvolvimento e 10% administração), P-049 desloca cinco pontos percentuais da Pool para o Fundo de Garantia. A cada R$ 10.000,00 de RLE hipotética, a simulação resulta em R$ 2.500,00 para Pool, R$ 3.500,00 para Fundo de Garantia, R$ 3.000,00 para operação/desenvolvimento e R$ 1.000,00 para administração.

O painel administrativo pode calcular cenários P-049 sem gravar lançamentos, alterar a política ativa, transferir BRL ou emitir MC. A política ativa só poderá ser alterada após revisão de fluxo de caixa, cobertura e regras de uso/recomposição do Fundo de Garantia, concentração de recompensas, cenários de estresse e aprovação expressa posterior. A reserva não deve ser tratada como caixa livre nem como garantia suficiente, isoladamente, contra insolvência.

