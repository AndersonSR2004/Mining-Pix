# Mining Pix — Registro de Decisões e Análise de Mecânicas

**Status:** decisões complementares registradas; desenho e simulação em andamento; nenhuma mecânica nova implementada.
**Branch:** `codex/mining-pix-work`
**Escopo:** bônus de HASH por Tier, energia por sala, Lucky Boxes, forja, duplicatas e destinação de PIX COIN.
**Decisões anteriores relacionadas:** D-011, D-012, D-016, D-019, D-024, D-025 e D-026.

## 1. Decisões aprovadas nesta rodada

| ID | Decisão | Regra aprovada | Limites |
|---|---|---|---|
| D-027 | Lucky Box I | Probabilidades: Tier 3 = 10%; Tier 2 = 20%; Tier 1 = 35%; peças de forja = 35%. Preço proposto: 100 PC. | O preço e a tabela ficam sujeitos à validação econômica, jurídica e de proteção ao consumidor antes do lançamento. |
| D-028 | Energia por sala | Ao chegar a zero de energia, toda a mineração daquela sala é suspensa, incluindo HASH-base e bônus. A mineração só volta após restauração de energia. | Capacidade, consumo, duração, recarga, aquisição e fontes de energia continuam pendentes. |
| D-029 | Escopo da forja | O sistema terá montagem, evolução e reciclagem de equipamentos. | Receitas, custos, limites, tempos e resultados não foram definidos. |
| D-030 | Duplicatas | O jogador escolhe entre manter o equipamento duplicado no inventário ou desmontá-lo para obter peças. | Quantidade de peças, elegibilidade e eventuais custos de desmontagem continuam pendentes. |

Essas decisões aprovam a direção funcional, não autorizam implementação com parâmetros ainda indefinidos.

## 2. Bônus de HASH por Tier — proposta em análise

### 2.1 Tabela proposta, ainda não aprovada

| Tier | Bônus proposto |
|---|---:|
| T1 | 0% |
| T2 | 10% |
| T3 | 15% |
| T4 | 20% |
| T5 | 25% |

A proposta é aplicar o bônus individualmente à potência-base de cada máquina instalada. A soma dos resultados forma o HASH da sala:

`HASH_sala = soma(HASH_base_i × (1 + bônus_Tier_i))`

Exemplo ilustrativo: quatro máquinas T5 de 100 H/s cada somariam 400 H/s de base e 100 H/s de bônus, totalizando 500 H/s, desde que a sala esteja energizada.

O bônus:
- Só considera equipamentos instalados na sala.
- Não considera equipamentos guardados no inventário.
- É calculado por máquina e somado; não é composto exponencialmente.
- Deve ser validado no backend e incorporado ao HASH-hora elegível, nunca confiado ao cálculo do cliente.
- Fica indisponível quando a energia da sala chega a zero, juntamente com a mineração-base, conforme D-028.

### 2.2 Pontos ainda não resolvidos

1. A relação proposta de HASH-base entre T2 e T1 (T2 com o dobro da potência de T1) precisa ser confirmada como regra de potência nominal, e não confundida com o bônus percentual.
2. Não foi definido o HASH-base de nenhum Tier.
3. Ainda não foi decidido se todas as máquinas de um mesmo Tier terão a mesma curva de bônus, independentemente do SKU.
4. A correspondência entre SKUs persistentes existentes e Tiers ainda precisa ser formalizada. Não presumir que PIX Miner II seja T2 ou PIX Miner III seja T3 sem decisão e migração explícitas.
5. O sistema de energia precisa ser modelado antes de qualquer implementação.

### 2.3 Risco econômico

Como a Mining Pool distribui 100% do orçamento proporcionalmente ao HASH elegível (D-016), bônus de sala aumentam diretamente a participação relativa do jogador na Pool. A simulação deve comparar:
- HASH-base contra HASH com bônus;
- distribuição por percentis e concentração (Gini/HHI);
- impacto de ocupação de salas e tiers;
- HASH-hora elegível com indisponibilidade por falta de energia;
- emissão MC simulada sob o orçamento já aprovado, sem atribuir valor de saque.

Não comunicar bônus como rendimento garantido.

## 3. Lucky Boxes

### 3.1 Lucky Box I — D-027 aprovada

| Recompensa | Probabilidade |
|---|---:|
| Máquina T3 | 10% |
| Máquina T2 | 20% |
| Máquina T1 | 35% |
| Peças de forja | 35% |
| **Total** | **100%** |

Preço apresentado na proposta: 100 PC. O preço não deve ser tratado como definitivo até a simulação.

