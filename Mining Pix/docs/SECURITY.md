# Mining Pix — segurança, RLS e matriz de permissões

**Status:** controles implementados incrementalmente no Supabase DEV; consulte as seções de implementação e os documentos de fase para distinguir controles ativos de requisitos ainda pendentes.

## 1. Modelo de ameaça

Proteger contra:
- Jogador alterando localStorage, estado React, requests, JavaScript ou parâmetros enviados pelo browser.
- Acesso horizontal aos dados de outro jogador por troca de UUID.
- Repetição de requisições para duplicar recompensas, compras ou ciclos.
- Corridas concorrentes em carteira, reivindicações e alocações.
- Usuário comum tentando executar ações administrativas.
- Dados de jogo forjados, speed hacks e resultados impossíveis.
- Exposição acidental de chaves privilegiadas e dados pessoais.
- Dependências vulneráveis e mudanças de schema sem revisão.

Não é objetivo desta fase proteger contra comprometimento do provedor, credenciais do próprio usuário roubadas ou fraude de pagamento externo ainda não integrado. Esses riscos exigem controles adicionais.

## 2. Princípios obrigatórios

1. **Negar por padrão:** RLS habilitada em toda tabela exposta; grants mínimos.
2. **Propriedade no servidor:** identidade do dono vem de `auth.uid()`, não de `user_id` enviado pelo cliente.
3. **Economia server-authoritative:** cliente não atualiza saldo, XP, inventário, recompensas ou status VIP diretamente.
4. **Ledger imutável:** usuário não insere, atualiza ou exclui transações.
5. **Idempotência:** cada comando que produz efeito usa chave única e resultado estável em retry.
6. **Transação:** validação, alteração de estado e ledger na mesma transação.
7. **Segredos:** chave `service_role` apenas server-side; nunca no bundle, Git ou `VITE_*`.
8. **Auditoria:** toda ação privilegiada inclui ator, alvo, motivo, horário e identificador da requisição.
9. **Validação:** tratar todo input do browser como não confiável.
10. **Separação DEV/PROD:** credenciais, dados e migrations isolados.

## 3. Matriz de permissões

Legenda: **R** ler; **C** criar; **U** atualizar; **D** excluir; **RPC** somente por função aprovada; **—** sem acesso direto.

| Recurso | Anônimo | Jogador autenticado | Admin | Processo de serviço |
|---|---:|---:|---:|---:|
| Perfil próprio | — | R/U campos permitidos | R/U conforme suporte | C |
| Perfil de outro jogador | — | R apenas campos públicos explicitamente expostos | R | — |
| Carteira própria | — | R | R para suporte autorizado | C/U via RPC |
| Carteira de outro jogador | — | — | R limitada; ajustes via RPC | C/U via RPC |
| Ledger próprio | — | R | R para auditoria autorizada | C via RPC |
| Ledger alheio | — | — | R auditável | C via RPC |
| Progresso próprio | — | R | R/U via RPC | C/U via RPC |
| Inventário/salas próprios | — | R | R/U via RPC | C/U via RPC |
| Inventário/salas alheios | — | — | R/U via RPC | C/U via RPC |
| Catálogo público | R leitura permitida | R | C/R/U/D | R |
| Missões/temporadas | R leitura permitida | R | C/R/U/D | R |
| Progresso de missão/passe | — | R próprio; claim via RPC | R/U via RPC | C/U via RPC |
| Sessões e recordes | — | R próprio; submit via RPC | R para suporte | C/U via RPC |
| Ciclos/alocações públicas agregadas | R somente métricas aprovadas | R somente métricas aprovadas | R | C/U |
| Bots e parâmetros globais | — | R somente estado público sanitizado | R/C/U/D via RPC | C/U |
| Papéis administrativos | — | — | leitura mínima; concessão/revogação por canal privilegiado | C/U |
| Logs administrativos | — | — | R restrita | C |

Admin não deve receber automaticamente acesso ilimitado a dados privados se a tarefa de suporte não exigir. Ações de alto impacto podem exigir confirmação reforçada e motivo obrigatório.

## 4. Regras RLS por domínio

