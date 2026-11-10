# Mining Pix — Registro de Decisões e Análise de Mecânicas

**Status:** decisões complementares registradas; desenho e simulação em andamento; nenhuma mecânica nova implementada.
**Branch:** `codex/mining-pix-work`
**Escopo:** bônus de HASH por Tier, energia por sala, Lucky Boxes, forja, duplicatas e destinação de PIX COIN.
**Decisões anteriores relacionadas:** D-011, D-012, D-016, D-019, D-024, D-025 e D-026.

## 1. Decisões aprovadas nesta rodada

| ID | Decisão | Regra aprovada | Limites |
|---|---|---|---|
| D-027 | Lucky Boxes | Uma caixa cosmética gratuita por conta/dia UTC; 70% cosmético comum, 25% incomum, 5% raro. Sem PC, MC, HASH, dinheiro ou itens negociáveis. | Aprovada e implementada no DEV; catálogo e probabilidades publicados em `docs/LUCKY_BOX_POLICY.md`. |
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

## 3. Lucky Boxes — política revisada e aprovada

A política anterior de caixas pagas foi substituída. Nenhuma Lucky Box pode ser comprada com PIX COIN ou dinheiro.

### 3.1 Caixa diária gratuita

- Uma abertura por conta a cada dia UTC.
- Recompensas exclusivamente cosméticas, sem HASH, moedas, valor de saque ou vantagem competitiva.
- Itens não negociáveis, não transferíveis e sem conversão.
- Probabilidades públicas, fixas e versionadas.
- Sorteio e registro no backend, com idempotência e proteção contra concorrência.
- Nenhum pagamento, PC, MC ou outra contraprestação é exigido para abrir a caixa.

### 3.2 Catálogo e probabilidades iniciais

| Recompensa | Categoria | Probabilidade |
|---|---|---:|
| Moldura Neon | Cosmético comum | 40% |
| Drone Pixel | Cosmético comum | 30% |
| Banner Aurora | Cosmético incomum | 15% |
| Insígnia Dourada | Cosmético incomum | 10% |
| Emblema Fundador | Cosmético raro | 5% |
| **Total** | | **100%** |

### 3.3 Regras de integridade

- Uma única reivindicação por usuário e data UTC, inclusive diante de retries e chamadas concorrentes.
- O servidor determina o resultado; o cliente não envia nem escolhe o prêmio.
- O histórico da recompensa é persistente e consultável pelo próprio jogador.
- Nenhuma caixa contém PC, MC, dinheiro, equipamento, HASH, peças de forja ou item resgatável.
- Não há compra, aceleração, venda, troca ou transferência de caixas e cosméticos.
- Qualquer ampliação do catálogo deve manter a natureza puramente cosmética e publicar previamente os pesos e a versão.

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
4. Monitorar distribuição e duplicatas dos cosméticos gratuitos, sem impacto sobre HASH ou moedas.
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


## 10. Bônus individual por máquina e adicional de Tier — D-031 a D-033

As escolhas do usuário nesta rodada foram registradas da seguinte forma:

| ID | Decisão | Regra aprovada | Limites |
|---|---|---|---|
| D-031 | Modelo de bônus | O bônus é individual por máquina e incide somente sobre a potência-base daquela unidade. Os bônus das máquinas são somados para formar o HASH total da sala; não existe soma de percentuais aplicada diretamente ao HASH global. | A fórmula final de combinação e arredondamento precisa ser validada antes da implementação. |
| D-032 | Limites dos atributos | A faixa possível do atributo individual de bônus é determinada pelo Tier da máquina. | Limites mínimo/máximo, distribuição probabilística e raridades de cada Tier permanecem pendentes. |
| D-033 | Bônus adicional | Além do atributo individual, haverá um bônus adicional associado ao Tier da máquina, também aplicado individualmente à potência-base da unidade. | Percentuais por Tier e forma exata de combinação permanecem pendentes. |

As três decisões aprovam a estrutura conceitual, não os números. Não foi aprovado atributo aleatório uniforme de 0–100%, nem qualquer percentual fixo para o bônus adicional.

### 10.1 Modelo matemático de trabalho

Para cada máquina instalada (i):

`HASH_i = HASHbase_i × (1 + A_i + T_i)`

