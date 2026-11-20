# Pacote 02 do Mining Pix

## Ambiente e fluxo

O pacote depende da base do PR #6 e usa o projeto Supabase DEV. O jogo possui uma carteira DePix de demonstração. Os depósitos são solicitações fictícias confirmadas no Admin Center. Um saque reserva saldo e aguarda aprovação administrativa. A rejeição devolve a reserva, e a liquidação simulada consome a reserva aprovada. O destino é um identificador `sandbox:...`. O servidor valida a função administrativa atual e a sessão MFA para decisões financeiras.

O banco guarda valores em unidades de 0,00000001 DePix e envia textos decimais ao frontend. Os lançamentos têm duas pernas, chaves de idempotência e registros de auditoria. As posições do diário podem ser conciliadas pela soma das duas pernas de cada lançamento. Nenhuma integração PIX, custodiante, chave Liquid ou envio de ativos participa do fluxo.

## Preços de teste

| Oferta | DePix fictício |
| --- | ---: |
| Equipamento até 25 H/s | 1 |
| Equipamento de mais de 25 até 55 H/s | 2 |
| Equipamento de mais de 55 até 250 H/s | 5 |
| Equipamento acima de 250 H/s | 10 |
| Sala permanente | 5 |
| VIP demonstrativo por 30 dias | 10 |
| Passe demonstrativo por 30 dias | 5 |

As propostas são configuráveis no `depix_sandbox.prices` pelo operador de banco. A compra usa o preço vigente no servidor, confirma o preço apresentado ao jogador e vincula o débito à unidade entregue. Compras VIP e passe registram apenas a validade de demonstração. Regras de benefícios e trilhas pagas ainda precisam de homologação. Equipamentos e salas usam o inventário DEV existente e têm procedência nos recibos sandbox. Reservas nunca entram no saldo disponível para compra.

## Ciclos e competição

O Supabase Cron tenta liquidar um ciclo por dia UTC em intervalos de cinco minutos. O orçamento inicial é zero e precisa de financiamento fictício e limite diário configurados pelo administrador. A distribuição fica limitada pelo saldo da pool e pelo teto diário. As parcelas são calculadas sobre o HASH elegível e as unidades residuais seguem a ordem dos maiores restos. Falhas revertem o ciclo inteiro. Repetições no mesmo dia não geram novos pagamentos. Dias perdidos não são recompostos. O parâmetro de até 30% da receita líquida elegível permanece uma hipótese econômica para estudo.

O ranking usa nome público, HASH, classificação, liga e evolução desde o último ciclo. A posição e os prêmios individuais podem ser consultados por ciclo. Jogadores gratuitos podem reivindicar uma máquina vinculada à conta e usar o XP diário persistente para ativar um bônus por 24 horas. Os jogos permanecem acessíveis e o servidor bloqueia recompensas por vitórias ainda sem verificação autoritativa. As missões locais exibem objetivos de demonstração.

## Cutover e homologação

- O frontend novo remove PC/MC dos caminhos financeiros do jogador. RPCs, registros e módulos administrativos legados continuam no DEV durante a transição do preview antigo. Desativar as escritas PC/MC junto com o corte da versão anterior e retirar as permissões somente após verificar dependências.
- O esquema sandbox é isolado das tabelas públicas DePix iniciais. Qualquer futura produção deve começar sem importar posições, prêmios, equipamentos ou salas de teste como ativos elegíveis para recompensas resgatáveis.
- Validar concorrência com múltiplas conexões, carga representativa, rotina de conciliação, revisão de permissões, experiência mobile e matrícula/login MFA com um administrador do piloto.
- Validar os critérios econômicos, a política da pool e o enquadramento da operação antes de qualquer autorização do proprietário para ativar transferências reais.

## Regressões

Execute os testes Node e o build na pasta do projeto. As suites SQL em `supabase/tests` usam transações revertidas e cobrem precisão, depósito único, compra, reserva, liquidação, rejeição, limite da pool, arredondamento, repetição, falha no ciclo, empate, ligas e privacidade.
