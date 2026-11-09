# Fase 3 — Mining Pool persistente e liquidação server-side

**Ambiente:** Supabase DEV (odlasosyewiiepvrvbnn)  
**Status:** fundação de dados, painel de jogador e operador protegido implementados; política econômica e ativação de operador pendentes.  
**Produção:** nenhuma alteração.

## Objetivo

Retirar do navegador a autoridade sobre participação, snapshots e distribuição da Mining Pool. O hashrate elegível passa a ser calculado no PostgreSQL a partir de equipamentos persistentes instalados em salas ativas. Bots locais, orçamento local e hashrate temporário de jogos não entram na pool persistente.

## Modelo de dados

### pool_cycles
- Ciclo UUID, chave externa única, status (open, settled, cancelled), orçamento inteiro em PC, hashrate total congelado, participantes, versão das regras e timestamps.
- Índice único parcial impede mais de um ciclo aberto ao mesmo tempo.
- O orçamento é informado explicitamente pelo operador. Não há emissão automática nem orçamento padrão.

### pool_allocations
- Uma linha por jogador/ciclo, com hashrate snapshot, participação proporcional, recompensa inteira em PC e referência opcional ao lançamento da carteira.
- Unique (cycle_id,user_id) impede duplicação.
- Histórico append-only para o cliente; RLS permite ao jogador ler somente as próprias alocações.

## Operações do backend

- get_pool_dashboard() — retorna somente agregados da rede, hashrate do jogador autenticado, ciclo aberto e até 10 alocações próprias.
- open_pool_cycle(cycle_key,budget_pc) — disponível somente ao papel service_role.
- settle_pool_cycle(cycle_id) — disponível somente ao papel service_role; congela o hashrate instalado, calcula a distribuição pelo método dos maiores restos e credita carteira + ledger + alocação + status do ciclo na mesma transação.
- Retry de liquidação em ciclo já concluído retorna already_settled=true e não cria créditos adicionais.
- A alocação total corresponde exatamente ao orçamento quando há participantes elegíveis; quando não há hashrate, o ciclo é encerrado sem distribuição.

## Edge Function pool-operator

Endpoint: /functions/v1/pool-operator  
JWT obrigatório.

A função valida a identidade com Supabase Auth e exige app_metadata.pool_operator === true. Nunca utiliza user_metadata para autorização. O cliente de serviço permanece no backend e chama as RPCs restritas.

Ações:
- open_cycle: recebe cycle_key e budget_pc inteiro.
- settle_cycle: recebe cycle_id.

**Bootstrap operacional:** nenhum usuário recebeu automaticamente a permissão de operador. Para autorizar um operador, um administrador do projeto deve abrir Authentication → Users → usuário escolhido → Raw App Meta Data e acrescentar {"pool_operator": true}, preservando os demais campos JSON. Isso não deve ser feito em user_metadata. A permissão pode ser revogada removendo a chave. Não atribuir essa permissão a contas de teste.

## Frontend

src/PersistentMiningPool.tsx consulta get_pool_dashboard() e exibe hashrate persistente individual e agregado, participação atual, estado do ciclo aberto e últimas distribuições do próprio usuário.

A tela Mineração apresenta o painel persistente separado do simulador local. A interface não consegue abrir ciclos nem creditar recompensas diretamente.

## Validações executadas no DEV

Teste transacional com duas contas e equipamentos temporários (rollback completo):
- Jogador A: 250 H/s; jogador B: 600 H/s.
- Orçamento de QA: 101 PC.
- Snapshot total: 850 H/s.
- Participações: 29,4118% e 70,5882%.
- Distribuição pelo método dos maiores restos: 30 PC e 71 PC.
- Saldos e lançamentos de ledger corresponderam às alocações.
- Retry de settlement retornou already_settled=true.
- Todo o teste foi revertido.

Verificações adicionais:
- get_pool_dashboard() com identidade autenticada retornou hashrate 0, participação 0 e histórico vazio para a conta sem equipamentos.
- Permissões: dashboard executável por authenticated, não por anon; settlement não executável por authenticated, executável por service_role.
- Após rollback: 0 ciclos, 0 alocações, 0 lançamentos de QA e nenhuma carteira com saldo diferente de zero.
- Supabase Security Advisor: alerta esperado para get_pool_dashboard() SECURITY DEFINER porque precisa calcular um agregado global sem revelar dados individuais; função exige auth.uid() e retorna apenas dados agregados + próprios.
- Performance Advisor: índice da FK wallet_transaction_id adicionado na migration seguinte.

## Decisões ainda necessárias antes da operação recorrente

1. Orçamento da pool por ciclo ou fonte econômica que alimentará o orçamento.
2. Duração e frequência dos ciclos (a duração local antiga de 10 minutos ainda não é uma regra persistente aprovada).
3. Se bots existirão na pool persistente. Nesta fase, bots locais foram excluídos; só jogadores com equipamentos persistentes participam.
4. Regra para ciclos sem participantes e limite máximo de emissão por período.

Até essas regras serem definidas, nenhum ciclo foi aberto, nenhuma recompensa foi emitida e nenhum operador foi habilitado. O mecanismo transacional está pronto para testes controlados, mas não há liquidação automática recorrente.