Onde:
- `HASHbase_i` é a potência nominal da máquina;
- `A_i` é o atributo individual sorteado/atribuído dentro dos limites do Tier;
- `T_i` é o bônus adicional definido pelo Tier.

O HASH da sala energizada é a soma das potências efetivas das máquinas instaladas e elegíveis:

`HASH_sala = Σ HASH_i`

Esta fórmula aditiva é uma hipótese de trabalho para simulação, não uma regra matemática definitivamente aprovada. Uma alternativa multiplicativa (`HASHbase × (1 + A) × (1 + T)`) aumenta mais a potência e deverá ser comparada antes de escolher a fórmula final. Bônus não devem ser compostos entre máquinas nem aplicados como multiplicador global da sala.

### 10.2 Simulação normalizada — exemplo ilustrativo, não balanceamento aprovado

Para demonstrar o comportamento, considere quatro máquinas idênticas de 100 H/s. Os valores abaixo são exemplos hipotéticos de atributos e bônus adicional, não parâmetros propostos para lançamento:

| Máquina | HASH-base | Atributo individual hipotético | Adicional de Tier hipotético | HASH efetivo aditivo |
|---|---:|---:|---:|---:|
| A | 100 | 5% | 5% | 110 |
| B | 100 | 10% | 5% | 115 |
| C | 100 | 15% | 5% | 120 |
| D | 100 | 20% | 5% | 125 |
| **Total** | **400** | — | — | **470 H/s** |

Nesse exemplo, a sala recebe +70 H/s, ou +17,5% sobre a base. Não recebe +100% por simplesmente somar quatro atributos de 25%, porque cada percentual atua apenas na respectiva máquina.

### 10.3 Comparação entre fórmulas

Usando os mesmos exemplos ilustrativos:
- Fórmula aditiva: `100 × (1 + 20% + 5%) = 125 H/s`.
- Fórmula multiplicativa: `100 × 1,20 × 1,05 = 126 H/s`.

A diferença por unidade parece pequena nesse exemplo, mas cresce quando os dois bônus aumentam. A fórmula aditiva é mais simples de explicar, auditar e balancear; por isso é a referência inicial recomendada para simulação. A decisão final continua pendente.

### 10.4 Implicações para progressão e distribuição da Pool

- Atributos individuais criam diferenciação entre máquinas do mesmo Tier, sem fazer a sala escalar exponencialmente com o número de equipamentos.
- O adicional de Tier preserva uma identidade de progressão entre categorias, mesmo quando duas máquinas têm atributos individuais diferentes.
- Se o atributo individual for sorteado, deve ser gerado no backend na criação/obtenção do item, persistido no registro do equipamento e permanecer estável durante a vida útil da unidade, salvo regra explícita futura.
- O atributo não deve ser rerrolado gratuitamente por reinstalação, troca de sala, reconexão ou retry.
- A raridade deve ser separada do Tier: Tier determina a faixa e o adicional estrutural; raridade, se aprovada depois, poderá definir a distribuição dentro da faixa, sem ultrapassar seus limites.
- O HASH efetivo validado pelo backend alimentará o HASH-hora elegível. O cliente apenas apresenta os valores.
- A Pool permanece proporcional ao HASH elegível (D-016); portanto, qualquer bônus altera participação relativa, não o orçamento total da Pool.

### 10.5 Simulações necessárias antes de fixar parâmetros

Executar cenários com:
1. Máquinas no limite inferior, mediano e superior do atributo permitido em cada Tier.
2. Bônus adicional de Tier desligado, moderado e alto.
3. Fórmula aditiva versus multiplicativa.
4. Salas com 1, 4, 10, 20 e 40 máquinas, respeitando as capacidades reais de cada plano.
5. Composições homogêneas e mistas de Tiers.
6. Atributos sorteados independentemente e cenários de concentração adversa (jogadores com muitas máquinas no topo da faixa).
7. Energia disponível em 100%, 75%, 50% e 0% do tempo; com energia zero, HASH da sala é zero conforme D-028.
8. Distribuição proporcional da Pool antes/depois dos bônus, incluindo percentis, Gini e HHI, sem assumir que o orçamento aumenta.
9. Sensibilidade a novas máquinas obtidas por loja, Lucky Boxes, passe e eventos, para medir concentração e pressão sobre a emissão simulada de MC.

### 10.6 Pendências de balanceamento

