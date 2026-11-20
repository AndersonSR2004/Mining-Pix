# Migração para DePix

## Carteira em DEV

A primeira entrega reproduz no histórico do repositório as quatro tabelas já existentes no DEV. A tela Minha carteira consulta o saldo DePix total, reservado e disponível e até 20 movimentações, com oito casas decimais preservadas entre banco e navegador. A conta sem registro exibe saldo zero. A carteira anterior continua visível enquanto loja, VIP e pool dependem dos fluxos PC/MC.

## Próximas entregas do pacote A

1. Criar diário de partidas dobradas com lançamentos imutáveis, estornos por compensação e controles de idempotência. Usar unidades inteiras do ativo ou NUMERIC com parâmetros validados antes do arredondamento. Usar textos decimais no contrato JSON.
2. Implementar provedor simulado isolado dos fundos reais. Criar intenções de depósito com validade e confirmar destinatário, ativo, rede e valor no backend. Deduplicar por rede, TXID e índice da saída. O esquema inicial usa TXID único e precisará suportar múltiplas saídas de uma transferência.
3. Reservar saldo e gravar o saque na mesma transação. Exigir MFA e autorização administrativa verificada no servidor. Aprovar ou rejeitar com trilha de auditoria, liberar a reserva na rejeição e testar concorrência e repetições. Validar endereço com decodificação e checksum de Liquid antes de qualquer envio.
4. Expor fluxo e históricos no jogo e fila de revisão no Admin Center. Testar jogador, segundo jogador, administrador com MFA e sessão sem autorização.
5. Inventariar chamadas PC/MC de compras, VIP, passe, missões, recompensas, pool e relatórios. Manter o histórico e precificar em DePix antes de trocar o fluxo ativo. Desabilitar emissão legada no corte e preservar dados para auditoria. Retirar a UI nova por reversão do código se necessário, mantendo a base e o histórico.

## Liquid e produção

A documentação da Eulen informa oito casas decimais e registra o ID do ativo Liquid. Sua API pública Pix2DePix documenta conversões entre PIX e DePix. Depósitos e saques diretos entre carteiras Liquid exigem integração com carteira ou nó Liquid, inclusive leitura de saídas confidenciais pelo destinatário. Validar taxas em L-BTC, política de confirmações, tratamento de reorganizações, conciliação e custódia antes de habilitar transferências. O sandbox deve usar simulação ou ativo de teste sem valor.

- [Guia Liquid da Eulen](https://docs.eulen.app/liquid-network-guide-2411355m0)
- [API Pix2DePix](https://docs.eulen.app/)
- [Resolução BCB nº 520](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=520&tipo=Resolu%C3%A7%C3%A3o+BCB)

Para a produção, confirmar o enquadramento jurídico da custódia e operação em nome de jogadores, além de obrigações de proteção de dados, tributação e prevenção à lavagem. A autorização para movimentar valores reais permanece uma decisão explícita do proprietário.

## Pacote B

Financiar a pool somente com receita líquida elegível liquidada e conciliada, após validação do teto de 30%. Manter fundos de jogadores, receita, reservas e obrigações em contas distintas. Registrar snapshots de HASH elegível, distribuir em unidades inteiras por maiores restos e reconciliar o orçamento exato por ciclo. Preservar PC/MC como histórico, sem converter saldos de demonstração em ativos resgatáveis.
