# Supabase — Mining Pix (DEV)

O projeto Supabase conectado é o ambiente de desenvolvimento do Mining Pix:
- Projeto: `Mining Pix`
- Project ref: `odlasosyewiiepvrvbnn`
- Região: `us-west-2`
- Status verificado: `ACTIVE_HEALTHY`

**Não use este projeto para dados de produção.** O frontend publicado nesta etapa continua sendo uma demonstração; carteira e progressão ainda não são autoritativas no banco.

## Infraestrutura implantada

Migrations aplicadas:
- `202611090001_identity_foundation.sql` — identidade;
- `202611090002_wallet_ledger.sql` — ledger e RPC de débito;
- `202611090003_wallet_idempotency_lock.sql` — serialização de retries.

Tabelas:
- `profiles`: nome público e avatar do jogador;
- `wallets`: saldo inicial zero;
- `player_progress`: XP, nível, VIP e passe;
- `wallet_transactions`: ledger imutável de movimentações da carteira.

As três tabelas têm RLS habilitada. O cliente autenticado pode consultar somente os registros da própria conta. A carteira e a progressão não aceitam escrita direta pelo navegador. O trigger de Auth cria os três registros ao cadastrar uma identidade.

## Configuração de autenticação obrigatória

No painel Supabase, abra **Authentication → URL Configuration**:

1. Configure **Site URL** como:
   `https://andersonsr2004.github.io/Mining-Pix/`
2. Em **Redirect URLs**, adicione exatamente:
   `https://andersonsr2004.github.io/Mining-Pix/`
3. Se for usar previews temporários do StackBlitz, adicione somente a URL exata do preview que estiver utilizando. Evite curingas amplos.
4. Em **Authentication → Providers → Email**, mantenha habilitada a confirmação de e-mail para os testes.

O cliente já envia a URL de retorno para cadastro e recuperação de senha. Ela precisa estar na lista de URLs permitidas.

## Configuração do frontend

O cliente Supabase usa:
- Project URL: `https://odlasosyewiiepvrvbnn.supabase.co`
- Publishable key: chave pública de navegador (não é segredo).

Esses valores de DEV estão como fallback em `src/lib/supabase/client.ts`, para que o GitHub Pages funcione sem variáveis adicionais. Podem ser substituídos por:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

O arquivo `.env` não deve ser commitado. Nunca use `service_role`, secret key ou senha do banco no frontend, em `VITE_*` ou no GitHub.

## Fluxo de conta implementado

- Cadastro com e-mail, senha e nome de jogador;
- Login por e-mail e senha;
- Persistência e restauração da sessão;
- Logout;
- Recuperação de senha e atualização após o link;
- Consulta de perfil, carteira e progressão após autenticação;
- Exibição do perfil da conta.

Os dados de jogo ainda são sandbox local. O estado do simulador e o progresso dos jogos agora são separados por UUID de usuário no navegador, para evitar que duas contas no mesmo dispositivo compartilhem o mesmo save. Isso **não** equivale à sincronização entre dispositivos nem à persistência de economia no backend.

## Homologação de duas contas

1. Depois de configurar as URLs, abra o site e crie a conta A com um e-mail de teste controlado.
2. Confirme o e-mail e entre.
3. Verifique no Supabase **Authentication → Users** se a conta foi criada.
4. Em **Table Editor**, confirme que existe exatamente um registro correspondente em `profiles`, `wallets` e `player_progress`.
5. Saia, crie e confirme a conta B.
6. Confirme que B recebe registros próprios e que, ao alternar entre A e B no mesmo navegador, os saves locais são separados.
7. Não tente alterar saldo, XP ou VIP por chamadas diretas: essas colunas estão protegidas e ainda não há RPC econômica.

Não crie contas de teste com dados pessoais de terceiros. Não compartilhe senhas no chat.

## Limites desta etapa

- PC, XP, inventário, equipamentos, bots, Mining Pool, missões, passe e recompensas de jogos continuam locais e manipuláveis no sandbox.
- A carteira persistente é consultável pelo próprio usuário; alterações diretas continuam bloqueadas. A RPC `debit_wallet` permite apenas débitos autenticados, com saldo suficiente, lock transacional e idempotência. Créditos não são expostos ao cliente. O saldo atual no banco permanece zero.
- Nenhuma recompensa de jogo é creditada no banco.
- Não existe ainda role administrativa, RPC de crédito, compras server-side, settlement da Mining Pool ou Edge Function econômica.
- Não importar os dados legados do localStorage como legítimos.

Consulte `docs/PHASE2_WALLET.md` para o escopo, testes e limites da primeira entrega da Fase 2.


## Catálogo e compras persistentes — Fase 2B

Migrations adicionais:
- `202611090004_equipment_catalog_and_atomic_purchase.sql` — catálogo global, inventário por jogador e RPC transacional de compra.
- `202611090005_equipment_purchase_idempotency_fix.sql` — retry idempotente preservado mesmo se o preço do catálogo for atualizado após a compra original.
- `202611090006_equipment_catalog_fk_index.sql` — índice da FK do catálogo no inventário.

Catálogo inicial: PIX Miner II (250 H/s, 2.500 PC) e PIX Miner III (600 H/s, 5.000 PC). A RPC `purchase_equipment` recebe somente SKU e chave idempotente; preço é consultado no banco. A carteira, o ledger e o inventário são alterados atomicamente.

A tela Loja agora apresenta a loja persistente e o inventário vinculado à conta, mantendo a loja demonstrativa em uma seção separada. O inventário persistente ainda não alimenta a instalação e o hashrate local.


## Salas, instalação e hashrate — Fase 2C

Migration:
- `202611090007_persistent_rooms_installation_and_hashrate.sql`

Cria `player_rooms` e `player_equipment_operations`, associa equipamento à sala por FK composta de proprietário, adiciona triggers de provisionamento por VIP e RPCs `install_player_equipment`, `uninstall_player_equipment`, `rename_player_room` e `get_player_mining_summary`.

Limites: até 4 salas conforme VIP e 10 equipamentos por sala. O resumo de hashrate é calculado no PostgreSQL e respeita RLS. Instalação/desinstalação são idempotentes e não alteram PC. O simulador local continua separado.


## Otimização e visibilidade de equipamentos próprios — Fase 2C.1

Migration:
- `202611090008_facility_fk_indexes_and_owned_catalog_visibility.sql`

Adiciona índices de cobertura para FKs compostas de sala/equipamento/operações e permite que o jogador consulte os dados de catálogo de equipamentos que já possui, mesmo que um SKU seja desativado para novas compras. O catálogo continua listando publicamente apenas itens ativos.


## Retenção do histórico de salas em downgrade VIP — Fase 2C.2

Migration:
- `202611090009_preserve_room_history_on_vip_downgrade.sql`

Salas excedentes passam a ser marcadas como inativas, em vez de excluídas. Isso preserva as referências históricas das operações de instalação/desinstalação. Salas inativas não aparecem ao jogador, não entram na capacidade disponível e não podem receber equipamentos. Um upgrade reativa as salas correspondentes.


## Resumo de hashrate por sala no backend — Fase 2C.3

Migration:
- `202611090010_backend_room_hashrate_summaries.sql`

Adiciona `get_player_room_summaries()`, função SECURITY INVOKER que retorna capacidade, quantidade instalada e hashrate de cada sala ativa. O painel não calcula mais o hashrate das salas no navegador; apenas apresenta os valores calculados pelo PostgreSQL.
