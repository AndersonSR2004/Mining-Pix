# Mining Pix — Política das Lucky Boxes

**Status:** aprovada para implementação no ambiente DEV em 10 nov 2026.

## Regra do produto
- Lucky Boxes são exclusivamente gratuitas: uma abertura por conta a cada dia UTC.
- Não é possível comprar, acelerar, acumular tentativas ou pagar para abrir caixas.
- PIX COIN, MINING COIN, dinheiro, equipamentos com HASH e qualquer item com efeito econômico ficam excluídos.
- A caixa concede somente itens cosméticos sem efeito sobre progressão, potência, inventário de máquinas, moedas ou resgate.
- Os cosméticos não são negociáveis, transferíveis, conversíveis ou vendáveis.
- O catálogo, as probabilidades e as versões são públicos. Alterações futuras não modificam registros históricos.
- O resultado é selecionado no backend e registrado de forma atômica.
- Uma restrição única por usuário e data UTC impede resgates duplicados, inclusive em concorrência ou retry.

## Catálogo inicial e probabilidades
| Item | Categoria | Probabilidade |
|---|---|---:|
| Moldura Neon | Comum | 40% |
| Drone Pixel | Comum | 30% |
| Banner Aurora | Incomum | 15% |
| Insígnia Dourada | Incomum | 10% |
| Emblema Fundador | Raro | 5% |
| **Total** | | **100%** |

Agregados: comum 70%, incomum 25%, raro 5%.

## Implementação DEV
Migration `20261110040000_daily_free_cosmetic_boxes.sql` cria catálogo, inventário cosmético e histórico de resgates. A função `claim_daily_free_box()` exige autenticação, usa lock transacional por conta, sorteia no servidor e aplica idempotência diária. RLS permite leitura do catálogo ativo e dos próprios itens/histórico; nenhuma escrita direta é concedida.

## Limites
A primeira versão é uma coleção cosmética simples. Não há loja de cosméticos, mercado entre jogadores, caixas pagas, conversão em moedas, efeitos de HASH, nem integração com saques. Qualquer expansão exige nova decisão e revisão de impacto.
