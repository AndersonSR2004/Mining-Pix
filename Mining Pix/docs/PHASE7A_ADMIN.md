# Fase 7A — Diretório administrativo de jogadores

## Objetivo
Adicionar ao Admin Center uma consulta paginada e pesquisável de contas, sem habilitar alterações nas contas ou na economia.

## Escopo entregue
- Busca por nome de exibição ou prefixo do UUID.
- Paginação de 25 registros por página, com limite máximo de 50 na RPC.
- Indicadores por jogador: data de cadastro, saldo PC persistente, nível, XP, VIP, passe premium, equipamentos instalados e hashrate persistente.
- Consulta consolidada no backend; nenhum saldo, VIP, XP, equipamento ou estado de conta pode ser alterado pelo diretório.
- Não expõe e-mail, credenciais, tokens nem metadados de autenticação.

## Segurança
- RPC `admin_player_directory` usa `SECURITY DEFINER` com `search_path = ''`.
- Requer usuário autenticado e `app_metadata.admin = true` no JWT.
- `EXECUTE` revogado de `PUBLIC` e `anon`; concedido a `authenticated`, com autorização validada dentro da função.
- Limita pesquisa a 80 caracteres, página a 1–50 registros e offset a 100.000.
- Nenhuma escrita é realizada. A função apenas consulta tabelas do jogador e agrega o hashrate de equipamentos instalados em salas ativas.

## Testes no Supabase DEV
- Consulta autenticada com claim administrativo retornou os dois perfis de teste e os campos esperados.
- Verificação de privilégios confirmou `anon` sem EXECUTE e `authenticated` com EXECUTE (autorização ainda é obrigatoriamente validada dentro da RPC).
- A tentativa de acesso sem claim administrativo foi exercitada em transação de teste.
- Migration aplicada no projeto DEV.

## Fora do escopo
- Bloquear/desbloquear contas.
- Alterar VIP, PC, XP, inventário ou equipamentos.
- Excluir contas, alterar e-mails ou redefinir credenciais.
- Pagamentos, saques, ciclos da Pool ou distribuição de recompensas.
