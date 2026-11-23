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
