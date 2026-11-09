# Fase 1 — autenticação e identidade

**Status:** implementação inicial concluída na branch `codex/mining-pix-work`; homologação real depende da configuração de URLs e de dois cadastros controlados.

## Implementado

- Cliente `@supabase/supabase-js` fixado em `2.110.8`, com lockfile atualizado.
- Cliente Supabase configurado com persistência de sessão, renovação automática e detecção de retorno de e-mail.
- Cadastro com nome de jogador, e-mail e senha.
- Login e logout.
- Recuperação de senha e atualização de senha após retorno do link.
- Leitura de perfil, carteira e progressão após autenticação.
- A aplicação só inicia depois de confirmar que os três registros iniciais existem.
- Nome de jogador sincronizado com a coluna autorizada em `profiles`.
- Saves locais do simulador e dos jogos separados pelo UUID autenticado.

## Segurança

- A chave publishable é pública por definição e está limitada ao projeto DEV.
- Não há chave secret ou `service_role` no frontend.
- O banco permanece protegido por RLS e privilégios mínimos.
- O cliente não recebe permissão de escrita direta em carteira ou progressão.
- O UUID da sessão é usado somente para separar saves locais; não é tratado como prova de autorização no backend.

## O que ainda NÃO é persistido no banco

Saldo/PC, XP, VIP, inventário, equipamentos, Mining Pool, bots, missões, passe, recordes e recompensas de jogos continuam no sandbox do navegador. A separação por UUID evita que contas diferentes compartilhem o mesmo save no mesmo navegador, mas não oferece sincronização entre dispositivos nem proteção contra manipulação do cliente.

A carteira criada no Supabase começa em zero. O saldo de demonstração de 10.000 PC do jogo não é importado e não é saldo real.

## Critérios de aceite pendentes

1. Configurar Site URL e Redirect URLs no projeto Supabase.
2. Cadastrar e confirmar duas contas de teste controladas.
3. Confirmar que cada conta tem um registro próprio em `profiles`, `wallets` e `player_progress`.
4. Confirmar que cada sessão lê apenas os próprios registros.
5. Confirmar que o usuário não consegue alterar carteira ou progressão por chamadas diretas.

Nenhuma conta de teste foi criada automaticamente e nenhuma senha foi solicitada.
