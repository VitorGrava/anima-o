# Diário do bench

## Rodada 1: 01 bola quicando, 02 estrela brilhando

| anim | nota | o que ficou bom | o que ficou ruim |
|---|---|---|---|
| 01 bola | 7/10 | arco, aperto no contato, esticada na queda, ápice segurado (130 ms), sombra que acompanha a altura | bola "quadradona" (retângulo de cantos cortados, não círculo); volume não se mantém (28 px apertada contra 44 px caindo) |
| 02 estrela | 8/10 | cresce do ponto à cruz de 4 pontas com centro branco, pausas no apagado e no pico | f4 = f2 e f5 = f1 (espelho simples, sem variação) |

**Atritos relatados pelos agentes → correção**
- `check` dava "volume mudou" na estrela (efeito) → novo `tipo: "efeito"` (CLI `--efeito`) que não cobra volume, base, largura, nem "quase parado".
- `check` não avaliava movimento → novas checagens: emenda do loop que salta, tempos todos iguais, frames repetidos, movimento quase nulo, passos sem ease.
- Medidas de movimento eram dominadas pelo chão (bola) → só camadas que mudam entre frames entram nas medidas; as estáticas são listadas como ignoradas.
- `show`/`run` só mostravam um frame → `view frames:"all"` agora imprime todos lado a lado; `run` termina com a folha de todos os frames; `show <proj> all`.
- Sem MCP, o fluxo e os princípios só estavam no prompt → `anima guide` imprime o guia; CLAUDE.md/AGENTS.md mandam lê-lo primeiro.
- `tools` não mostrava `export`/`--columns`/`--frame` → entrada de `export` em `tools` e no CLAUDE.md; `new` documentado (sobrescreve e já define tamanho/fps).
- Cores 0/1 padrão geravam "cor sem uso" → não são mais avisadas.
- Prompt: checklist de entrega (ver todos os frames, `check`, tempos variados, formas redondas com `ellipse`, squash com volume constante) e regra para efeitos.

## Rodada 2: 03 coração pulsando, 04 fogueira

| anim | nota | o que ficou bom | o que ficou ruim |
|---|---|---|---|
| 03 coração | 8/10 | forma e sombreamento limpos, "lub-dub" (pico, contração, pulso menor), luz fixa em cima à esquerda, faísca | só 4 frames; o brilho de 1 px de ruído isolado (faísca) conta como pixel solto |
| 04 fogueira | 8,5/10 | base da chama fixa e ponta variando, brasas em arco defasadas, estrelas, reflexo no chão, loop de 6 frames com tempos variados | o agente não viu o GIF em movimento |

**Atritos → correção**
- `draw_rows` aceitou `frame` (singular) em silêncio e sobrescreveu o frame 0 cinco vezes → **chave desconhecida agora é erro com sugestão** ("frame" → quis dizer "frames"), em todos os comandos.
- O `--efeito` não aparecia no `anima help` (minha edição tinha caído no comentário do cabeçalho) e `--tipo efeito` era ignorado em silêncio → help corrigido, `--tipo` aceito, **flags desconhecidas na CLI viram erro**.
- `run` seguia depois de um erro e gerava dezenas de erros em cascata → **para no primeiro erro** (`--continuar` mantém o comportamento antigo).
- `tools` despejava JSON Schema → `anima tools` lista compacto, `anima tools <nome>` mostra parâmetros e exemplo, `--json` traz o schema.
- `show all --png` gerava um PNG por frame → gera a folha de todos os frames.
- `new` deixava cores 0/1 → `new --vazio`.
- Faltavam desenhar frames diferentes de uma vez, espelhar e centralizar → **`draw_frames`**, **`mirror: "horizontal"`** (em `draw_rows` e `draw_frames`), **`transform center`**.
- `check` contava faíscas como parte da figura → `ignore_layers` (CLI `--ignorar a,b`).
- Prompt: export também quando o pedido é um arquivo; `preview=false` documentado.

**Regras de estilo novas no `check`** (pedido: testes que cubram desenhar melhor e seguir padrões de pixel art)
contorno mais claro que o miolo, banding, pillow shading, ruído/dither aleatório, contraste fraco com o fundo e luz que troca de lado entre frames.
`tests/style.test.ts` tem um exemplo ruim e um bom para cada regra, três casos de falso positivo que as regras não podem ter, um teste de contrato (o prompt tem de ensinar cada regra que o `check` cobra) e um portão de qualidade que roda em todas as animações de `bench/out`.
Duas dessas regras acusaram a fogueira e o coração na primeira versão; eram falsos positivos meus (chama emite luz, contorno escuro não é "almofada", diagonal de 1 px não é ruído) e foram corrigidos junto com testes que os protegem.