- Faixas mínimas/máximas de atributo por Tier.
- Distribuição de probabilidade do atributo dentro de cada faixa.
- Bônus adicional por Tier.
- Fórmula aditiva ou multiplicativa.
- Se o atributo será sorteado ao obter a máquina ou escolhido por outro mecanismo.
- Política para atributos de máquinas antigas quando houver rebalanceamento.
- Relação formal entre os SKUs persistentes atuais e os Tiers.
- Compatibilidade com energia, forja, evolução, duplicatas e Lucky Boxes.
- Controles contra reroll, duplicação, manipulação de inventário e alterações indevidas.

## 11. Estado da implementação

Esta atualização altera somente a documentação de decisões na branch de trabalho. Nenhum código, migration, catálogo, saldo, inventário, regra de energia, ciclo de Pool ou emissão de MC foi alterado. A branch `main` e o PR não foram mesclados ou modificados por esta atualização.


## 12. Overclock e Benção de Potência — D-034 e D-035

O usuário definiu dois atributos distintos para cada máquina. Esta definição complementa e especifica D-031 a D-033.

| ID | Decisão | Regra aprovada | Limites |
|---|---|---|---|
| D-034 | Overclock por Tier | Bônus fixo e prefixado conforme o Tier, aplicado individualmente à potência-base da máquina. O atributo é estrutural do Tier, não um sorteio. | Valores de trabalho: T1 = 0%; T2 = 10%; T3 = 15%; T4 = 20%; T5 = 25%. Confirmar na simulação final antes da implementação. |
| D-035 | Benção de Potência | Atributo aleatório individual de cada unidade, sorteado na obtenção da máquina e aplicado somente ao HASH-base daquela máquina. | T1: 0–20%; T2: 0–30%; T3: 0–40%; T4: 0–50%; T5: 0–100%. Distribuição probabilística dentro da faixa ainda pendente. |

### 12.1 Fórmula de trabalho

A combinação recomendada para simulação é aditiva, sem composição exponencial:

`HASH_{máquina} = HASH_{base} × (1 + Overclock + Benção)`

Os percentuais são convertidos em frações no cálculo. O HASH da sala é a soma do HASH efetivo de cada máquina instalada e elegível. Os bônus não são somados entre máquinas para formar um multiplicador global.

Exemplo: máquina T5 de 100 H/s, Overclock de 25% e Benção de 80%:

`100 × (1 + 0,25 + 0,80) = 205 H/s`

### 12.2 Simulação normalizada por máquina de 100 H/s

Para estimar valores médios, assume-se provisoriamente que a Benção tenha distribuição uniforme entre o mínimo e o máximo de cada Tier. Essa hipótese não foi aprovada como distribuição final.

| Tier | Overclock | Faixa da Benção | Benção média hipotética | HASH médio | HASH máximo |
|---|---:|---:|---:|---:|---:|
| T1 | 0% | 0–20% | 10% | 110 H/s | 120 H/s |
| T2 | 10% | 0–30% | 15% | 125 H/s | 140 H/s |
| T3 | 15% | 0–40% | 20% | 135 H/s | 155 H/s |
| T4 | 20% | 0–50% | 25% | 145 H/s | 170 H/s |
| T5 | 25% | 0–100% | 50% | 175 H/s | 225 H/s |

### 12.3 Exemplos de salas homogêneas

Para máquinas de 100 H/s cada, todas com o mesmo Tier:

| Composição | HASH-base | HASH esperado com Benção uniforme | HASH máximo teórico |
|---|---:|---:|---:|
| 4 × T1 | 400 | 440 | 480 |
| 4 × T2 | 400 | 500 | 560 |
| 4 × T3 | 400 | 540 | 620 |
| 4 × T4 | 400 | 580 | 680 |
| 4 × T5 | 400 | 700 | 900 |

O valor esperado é uma média estatística de longo prazo, não uma garantia para uma sala específica. O máximo teórico pressupõe que todas as máquinas tirem o valor máximo da faixa simultaneamente; não representa um resultado provável.

### 12.4 Regras de integridade recomendadas

