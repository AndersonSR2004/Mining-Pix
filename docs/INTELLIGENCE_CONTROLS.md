# Mining Pix — controles de inteligência operacional

## Escopo desta entrega

O painel administrativo inclui um monitor econômico e uma auditoria estática de consistência do sandbox. Os cálculos usam somente os dados disponíveis no navegador atual.

### Monitor econômico
- Soma os saldos visíveis do jogador e dos bots.
- Apresenta o saldo mantido pelos bots e a participação do jogador no total visível.
- Soma os orçamentos registrados no histórico da Mining Pool.
- Soma as recompensas acumuladas registradas para jogador e bots.
- Calcula orçamento médio, último orçamento e quantidade de ciclos analisados.

Esses indicadores não equivalem à oferta monetária global: compras, recompensas de jogos, dados apagados e outros fluxos podem não estar integralmente representados no histórico atual. O saldo visível é apenas o estado local deste navegador.

### Auditoria de integridade
Verifica saldos não negativos e finitos, IDs duplicados de equipamentos/bots/ciclos, valores de equipamentos e bots, referências de salas, limites de capacidade e consistência básica dos ciclos registrados.

Um resultado sem erros significa apenas que essas regras verificáveis passaram. Não comprova resistência a cheats, adulteração do localStorage, acesso indevido ou ataques externos.

## Segurança automatizada no GitHub

- CodeQL analisa JavaScript/TypeScript em pushes, pull requests, agenda semanal e execução manual.
- Dependabot monitora dependências npm e GitHub Actions e propõe atualizações por pull request.
- O workflow de auditoria executa npm audit com nível alto de severidade.

## Limites e próximos passos

A aplicação ainda é frontend-only e persiste estado em localStorage. O painel administrativo não é protegido por autenticação. Antes de multiplayer real, compras, saques ou qualquer valor financeiro, será necessário backend autoritativo, autenticação, autorização por função, banco de dados, validação de transações no servidor, rate limiting, logs e testes de segurança.

Os controles desta entrega são ferramentas de diagnóstico e desenvolvimento, não uma certificação de segurança nem uma garantia de integridade econômica global.
