# Mining Pix — Catálogo de Máquinas e Simulações de Balanceamento

**Status:** desenho aprovado em princípios; simulação exploratória; nenhum parâmetro novo é definitivo.
**Branch:** `codex/mining-pix-work`
**Decisões relacionadas:** D-024, D-025 e D-026.
**Escopo:** catálogo, progressão de máquinas, capacidade por VIP e impacto distributivo na Mining Pool.

## 1. Decisões aprovadas

| ID | Decisão | Regra de produto |
|---|---|---|
| D-024 | Filosofia linear das máquinas | Categorias superiores entregam mais HASH e exigem maior investimento em PIX COIN. |
| D-025 | Progressão equilibrada | Custos, potência e ritmo de aquisição devem evoluir proporcionalmente, sem saltos abruptos nem grind excessivo. |
| D-026 | Espaço gratuito limitado | FREE permanece funcional, mas VIP oferece expansão expressiva de capacidade e conveniência. |

Essas decisões aprovam a direção do design, não valores numéricos. Preços, HASH, limites de aquisição, disponibilidade e benefícios VIP permanecem pendentes de simulação e aprovação específica.

## 2. Baseline técnico observado

### Catálogo persistente atual

| SKU | Equipamento | HASH atual | Preço atual |
|---|---|---:|---:|
| pix_miner_ii | PIX Miner II | 250 H/s | 2.500 PC |
| pix_miner_iii | PIX Miner III | 600 H/s | 5.000 PC |

Os números são valores existentes no catálogo DEV, não uma recomendação de balanceamento.

### Capacidade persistente atual

Cada sala comporta 10 equipamentos. O provisionamento atual é:

| Plano | Salas | Slots totais |
|---|---:|---:|
| FREE / VIP 0 | 1 | 10 |
| VIP 1 | 2 | 20 |
| VIP 2 | 3 | 30 |
| VIP 3 | 4 | 40 |

A loja persistente, a infraestrutura persistente e o sandbox em localStorage são sistemas separados. O protótipo sandbox também contém PIX Miner I (100 H/s / 1.000 PC), mas esse item não deve ser tratado como parte do catálogo persistente sem migração e aprovação próprias.

## 3. Diagnóstico de consistência do catálogo atual

A relação preço/HASH observada é:

- PIX Miner II: 10 PC por H/s.
- PIX Miner III: aproximadamente 8,33 PC por H/s.

Portanto, a PIX Miner III não apenas entrega mais HASH: também oferece melhor eficiência de compra por unidade de HASH. Isso pode ser intencional como incentivo à progressão, mas a diferença deve ser controlada. Se a eficiência melhorar rápido demais, a máquina anterior perde utilidade e a progressão vira uma escolha óbvia, não estratégica.

**Diretriz proposta:** manter a curva de preço crescente e a curva de HASH crescente, mas revisar a eficiência marginal entre níveis. Máquinas antigas devem continuar úteis como degraus de entrada, não necessariamente como a melhor compra no longo prazo.

## 4. Arquitetura conceitual do catálogo

A classificação abaixo é uma proposta de organização. A filosofia aprovada continua linear: cada tier posterior deve ter maior potência nominal que o anterior.

| Tier conceitual | Papel | Aquisição / uso |
|---|---|---|
| T1 — Inicial | Primeiro equipamento persistente, baixo atrito de entrada | Disponível a jogadores FREE |
| T2 — Intermediária | Primeiro salto de capacidade e eficiência | Progressão natural por PC |
| T3 — Avançada | Expansão relevante de HASH | Progressão intermediária |
| T4 — Elite | Alto investimento e alta potência | Progressão avançada; não deve ser requisito para jogar |
| T5 — Especial | Maior potência da linha, acabamento e identidade premium | Aquisição avançada ou sazonal, com regras transparentes |

A sequência T1–T5 é uma estrutura de catálogo, não uma decisão sobre quantidade final de SKUs. Variações cosméticas podem compartilhar HASH para não criar inflação de potência.

### Campos que cada SKU deverá possuir

- SKU imutável e nome comercial.
- Tier e ordem de exibição.
- Preço em PC, mantido no backend.
- HASH nominal por equipamento.
- Espaço ocupado (baseline: um slot).
- Requisitos de desbloqueio, se houver.
- Estado de venda (ativo/inativo), sem apagar itens já adquiridos.
- Data/versão de vigência do balanceamento.
- Limites de compra por conta, somente se justificados por segurança/economia.
- Métricas de eficiência: PC por H/s e variação de HASH por tier.
- Origem: loja, passe, evento ou outra fonte autorizada.
- Histórico auditável de alterações.

## 5. Simulações de capacidade com os valores atuais

Estas contas são cenários mecânicos, não previsões de recompensa e não representam renda. Consideram todos os slots ocupados por uma única categoria e usam apenas os números atuais do catálogo persistente.

| Plano | Slots | Só Miner II | Só Miner III |
|---|---:|---:|---:|
| FREE | 10 | 2.500 H/s | 6.000 H/s |
| VIP 1 | 20 | 5.000 H/s | 12.000 H/s |
| VIP 2 | 30 | 7.500 H/s | 18.000 H/s |
| VIP 3 | 40 | 10.000 H/s | 24.000 H/s |

Investimento teórico para preencher todos os slots, caso todos os equipamentos fossem comprados ao preço atual:

| Plano | Só Miner II | Só Miner III |
|---|---:|---:|
| FREE | 25.000 PC | 50.000 PC |
| VIP 1 | 50.000 PC | 100.000 PC |
| VIP 2 | 75.000 PC | 150.000 PC |
| VIP 3 | 100.000 PC | 200.000 PC |