- O Overclock deve ser determinado pelo Tier e não ser rerrolável.
- A Benção deve ser sorteada no backend quando a unidade é criada/obtida, persistida no registro daquela unidade e permanecer estável.
- Reinstalar, mover entre salas, relogar ou repetir uma requisição não pode gerar novo sorteio.
- A Benção não pode ultrapassar o limite do Tier, mesmo em operações de forja ou evolução; qualquer regra de evolução futura deve definir explicitamente como o atributo é preservado ou recalculado.
- O jogador deve visualizar separadamente Overclock e Benção, além do HASH-base e do HASH final.
- O cálculo de HASH-hora elegível deve ocorrer no backend.
- A distribuição da Benção (uniforme, ponderada ou por raridade) continua pendente. Não assumir que cada valor da faixa terá a mesma chance no lançamento.
- O efeito sobre a participação relativa na Mining Pool deve ser simulado, pois D-016 distribui o orçamento proporcionalmente ao HASH elegível.

### 12.5 Riscos e pontos de atenção

- T5 pode alcançar 2,25 vezes a potência-base. Isso cria diferenciação forte e pode concentrar HASH em jogadores com unidades T5 de alta Benção.
- Se a aquisição aleatória for paga direta ou indiretamente, é necessária análise jurídica e de proteção ao consumidor antes de lançamento, com odds claras e auditáveis.
- A faixa ampla do T5 não deve ser confundida com probabilidade uniforme nem com garantia de obter 100%.
- Não definir preço, chance de obtenção por fonte, reroll pago, taxa de forja ou conversão de atributos nesta etapa.

### 12.6 Estado

D-034 e D-035 registram a separação conceitual e as faixas propostas pelo usuário. A tabela de Overclock foi aceita como referência de trabalho, mas os parâmetros econômicos finais e a distribuição de probabilidade da Benção ainda precisam passar pelas simulações gerais. Nenhum código, migration, catálogo, inventário, saldo ou ciclo de Pool foi alterado.


## 13. Máquinas iniciais T0 e recompensas de jogos — D-036 a D-038

| ID | Decisão | Regra | Estado |
|---|---|---|---|
| D-036 | Catálogo inicial FREE | Dez máquinas T0, Overclock 0%, Benção de Potência sorteada individualmente entre 0% e 20%, HASH-base crescente em passos de 5 H/s. | Aprovada e implementada no DEV |
| D-037 | Recompensas e limite dos jogos | Regra original: vitória concedia 1 PC e +1 H/s temporário. O componente PC foi revogado por D-039; permanece apenas +1 H/s temporário por vitória. Limite de 30 partidas iniciadas por dia UTC, individualmente para cada jogo. Regras anteriores de níveis, metas, duração e cooldown são preservadas. | Parcialmente substituída por D-039; limite e HASH continuam ativos |
| D-038 | Ajustes de jogabilidade | Flappy Pix passa a usar animação por requestAnimationFrame e física baseada em delta time; Coin Catch reduz o volume de itens e impõe intervalo mínimo entre lançamentos. | Aprovada e implementada na branch |

### 13.1 Catálogo T0 inicial

| Máquina | Tier | HASH-base | Preço PC | Overclock | Benção |
|---|---:|---:|---:|---:|---:|
| PIX Starter 01 | 0 | 10 H/s | 100 | 0% | 0–20% |
| PIX Starter 02 | 0 | 15 H/s | 200 | 0% | 0–20% |
| PIX Starter 03 | 0 | 20 H/s | 300 | 0% | 0–20% |
| PIX Starter 04 | 0 | 25 H/s | 400 | 0% | 0–20% |
| PIX Starter 05 | 0 | 30 H/s | 500 | 0% | 0–20% |
| PIX Starter 06 | 0 | 35 H/s | 600 | 0% | 0–20% |
| PIX Starter 07 | 0 | 40 H/s | 700 | 0% | 0–20% |
| PIX Starter 08 | 0 | 45 H/s | 800 | 0% | 0–20% |
| PIX Starter 09 | 0 | 50 H/s | 900 | 0% | 0–20% |
| PIX Starter 10 | 0 | 55 H/s | 1.000 | 0% | 0–20% |

A sequência de preços até a sétima máquina foi explicitamente descrita pelo usuário. A extensão para 800, 900 e 1.000 PC nas máquinas 8–10 foi inferida pela continuidade do incremento de 100 PC, para completar o catálogo de dez unidades. O HASH foi estendido em incrementos de 5 H/s, conforme a sequência informada.

