# Mining Pix — Modelo Econômico da MINING COIN com Resgate Variável

**Proposta:** P-045  
**Registrada em:** 10 nov 2026  
**Branch:** `codex/mining-pix-work`  
**Status:** direção escolhida pelo usuário; modelagem conceitual em validação; parâmetros e regras operacionais pendentes.  
**Implementação:** documentação בלבד. Nenhuma conversão, cotação, emissão oficial, saque, pagamento, migration ou alteração de saldo foi habilitada.

## 1. Direção escolhida

O usuário escolheu:

- **Arquitetura A:** MINING COIN (MC) com valor de resgate variável, caso um programa de resgate venha a ser legal e financeiramente aprovado.
- **Prioridade:** sustentabilidade financeira acima de recompensas elevadas.
- **Princípio de jogo:** recompensar contribuição efetiva de HASH elegível, de forma proporcional e verificável.
- **Princípio financeiro:** não criar taxa fixa MC/BRL, obrigação de resgate ou promessa de retorno antes de demonstrar funding, liquidez, controles e conformidade.

Esta escolha não aprova resgate, valor mínimo, taxa, taxa de câmbio, obrigação de pagamento ou distribuição monetária oficial.

## 2. Separação obrigatória dos conceitos

| Camada | Definição | Tratamento |
|---|---|---|
| PIX COIN (PC) | Moeda fechada, adquirida por compra e consumida no jogo | Sem conversão para MC e sem saque |
| HASH elegível | Medida da contribuição validada no backend por bloco | Base de rateio |
| MC | Unidade de recompensa registrada no ledger da Mining Pool | Sem paridade BRL prometida |
| Orçamento financeiro da Pool | Parcela financiada da RLE, limitada pelo caixa disponível | Contabilidade em BRL |
| Programa de resgate futuro | Programa separado, com orçamento e regras publicados | Só após aprovação legal, contábil e financeira |

Não chamar o saldo de MC de “reais”, “dinheiro disponível” ou “valor garantido”. Até um programa de resgate existir, exibir MC como recompensa virtual acumulada. Qualquer conversão demonstrativa deve ser identificada como cenário hipotético, nunca como cotação.

## 3. Funding da Pool — regras herdadas

Manter D-042 a D-044:

- Pool de até 30% da Receita Líquida Elegível (RLE).
- A alocação fica limitada ao menor valor entre o teto de 30% da RLE e o caixa efetivamente livre após taxas, tributos, reembolsos/chargebacks, custos, obrigações vencidas e reservas exigidas.
- Orçamento mensal liberado linearmente ao longo do período em blocos de 600 segundos.
- Rateio de cada bloco proporcional ao HASH elegível daquele bloco.
- Maturação de 7 dias para eventual elegibilidade futura de resgate, sem excluir a exposição econômica desde o crédito.
- A reserva operacional de três meses e eventual reserva de resgate são caixas distintos. O mesmo dinheiro não pode cobrir duas finalidades.

Definições:

`PoolBudget_m = min(0,30 × RLE_m, CaixaLivreElegível_m)`

`BlockBudget_b = PoolBudget_m / NúmeroDeBlocosDoPeríodo`

`Share_{i,b} = BlockBudget_b × HASH_{i,b} / HASH_{total,b}`

A soma das parcelas individuais de cada bloco nunca pode exceder o orçamento financiado do bloco. O resíduo de arredondamento deve ser tratado por regra determinística e auditável.

**Importante:** a fórmula acima calcula a parcela econômica de referência do bloco em BRL para análise de funding. Ela não define, por si só, quantas MC devem ser emitidas nem transforma BRL em saldo sacável.

## 4. Como tratar MC sem paridade fixa

### 4.1 Recomendação de arquitetura

Manter MC como unidade de recompensa virtual e ledger separado. Não usar uma taxa fixa como `1 MC = R$1` ou `100 MC = R$1`.

Se um programa de resgate variável for aprovado futuramente, criar um módulo de resgate separado da Mining Pool. Esse módulo deverá ter:

1. orçamento em BRL previamente aprovado e efetivamente reservado;
2. janela de solicitação com datas e regras públicas;
3. saldo de MC elegível verificado no backend;
4. taxa de resgate calculada para aquela janela, nunca apresentada antecipadamente como fixa;
5. mesma regra de cálculo para todos os participantes da janela;
6. liquidação limitada ao orçamento reservado;
7. ledger de solicitações, conversões, reservas, pagamentos, recusas e reversões, com idempotência e auditoria.

### 4.2 Fórmula candidata para uma janela de resgate

Como hipótese de modelagem — não como política aprovada — considerar:

- `W_t`: orçamento em BRL reservado e disponível para a janela t;
- `M_t`: total de MC válidas efetivamente submetidas e aprovadas para conversão nessa janela;
- `r_t`: taxa variável em BRL por MC para aquela janela.

`r_t = W_t / M_t`, quando `M_t > 0`.

`Pagamento_{i,t} = MC_{i,t} × r_t`.

Assim, a soma dos pagamentos da janela não supera `W_t`. Se não houver orçamento positivo ou não houver MC elegíveis submetidas, não existe liquidação naquela janela.

**Limitações relevantes:** essa fórmula faz a taxa variar conforme a procura de resgate. Se muitos jogadores solicitarem conversão ao mesmo tempo, o valor por MC diminui; se poucos solicitarem, aumenta. Isso evita ultrapassar o orçamento, mas pode gerar volatilidade, incentivo para esperar por janelas melhores e percepção de incerteza. Não deve ser lançada sem regra de cotação prévia, janela de aceite, tratamento de solicitações não atendidas, comunicação clara e revisão jurídica/consumerista.

A taxa só pode ser calculada depois do fechamento da janela, ou depois de um snapshot confiável de solicitações. Para evitar corrida de submissão, a janela deve fechar em horário previamente anunciado e incluir todas as solicitações válidas recebidas dentro dela; não usar FIFO como critério econômico de preferência.

### 4.3 Alternativa mais conservadora

Se a taxa variável por janela for considerada difícil de explicar ou juridicamente inadequada, manter MC exclusivamente como pontos/recompensas de jogo e, no futuro, criar campanhas de premiação em BRL com orçamento próprio, separado e previamente definido. Essa alternativa evita que o saldo histórico de MC seja interpretado como uma obrigação de conversão.

A decisão entre essas duas implementações futuras permanece pendente de modelagem e parecer especializado. A escolha atual do Modelo A é uma direção de arquitetura, não a aprovação da fórmula de resgate acima.

## 5. Simulação financeira de 12 meses

A simulação abaixo reutiliza os cenários aprovados em D-042 a D-044. Os valores são tetos de Pool em BRL, não MC emitidas, não saldos individuais e não promessas de saque.

| Cenário | RLE acumulada em 12 meses | Pool máxima acumulada (30%) | Pool do mês 12 |
|---|---:|---:|---:|
| Estável: R$100 mil/mês | R$1.200.000 | R$360.000 | R$30.000 |
| Crescimento: +5% ao mês a partir de R$100 mil | R$1.591.713 | R$477.514 | R$51.310 |
| Contração: -10% ao mês a partir de R$100 mil | R$717.570 | R$215.271 | R$9.414 |
| Choque: 3 meses a R$100 mil, 3 a R$50 mil, 6 a R$30 mil | R$630.000 | R$189.000 | R$9.000 |

### 5.1 Leitura gerencial

- **Estável:** o teto da Pool é previsível, mas continua condicionado à disponibilidade real de caixa e às reservas.
- **Crescimento:** o teto cresce, mas não se deve antecipar receitas futuras nem assumir compromissos com base no crescimento projetado.
- **Contração:** o orçamento cai de R$30.000 para aproximadamente R$9.414 no mês 12. Um orçamento fixo de recompensas seria insustentável.
- **Choque:** o mês 12 opera com teto de R$9.000. A política precisa se ajustar sem criar emissão mínima garantida.

### 5.2 Liberação linear

Em um mês de 30 dias, há 4.320 blocos de 600 segundos. Com teto de Pool de R$30.000:

- orçamento médio por bloco: R$6,9444;
- orçamento total do mês: R$30.000;
- o rateio por jogador depende da proporção do HASH elegível no bloco;
- maior HASH total não aumenta o orçamento global: apenas divide a mesma verba entre mais HASH elegível.

Meses de calendário não têm todos 4.320 blocos; o denominador deve ser calculado com os limites reais do período aprovado, evitando criar ou perder orçamento por diferença de duração.

## 6. Stress test de liquidez e resgates

Os percentuais de 5%, 15%, 30% e 50% abaixo são hipóteses de comportamento de resgate, não limites ou taxas aprovadas.

Se, apenas para teste, toda a Pool de R$30.000 do cenário estável for considerada exposição econômica potencial:

| Fração hipotética submetida a resgate | Demanda ilustrativa |
|---:|---:|
| 5% | R$1.500 |
| 15% | R$4.500 |
| 30% | R$9.000 |
| 50% | R$15.000 |
| 100% | R$30.000 |

Esses valores não provam que a liquidez existe. São apenas uma forma de testar demanda hipotética contra caixa segregado.

Testes obrigatórios adicionais:
- solicitações concentradas em 24 horas;
- interrupção de receita por 1, 2 e 3 meses;
- aumento de chargebacks e estornos;
- aumento súbito do HASH elegível sem aumento da receita;
- concentração do Top 1, Top 10 e Top 100;
- falha de processador bancário;
- reserva operacional no piso;
- solicitações válidas superiores ao orçamento de resgate;
- resgates adiados e solicitações repetidas/idempotentes.

## 7. Política de concentração e proteção contra baleias

Não impor limite arbitrário de saque VIP como solução para concentração de HASH. Isso não resolve a distribuição e pode criar tratamento desigual.

Primeiro medir:
- participação do Top 1, Top 10 e Top 100 no HASH elegível;
- índice HHI e Gini;
- distribuição por percentis;
- evolução da participação após compras, upgrades, bônus, energia e eventos;
- participação de contas relacionadas e sinais de multi-accounting.

A proporcionalidade pura continua sendo a regra aprovada D-016. Antes de alterar essa regra, simular alternativas:
1. proporcionalidade pura;
2. limite máximo de participação por conta, com regra publicada e análise de contas relacionadas;
3. curva marginal decrescente de HASH elegível, que reduz o peso do HASH acima de faixas definidas.

Nenhum limite ou curva é aprovado nesta proposta. Se uma mudança for necessária, deve ser prospectiva, pública, tecnicamente auditável e submetida à aprovação do usuário. Nunca reduzir retroativamente recompensas já creditadas.

## 8. Política de saques — princípios propostos, números pendentes

Se o resgate for habilitado:

- **Orçamento reservado antes de aceitar pagamentos:** nunca aceitar solicitações acima do dinheiro segregado e disponível.
- **Janela pública:** datas, horários, critérios, estimativa de processamento e fórmula divulgados antes de abrir solicitações.
- **Tratamento uniforme:** mesma metodologia para todos os participantes da mesma janela; VIP não compra prioridade financeira.
- **Pro rata em caso de insuficiência:** avaliar distribuição proporcional em vez de FIFO que favoreça quem chegou primeiro.
- **Sem taxa punitiva:** cobrar apenas custos reais, verificáveis e divulgados.
- **Antifraude:** identidade e verificações aplicáveis, análise de comportamento, origem de saldo, contas relacionadas, duplicidade e abuso.
- **Circuit breaker:** interromper novas conversões quando reservas, solvência, fraude ou condições legais atingirem gatilhos publicados. Preservar todos os registros e comunicar plano de normalização.
- **Direitos e disputas:** nenhum confisco arbitrário de recompensa; bloqueios exigem motivo objetivo, evidência, prazo de revisão e canal de contestação.
- **Separação de reservas:** caixa operacional, Pool financiada e reserva de pagamentos não podem ser contabilizados duas vezes.

Limites diários/mensais podem existir por segurança operacional, prevenção a fraude ou capacidade do provedor, mas não devem ser usados para mascarar falta estrutural de liquidez. Não definir limites VIP de saque nesta fase.

