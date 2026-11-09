# Fase 2C — Salas, instalação e hashrate persistentes

## Entregas
- Salas persistentes por jogador, provisionadas conforme VIP registrado no banco.
- Instalação/desinstalação por RPC transacional e idempotente.
- Limite de 10 equipamentos por sala.
- Renomeação de salas com validação de 1 a 30 caracteres.
- Hashrate calculado no PostgreSQL a partir do catálogo e dos equipamentos instalados.
- Painel de infraestrutura na tela Equipamentos e resumo na tela Mineração.
- Simulador local preservado e identificado como sandbox.

## Regras
- VIP 0: 1 sala; VIP 1: 2; VIP 2: 3; VIP 3: 4.
- 10 equipamentos por sala.
- Redução de VIP é bloqueada quando há equipamento instalado em sala que seria removida.
- A FK composta de sala + proprietário impede vincular equipamento a sala de outra conta.

## Segurança
- RLS em player_rooms e player_equipment_operations.
- Sem escrita direta do cliente nas tabelas.
- RPCs verificam auth.uid(), propriedade, estado, sala e capacidade.
- Idempotência para retries de instalação e desinstalação.
- get_player_mining_summary é SECURITY INVOKER e respeita RLS.
- Nenhum PC, XP ou recompensa é criado ou alterado nesta fase.

## Testes DEV
Em transação revertida:
- 10 instalações aceitas; 11ª rejeitada.
- Retry de instalação e desinstalação não duplicou efeitos.
- 10 equipamentos de 250 H/s resultaram em 2.500 H/s calculados no banco.
- Desinstalar um item reduziu o resumo para 2.250 H/s.
- Conta B não viu equipamentos da conta A.
- Rollback confirmou ausência de dados de teste permanentes.

## Limites
- Nenhum equipamento do sandbox foi migrado ou considerado legítimo.
- Inventário persistente começa vazio e recebe itens somente por compra válida.
- A Mining Pool ainda não usa este hashrate; isso exigirá snapshots e settlement server-side em fase própria.
- VIP ainda não possui fluxo de compra/entitlement persistente.


## Migration adicional 2C.1

Foi adicionada `202611090008_facility_fk_indexes_and_owned_catalog_visibility.sql` para cobrir FKs compostas identificadas pelo Performance Advisor e preservar a leitura dos atributos de equipamentos que o jogador já possui mesmo se o catálogo desativar novas vendas desse SKU.
