# Financial Intelligence Center

## Objetivo

Módulo de controle gerencial do Mining Pix integrado ao Admin Center. Consolida receita, previsão, despesas efetivas, compromissos, reserva, política de alocação, oferta de PIX COIN e atividade de jogadores. O painel atual é de leitura e não executa pagamentos ou transferências.

## Regras aprovadas

- Receita elegível: somente recebida, liquidada e conciliada no Revenue Ledger BRL.
- Reserva: meta mínima = soma das despesas operacionais efetivamente pagas nos três últimos meses completos.
- Alocação de referência: 30% Mining Pool, 30% reserva, 30% operação/desenvolvimento e 10% administração.
- Ao atingir a meta da reserva, aportes ficam suspensos até revisão formal; não há redirecionamento automático.
- Compromissos de jogadores são exibidos em MC separadamente de obrigações em BRL. Não atribuir cotação, valor de resgate ou passivo em reais a MC sem política aprovada.
- Emissão MC e saques continuam bloqueados.

## Estruturas DEV instaladas

- `private.operational_expense_entries`: despesas efetivamente pagas, BRL em centavos inteiros, append-only.
- `private.financial_commitments`: compromissos futuros abertos/pagos/cancelados; moeda BRL para obrigações comerciais e MC para compromissos de recompensa.
- `private.financial_commitment_events`: trilha de eventos dos compromissos, append-only.
- `private.reserve_fund_movements`: movimentos da reserva, BRL em centavos, append-only.
- `private.economy_supply_snapshots`: snapshots da oferta de PC, carteiras, equipamentos e hashrate.
- `private.player_activity_events`: eventos de atividade por jogador; coleta ainda não integrada ao cliente.
- `public.admin_financial_snapshot()`: read model admin-only.
- `public.admin_capture_economy_snapshot()`: captura admin-only de snapshot da oferta PC.

## Indicadores exibidos

- Receita líquida conciliada dos últimos três meses completos.
- Previsão do próximo mês = média simples da receita líquida dos três últimos meses completos. Cenário indicativo, não garantia.
- Compromissos em BRL em aberto e vencimentos nos próximos 30 dias.
- Compromissos de recompensa em MC, separados e sem conversão BRL.
- Saldo da reserva, meta de três meses e gap.
- Série mensal de receitas e despesas.
- Alocação de referência 30/30/30/10.
- Oferta circulante PC, emissão bruta, sinks, emissão líquida e snapshots históricos.
- Atividade de jogadores 7d/30d e eventos 24h, atualmente sem coleta.

## Interpretação dos KPIs

- “Inflação da rede” é acompanhada inicialmente como pressão de emissão líquida de PIX COIN (créditos menos débitos) em relação à oferta circulante. Isso não é inflação de preços ao consumidor. Um índice de preços interno exigirá cesta estável de itens/serviços, preços históricos comparáveis e ponderação.
- A variação da oferta em 30 dias depende de snapshots registrados em datas diferentes. O primeiro snapshot não cria histórico retroativo.
- Atividade de jogadores permanece explicitamente “não coletada” até instrumentação. Eventos de cliente servem a analytics, nunca como prova de recompensa ou HASH elegível.
- A previsão usa somente meses completos para não projetar a partir de mês parcial.
- A meta de reserva é a soma das despesas efetivas dos três meses completos anteriores ao mês atual. Sem histórico de despesas, o painel informa meta zero e ausência de cobertura mensurável; isso não significa reserva suficiente.

## Limites da entrega

- Admin Center já permite registrar despesas efetivamente pagas, compromissos BRL/MC e movimentos contábeis da reserva. Toda operação exige motivo, referência, validação administrativa server-side, idempotência e trilha financeira append-only.
- Ainda não há gateway de pagamento, integração de anúncios ou importação automática de extratos.
- Ainda não há fechamento mensal, conciliação com provedores, tratamento automatizado de chargebacks tardios ou motor de alocação.
- Telemetria inicial já registra sessões autenticadas, início de partida e conclusão de partida. É analítica client-reported, não autoriza recompensas, HASH ou pagamentos.
- Snapshot de oferta PC é manual pelo botão no painel; não há cron. O primeiro comparativo de 30 dias depende de uma segunda captura após esse intervalo.
- Nenhuma linha financeira foi criada como dado fictício para preencher gráficos.

## Próximas etapas

1. Edge Function administrativa para registrar despesas pagas, compromissos e movimentos de reserva, com idempotência, motivo e auditoria.
2. Fluxo de baixa de compromissos que cria despesa real associada sem duplicidade.
3. Telemetria de atividade no cliente e eventos confiáveis do backend, claramente separados.
4. Índice interno de preços de itens e serviços com cesta versionada para medir inflação de preços da economia virtual.
5. Integração de provedores de pagamento e publicidade após seleção e validação.
6. Fechamento mensal, provisões, ajustes tardios, reserva e motor de alocação.
7. Depois, integração de HASH-hora e orçamento BRL da Mining Pool sem habilitar emissão MC.

## Segurança

Tabelas no schema privado, RLS habilitado, sem acesso direto de anon/authenticated/service_role; acesso a dados feito por funções SECURITY DEFINER com validação de `app_metadata.admin=true`. Ledgers de fatos financeiros e eventos são append-only. A tabela de compromissos permite somente transições de estado via backend `service_role`, mantendo termos imutáveis.


## Entrega de operações administrativas

- Edge Function `admin-finance` implantada no DEV com JWT obrigatório, origem GitHub Pages permitida e validação de `auth.getUser` + `app_metadata.admin=true`.
- Registro de despesa efetivamente paga com BRL em centavos, referência, data, motivo e idempotência.
- Criação de compromissos em BRL ou MC (o compromisso de recompensa é MC-only).
- Registro de aportes/retiradas contábeis da reserva; retirada não pode exceder saldo disponível.
- Baixa de compromisso BRL exige despesa paga de valor exatamente correspondente; a mesma despesa não pode liquidar dois compromissos.
- Eventos administrativos financeiros registrados em trilha append-only.
- Chaves idempotentes permanecem estáveis no cliente em caso de retry até confirmação.
- Painel mostra despesas recentes, compromissos, cronograma mensal de obrigações MC e auditoria financeira.
- Telemetria inicial registra sessão autenticada, início e conclusão de partidas; não participa de cálculos de recompensa.
