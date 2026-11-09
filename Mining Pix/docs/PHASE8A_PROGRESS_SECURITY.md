# Fase 8A — Fundação de progressão persistente e hardening

## Entregue no DEV
- Migration `202611090020_persistent_xp_foundation.sql`.
- Ledger append-only `player_xp_transactions`, com chave única por jogador e operação.
- XP e nível continuam em `player_progress`; clientes autenticados têm somente leitura.
- RPC `claim_daily_login_xp()` deriva o jogador de `auth.uid()` e o dia de UTC no banco. O cliente não fornece usuário, quantidade de XP, data ou chave de idempotência.
- Uma conta pode receber 100 XP por dia UTC. Retry e chamadas concorrentes usam a mesma chave única e não duplicam a recompensa.
- O componente `PersistentProgressPanel` apresenta a progressão da conta online e permite resgatar a recompensa diária.
- A progressão local do sandbox permanece separada e explicitamente identificada; XP local, missões locais e resultados de jogos não são promovidos automaticamente a XP legítimo.
- O Admin Center já consulta `player_progress`; agora os valores online são atualizados pela RPC.

## Hardening aplicado
- RLS habilitada no ledger XP; leitura limitada ao próprio `user_id`.
- `anon` não pode ler o ledger nem executar a RPC.
- `authenticated` não pode inserir/atualizar/excluir linhas do ledger.
- A RPC é `SECURITY DEFINER` com `search_path = ''`, nomes de objetos qualificados, identidade derivada de `auth.uid()` e execução concedida somente a `authenticated`.
- Edge Function `admin-control` atualizada para exigir origem exata do GitHub Pages, método POST, `Content-Type: application/json` e rejeição antecipada de payloads com Content-Length acima do limite. JWT e claim administrativo continuam validados no Auth e no banco.
- Edge Function implantada no DEV como versão 4, mantendo `verify_jwt=true`.

## QA executado
- Migration aplicada no Supabase DEV.
- Teste transacional da RPC com identidade autenticada: +100 XP e nível calculado corretamente; transação revertida.
- Retry da mesma RPC na mesma janela UTC retornou `awarded=false` e `amount=0`; transação revertida.
- Privilégios verificados: `anon` sem SELECT no ledger e sem EXECUTE na RPC; `authenticated` com SELECT próprio e EXECUTE na RPC, sem INSERT direto.
- Nenhum XP ou lançamento de QA permaneceu no banco.
- Não foram concedidos XP a contas reais pela implementação.

## Limites intencionais
- Apenas a recompensa diária de login está ativa no backend nesta fase.
- Missões de jogos, anúncios, compras, recargas e eventos enviados pelo navegador continuam sem gerar XP persistente.
- Recompensas de Passe de Batalha e trilha Premium permanecem no sandbox até existir catálogo, temporada, entitlement e claims validados no servidor.
- O XP antigo de localStorage não foi importado.

## Pendências de segurança antes de produção
1. Habilitar Leaked Password Protection no Supabase Auth (configuração de projeto ainda exige ação no Dashboard).
2. Confirmar MFA para a conta administradora e política de sessão/revogação.
3. Implementar rate limiting server-side para operações privilegiadas e endpoints sujeitos a abuso.
4. Fazer validação server-side/replay dos três jogos antes de atribuir XP ou PC por partidas.
5. Definir política de temporada, progressão e recompensas Premium antes de persistir o Passe de Batalha.
6. Reavaliar advisors após cada fase; os avisos de funções SECURITY DEFINER e tabelas sem policy de leitura direta devem ser julgados pelo grant e pelas verificações internas, não removidos indiscriminadamente.

## Custo
- Lovable: 0 créditos estimados. Implementação feita diretamente no GitHub e Supabase.
- Ambiente Supabase DEV; nenhuma migration aplicada em produção.
