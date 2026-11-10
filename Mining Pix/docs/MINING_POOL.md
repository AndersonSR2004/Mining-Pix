# Mining Pool — operação e controles

## Decisões econômicas aprovadas

- **D-012/D-013:** economia dual. PIX COIN (PC) é moeda interna comprada e não sacável; MINING COIN (MC) é recompensa da Mining Pool e poderá ser considerada para conversibilidade futura somente após os portões jurídico, financeiro e operacional. A Pool é a única fonte inicial de MC.
- **D-014:** 30% da receita líquida elegível será a base econômica destinada à Mining Pool.
- **D-015/D-019:** reserva mínima equivalente a três meses de despesas operacionais. A política inicial destina 30% da receita líquida elegível à reserva enquanto ela estiver abaixo da meta. Ao atingir a meta, novos aportes automáticos ficam suspensos até revisão formal; não há redirecionamento automático da parcela.
- **D-016/D-021:** participação proporcional ao HASH elegível, com apuração pretendida por HASH-hora validado durante o ciclo diário.
- **D-017:** ciclos diários de 24 horas.
- **D-018:** diversificar as quatro fontes de monetização (PC, VIP, Passe Premium e publicidade), sem quotas obrigatórias iguais.
- **D-019:** alocação inicial de referência da receita líquida elegível: 30% Pool, 30% reserva, 30% operação/desenvolvimento e 10% administração.
- **D-020:** BRL é a unidade contábil oficial. A carteira MC é independente; não existe conversão automática, cotação ou valor de resgate prometido. A precisão MC alvo aprovada é de até oito casas decimais, ainda não migrada no schema atual.
- **D-022:** somente receitas recebidas, liquidadas e conciliadas entram na base. Taxas, impostos, estornos, reembolsos, chargebacks e demais deduções aplicáveis reduzem a receita elegível.
- **D-023:** precisão decimal controlada, método dos maiores restos e resíduos preservados para ciclos seguintes; nunca distribuir acima do orçamento autorizado.

## Controles técnicos já aplicados

- No máximo um ciclo aberto por vez.
- Liquidação bloqueada antes de completar 24 horas.
- Orçamentos e alocações PC proibidos na Mining Pool.
- Emissão de MC bloqueada por padrão por controle fail-closed em schema privado.
- Carteiras e ledger MC separados de PC; nenhum saldo legado foi convertido.
- RPCs de operação da Pool restritas a service_role; operador não habilitado automaticamente.
- Liquidação da Pool transacional e idempotente.
- Revenue Ledger BRL em schema privado, append-only, com valores em centavos inteiros.
- Registro de eventos financeiros por função idempotente, exclusiva de service_role; resumo por período também restrito ao backend.

## Revenue Ledger BRL — implementação inicial DEV

Migration: 20261110000000_revenue_ledger_foundation.sql.

Tabela: private.revenue_ledger_entries.

Fontes aceitas:
- pix_coin
- vip
- premium_pass
- advertising

Tipos de lançamento:
- gross_receipt: crédito positivo.
- payment_fee, tax, refund, chargeback, other_deduction: deduções negativas.
- correction: ajuste compensatório, sem editar ou apagar lançamentos antigos.

Valores são armazenados como centavos inteiros de BRL (signed_amount_cents), nunca ponto flutuante. Cada entrada exige referências de origem/liquidação, timestamp de liquidação e chave idempotente. A função private.record_revenue_ledger_entry(...) aceita somente chamadas do backend service_role, rejeita reutilização divergente da chave e não permite eventos pendentes ou não liquidados por contrato. A função private.get_revenue_period_summary(...) fornece agregação por janela de tempo.

**Limites deliberados desta entrega:**
- Nenhum gateway ou provedor de pagamento foi conectado.
- Nenhum evento financeiro real foi importado.
- Nenhum orçamento Pool, reserva, despesa operacional ou taxa administrativa é calculado automaticamente.
- Não existe ainda fechamento mensal, carry-forward de déficits/chargebacks, nem processo de conciliação com provedores.
- O Revenue Ledger não habilita emissão MC, conversão ou saques.

## Diferenças técnicas ainda a corrigir

1. O schema atual de MC usa numeric(20,0); a precisão de até oito casas aprovada em D-020 ainda precisa de migration coordenada com RPCs, Edge Function, frontend e testes.
2. A liquidação atual usa HASH instalado no momento do settlement; o mecanismo HASH-hora aprovado em D-021 ainda precisa ser implementado com snapshots/eventos temporais server-side.
3. O método de maiores restos existe na liquidação atual, mas a preservação de resíduos entre ciclos (D-023) ainda não está integrada ao orçamento.
4. O Revenue Ledger precisa de integração com fontes de pagamento e publicidade, verificação de webhooks/relatórios, conciliação e regras de fechamento.
5. O motor de alocação 30/30/30/10 e o ledger da reserva ainda não foram implementados.

## Estado atual do ambiente DEV

- Revenue Ledger: tabela e funções instaladas; zero lançamentos de teste persistidos.
- Carteiras MC: estrutura existente; nenhuma emissão realizada.
- Ciclos Pool: nenhum ciclo aberto ou liquidado.
- Alocações: nenhuma persistida.
- Saldos PC e MC: sem alteração nesta entrega.
- distribution_enabled=false; política de emissão MC não configurada.
- Branch de trabalho: codex/mining-pix-work.
- PR #1 continua draft e não mesclada; main não foi alterada.

## Próximas etapas técnicas

1. Criar integração de entrada financeira segura para provedores escolhidos, com validação de assinatura, conciliação e idempotência.
2. Definir e implementar fechamento financeiro, tratamento de chargebacks posteriores e carry-forward.
3. Implementar ledger da reserva e motor de alocação mensal com travas e auditoria.
4. Migrar a precisão MC para até oito casas decimais de forma coordenada e testar todos os consumidores.
5. Implementar HASH-hora elegível e snapshot diário auditável.
6. Integrar orçamento BRL à Pool sem habilitar emissão MC.
7. Homologar concorrência, falha parcial, retries, reversões, arredondamentos e reconciliação.
8. Manter emissão MC e saques bloqueados até revisão jurídica, tributária, antifraude e operacional.

> Este documento descreve o ambiente DEV. Não representa promessa de rendimento, cotação, conversibilidade ou disponibilidade de saques.