### Dados por usuário
Para `profiles`, `wallets`, `player_progress`, `player_equipment`, `player_rooms`, `player_missions`, `battle_pass_progress`, `game_sessions` e `game_records`:
- SELECT: `auth.uid() = user_id`.
- UPDATE em perfil: somente colunas de perfil explicitamente permitidas.
- INSERT: preferir trigger/função de provisionamento; não aceitar `user_id` arbitrário.
- UPDATE/DELETE de estado econômico: sem grants diretos; usar RPC.
- Não usar policy ampla `USING (true)` em tabelas privadas.

### Carteira e ledger
- Carteira: SELECT próprio. Sem INSERT/UPDATE/DELETE direto por `authenticated`.
- Ledger: SELECT próprio. Sem INSERT/UPDATE/DELETE direto por `authenticated`.
- RPC verifica identidade, bloqueia linha da carteira (`SELECT ... FOR UPDATE`), aplica mudança e grava transação.
- `idempotency_key` com unique constraint; conflito retorna resultado original, não repete crédito.
- Operações administrativas não contornam o ledger: geram lançamento compensatório.

### Catálogos e dados públicos
- Catálogo, missões e temporadas podem permitir SELECT público apenas para conteúdo aprovado e habilitado.
- Escrita somente para papel administrativo ou processo confiável.
- Métricas de rede devem ser agregadas e não revelar carteira, identidade ou comportamento individual sem necessidade.

### Bots, ciclos e configurações
- Não permitir que jogador insira ou altere bots, orçamento, parâmetros globais, ciclos ou alocações.
- Processo de serviço ou RPC privilegiada administra esses recursos.
- Admin executa ações por funções verificadas e auditadas.

## 5. Autorização administrativa

- Papel deve vir de fonte confiável: tabela `admin_roles` protegida e/ou claim em `app_metadata` escrita exclusivamente pelo servidor.
- Nunca confiar em `user_metadata`, parâmetro do request, campo local, botão escondido ou role enviada pelo frontend.
- Toda RPC administrativa consulta papel atual e valida o alvo.
- Concessão/revogação de admin deve exigir acesso privilegiado ao projeto e gerar auditoria.
- Evitar `SECURITY DEFINER` sem `search_path` fixo e grants mínimos.
- Chaves privilegiadas não devem ser distribuídas a usuários administrativos comuns.

## 6. Proteção contra abuso e concorrência

- Idempotency key para compras, claims, jogos e ciclos.
- Transações SQL e locks de linha em carteiras/recursos disputados.
- Unique constraints para claims, sessões, ciclos e alocações.
- Rate limits por usuário/IP nas Edge Functions para operações de alto custo; não depender apenas de limites do frontend.
- Validar tamanho/tipo/faixa de todos os campos e payloads.
- Limitar paginação e payloads; não retornar dados excessivos.
- Não aceitar preço, saldo final, hashrate global, orçamento, recompensa ou XP como autoridade do browser.
- Para ações sensíveis, verificar sessão recente ou confirmação adicional conforme o risco.

## 7. Segurança de jogos

- Sessão criada pelo backend com nonce, versão das regras e janela de validade.
- Resultado associado a uma única sessão.
- Validar sequência de inputs, duração mínima/máxima, frequência de eventos, limites físicos e consistência do estado.
- Preferir replay determinístico no servidor; não confiar apenas em hash ou score enviado pelo cliente.
- Uma sessão não pode ser concluída mais de uma vez.
- Recompensa só depois de validação bem-sucedida.
- Se validação robusta ainda não existir, manter recompensa apenas no sandbox local ou desabilitar crédito persistente.
- Registrar versão do jogo para que mudanças de regras não invalidem replays antigos.

## 8. Segredos e pipeline

- Chave publishable/anon no frontend apenas com RLS corretamente aplicada.
- `service_role`, tokens de deploy e credenciais de banco em GitHub Secrets/Supabase secrets, conforme a função.
- Não imprimir segredos nos logs; mascarar variáveis e evitar debug de headers.
- Revisar bundle de produção para garantir ausência de chave privilegiada.
- CodeQL, Dependabot e npm audit continuam como controles auxiliares, não substitutos de revisão.
- Migrations via pull request e pipeline DEV primeiro; PROD com aprovação manual.
- Backups e plano de recuperação definidos antes do lançamento.

## 9. Testes de segurança obrigatórios