A Benção é gerada no backend no momento da compra, com duas casas decimais e distribuição pseudoaleatória uniforme contínua no intervalo de 0% a 20%. Essa distribuição uniforme é a regra técnica inicial implementada; caso o sistema passe a envolver compras com dinheiro real ou caixas pagas, a aleatoriedade, transparência e conformidade deverão passar por revisão específica. A Benção fica persistida na unidade e não é rerrolada em reinstalações.

As máquinas antigas PIX Miner II e PIX Miner III permanecem ativas com seus preços e potências anteriores. Seu mapeamento formal para Tier e seus limites de Overclock/Benção continuam pendentes; por isso, o cálculo atual mantém Overclock e Benção em zero para essas unidades legadas até deliberação própria.

### 13.2 Fórmula efetiva

O backend calcula individualmente:

`HASH_{efetivo}=HASH_{base} × (1 + Overclock/100 + Benção/100)`

O HASH efetivo é somado por sala e considerado no resumo da infraestrutura e na distribuição proporcional da Mining Pool. O HASH temporário concedido pelos jogos também entra no HASH global enquanto estiver ativo. Energia por sala ainda não está implementada; quando vier a ser implementada, deverá suspender a contribuição da sala conforme D-028.

### 13.3 Jogos: recompensas e limites

- Cada jogo possui contador diário independente: Flappy Pix, Pix Snake e Coin Catch.
- O limite de 30 partidas conta partidas iniciadas, inclusive derrotas e partidas abandonadas, com reinício às 00:00 UTC.
- O limite é validado pelo PostgreSQL; limpar armazenamento local ou alterar o relógio do navegador não aumenta o limite.
- Regra original D-037: vitória concedia +1 PIX COIN e +1 H/s temporário. Substituída pela decisão posterior D-039: vitórias concedem somente +1 H/s temporário por 24 horas; PC é exclusivamente comprada.
- Vitórias sucessivas durante a validade acumulam HASH temporário; quando expira, uma nova vitória reinicia o bônus em +1 H/s.
- A conclusão de qualquer partida renova por 24 horas a validade do HASH temporário que ainda estiver ativo, preservando a regra anterior.
- Derrotas não concedem PC nem novo HASH.
- Cooldowns e progressão continuam: metas de 10, 15, 20, 25... objetivos, 45 segundos por partida, três vitórias para subir de nível e cooldowns de 10/20/30/60 segundos.
- O contador diário e o bônus temporário de HASH são persistidos no backend; XP e progresso de missões continuam separados. O backend retorna pc_awarded=0 para novas partidas.

**Limite de integridade conhecido:** o servidor registra início, conclusão, idempotência e limite diário, mas o resultado de vitória ainda é reportado pelo cliente. A duração mínima e a unicidade do attempt reduzem abuso trivial, porém não constituem prova antifraude de que a partida foi realmente vencida. Antes de vincular recompensas a valor financeiro, será necessário implementar validação de gameplay mais robusta ou tornar a recompensa explicitamente promocional e limitada.

### 13.4 Ajustes de jogabilidade

**Flappy Pix**
- Substituído o timer de 30 ms por requestAnimationFrame.
- Física passa a usar delta time, gravidade e impulso em unidades por segundo.
- Renderização do canvas é desenhada diretamente no loop, evitando re-renderizações React a cada frame.
- Velocidade de deslocamento dos obstáculos ajustada para movimento contínuo.

**Coin Catch**
- Intervalo mínimo de 1.300 ms entre lançamentos.
- Evita lançar novo item quando há outro nas primeiras três linhas.
- Probabilidade de lançamento reduzida para 65% quando o intervalo mínimo é alcançado.
- A velocidade de queda e os controles existentes permanecem.

### 13.5 Implementação e salvaguardas

- Migration: `20261112000000_starter_machines_and_game_rewards.sql`.
- Novas colunas do catálogo: Tier, Overclock e faixa de Benção.
- Cada equipamento possui `blessing_percent` próprio.
- Tabelas `player_game_attempts` e `player_game_hash_boosts` possuem RLS e políticas de leitura por proprietário; escritas ocorrem por RPCs autenticadas.
- RPCs: `start_player_game_attempt`, `finish_player_game_attempt` e `get_player_game_status`.
- Compra de máquina sorteia e persiste a Benção no backend; o cliente não escolhe o atributo.
- `get_player_mining_summary`, `get_player_room_summaries`, `get_pool_dashboard` e `settle_pool_cycle` passam a usar HASH efetivo com Overclock/Benção e HASH temporário ativo.
- Nenhum saldo existente foi convertido, nenhuma carteira MC foi creditada e nenhum ciclo da Pool foi aberto ou liquidado nesta atualização.


