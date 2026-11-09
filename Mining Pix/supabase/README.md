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
