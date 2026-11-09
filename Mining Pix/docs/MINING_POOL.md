# Mining Pool — operação e controles

## Regras aprovadas

- A Mining Pool é a única fonte inicial de MINING COIN (MC).
- Ciclos de apuração são diários, com duração mínima de 24 horas.
- A distribuição é 100% proporcional ao HASH elegível registrado no backend.
- O orçamento econômico aprovado é 30% da receita líquida elegível, depois de taxas, impostos e estornos.
- A PIX COIN (PC) não pode ser distribuída pela Mining Pool.
- Reserva financeira mínima aprovada: três meses de despesas.
- A reserva, a conversão BRL/MC e a conciliação financeira ainda não estão integralmente especificadas.

## Controles técnicos aplicados

- No máximo um ciclo pode permanecer aberto por vez.
- Um ciclo não pode ser liquidado antes de completar 24 horas.
- Orçamentos PC e alocações PC foram bloqueados no banco; a Pool opera somente em MC.
- A liquidação de ciclos com orçamento MC permanece bloqueada por padrão.
- O bloqueio só poderá ser liberado após uma política financeira aprovada e versionada ser configurada por migração revisada.
- A tabela de controle fica no schema privado, com acesso concedido somente ao backend `service_role`.
- A liquidação e os lançamentos MC continuam transacionais e idempotentes no backend.

## Estado atual do ambiente DEV

- Nenhum ciclo aberto ou liquidado.
- Nenhuma alocação persistida.
- Nenhuma transação MC emitida.
- Nenhuma carteira MC com saldo diferente de zero.
- Distribuição MC desabilitada.
- Nenhuma mudança de saldo PC realizada.

## Pendências que bloqueiam a emissão real

1. Definir como a reserva de três meses será formada e recomposta em relação aos 30% da Pool.
2. Definir a política contábil BRL/MC, precisão e momento de conversão; não atribuir cotação ou valor de resgate por suposição.
3. Fechar a definição de HASH elegível, incluindo máquinas, salas, bônus e atividade.
4. Definir fechamento financeiro: liquidação de pagamentos, chargebacks, reembolsos e conciliação.
5. Definir tratamento de resíduos/frações e arredondamento.
6. Implementar ledger de receita em BRL e conciliação antes de calcular automaticamente os 30%.
7. Validar implicações jurídicas, tributárias, antifraude e de proteção ao consumidor antes de qualquer saque/conversão.

## Próximos passos técnicos

1. Fechar as pendências financeiras acima.
2. Implementar ledger de receita líquida elegível em BRL, provisões e reserva.
3. Implementar orçamento diário da Pool em BRL com trilha de auditoria.
4. Aprovar e versionar a regra BRL/MC.
5. Só então liberar a liquidação MC e adicionar agendamento automático, monitoramento e alertas.
6. Homologar em ambiente DEV com cenários concorrentes, reprocessamento, chargeback, falha parcial e idempotência antes de produção.

> Este documento descreve o ambiente DEV. Não representa promessa de rendimento, cotação, conversibilidade ou disponibilidade de saques.
