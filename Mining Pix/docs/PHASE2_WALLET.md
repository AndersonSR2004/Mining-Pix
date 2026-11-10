# Fase 2A — carteira persistente e ledger

**Status:** implementado no Supabase DEV e na branch `codex/mining-pix-work`. Ainda não mesclado na `main`.

## Escopo entregue

- `wallet_transactions`: ledger append-only para clientes, com valor assinado, saldo após a operação, tipo, referência, chave de idempotência e data.
- RLS habilitada; jogador autenticado só consulta as próprias movimentações.
- Nenhum privilégio de INSERT, UPDATE ou DELETE concedido ao cliente em `wallet_transactions`.
- `debit_wallet`: RPC transacional para débito da própria carteira autenticada.
- A RPC valida valor inteiro positivo, autenticação, chave, descrição, existência da carteira e saldo suficiente.
- A RPC bloqueia a linha da carteira com `FOR UPDATE`, atualiza saldo/versão e insere o ledger na mesma transação.
- A verificação de idempotência ocorre depois do lock da carteira, serializando retries concorrentes da mesma conta.
- Reutilizar uma chave com valor diferente é rejeitado.
- A função não permite crédito ao jogador. Créditos futuros serão concedidos somente por operações confiáveis de servidor.

## Interface

A tela Carteira agora mostra separadamente:
1. **Carteira persistente:** saldo e últimas 20 transações consultados do Supabase, protegidos por RLS.
2. **Sandbox local:** saldo antigo do simulador, explicitamente rotulado como demonstração.

Os dados locais não foram importados. As duas carteiras persistentes permanecem com saldo zero. A economia principal do jogo, compras, mineração, XP, VIP, jogos e recompensas ainda não foram migrados nesta entrega.

## Migrations aplicadas no projeto DEV

- `202611090001_identity_foundation`
- `202611090002_wallet_ledger`
- `202611090003_wallet_idempotency_lock`

## Verificações realizadas

- Duas identidades continuam provisionadas com perfil, carteira e progressão.
- `wallet_transactions` criada com RLS habilitada.
- Teste de RLS como usuário A: uma carteira visível; carteira do usuário B invisível.
- Tentativa de UPDATE direto na carteira como usuário autenticado rejeitada por falta de privilégio.
- Débito sem saldo suficiente rejeitado.
- Teste transacional com saldo temporário de 100 PC: duas chamadas com a mesma chave produziram saldo 90 e versão 1; a transação de teste foi revertida. Nenhum saldo ou lançamento de teste permaneceu no banco.
- npm build/test/CodeQL e deploy ainda dependem da conclusão dos workflows GitHub para o commit desta etapa.

## Avisos de segurança

O Supabase Security Advisor sinaliza a RPC `debit_wallet` por ser `SECURITY DEFINER` executável por usuários autenticados. Isso é intencional nesta RPC de débito, que é limitada ao usuário autenticado, só reduz saldo, usa lock transacional e não aceita crédito. O alerta deve continuar sendo acompanhado; não se deve ampliar o escopo da função.

O Advisor também aponta a proteção contra senhas comprometidas desativada no Auth. Habilitar essa opção no painel Supabase é uma pendência operacional recomendada.

## Próximos passos

1. Aguardar CI, testes, CodeQL e Preview no GitHub.
2. Fazer teste visual autenticado da tela Carteira.
3. Implementar compras de equipamentos por RPC que valide preço e catálogo no banco.
4. Criar processo server-side de crédito e settlement antes de migrar recompensas, Mining Pool ou jogos.
5. Manter a PR como draft até todos os critérios de aceite serem revisados.
