# Mining Pix

Projeto de jogo/simulador de mineração desenvolvido com React, TypeScript e Vite.

## Estrutura atual

O projeto executável está dentro da pasta `Mining Pix/` na raiz deste repositório.

## Executar localmente

Pré-requisitos: Node.js compatível com Vite 8.

```bash
cd "Mining Pix"
npm install
npm run dev
```

Para validar a compilação:

```bash
npm run build
```

## Estado do projeto

Esta versão é um **sandbox frontend**. Saldo, máquinas, VIP, bots, Mining Pool, XP e recompensas são armazenados localmente no navegador via `localStorage`. Não representam pagamentos, saques ou uma economia multiplayer real.

O simulador possui contador de referência de 10 minutos por ciclo e distribuição inteira pelo método dos maiores restos; a execução continua manual nesta versão frontend.

Consulte [docs/PROJECT_AUDIT.md](docs/PROJECT_AUDIT.md) para o levantamento técnico inicial.

## Fluxo de desenvolvimento

- `main`: versão de referência enviada pelo proprietário.
- `codex/mining-pix-work`: branch isolada para preparação e melhorias.
- Alterações funcionais devem ser revisadas em Pull Requests antes de integrar à `main`.
