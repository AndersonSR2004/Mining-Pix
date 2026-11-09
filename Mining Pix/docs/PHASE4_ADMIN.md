# Fase 4 — Mining Pix Admin Center

## Objetivo
Separar a interface administrativa do jogo e disponibilizar uma visão operacional somente leitura sobre os dados persistentes do projeto Supabase DEV.

## Endereço
Após o deploy da branch, o ponto de entrada administrativo é:
`https://andersonsr2004.github.io/Mining-Pix/admin.html`

A página do jogo continua em `/`. O painel não é vinculado no menu público.

## Autorização
- O login reutiliza Supabase Auth, mas não oferece cadastro.
- O frontend só apresenta o dashboard quando o token do usuário contém `app_metadata.admin=true`.
- A função PostgreSQL `admin_dashboard_snapshot()` repete a autorização no backend usando `auth.jwt()->'app_metadata'`; `user_metadata` não é aceito.
- A função exige usuário autenticado, usa `SECURITY DEFINER` com `search_path=''`, revoga execução de `PUBLIC` e `anon` e concede execução a `authenticated`. A própria função valida o claim administrativo antes de consultar dados globais.
- A tela pública não possui mais o menu de Administração nem ferramentas locais de ajuste de saldo, VIP, XP, inventário, bots ou reset do sandbox.
- O simulador local e a carteira sandbox continuam separados das carteiras persistentes do Supabase DEV; a Mining Pool persistente é exibida em componente próprio.

## Concessão do primeiro administrador
Nenhuma conta recebeu privilégio automaticamente. Para conceder acesso:
1. Abra Supabase Dashboard → Authentication → Users.
2. Identifique sua conta pelo e-mail e abra o editor de metadados administrativos (Raw App Meta Data / app_metadata).
3. Preserve os metadados existentes e acrescente `"admin": true` no objeto `app_metadata`.
4. Salve, encerre a sessão e entre novamente em `/admin.html` para receber um JWT atualizado.

Para revogar, remova `admin` ou defina `false`. Nunca coloque esse atributo em `user_metadata`. O acesso ao painel não deve ser concedido apenas com base no endereço de e-mail informado pelo navegador.

## Escopo atual
- Indicadores globais: jogadores, carteiras, soma de PC, equipamentos instalados, hashrate persistente e estado/histórico agregado da Mining Pool.
- Ledger: últimas 20 movimentações com nome de exibição e identificador de conta.
- Jogadores: 10 cadastros mais recentes.
- Sem e-mails de jogadores, credenciais ou chaves privilegiadas no payload.
- Somente leitura: não há controles para emitir PC, editar carteira, alterar VIP, administrar equipamentos ou abrir/liquidar ciclos.

## Limites e próximos passos
- Este é um painel DEV, não uma instância de produção.
- A URL separada e `noindex` não são controles de segurança; a autorização real é feita no backend.
- Recomenda-se habilitar MFA na conta administradora antes de operações privilegiadas.
- A fase seguinte deve introduzir trilha de auditoria para mutações administrativas antes de liberar qualquer comando de escrita.
- O projeto Supabase de produção, credenciais e dados reais ainda não existem; nenhuma integração de pagamento foi criada.


## Fase 5 — fundação da auditoria administrativa

A migration `202611090015_admin_audit_foundation.sql` cria `admin_audit_logs` como trilha append-only para futuras operações privilegiadas.

- Cada evento registra ator, alvo, ação, tipo/ID da entidade, motivo, estado anterior/posterior, contexto não sensível, request ID e timestamp.
- O cliente `anon` e `authenticated` não recebe permissões diretas de leitura ou escrita na tabela.
- Somente `service_role` pode inserir eventos; não recebe UPDATE ou DELETE.
- RLS permanece habilitada sem políticas de acesso direto.
- A RPC `admin_audit_snapshot()` exige sessão autenticada e `app_metadata.admin=true`, retornando os 50 eventos mais recentes.
- O Admin Center passa a exibir a trilha de auditoria, mantendo o modo somente leitura.
- A tabela não deve armazenar senhas, tokens, credenciais de pagamento ou segredos.
- Nenhuma operação administrativa de escrita foi habilitada nesta fase.

A tabela começa vazia. Os eventos serão gravados quando as futuras Edge Functions administrativas forem implementadas e validadas.
