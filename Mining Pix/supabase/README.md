# Supabase DEV — Mining Pix

Esta pasta contém migrations versionadas. **Não aplique migrations no projeto PROD.**

## Criar o projeto DEV

1. Entre em https://supabase.com/dashboard e crie um projeto chamado `mining-pix-dev`.
2. Escolha uma região próxima dos jogadores (a região não pode ser alterada depois da criação).
3. Use uma senha forte para o banco e guarde-a em um gerenciador de senhas.
4. Aguarde o provisionamento e abra **Project Settings → API**.
5. Copie a Project URL e a chave pública **publishable** (ou a chave legada `anon`, se o painel ainda apresentar esse formato).
6. Não copie a `service_role` para o frontend, GitHub, arquivos versionados ou variáveis `VITE_*`.

## Aplicar a primeira migration

No painel do Supabase, abra **SQL Editor → New query**, cole o conteúdo de:

`supabase/migrations/202611090001_identity_foundation.sql`

Execute somente no projeto `mining-pix-dev`. A migration cria:
- `profiles`: perfil básico individual;
- `wallets`: carteira inicial com saldo zero, sem escrita direta pelo cliente;
- `player_progress`: progressão inicial, também somente leitura pelo cliente;
- trigger de provisionamento ao criar uma identidade no Supabase Auth;
- políticas RLS e privilégios mínimos.

A migration é transacional. Se ocorrer erro, não avance para integração do frontend; envie o erro para revisão.

## Configurar autenticação

Em **Authentication → URL Configuration**:
- Site URL DEV: URL de preview que será usada durante os testes.
- Redirect URLs: adicionar a URL exata do preview e, quando necessário, a URL GitHub Pages de teste.
- Para a primeira homologação, manter confirmação de e-mail habilitada e usar endereços de teste controlados.

Não habilite login social, recuperação customizada ou produção nesta etapa.

## Configuração local futura

Quando a integração do frontend for adicionada, os valores públicos serão fornecidos via variáveis:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY` para chave legada)

O arquivo `.env` não deve ser commitado. Nunca forneça a senha do banco ou `service_role` no chat.

## Teste de isolamento obrigatório

Depois da integração Auth:
1. Criar duas contas de teste independentes (A e B).
2. Confirmar que cada conta recebe exatamente um perfil, uma carteira com saldo 0 e um progresso inicial.
3. Autenticado como A, confirmar que as consultas de perfil/carteira/progresso retornam somente A.
4. Tentar consultar os UUIDs de B diretamente pela API: nenhuma linha de B pode ser retornada.
5. Tentar INSERT/UPDATE/DELETE direto em `wallets` e `player_progress`: deve ser negado.
6. Confirmar que usuário anônimo não lê dados privados.

Não creditar recompensas de jogo, importar saldos locais ou liberar operações econômicas nesta fase.
