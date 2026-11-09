# Fase 2B — Catálogo e compras persistentes

## Escopo entregue

- Catálogo global `equipment_catalog`, com preço e atributos mantidos no PostgreSQL.
- Inventário persistente por usuário em `player_equipment`.
- Compra pela RPC `purchase_equipment(p_sku, p_idempotency_key)`.
- Débito da carteira, inserção no inventário e lançamento no ledger na mesma transação.
- Frontend com catálogo oficial, saldo persistente e inventário persistente.
- Loja demonstrativa local preservada e explicitamente separada.

## Catálogo inicial

| SKU | Equipamento | Hashrate | Preço |
|---|---|---:|---:|
| pix_miner_ii | PIX Miner II | 250 H/s | 2.500 PC |
| pix_miner_iii | PIX Miner III | 600 H/s | 5.000 PC |

Os valores vêm do catálogo do banco. O navegador envia somente o SKU e uma chave de idempotência; não envia preço, saldo, proprietário ou recompensa.

## Segurança e integridade

- RLS habilitada em ambas as tabelas.
- Jogadores só consultam o catálogo ativo e os próprios equipamentos.
- Nenhuma escrita direta do cliente em `wallets`, `wallet_transactions` ou `player_equipment`.
- A RPC exige usuário autenticado e valida o SKU no catálogo.
- A RPC bloqueia a linha da carteira com `FOR UPDATE`, valida saldo, debita, cria o item e registra a transação em uma única transação SQL.
- A chave de idempotência é serializada pelo lock da carteira. Repetir uma chamada já concluída não duplica compra nem débito; reutilizar a chave para outro SKU é rejeitado.
- Preço é lido no banco e gravado como snapshot em `purchase_price_pc`.
- A função não concede créditos e não aceita preço fornecido pelo cliente.

## Limites deliberados

- O inventário persistente ainda não está conectado à instalação das máquinas, salas, capacidade ou cálculo de hashrate do simulador local.
- A seção sandbox continua usando localStorage e saldo demonstrativo, sem comunicação com a carteira real do banco.
- Não foi concedido saldo de teste permanente nem migrado saldo antigo.
- Não existe pagamento PIX real, saque ou conversão de moeda.
- Não há painel administrativo para alterar catálogo; mudanças futuras devem ocorrer por migration auditada.

## Validação executada no Supabase DEV

Teste transacional dentro de `BEGIN ... ROLLBACK`:
- Carteira temporariamente ajustada para 6.000 PC.
- Primeira compra PIX Miner II: débito de 2.500 PC.
- Repetição com a mesma chave: resposta idempotente, sem novo débito.
- Asserções dentro da transação: saldo 3.500 PC, 1 equipamento, 1 transação.
- Conta separada com saldo zero: compra rejeitada por saldo insuficiente.
- Toda a transação de teste foi revertida; nenhum saldo ou item de teste foi persistido.

## Avisos do Security Advisor

O Supabase reporta a RPC `purchase_equipment` como `SECURITY DEFINER` executável por usuários autenticados. Isso é intencional para permitir a operação atômica sem conceder escrita direta nas tabelas. A função valida `auth.uid()`, limita a operação a compras do próprio usuário, não recebe preço e não tem permissão para creditar a carteira. A execução para `public` e `anon` foi revogada.

Também permanece o aviso anterior de proteção contra senhas vazadas desabilitada no Auth. Habilitar antes de produção pelo Dashboard.

## Próxima etapa sugerida

Persistir instalação, salas e hashrate com validação server-side, sem misturar os dados locais legados.