## 9. Métricas obrigatórias do Financial Intelligence Center

Adicionar ao desenho analítico, sem implementar ainda:

### Funding e solvência
- RLE liquidada e conciliada por fonte;
- teto teórico da Pool;
- Pool efetivamente financiada;
- caixa livre após obrigações e reservas;
- cobertura de despesas operacionais;
- cobertura de compromissos financeiros;
- reserva específica de resgate, se existir;
- runway em meses;
- exposição MC por idade e origem, caso exista qualquer promessa de resgate.

### Distribuição e concentração
- HASH elegível total por bloco;
- HASH-hora por jogador;
- participação Top 1/10/100;
- HHI e Gini;
- MC emitida por bloco, mês e fonte;
- MC acumulada, madura, submetida a resgate, convertida e paga;
- recompensa por HASH-hora;
- relação entre orçamento financiado e recompensas registradas.

### Liquidez e fila
- solicitações válidas, pendentes, aprovadas e pagas;
- valor em BRL reservado;
- saldo não reservado;
- tempo médio e percentis de processamento;
- demanda de resgate versus orçamento;
- taxa efetiva por janela, se aprovada;
- eventos de circuit breaker e recuperação.

Não somar saldos de PC e MC, nem tratar PC vendida como dinheiro disponível sem conciliação de recebimento e obrigações.

## 10. Guardrails de lançamento

Não avançar para resgate real até todos os critérios abaixo serem satisfeitos:

1. RLE e funding reconciliados com extratos e registros financeiros.
2. Fonte e tratamento contábil de cada receita aprovados.
3. Modelo de emissão MC e sua relação com a Pool formalmente definidos.
4. Todas as recompensas creditadas contabilizadas na exposição econômica aplicável.
5. Reserva de resgate separada e testada sob estresse.
6. Testes de concentração, corrida de resgates e queda de receita aprovados.
7. Fila, cotação, aceite, liquidação, cancelamento e disputa especificados.
8. Idempotência, trilha de auditoria, controles de acesso e antifraude homologados.
9. Revisão jurídica, tributária, contábil, consumerista e regulatória no Brasil concluída.
10. Termos e comunicação ao jogador revisados para não prometer retorno, valor fixo ou liquidez inexistente.

## 11. Decisões ainda necessárias

| Tema | Estado |
|---|---|
| Modelo A: resgate variável como direção futura | Escolhido pelo usuário |
| Prioridade: sustentabilidade acima de recompensas elevadas | Escolhida pelo usuário |
| Paridade fixa MC/BRL | Rejeitada como premissa neste estágio |
| MC como saldo automaticamente sacável | Não aprovado |
| Fórmula variável `W_t / M_t` | Hipótese de estudo, não aprovada |
| Modelo alternativo de campanhas de premiação em BRL | Alternativa a comparar |
| Fator de emissão MC por orçamento Pool | Pendente |
| Definição da exposição/passivo de MC | Pendente de parecer contábil/jurídico e desenho final |
| Percentual da Pool reservado para resgate | Pendente |
| Reserva mínima de resgate | Pendente |
| Janela, fila, limites, taxas e SLA | Pendentes |
| Limites de concentração/curva marginal de HASH | Pendente de simulação e aprovação |
| Ativação de emissão oficial, conversão e saque | Não autorizada |

## 12. Registro de segurança e escopo

- PC permanece exclusiva de compra e consumo interno, sem conversão para MC.
- MC permanece distribuída exclusivamente pela Mining Pool no desenho inicial.
- Nenhum valor fixo em BRL foi atribuído à MC.
- O orçamento sandbox de 100 MC por bloco continua exclusivamente para testes e não deve ser usado para estimar obrigações financeiras reais.
- Nenhuma recompensa previamente creditada deve ser confiscada ou reavaliada retroativamente por mudança de política.
- A proposta não autoriza implementação, emissão oficial, abertura/liquidação de blocos, conversão, resgate ou pagamento.
- Nenhuma alteração de código, banco, carteira, saldo ou configuração de produção faz parte desta etapa.
