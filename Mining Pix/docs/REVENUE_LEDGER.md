# Revenue Ledger — contrato técnico

## Objetivo

Registrar, de forma auditável e idempotente, eventos financeiros em BRL que já tenham sido recebidos, liquidados e conciliados por um processo confiável. Este módulo é infraestrutura contábil interna; não é gateway de pagamento, carteira de dinheiro, sistema de saque ou promessa de valor da MINING COIN.

## Unidade e sinal

- Moeda: BRL.
- Unidade armazenada: centavos inteiros (bigint).
- Recebimento bruto: valor positivo.
- Taxa, imposto, reembolso, estorno, chargeback e outra dedução: valor negativo.
- Correção: lançamento compensatório novo, positivo ou negativo.
- Não usar float, real ou double precision para valores monetários.

## Fontes permitidas

- pix_coin
- vip
- premium_pass
- advertising

A classificação não implica que as respectivas compras ou provedores já estejam integrados. A diversificação dessas fontes é uma prioridade estratégica, não uma obrigação de participação igual.

## Estrutura instalada

Migration DEV: 20261110000000_revenue_ledger_foundation.sql.

Tabela privada: private.revenue_ledger_entries.

Funções:
- private.record_revenue_ledger_entry(...): inserção idempotente, somente service_role.
- private.get_revenue_period_summary(p_period_start, p_period_end): resumo por janela de liquidação, somente service_role.

Controles:
- Schema private, RLS habilitado e leitura explícita apenas para service_role.
- Sem grants de escrita direta para clientes ou para chamadas diretas da API.
- Trigger bloqueia UPDATE, DELETE e TRUNCATE.
- Correções são novos lançamentos; nunca reescrever o histórico.
- A chave idempotente não pode ser reutilizada com payload divergente.
- Metadados limitados a objeto JSON de até 4 KiB; não armazenar payload bruto de webhook, credenciais, dados de cartão ou informações pessoais desnecessárias.

## Contrato de integração futuro

O serviço de integração deve:
1. Validar a assinatura/autenticidade do webhook ou relatório do provedor.
2. Confirmar que o pagamento foi liquidado e conciliado.
3. Classificar a origem e o tipo do lançamento.
4. Usar o identificador imutável do evento do provedor como base da idempotência.
5. Registrar o valor em centavos e a referência de liquidação.
6. Registrar taxas, impostos, reembolsos e chargebacks como lançamentos negativos separados.
7. Nunca aceitar valor, origem, status de liquidação ou usuário diretamente do navegador como fonte de verdade.

## O que ainda não está habilitado

- Nenhum gateway de pagamento ou rede de anúncios conectado.
- Nenhuma ingestão automática.
- Nenhum fechamento mensal definitivo.
- Nenhuma regra de carry-forward de déficit ou chargeback tardio.
- Nenhuma alocação 30/30/30/10 ou movimentação da reserva.
- Nenhuma conversão BRL/MC, emissão MC ou saque.

O resumo de período retorna o líquido observado dentro da janela solicitada; não deve ser tratado como orçamento distribuível até que as regras de fechamento, ajustes tardios e carry-forward sejam implementadas e aprovadas.

## QA DEV

A verificação transacional cobriu inserção, retry idempotente, resumo de período e rollback. Nenhuma linha de QA permaneceu persistida. O ledger permanece vazio no DEV.