### 3.2 Lucky Boxes II e III — propostas não aprovadas

**Lucky Box II — proposta de 500 PC**

| Recompensa | Probabilidade proposta |
|---|---:|
| Máquina T4 | 7% |
| Máquina T3 | 15% |
| Máquina T2 | 20% |
| Máquina T1 | 30% |
| Peças | 28% |
| **Total** | **100%** |

**Lucky Box III — proposta de 1.000 PC**

| Recompensa | Probabilidade proposta |
|---|---:|
| Máquina T5 | 4% |
| Máquina T4 | 10% |
| Máquina T3 | 15% |
| Máquina T2 | 20% |
| Máquina T1 | 30% |
| Peças | 21% |
| **Total** | **100%** |

### 3.3 Leitura probabilística inicial

Com as distribuições propostas:
- Box I: 65% de chance de máquina e 35% de peças; Tier médio condicional entre máquinas ≈ 1,62.
- Box II: 72% de chance de máquina e 28% de peças; Tier médio condicional entre máquinas ≈ 1,99.
- Box III: 79% de chance de máquina e 21% de peças; Tier médio condicional entre máquinas ≈ 2,22.

O Tier médio é uma média condicional entre os resultados que são máquinas, não o valor econômico esperado da caixa. Não é possível concluir se uma caixa é vantajosa sem conhecer HASH-base, utilidade, preço de referência dos equipamentos, custos de forja e valor de oportunidade das peças.

### 3.4 Regras de integridade já exigidas por D-011

- Nenhuma caixa concede PIX COIN, MINING COIN, dinheiro ou prêmio sacável.
- Sorteio exclusivamente no backend, com aleatoriedade adequada e trilha auditável.
- Probabilidades públicas e versionadas; uma versão não pode ser alterada retroativamente para caixas já abertas.
- Cada abertura precisa de idempotência e registro único para evitar cobrança duplicada ou múltiplos prêmios.
- Equipamentos premiados entram no inventário, sem instalação automática.
- Verificar capacidade de inventário e tratamento de falhas antes de debitar PC.
- Revisão jurídica e de proteção ao consumidor no Brasil antes de disponibilizar caixas pagas.

## 4. Forja — desenho funcional aprovado, regras econômicas pendentes

D-029 aprova três capacidades:

### 4.1 Montagem
Converter peças e, possivelmente, outros insumos em um equipamento definido. A receita deverá declarar previamente:
- Tier/SKU produzido;
- peças e insumos consumidos;
- custo adicional, se houver;
- tempo de fabricação, se houver;
- resultado garantido ou variável.

### 4.2 Evolução
Usar peças e/ou equipamentos para evoluir um equipamento existente. É necessário definir se a evolução:
- aumenta Tier ou apenas uma variante do mesmo Tier;
- preserva o equipamento original em caso de falha;
- exige duplicatas ou apenas peças;
- aumenta HASH-base ou apenas atributos não econômicos.

Nenhuma chance de falha, custo ou aumento de potência está aprovado.

### 4.3 Reciclagem
Desmontar equipamento elegível em peças. O sistema deve exibir o resultado antes da confirmação e registrar o consumo do equipamento e a concessão das peças na mesma transação.

### 4.4 Controles anti-inflação
- Peças são itens de inventário, não uma nova moeda.
- Peças não podem ser convertidas em PC ou MC.
- Não criar conversão automática em saldo sacável.
- Toda receita deve ter sinks e fontes mensuráveis.
- O sistema deve impedir duplicação por concorrência, repetição de requisição ou retry.
- Ledger de itens append-only, com idempotência e trilha de auditoria.
- Simular a velocidade de geração e consumo de peças antes de fixar receitas.
- Cosméticos e utilidades sem HASH podem ajudar a oferecer valor sem expandir continuamente a potência da Pool.

## 5. Duplicatas — escolha do jogador

D-030 permite que o jogador mantenha ou recicle a duplicata. O fluxo recomendado:
1. Ao receber uma duplicata, ela entra no inventário normalmente.
2. A interface oferece a opção de manter ou desmontar.
3. A desmontagem exige confirmação que informe claramente quantas peças serão recebidas.
4. A escolha de manter não deve causar perda, expiração ou desmontagem automática.
5. A operação de desmontagem é atômica: o equipamento é consumido e as peças creditadas uma única vez.

A quantidade de peças por Tier e qualquer custo de reciclagem permanecem em aberto.

## 6. PIX COIN — análise de destinação e contabilização

