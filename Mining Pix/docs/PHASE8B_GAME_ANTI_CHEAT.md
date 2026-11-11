# Fase 8B — integridade dos minijogos (DEV)

## Problema confirmado

O navegador executava a simulação dos minijogos e enviava `p_won` para a RPC `finish_player_game_attempt`. O backend aceitava esse booleano como verdade, creditando +1 H/s temporário por 24 horas. Um cliente modificado poderia forjar vitórias sem concluir legitimamente a simulação.

## Mitigação aplicada

Migration: `20261112020000_fail_closed_client_game_win_claims.sql`

- A RPC mantém autenticação por `auth.uid()`, valida a propriedade da tentativa e bloqueia tentativas expiradas.
- O parâmetro `p_won` deixa de ser fonte de verdade.
- Até existir validação server-side de replay/telemetria, toda tentativa finalizada é persistida como `won=false`, `hash_awarded=0` e `pc_awarded=0`.
- A resposta declara `win_verified=false`; o cliente não pode avançar vitórias/níveis ou missões de vitória sem confirmação verificável.
- Repetições da mesma tentativa continuam idempotentes.
- `anon` e `PUBLIC` não recebem EXECUTE; `authenticated` mantém execução da RPC autenticada.

## Dados anteriores no DEV

A auditoria encontrou cinco tentativas históricas com vitória declarada pelo cliente e 1 H/s cada, associadas à conta de desenvolvimento do proprietário do projeto. Como a origem dessas vitórias não era verificável, o boost ativo de 5 H/s foi zerado e sua expiração removida. O histórico das tentativas foi preservado; nenhum saldo PC ou MC foi alterado.

## Limitação funcional temporária

As vitórias dos minijogos ainda não concedem HASH. Isso é uma contenção deliberada contra fraude, não a mecânica final. O jogo continua registrando tentativas e estatísticas, mas recompensas de vitória permanecem suspensas até a implementação de validação autoritativa no servidor.

## Próxima implementação

Escolher e implementar um modelo de jogo verificável:
1. simulação determinística no servidor com seed/estado assinado e replay validado; ou
2. protocolo de eventos com limites físicos/temporais validados e estado autoritativo, sem confiar em score ou vitória enviados pelo navegador.

Depois, adicionar testes de fraude, replay, concorrência, expiração, duplicação e recompensa idempotente. Só reativar recompensas após esses testes passarem.

## Escopo

DEV somente. Nenhum merge, publicação em produção, pagamento real, saque ou alteração de saldo foi realizado.