## 14. Decisão D-039 — moedas e recompensas de bloco (10 nov 2026)

**Estado: aprovada e aplicada no DEV.**

- PIX COIN (PC) é moeda de compra: adquirida exclusivamente por compras. Não é emitida por blocos, vitórias de jogos, bots, missões, Lucky Boxes ou eventos.
- MINING COIN (MC) é a única recompensa de mineração, distribuída pela Mining Pool conforme HASH elegível.
- Vitórias em jogos mantêm o bônus temporário de +1 H/s por 24 horas, sem PC.
- PIX BLOCK sandbox: 100 MC por ciclo de 600 segundos como orçamento padrão; PC = 0. O administrador ainda pode alterar o orçamento MC no sandbox para testes, com auditoria.
- Dados históricos incorretos de PC no sandbox foram zerados; históricos de MC e eventos de auditoria foram preservados.
- Não há conversão PC→MC.

## 15. Proposta P-040 — referência nominal de moedas

**Estado: pendente de simulação e aprovação econômica.**

O usuário propôs a referência nominal R$ 1 = 1 MC = 100 PC. Não representa atualmente preço de resgate, garantia de paridade, conversibilidade, lastro ou valor de mercado. Avaliar custos de pagamento, impostos, estornos, liquidez, reserva, ritmo de emissão da Pool, passivos e cenários de saque antes de adotar a referência como política comercial ou financeira.


## 16. Decisão D-041 — cadência oficial do PIX BLOCK (10 nov 2026)

**Estado: aprovada como regra de produto; automação operacional pendente.**

- O intervalo oficial de cada PIX BLOCK é de 600 segundos (10 minutos), substituindo a cadência diária anteriormente definida para o ciclo de recompensa.
- A recompensa de MC de cada bloco deve ser distribuída proporcionalmente ao HASH elegível daquele bloco.
- O banco exige pelo menos 600 segundos antes da liquidação oficial.
- A abertura e liquidação automática por operador confiável a cada 600 segundos ainda não está implantada; a emissão/distribuição real de MC permanece desativada até aprovação da política de funding/conversão.
- O sandbox já opera com blocos de 600 segundos e orçamento padrão de 100 MC, sem PC.


## 17. Proposta P-045 — MINING COIN com resgate variável

**Estado: direção escolhida pelo usuário; modelagem em validação; não implementada.**

O usuário escolheu:
- Arquitetura A: MC poderá ter valor de resgate variável caso um programa futuro seja aprovado.
- Prioridade econômica: sustentabilidade financeira acima de recompensas elevadas.
- Recompensa proporcional ao HASH elegível, respeitando orçamento efetivamente financiado.
- Não estabelecer paridade fixa MC/BRL nesta fase.

Regras e salvaguardas propostas:
- MC permanece unidade de recompensa virtual, sem valor fixo em BRL prometido.
- Não aprovar automaticamente a fórmula de resgate, cotação variável, obrigação financeira ou pagamento.
- O orçamento da Pool continua limitado a até 30% da RLE e ao caixa efetivamente disponível, conforme D-042.
- A liberação permanece linear em blocos de 600 segundos, conforme D-043 e D-041.
- A maturação de 7 dias permanece como requisito proposto para elegibilidade futura, sem eliminar a exposição econômica desde o crédito, conforme D-044.
- Um eventual programa de resgate deve ter orçamento BRL reservado, janela pública, metodologia uniforme, controles antifraude, ledger auditável, revisão jurídica/contábil e circuit breaker.
- Não usar limite VIP de saque para corrigir concentração de HASH.
- Avaliar concentração Top 1/10/100, HHI e Gini antes de propor limites ou curva marginal decrescente.
- Não confiscar ou reavaliar retroativamente recompensas já creditadas.
- A fórmula candidata `r_t = W_t / M_t` é apenas hipótese de estudo e ainda precisa ser comparada com alternativas mais conservadoras.

Documento de modelagem: `docs/MINING_COIN_VARIABLE_REDEMPTION_MODEL.md`.

Nenhuma conversão, cotação, emissão oficial, saque, pagamento, migration, alteração de saldo, ciclo real da Pool ou mudança de produção foi autorizada por P-045.