1. Jogador A não lê dados privados de B usando UUID conhecido.
2. Jogador A não altera saldo, XP, VIP, inventário ou progresso de B.
3. Jogador comum não insere ledger nem altera carteira.
4. Repetir a mesma compra/claim não duplica o efeito.
5. Duas compras concorrentes não deixam saldo negativo.
6. Duas chamadas de settlement do mesmo ciclo não duplicam alocação.
7. Alterar score, tempo, nonce ou resultado no browser não gera recompensa inválida.
8. Usuário sem papel admin não executa RPC administrativa.
9. Revogar papel admin impede novas operações privilegiadas.
10. Nenhuma chave `service_role` aparece em bundle, logs ou repositório.

## 10. Incidentes e resposta

- Revogar imediatamente segredo exposto e rotacionar credenciais afetadas.
- Suspender RPC/Edge Function comprometida, preservando logs.
- Identificar usuários, transações e intervalo afetado.
- Corrigir por migration revisada e lançar ajustes compensatórios auditáveis.
- Comunicar impacto de forma clara; nunca apagar ledger para ocultar incidente.


## 11. Implementação do Admin Center (Fase 4)

- O Admin Center utiliza Supabase Auth para autenticação e `app_metadata.admin` para autorização.
- A função `public.admin_dashboard_snapshot()` repete a verificação no PostgreSQL a cada chamada; usa `SECURITY DEFINER`, `search_path=''`, grants mínimos e consultas qualificadas.
- O claim nunca é lido de `user_metadata`, pois esse campo é controlável pelo usuário.
- `anon` não possui EXECUTE; `authenticated` pode chamar o RPC, mas chamadas sem claim administrativo são rejeitadas pela função.
- A função retorna apenas indicadores agregados, últimos lançamentos e perfis recentes, sem e-mails ou credenciais.
- O painel é somente leitura nesta fase. Ações de escrita exigirão uma trilha append-only em `admin_audit_logs`, motivo obrigatório, ator/alvo, idempotência e validação server-side.
- A URL administrativa não é secreta nem mecanismo de controle; a autorização real ocorre no backend.
- Antes de produção: MFA na conta administradora, Leaked Password Protection habilitada, revisão de advisors e projeto PROD separado.


## 12. Fase 6 — notas internas auditadas

- O Admin Center permite registrar notas internas vinculadas a um UUID de jogador.
- Notas não alteram carteira, saldo, VIP, progresso, inventário, equipamentos ou acesso à conta.
- A Edge Function `admin-control` exige JWT válido, resolve o usuário com `auth.getUser(token)` e verifica `app_metadata.admin` obtido do Auth.
- O banco revalida o claim atual em `auth.users.raw_app_meta_data`, confirma a existência do alvo e grava a nota dentro de `admin_audit_logs`.
- A escrita ocorre por função SQL disponível somente a `service_role`; a tabela de auditoria continua sem leitura/escrita direta por clientes.
- Cada envio usa `request_id` único e índice parcial para idempotência; retry idêntico retorna o evento existente, enquanto reutilização da chave com payload diferente é rejeitada.
- Toda nota exige motivo, ator, alvo e timestamp. O conteúdo não é enviado ao jogador nem aparece no jogo público.
- Esta capacidade é somente de anotação; não habilita ajustes econômicos ou alterações de conta.


## Fase 7B — controles de acesso administrativo

O bloqueio/desbloqueio de jogadores usa Supabase Auth pelo backend (`admin-control`) com JWT e `app_metadata.admin` verificados. A operação tem motivo obrigatório, confirmação explícita, request ID idempotente e evento append-only na auditoria. Administradores e a própria conta do administrador não podem ser alterados pelos controles de jogador. O banimento padrão é de 30 dias. JWTs de acesso já emitidos continuam válidos até expirarem; portanto, bloqueio não significa revogação instantânea de tokens já emitidos. Consulte `docs/PHASE7B_ADMIN.md`.


## 13. Hardening validado — Fase 8A

- `player_xp_transactions` é um ledger de XP com RLS, leitura apenas pelo proprietário e sem grants de escrita para `anon` ou `authenticated`.
- `claim_daily_login_xp()` usa `auth.uid()`, dia UTC calculado no banco, chave idempotente única e transação atômica. O browser não escolhe usuário, XP, período ou chave.
- A RPC usa `SECURITY DEFINER` com `search_path=''`, objetos qualificados e EXECUTE concedido apenas a `authenticated`; chamadas anônimas são negadas.
- O componente de progressão mostra XP persistente separado do XP sandbox local.
- `admin-control` exige origem exata do GitHub Pages, POST, JSON e JWT válido; o claim administrativo é validado no Auth e novamente no banco. Versão 4 implantada no DEV.
- Testes SQL foram executados dentro de transações revertidas; nenhum XP de QA foi persistido.

