# Mining Pix — arquitetura-alvo

**Status:** proposta técnica da Fase 0. Ainda não implementada.  
**Escopo:** preparar a transição do sandbox local para contas individuais com backend autoritativo, preservando o frontend estático.

## 1. Objetivos e princípios

1. Cada jogador possui identidade e dados próprios.
2. O servidor/banco é a fonte de verdade para saldos, inventário, XP, missões, recompensas, passe, ciclos e permissões.
3. O navegador apresenta dados e solicita operações; nunca decide sozinho se uma operação econômica é válida.
4. Toda operação que altera PIX COIN (PC) é atômica, autorizada, idempotente e auditável.
5. Dados legados do navegador não são presumidos legítimos.
6. A primeira versão online continua sendo um jogo de moeda virtual demonstrativa: sem PIX real, saques, depósitos, compra real de moeda ou promessa de rendimento.
7. Segurança é aplicada em camadas: autenticação, autorização, RLS, funções transacionais, validação, limites de requisição, logs e testes.

## 2. Stack proposta

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Interface | React + TypeScript + Vite | UI, navegação, formulários e apresentação |
| Hospedagem | GitHub Pages | Servir o frontend estático |
| Identidade | Supabase Auth | Cadastro, login, recuperação e sessão |
| Dados | Supabase PostgreSQL | Estado persistente e transacional |
| Isolamento | PostgreSQL RLS | Restringir linhas por usuário e papel |
| Operações críticas | PostgreSQL RPC | Carteira, compras, recompensas e ciclos atômicos |
| Integrações privilegiadas | Supabase Edge Functions | Orquestração, validações e tarefas que não podem confiar no browser |
| Entrega | GitHub Actions | Testes, build, auditoria e deploy |
| Evolução do schema | Supabase CLI + migrations SQL | Versionar e aplicar mudanças de banco |

Dependência inicial do frontend: `@supabase/supabase-js`. Evitar bibliotecas adicionais sem necessidade demonstrada. A CLI é ferramenta de desenvolvimento/CI, não dependência do navegador.

## 3. Ambientes e configuração

- **DEV:** projeto Supabase isolado para migrations, testes e dados descartáveis.
- **PROD:** projeto separado, criado apenas após homologação e revisão de custos/limites.
- GitHub Pages continua hospedando o frontend.
- Configuração pública do frontend: URL do projeto e chave publishable/anon. São identificadores públicos, não segredos; a segurança depende de RLS e grants corretos.
- `service_role`, tokens administrativos e segredos ficam exclusivamente em ambientes server-side/secret stores. Nunca usar prefixo `VITE_` para segredos.
- Não versionar arquivos `.env` com valores sensíveis.
- Não executar migrations de desenvolvimento em produção.
- Confirmar cotas, pausas por inatividade, limites de egress, banco, Edge Functions e disponibilidade do plano gratuito antes de qualquer compromisso de custo zero.

## 4. Componentes e fronteiras

### Frontend
- Mantém páginas e componentes React.
- `src/lib/supabase/`: cliente Supabase e configuração pública.
- `src/lib/api/`: chamadas tipadas para operações remotas.
- `src/services/`: casos de uso da aplicação.
- `src/types/`: tipos de domínio e respostas.
- Não contém credenciais privilegiadas, regras de autorização confiáveis ou cálculos finais de saldo.

### Banco PostgreSQL
- Guarda dados duráveis.
- Aplica constraints, chaves estrangeiras, transações e RLS.
- Expõe apenas operações necessárias.
- Tabelas de ledger e auditoria são append-only para o cliente comum.

### RPC
Usar funções transacionais para operações que precisam ler e gravar múltiplas linhas de forma consistente: compra, venda/desmontagem, reivindicação de recompensa, crédito validado, distribuição de pool e ajustes administrativos. Cada função valida usuário, autorização, estado, limites e idempotency key dentro da mesma transação.

### Edge Functions
Usar para integrações, validações ou processos que exigem segredo/controle server-side. Não criar uma Edge Function para cada leitura simples se uma consulta RLS segura resolver. A lógica econômica crítica pode residir em RPC SQL; Edge Functions orquestram quando necessário.

## 5. Domínios e modelo de dados

O modelo relacional completo está em [DATABASE.md](./DATABASE.md). Os domínios são:

- Identidade e papéis: `profiles`, `admin_roles`.
- Carteira e auditoria financeira virtual: `wallets`, `wallet_transactions`, `admin_audit_logs`.
- Progressão: `player_progress`, `missions`, `player_missions`, `battle_pass_seasons`, `battle_pass_progress`.
- Equipamentos e salas: `equipment_catalog`, `player_equipment`, `player_rooms`.
- Jogos: `game_sessions`, `game_records`.
- Mining Pool: `pool_cycles`, `pool_allocations`, `network_bots`, `economy_config`.

Todas as tabelas terão PK UUID (salvo catálogo com chave estável quando conveniente), timestamps UTC e constraints explícitas. Dados pertencentes a jogador terão `user_id` e políticas RLS próprias.

## 6. Fluxos de negócio

### Cadastro e sessão
1. Supabase Auth cria a identidade.
2. Trigger seguro ou fluxo server-side cria `profiles`, `wallets` e `player_progress` iniciais.
3. O usuário lê somente seu próprio perfil e dados privados.
4. Papel administrativo é atribuído fora do fluxo de cadastro público.

