# Mining Pix — Fase 6: notas internas auditadas

**Ambiente:** Supabase DEV  
**Status:** implementada; validação automatizada do frontend em andamento.

## Objetivo

Introduzir a primeira ação administrativa de escrita com risco operacional baixo, sem alterar o estado de jogo ou a economia.

## Funcionalidade

O Admin Center permite registrar uma nota interna associada ao UUID de um jogador. Cada registro exige:
- UUID da conta-alvo;
- conteúdo da nota (5–1.500 caracteres);
- motivo do registro (3–500 caracteres).

A nota fica em `admin_audit_logs.after_data`, vinculada ao ator, alvo, ação, motivo, timestamp e request ID. É exibida na seção de eventos administrativos. O jogador não recebe a nota e ela não altera o jogo.

## Fluxo e controles

1. O browser envia a ação para a Edge Function `admin-control` com a sessão atual.
2. A função exige JWT, chama `auth.getUser(token)` e verifica `app_metadata.admin === true`.
3. A função valida formato e tamanho do payload e chama a RPC SQL com a chave service-role apenas no servidor.
4. A RPC revalida a permissão atual consultando `auth.users.raw_app_meta_data`, confirma a existência do jogador e grava a nota e o evento de auditoria na mesma transação.
5. Um índice único parcial por ator/request ID impede duplicação. Retry idêntico retorna o evento existente; reutilização da chave com dados diferentes é rejeitada.
6. A tabela de auditoria não concede leitura ou escrita direta a `anon` ou `authenticated`. A RPC de criação só pode ser executada por `service_role`.

## Limites deliberados

Esta etapa NÃO permite:
- alterar ou creditar carteiras/PC;
- modificar VIP, XP, progresso, equipamentos ou salas;
- banir, suspender ou excluir contas;
- abrir/liquidar ciclos da Mining Pool;
- iniciar pagamentos, saques ou integrações financeiras.

## Testes executados no DEV

- Inserção e retry idempotente testados dentro de transação revertida.
- Evento de teste confirmado como não persistido após rollback.
- Ator sem claim administrativo rejeitado pela RPC.
- `anon` e `authenticated` sem EXECUTE na RPC de criação.
- `service_role` com EXECUTE e INSERT necessário.
- `authenticated` sem SELECT/INSERT direto em `admin_audit_logs`.
- Edge Function implantada com JWT obrigatório.

## Próxima homologação manual

No Admin Center, registrar uma nota de teste para uma conta de DEV existente, com conteúdo neutro e sem dados pessoais sensíveis. Confirmar que:
1. a operação retorna sucesso;
2. o evento aparece na trilha de auditoria com ator e alvo corretos;
3. o conteúdo aparece nos detalhes do evento;
4. nenhum saldo, inventário ou estado de jogo é alterado.

Apagar ou alterar registros de auditoria não faz parte do fluxo; não usar dados sensíveis em notas internas.