A decisão sobre a queima de PC em compras de máquinas foi explicitamente deixada para revisão. A proposta anterior de queimar 10% e retirar os 90% restantes de circulação não está aprovada.

### 6.1 Conceitos que não devem ser confundidos

- **Queima (burn):** destruição permanente de PC, sem possibilidade de reemissão ou retorno ao estoque.
- **Sink/consumo:** PC sai da carteira do jogador e é consumido por uma mecânica. Se existir uma tesouraria interna que possa redistribuí-lo, isso não é queima.
- **Retenção/tesouraria:** PC é transferido para uma carteira controlada pelo sistema; permanece contabilizado e potencialmente pode voltar à circulação.
- **Receita financeira:** BRL efetivamente recebido e conciliado. O gasto posterior de PC não é uma nova entrada de dinheiro.

### 6.2 Alternativas para compras de máquinas

| Modelo | Destinação | Vantagem | Risco |
|---|---|---|---|
| A — sink integral | 100% do PC gasto é consumido/destruído | Simplicidade e forte controle da oferta | Pode reduzir a liquidez interna e tornar compras menos flexíveis |
| B — burn parcial | Uma fração é queimada e o restante vai para tesouraria/sink não circulante | Permite modular oferta e reservar capacidade de incentivos | Exige transparência, controle de tesouraria e risco de reemissão |
| C — sink sem burn | 100% sai da carteira e é contabilizado como consumo; sem destruição permanente | Maior flexibilidade para futuras políticas | Se o PC puder voltar, a oferta pode inflar e a classificação deve ser clara |
| D — política por categoria | Máquinas, caixas, passe e VIP podem ter destinações diferentes | Ajusta os sinks ao papel de cada produto | Maior complexidade e necessidade de monitoramento |

Não selecionar um modelo nesta etapa. Para escolher, medir PC comprado, PC gasto por categoria, saldos retidos, velocidade de circulação, concentração de PC, recompensas/promos e necessidade de liquidez operacional.

### 6.3 Regras contábeis e econômicas

- O BRL recebido na compra de PC deve ser registrado no ledger financeiro no momento correto da liquidação, com tratamento contábil definido por profissional competente.
- Gastar PC em máquinas, caixas, passe ou VIP não deve ser contado novamente como receita em BRL.
- A alocação D-019 (30% Pool, 30% reserva, 30% operação/desenvolvimento e 10% administração) aplica-se à receita líquida financeira elegível em BRL, não ao valor nominal do PC consumido.
- PC não deve ser convertido em MC nem transferido para a Mining Pool.
- Compras e sinks precisam ser registrados em ledgers separados, conciliáveis e auditáveis.
- Uma política de burn deve impedir que PC destruído reapareça por correções administrativas sem evento compensatório auditado.

## 7. Ordem recomendada de trabalho

1. Quantificar o catálogo T1–T5 e a relação HASH-base, incluindo o benchmark T2/T1.
2. Modelar energia por sala: capacidade, consumo por equipamento, duração, restauração e cenários de sala inativa.
3. Simular HASH-base e bônus por sala, incluindo concentração e distribuição proporcional da Pool.
4. Avaliar probabilidades das três Lucky Boxes com custos/valores de oportunidade e impacto na oferta de máquinas.
5. Modelar receitas e sinks da forja e o fluxo de duplicatas.
6. Comparar alternativas de destinação do PC por categoria e apresentar uma proposta de política.
7. Submeter os parâmetros finais para aprovação antes de qualquer implementação.

## 8. Fora de escopo / salvaguardas

- Não ativar saques, conversibilidade ou valor de resgate de MC.
- Não emitir MC nem iniciar/settle ciclos da Pool como parte desta etapa.
- Não alterar saldos, inventários ou catálogo persistente nesta fase de desenho.
- Não habilitar Lucky Boxes pagas antes da revisão jurídica e de consumidor.
- Não definir preços, HASH-base, consumo de energia, odds de Box II/III, receitas de forja, quantidade de peças ou percentuais de burn sem simulação e aprovação.
- Implementação futura deve validar todas as regras econômicas no backend, nunca confiar no cliente.

## 9. Critérios de aceite desta etapa de análise

- D-027 a D-030 registrados.
- D-028 aplicado como requisito funcional de suspensão integral da sala quando sem energia.
- Propostas ainda não aprovadas claramente separadas das decisões.
- Alternativas de destinação de PC documentadas sem escolha prematura.
- Nenhuma migration, alteração de catálogo, saldo, inventário, emissão MC, ciclo Pool ou mudança em produção realizada.