### Carteira e compras
1. Cliente solicita uma operação com identificador idempotente.
2. RPC valida sessão, produto, preço vigente e saldo.
3. RPC bloqueia a carteira da conta, valida saldo, grava débito/crédito e ledger na mesma transação.
4. Repetição da mesma chave devolve o resultado original sem duplicar a movimentação.
5. Ledger não pode ser editado ou apagado pelo jogador.

### Jogos e recompensas
1. Backend cria uma sessão com jogo, versão de regras, parâmetros, nonce e expiração.
2. Cliente envia eventos/inputs necessários para concluir a sessão.
3. Servidor valida duração, sequência, limites e resultado usando regra reproduzível ou método de validação definido por jogo.
4. Somente sessão validada pode produzir recorde/progresso/recompensa.
5. Se não houver validação server-side suficiente, o jogo pode continuar em modo de demonstração, mas não credita recompensas persistentes.
6. Recompensas são emitidas por RPC idempotente e registradas no ledger quando forem PC.

Não aceitar score, vitória, tempo, XP ou recompensa calculados exclusivamente pelo browser como prova.

### Mining Pool
1. Backend captura snapshot de hashrate elegível e parâmetros do ciclo.
2. Ciclo é criado uma única vez para sua janela/identificador.
3. Distribuição é calculada no servidor a partir do snapshot.
4. Alocações e créditos são persistidos atomicamente e com idempotência.
5. Histórico é imutável; correções são lançamentos compensatórios auditáveis.
6. Bots são entidades de simulação controladas por administrador/servidor, não contas ou saldos manipuláveis por jogadores.

### Administração
1. Usuário autenticado precisa ter papel administrativo concedido por canal confiável.
2. RPC/Edge Function valida papel no servidor em toda operação.
3. Ajustes nunca sobrescrevem silenciosamente o saldo: geram lançamento compensatório, motivo, ator, alvo e log.
4. Interface administrativa não é mecanismo de segurança; esconder botões não substitui autorização.

## 7. Estratégia de migração

As chaves locais atualmente identificadas são:

- `mining-pix-demo-v1`: estado principal (saldo, equipamentos, inventário, salas, VIP, XP, bots, ciclos, missões e configurações).
- `mining-pix-games-progress-v2`: progresso de jogos.
- `mining-pix-games-best-v1`: melhores pontuações.

Esses dados podem ser alterados pelo próprio usuário no navegador. Portanto:
- Não creditar automaticamente saldos, PC, recompensas, XP, VIP, bots ou histórico como válidos.
- Criar fluxo explícito de migração/importação como **legado não verificado**, sem poder econômico.
- Preferir importar apenas preferências e recordes históricos marcados como não verificados.
- Se futuramente houver concessão de saldo inicial, fazê-la por política global, não com base em valores arbitrários do localStorage.
- Preservar o sandbox atual até existir backup/exportação e plano de reversão.

Detalhamento em [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).

## 8. Estrutura-alvo sugerida

```text
Mining Pix/
├── src/
│   ├── components/
│   ├── pages/
│   ├── lib/
│   │   ├── supabase/
│   │   ├── api/
│   │   └── validation/
│   ├── services/
│   ├── hooks/
│   └── types/
├── supabase/
│   ├── migrations/
│   ├── functions/
│   └── tests/
├── tests/
└── docs/
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── SECURITY.md
    └── MIGRATION_PLAN.md
```

A estrutura é um destino incremental, não uma exigência de reorganizar todo o frontend de uma vez.

## 9. Critérios de aceite globais

- Dois usuários de teste não conseguem ler ou alterar dados privados um do outro.
- Nenhum saldo ou item econômico pode ser criado por update direto do cliente.
- Débitos e créditos são atômicos e idempotentes.
- Nenhum resultado de jogo é recompensado sem validação server-side.
- Ciclos da pool e alocações não duplicam sob concorrência/retry.
- Ações administrativas exigem papel validado no servidor e geram auditoria.
- Testes automatizados cobrem RLS, grants, RPC, concorrência, idempotência e regras econômicas.
- Build e testes do frontend passam.
- Nenhuma credencial privilegiada está no bundle ou histórico Git.
- Não há migração automática de saldo local como saldo legítimo.

## 10. Fora do escopo desta fase

- Criar projeto Supabase ou configurar credenciais.
- Implementar autenticação ou alterar o runtime do frontend.
- Criar migrations executáveis.
- Migrar dados ou habilitar economia persistente.
- Integrar pagamentos, PIX real, saques ou anúncios.
- Publicar em produção ou mesclar a branch principal.

## 11. Sequência de entrega

1. **Fase 0 — documentação:** arquitetura, schema, matriz de segurança e migração.
2. **Fase 1 — identidade:** projeto DEV, Auth, profiles, wallets iniciais e RLS.
3. **Fase 2 — economia:** ledger, RPCs, catálogo, compras e pool.
4. **Fase 3 — progressão:** XP, missões, passe e sessões de jogos.
5. **Fase 4 — administração:** papéis, auditoria e bots server-side.
6. **Fase 5 — homologação:** migração controlada, testes de segurança, backup e lançamento.

Cada fase deve ser revisada e aprovada antes de avançar para operações que alterem dados ou serviços externos.