### Leitura dos resultados

1. A capacidade de VIP 3 é quatro vezes a capacidade FREE. Isso cria diferenciação comercial expressiva e também potencial de concentração de HASH.
2. A capacidade extra não garante ocupação: o jogador precisa adquirir e instalar equipamentos.
3. A capacidade física, o poder de compra e a participação na Pool são dimensões diferentes e devem ser medidas separadamente.
4. Como D-016 define distribuição proporcional ao HASH elegível, qualquer vantagem de HASH afeta a participação relativa na Pool. Não se deve prometer retorno por máquina, PC gasto ou plano VIP.
5. Os valores da tabela não devem ser usados como meta de emissão de MC nem como projeção financeira.

## 6. Cenários de evolução para simular

### Cenário conservador
- Adoção lenta de equipamentos de tiers superiores.
- Maioria dos jogadores com slots parcialmente ocupados.
- Concentração de HASH moderada, mas crescimento lento do HASH total.
- Maior peso da progressão FREE e dos primeiros tiers.
- Risco principal: catálogo caro demais, reduzindo a sensação de progresso.

### Cenário base
- Distribuição gradual de jogadores entre FREE e VIP.
- Compra progressiva de equipamentos, com mistura de tiers.
- Ocupação de slots cresce conforme retenção e tempo de conta.
- HASH total cresce em ritmo compatível com receita líquida elegível e orçamento da Pool.
- Risco principal: diferença de capacidade entre planos produzir concentração excessiva.

### Cenário otimista
- Crescimento rápido de contas ativas e compras.
- Maior adoção de VIP e de tiers superiores.
- Aumento acelerado de HASH total e do volume de PC consumido.
- Mais receita potencial, mas também maior compromisso operacional e volatilidade da Pool.
- Risco principal: escalar aquisição e HASH mais rápido que receita efetivamente liquidada.

Os três cenários devem ser quantificados com dados reais de jogadores ativos, receita liquidada, compras, equipamentos instalados, churn e HASH-hora. Sem esses dados, números de crescimento seriam apenas hipóteses.

## 7. Modelo de simulação que deverá ser implementado antes do balanceamento definitivo

Executar horizontes de 30, 90 e 365 dias, variando:

- Distribuição de contas por FREE/VIP 1/VIP 2/VIP 3.
- Slots médios ocupados por plano.
- Mix de equipamentos por tier.
- PC comprado, PC consumido e saldo PC retido.
- HASH total e HASH-hora elegível.
- Participação da Pool por percentis de jogadores.
- Participação dos 1%, 5%, 10% e 25% maiores HASH.
- Gini e HHI da distribuição de HASH.
- Receita líquida elegível liquidada, após taxas, tributos, estornos e chargebacks.
- Orçamento diário da Pool conforme regra aprovada.
- Emissão MC simulada, separada do valor BRL e sem atribuir valor de saque.
- Cenários de queda de receita, churn e concentração de compras.

### Métricas de aprovação

- O jogador FREE consegue iniciar, progredir e utilizar a Pool sem comprar VIP.
- VIP expande capacidade, mas não cria promessa de retorno nem privilégio oculto no cálculo de HASH.
- Cada tier superior apresenta aumento de preço e potência coerente com sua eficiência marginal.
- O custo dos marcos de progressão não cresce mais rápido que a capacidade plausível de acumular PC.
- Nenhum cenário emite MC acima do orçamento elegível da Pool.
- A distribuição continua 100% proporcional ao HASH-hora elegível, conforme D-016.
- A simulação mostra explicitamente a concentração e a volatilidade, sem esconder médias atrás de totais.

## 8. Riscos e decisões ainda pendentes

| Tema | Risco | Próxima deliberação necessária |
|---|---|---|
| Curva preço/HASH | Tier novo tornar todos os anteriores obsoletos | Definir faixa aceitável de eficiência marginal |
| VIP e slots | Concentração excessiva de HASH | Validar diferença de capacidade e custo total de ocupação |
| Catálogo | Equipamentos permanentes saturarem a progressão | Definir expansão de catálogo sem obsolescência artificial |
| Pool | Jogadores confundirem HASH com renda garantida | Comunicação clara e painel de estimativa não garantida |
| PC | Oferta e sinks desbalanceados | Modelar compras, sinks, saldo retido e velocidade de circulação |
| MC | Obrigações crescerem mais rápido que receita liquidada | Simular emissão e stress de liquidez; saques continuam desativados |

Não propor limite artificial de participação individual na Pool neste momento: isso alteraria a regra aprovada de proporcionalidade integral e exigiria nova decisão explícita.

## 9. Critérios de aceite da etapa de desenho

- Decisões D-024 a D-026 registradas.
- Catálogo conceitual T1–T5 descrito, sem preços ou HASH novos.
- Baseline persistente separado do sandbox.
- Capacidade VIP simulada com regras existentes.
- Inconsistência de eficiência do catálogo atual identificada.
- Modelo de simulação e métricas definidos.
- Nenhuma migration, alteração de catálogo, mudança de saldo, emissão MC, ativação de Pool ou alteração em produção realizada.

## 10. Próxima etapa

A próxima etapa é construir uma matriz quantitativa de balanceamento com variáveis ajustáveis e cenários 30/90/365 dias. Ela deverá usar dados agregados reais do DEV quando disponíveis e deixar hipóteses claramente identificadas. Só depois da revisão dessa matriz serão submetidos à aprovação os preços PC, HASH por máquina, curva de progressão e eventuais ajustes de capacidade VIP.
