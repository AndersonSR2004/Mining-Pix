# Mining Pix 4.0 — Pacote Integrado de Estabilização e Políticas (21/11/2026)

## Escopo e limites de autorização
Implementar na branch `codex/mining-pix-work` e Supabase DEV `odlasosyewiiepvrvbnn`, após inspeção, testes e migração preservadora. **Não fazer merge na main, não ativar pagamentos/saques reais, não apagar dados ou executar migração destrutiva sem validação e aprovação específica.** Os números não aprovados permanecem desativados/configuráveis, nunca apresentados como regras oficiais.

## Decisões aprovadas — fonte de verdade
1. **Moeda:** DePix única moeda do jogo. PIX COIN/PC e MINING COIN/MC são legados a retirar de fluxos ativos, com reconciliação e preservação do histórico. DePix permanece fictício no sandbox; nenhum saque ou pagamento real.
2. **VIP permanente:** baseado exclusivamente no total histórico acumulado de recargas DePix **confirmadas e liquidadas**, líquido de estornos/chargebacks. Não contar DePix minerado, de missões/eventos, compras ou saldo. Recalcular nível quando estornos invalidarem recargas; níveis não expiram pelo tempo. Níveis não acumulam bônus entre si:
   - FREE: 0 / HASH 0% / XP 0% / desconto de DePix na forja 0%
   - VIP 1: 100 DePix / HASH +10% / XP +15% / forja -5%
   - VIP 2: 250 / +20% / +25% / -10%
   - VIP 3: 500 / +40% / +45% / -20%
   - VIP 4: 1.000 / +70% / +80% / -30%
   - REI: 2.000 / +95% / +100% / -50%.
   Benefícios de HASH somados ao bônus de forja e rack sobre o HASH base, sem composição exponencial. Desconto na forja aplica-se somente à taxa em DePix. VIP não concede passe PREMIUM nem multiplica pontos de eventos.
3. **Infraestrutura:** jogador -> salas -> racks físicos (ocupam posições nas salas) -> máquinas (ocupam slots de racks). Racks comprados individualmente em DePix e permanentemente possuídos; não são acessórios de uma máquina; não são fabricados na forja. Não converter automaticamente racks existentes nem criar upgrades por diferença de preço. Salas/racks independentes de VIP. Movimentações preservam IDs, propriedade, capacidade e equipamentos.
4. **Forja:** máquina +0 a +10; cada nível +5% do HASH base, máximo +50%; sucesso 100%; sem perda de materiais por falha. Custo de DePix por HASH adicional deve ser inferior à compra de HASH equivalente na loja, compensado por materiais e tempo. Meta de +10: 30–45 dias de atividade consistente, viável para FREE. Materiais exclusivos da forja (não moeda, não sacáveis, não conversíveis em DePix). Quantidades/custos exatos pendentes de homologação.
5. **Passe Genesis:** 42 dias, 30 níveis, trilhas FREE e PREMIUM; PREMIUM custa 100 DePix por temporada. Máquinas Genesis exclusivas daquela temporada, propriedade permanente após obtenção. HASH específico, tabela de recompensas, fontes de XP e regras de encerramento permanecem propostas, não aprovadas; não ativar compras de níveis/passe completo como regra nova sem autorização. Resgate retroativo do PREMIUM e encerramento exigem decisão/validação antes da ativação.
6. **Eventos:** três formatos individuais e distintos: **Passe, Progressão e Puzzle**. Não introduzir ranking global ou trilha competitiva dentro desses eventos. Progressão possui referência previamente discutida de 1 DePix gasto elegível = 1.000 pontos, e multiplicadores vinculados a recargas do evento; confirmar texto exato/condições de elegibilidade antes de habilitar. Puzzle usa peças obtidas por objetivos/partidas/compras elegíveis. Não transformar propostas de preços de Lucky Boxes em produtos ativos sem revisão da política e autorização explícita.
7. **Economia de mineração:** distribuição proporcional ao HASH elegível, pool dentro do orçamento aprovado, cálculos e lançamentos no servidor, integridade transacional e idempotência. Simular inflação de HASH por máquinas, racks, forja, VIP e recompensas antes de homologar valores. Não afirmar retornos garantidos.

## Problemas confirmados em inspeção de 21/11/2026
- `codex/mining-pix-work` divergiu da `main`: 484 commits ahead / 13 behind. Proibido merge automático.
- `src/PersistentVipPanel.tsx` apresenta VIP I–V por janela de 30 dias, BRL e benefícios antigos; conflita com VIP permanente DePix.
- `src/RoyaltyPanel.tsx` vende títulos de nobreza temporários e trata rack como acessório por máquina; conflita com novas políticas.
- `src/GenesisPass.tsx` contém compras de avanço de nível e passe completo, recompensas placeholder e controle premium antigo; conflita com escopo aprovado.
- `src/LiveEventsPanel.tsx` usa tipos genéricos event/battle_pass e só apresenta progressão; precisa suportar Passe, Progressão e Puzzle sem ranking.
- Supabase DEV ainda contém `mining_coin_wallets`, `mining_coin_transactions`, `wallets`, `wallet_transactions` ao lado de `depix_accounts`, `depix_ledger`, `depix_deposits`. Não remover sem inventário e plano de migração.

## Ordem de implementação e critérios de aceite
**P0 — segurança e diagnóstico:** inventário de schema, RLS, grants, RPCs, cron, dependências, CI, testes e drift; cópia lógica/rollback verificável; nenhum segredo no frontend; erros e operações auditáveis.
**P1 — DePix e VIP:** migração não destrutiva do ledger, qualificação cumulativa liquidada e estornos, RPCs server-authoritative, testes de borda nos limiares 0/100/250/500/1000/2000, idempotência e concorrência. Remover interfaces VIP temporárias após migração segura.
**P2 — instalações/racks:** criar estrutura de racks físicos, slots e vínculo de máquina; migrar sem perda de equipamentos; transações atômicas e RLS; atualizar loja, inventário e sala.
**P3 — forja:** upgrades 0–10 garantidos, materiais exclusivos, custo server-authoritative, atomicidade, limites e simulação econômica. Não fixar custos pendentes sem aprovação.
**P4 — passe:** temporada de 42 dias, 30 níveis, trilhas FREE/PREMIUM e compra única 100 DePix no sandbox; XP/claims server-authoritative, máquinas exclusivas por temporada; recompensas pendentes mantidas desativadas/configuráveis.
**P5 — eventos:** modelagem separada de Passe/Progressão/Puzzle, sem ranking; pontuação validada, peças e recompensas idempotentes; multiplicadores e caixas não homologados desativados.
**P6 — QA e entrega:** build, lint, testes unitários, integração, RLS, concorrência, smoke e2e, simulação de economia, comparação de dados pré/pós migração; relatório por frente (feito, parcial, bloqueado), commits e evidências; PR para revisão. Produção permanece intacta.

## Gates de liberação
Nenhuma funcionalidade é considerada concluída apenas por exibir tela ou escrever SQL. É preciso verificar servidor, persistência, segurança, migração, regressão e rollback. Sem validação da economia e parâmetros pendentes, manter feature flag OFF.
