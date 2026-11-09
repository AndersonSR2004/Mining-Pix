# Mining Pix — plano de migração do sandbox

**Status:** planejamento; nenhuma informação local será importada nesta fase.

## 1. Estado atual conhecido

O aplicativo é frontend-only e mantém estado no navegador. As chaves identificadas são:

| Chave | Conteúdo conhecido |
|---|---|
| `mining-pix-demo-v1` | saldo PC, equipamentos, inventário, salas, VIP, orçamento/ciclos da pool, histórico, bots, XP, passe, missões e hashrate temporário |
| `mining-pix-games-progress-v2` | progresso e níveis dos jogos |
| `mining-pix-games-best-v1` | melhores pontuações locais |

O conteúdo pode ser editado pelo dono do navegador. Validação de formato não prova legitimidade econômica.

## 2. Classificação dos dados

| Dado | Política proposta |
|---|---|
| Saldo PC e histórico de carteira | Não importar como saldo legítimo |
| Recompensas de mineração e alocações | Não importar como crédito confirmado |
| Bots, saldo de bots e orçamento de pool | Não importar como estado global |
| XP e nível | Não importar como progressão verificada |
| VIP e passe premium | Não importar como entitlement válido |
| Inventário/equipamentos | Opcionalmente oferecer como legado não verificado, sem valor econômico |
| Salas e nomes personalizados | Podem ser reconfigurados pelo usuário |
| Recordes e melhores pontuações | Podem ser preservados como histórico não verificado |
| Preferências de interface | Podem ser migradas após validação básica |
| Missões e claims | Não importar como recompensa elegível |

## 3. Fluxo futuro de migração

1. Usuário cria conta individual e confirma e-mail, conforme configuração do Auth.
2. Aplicação oferece opção explícita de importar dados locais.
3. Frontend lê as chaves conhecidas e valida apenas estrutura/tamanho/tipos para evitar payloads inválidos.
4. Backend recebe pacote limitado, registra origem e versão do formato.
5. Backend armazena em área de legado não verificado, isolada de carteira, progressão e economia.
6. Interface apresenta resumo do que foi encontrado e pede confirmação antes de importar itens permitidos.
7. Dados aprovados são convertidos para entidades novas sem conceder saldo, recompensas ou benefícios premium.
8. Usuário pode ignorar a migração e começar uma conta limpa.

A migração não pode aceitar campos que determinem saldo inicial, admin, preço, hashrate global, recompensa, validade de pagamento ou propriedade de ativos econômicos.

## 4. Proteção contra replay e abuso

- Cada pacote de migração recebe ID e chave idempotente.
- Limitar tamanho do payload e número de registros.
- Rejeitar campos inesperados ou versões incompatíveis.
- Não executar JSON recebido como código.
- Registrar usuário, timestamp, versão e resultado.
- Nunca expor o pacote legado como fonte de verdade para operações do jogo.
- Permitir uma importação por conta/formato, ou documentar explicitamente como reimportações são tratadas.

## 5. Continuidade e reversão

Antes da migração:
- Manter versão sandbox acessível durante homologação.
- Não remover localStorage nem substituir fluxo atual antes de existir fluxo de exportação/recuperação.
- Criar backup/exportação JSON local com versão de schema, se necessário.
- Não misturar dados DEV e PROD.
- Testar rollback de frontend e migrations em DEV.
- Mudanças destrutivas de schema exigem backup e plano de restauração.

Após a migração:
- Conta autenticada consulta estado do backend.
- LocalStorage deixa de ser autoridade; pode armazenar cache de interface não sensível.
- Em falha de rede, não conceder recompensa offline que depois possa ser forjada.
- Sincronização deve usar operações idempotentes e reconciliação explícita.

## 6. Critérios de aceite

- Usuário consegue começar uma conta limpa sem importar nada.
- Importação é opt-in, idempotente e limitada.
- Nenhum saldo ou recompensa local vira saldo legítimo automaticamente.
- Dados importados aparecem claramente como legado não verificado.
- Dois usuários não conseguem acessar pacotes legados um do outro.
- Erro durante importação não cria itens duplicados ou créditos parciais.
- Existe exportação/backup e procedimento de recuperação antes de remover o sandbox.
