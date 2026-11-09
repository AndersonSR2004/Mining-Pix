# Fase 7B — Controles auditados de acesso a jogadores

## Objetivo
Habilitar bloqueio e desbloqueio administrativo de contas comuns no Supabase Auth, com justificativa, confirmação explícita, idempotência e trilha de auditoria.

## Comportamento
- Bloquear: aplica banimento de 30 dias via `auth.admin.updateUserById(userId, { ban_duration: '720h' })`.
- Desbloquear: remove o banimento via `ban_duration: 'none'`.
- O diretório exibe estado atual, data de expiração do bloqueio e controles de ação.
- A interface exige motivo de 5–500 caracteres e digitação literal de `BLOQUEAR` ou `DESBLOQUEAR`.
- Contas administrativas e a própria conta do administrador são protegidas contra essas operações.
- Repetir uma solicitação com a mesma chave idempotente não duplica a operação nem o evento de auditoria.
- Nenhuma operação de saldo, VIP, XP, inventário, equipamento ou Mining Pool é habilitada.

## Arquitetura
1. O frontend envia somente alvo, ação, motivo e request ID para a Edge Function `admin-control`.
2. A Edge Function valida JWT com `auth.getUser()` e exige `app_metadata.admin === true`.
3. A RPC `admin_begin_player_access_change()` revalida o administrador diretamente em `auth.users.raw_app_meta_data`, protege administradores/alvo próprio e cria um registro pendente idempotente.
4. A Edge Function executa a alteração de Auth usando a chave `service_role`, exclusivamente no backend.
5. A RPC `admin_complete_player_access_change()` conclui a operação e grava o evento append-only em `admin_audit_logs` na mesma transação.
6. Se houver falha entre Auth e auditoria, a operação fica pendente e pode ser repetida com a mesma request ID; o estado atual do Auth é reavaliado para evitar efeitos duplicados.

## Segurança
- As duas RPCs de operação são executáveis somente por `service_role`; `PUBLIC`, `anon` e `authenticated` não recebem EXECUTE.
- Tabela de operações tem RLS habilitada e nenhum acesso direto para clientes.
- O diretório lê `banned_until` e o indicador administrativo, sem expor e-mail, credenciais, tokens ou metadados completos.
- Não é possível bloquear a própria conta nem contas com `app_metadata.admin=true`.
- A Edge Function exige JWT e valida novamente a permissão administrativa; a URL do painel não é mecanismo de autorização.
- A chave `service_role` nunca é enviada ao frontend.

## Limitação importante de sessões
O banimento impede novas autenticações/renovações conforme o Supabase Auth, mas não invalida imediatamente JWTs de acesso já emitidos. Esses tokens continuam válidos até a expiração (normalmente até 1 hora). Portanto, uma sessão já aberta pode conservar acesso às operações protegidas por RLS até o token expirar, salvo se cada operação sensível também validar o estado da sessão/conta no backend. O painel informa essa limitação antes da confirmação.

## QA executado no Supabase DEV
- Migration 0018 aplicada; migration 0019 corrige o índice de FK e preserva o estado atual em retries pendentes.
- Teste transacional de begin/complete, evento de auditoria e retry idempotente executado em transação revertida.
- Testes negativos confirmaram bloqueio de ator sem claim administrativo, auto-bloqueio e tentativa de alterar outra conta administrativa.
- Diretório confirmou estado ativo e identificação da conta administrativa; nenhuma conta real foi bloqueada ou desbloqueada durante os testes.
- Testes foram revertidos: nenhum registro de operação ou evento de QA permanece.
- Edge Function `admin-control` implantada no DEV com `verify_jwt=true`, versão 3.
- Nenhuma operação de bloqueio/desbloqueio real foi executada durante a implementação.

## Pendências antes de produção
- Homologação manual do formulário no Admin Center DEV.
- Habilitar Leaked Password Protection.
- Revisar MFA do administrador e estratégia de invalidação de sessões já emitidas antes de operações administrativas de alto impacto.
- Projeto DEV permanece separado; nada foi publicado em produção.
