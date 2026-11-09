# Mining Pix — auditoria técnica inicial

**Base analisada:** commit `7404a96f2bb948ad7c1d0ff26930f32eaa49cf69` da branch `main`.

## 1. Estrutura e stack

- React 19 + TypeScript + Vite 8.
- Entrada: `src/main.tsx`.
- Aplicação: `src/App.tsx`.
- Estilos principais: `src/App.css`.
- Estilos globais: `src/index.css`.
- Persistência: `localStorage`, chave `mining-pix-demo-v1`.
- O projeto foi enviado dentro da subpasta `Mining Pix/`; por isso, os comandos npm devem ser executados a partir dessa pasta. A raiz do repositório ainda não é a raiz Vite.

## 2. Funcionalidades encontradas

- Dashboard e navegação entre Dashboard, Mineração, Equipamentos, Inventário, Loja, Carteira, VIP, Passe de Batalha e Administração.
- Máquinas instaladas em salas e máquinas guardadas no inventário.
- Capacidade por sala e planos Free/VIP.
- Desmontagem com recuperação de 90% do preço-base.
- Mining Pool simulada com orçamento por ciclo.
- Hashrate global calculado pela soma do jogador e dos bots ativos.
- Bots com hashrate, estado ativo/inativo e carteiras simuladas.
- Painel administrativo local para saldo, VIP, XP, máquinas, bots e orçamento da pool.
- XP e níveis; cada ciclo manual concede 100 XP.
- Passe com 3 recompensas Free e 10 Premium, cada máquina com 1 H/s.
- Histórico de movimentações e ciclos.

## 3. Limites importantes da versão atual

1. **Somente frontend:** não há backend, autenticação, banco de dados compartilhado ou validação server-side.
2. **Dados locais:** cada navegador possui seu próprio estado. Limpar os dados do navegador pode apagar o progresso.
3. **Administração sem segurança real:** o painel administrativo é uma ferramenta de sandbox, não um controle de acesso protegido.
4. **Mining Pool manual:** existe contador persistente de referência de 10 minutos; ao zerar, a interface informa que o ciclo está disponível, mas a distribuição continua manual e não há pagamento automático no frontend.
5. **Distribuição inteira:** o orçamento inteiro é dividido pelo método dos maiores restos, para que as parcelas do jogador e dos bots ativos somem exatamente o orçamento do ciclo.
6. **Economia demonstrativa:** saldos, XP, VIP e recompensas não devem ser tratados como dinheiro ou pagamentos reais.
7. **Passe Premium:** a ativação é uma flag local controlada pelo sandbox; não existe cobrança ou validação de compra.
8. **Layout do repositório:** os arquivos estão aninhados em `Mining Pix/`, o que exige configurar a raiz do projeto corretamente em ambientes de deploy/importação.

## 4. Regras de domínio que devem ser preservadas

- Hashrate da rede = hashrate do jogador + hashrate de todos os bots ativos.
- A participação do jogador é sua fração do hashrate total.
- A recompensa é calculada sobre o orçamento definido para o ciclo; não se deve criar hashrate global fixo.
- Bots são participantes simulados e não podem gerar pagamentos reais.
- As máquinas do passe têm 1 H/s cada: 3 na trilha Free e 10 na Premium.
- A desmontagem recupera 90% do preço-base.
- VIP e Premium Pass são conceitos separados.
- Preservar a identidade visual atual em `App.css`; mudanças visuais devem ser deliberadas.

## 5. Próximas etapas recomendadas

1. Executar e acompanhar o workflow de CI, que instala dependências e roda `npm run build` dentro de `Mining Pix/`.
2. Adicionar testes automatizados para distribuição da pool, instalação de máquinas, limites de sala e resgate de recompensas.
3. Avaliar a separação das regras econômicas em módulos independentes para facilitar testes e manutenção.
4. Planejar backend e persistência compartilhada antes de qualquer multiplayer real, compra, saque ou valor financeiro.

## 6. Segurança de mudanças

A branch `main` deve permanecer como referência estável. Implementações devem ocorrer em branches de trabalho e ser apresentadas em Pull Requests para revisão. Nenhuma mudança desta auditoria altera o comportamento do jogo.