### Interpretação dos avisos do Supabase Advisor
O advisor sinaliza funções `SECURITY DEFINER` acessíveis a `authenticated` e tabelas RLS sem policies. Isso não é automaticamente uma vulnerabilidade: algumas RPCs precisam ser chamadas pelo usuário autenticado e validam `auth.uid()`/claim administrativo internamente; tabelas de auditoria e operações administrativas sem policy são intencionalmente inacessíveis diretamente. A revisão deve conferir, para cada função, assinatura, `search_path`, grants e validação interna. Não criar policies amplas nem conceder escrita direta apenas para silenciar lints.

### Pendências explícitas
- Leaked Password Protection permanece desativada e precisa ser habilitada no Dashboard Auth/Security.
- MFA da conta admin deve ser confirmada antes de produção.
- Rate limiting server-side e política de sessão/revogação ainda precisam ser implementados/revistos.
- XP de jogos, missões e recompensas do Passe não devem ser persistidos até validação server-side de cada evento.


## 14. Sandbox administrativo — RLS habilitada (DEV)

Migration `20261110182731_secure_sandbox_tables_enable_rls.sql` habilita RLS em:
- `private.sandbox_sessions`
- `private.sandbox_miners`
- `private.sandbox_blocks`
- `private.sandbox_allocations`
- `private.sandbox_admin_events`

Não foram criadas policies para `anon` ou `authenticated`; essas tabelas não possuem grants diretos para esses papéis e o schema `private` não concede USAGE a eles. O papel `service_role` mantém os privilégios operacionais necessários.

As RPCs administrativas de sandbox são `SECURITY DEFINER`, pertencem a `postgres` e chamam `private.assert_sandbox_admin()`, que exige `auth.uid()` e confirma `auth.users.raw_app_meta_data.admin=true`. O dono da função pode operar nas tabelas com RLS habilitada; o chamador comum não recebe acesso direto.

Verificação pós-migration no Supabase DEV:
- RLS habilitada nas cinco tabelas.
- Nenhuma policy criada nessas tabelas.
- Nenhum grant direto a `anon` ou `authenticated`.
- `authenticated_private_usage=false` e `anon_private_usage=false`.
- Sem alteração de dados, saldos, ciclos ou recompensas.

## 15. Salas permanentes, eventos e VIP — DEV

- purchase_player_room(text) é SECURITY DEFINER, exige auth.uid(), usa lock transacional da conta, debita 10.000 PC e grava a sala e a transação com chave de idempotência. anon não tem EXECUTE.
- Triggers antigos que criavam/desativavam salas em mudanças VIP foram removidos. O limite permanente é de 4 salas por jogador, imposto pela RPC de compra e por constraint no banco; a função de instalação não verifica VIP.
- private.vip_topup_events tem RLS habilitada, sem policies nem grants para anon/authenticated; somente service_role recebe acesso para ingestão de pagamentos confirmados pelo futuro webhook. Nenhum gateway está conectado nesta fase.
- get_my_vip_status() só consulta a própria conta e recalcula a janela móvel de 30 dias. Reembolsos/chargebacks são excluídos pelo status do ledger.
- private.vip_hash_multiplier(uuid) deriva o boost diretamente do ledger de pagamentos confirmados, evitando depender de um vip_tier expirado. get_pool_dashboard() e settle_pool_cycle(uuid) usam o multiplicador individual por jogador. Liquidação permanece restrita a service_role.
- game_events tem RLS; jogadores leem apenas campanhas ao vivo dentro da janela. RPCs administrativas verificam auth.uid() e auth.jwt()->'app_metadata'->>'admin'='true', e ações são registradas em admin_audit_logs.
- A liquidação da Pool retém 1,5% da recompensa bruta individual em MC (sem conversão), registra o valor em ledger privado e o acumula em reserva privada para financiar ciclos futuros. A fração inferior a 1 MC é carregada individualmente entre ciclos até completar uma unidade inteira, evitando perda sistemática por arredondamento. A abertura de um novo ciclo incorpora a reserva ao orçamento e registra a movimentação. Não há crédito de PC nem débito retroativo.
- Não foram ativados pagamentos reais, saques ou webhooks.

