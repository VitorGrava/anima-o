# anima-o — instruções para o Claude Code

Este repositório é uma engine de animação pixel art feita para ser controlada por IA.

## Para desenhar e animar

**REGRA PERMANENTE (pedido do dono do projeto):** antes de fazer QUALQUER pixel art original, PESQUISE REFERÊNCIAS NA INTERNET (WebSearch; baixe as imagens com o fetch e OLHE com Read; liste 5 características concretas: pose, proporção da cabeça, cores, contorno, acento) e só então desenhe. Na entrega diga quais referências usou. E NÃO PARE no meio: o dono pediu para continuar melhorando e iterando até o limite; faça as rodadas, compare com a referência, descarte o que piorar e siga (`reference processo`). Dica de pesquisa: `curl` baixa as imagens das páginas do itch.io/OpenGameArt; GIFs e imagens grandes: recorte e amplie com ImageMagick (`convert`) para enxergar o sprite; `import_image` só lê PNG. Só use `import_image` com referências para estudo local (algumas licenças proíbem redistribuir ou treinar IA; não copie para o repositório).

Use o servidor MCP `anima` (ferramentas `open_project`, `draw_rows`, `draw_shapes`,
`transform`, `add_frames`, `view`, `export_file`, ...). As instruções do servidor trazem
os princípios de pixel art e de animação: siga-os.

Sem MCP, **comece lendo o guia do animador** (`node bin/anima.mjs guide`: curto; `guide --completo` traz o guia inteiro com anatomia, princípios de pixel art e de
animação e checklist de entrega) e use a CLI pelo terminal:

```bash
node bin/anima.mjs new projeto.anima.json 32x32 12       # já define tamanho e fps (sobrescreve se existir); sem cores (defina a paleta) e com a camada "Base" (--camada <nome> renomeia; --cores-padrao traz as cores 0 e 1)
node bin/anima.mjs run projeto.anima.json comandos.json   # [{"name": "...", "input": {...}}]
node bin/anima.mjs show projeto.anima.json 0 --png frame0.png --check silhueta
node bin/anima.mjs export projeto.anima.json saida.gif --scale 6                 # sem --scale a escala é automática; --fundo #hex --margem N --sombra --vai-e-volta deixam a saída bonita
node bin/anima.mjs export projeto.anima.json sheet.png --scale 6 --columns 8   # spritesheet; com --frame N, só um frame
node bin/anima.mjs show projeto.anima.json all            # todos os frames lado a lado, em texto
node bin/anima.mjs check projeto.anima.json [--efeito]    # defeitos, movimento e tempos (--efeito: brilho, chama, fumaça)
node bin/anima.mjs import projeto.anima.json ref.png --cores 24   # traz um PNG para a grade (detecta o pixel, tira o fundo, quantiza a paleta)
node bin/anima.mjs rodada projeto.anima.json --ref ref.png --nota 7   # UMA chamada por rodada de revisão (imagem, medidas, comparação, snapshot, aviso se piorou); `restaurar <proj> <n>` volta; `critico` gera o pedido para um crítico independente
# dicas: transform shade forma=volume (bloco de luz/sombra); set_frame_timing duration_ms=auto (slow in/out); a ÚLTIMA camada criada fica por cima
node bin/anima.mjs tools                                  # comandos e parâmetros
```

Esqueleto OPCIONAL (só se for pedido ou fizer sentido): `rig_create` → `rig_part` (arte própria presa aos ossos) → `rig_pose` (ângulos, tween) → `rig_bake`; `view --bones` mostra os ossos. Sem `rig_create` o projeto não tem esqueleto.
Figuras humanas: use o comando `draw_figure` (esqueleto por ângulos de articulação, com anatomia por construção; `cycle: "caminhada"`, `tween`, arma presa à mão), não desenhe membros à mão.
Você enxerga por IMAGEM: no CLI, `run` salva `<projeto>.preview.png` (e `-1.png` com o zoom da mudança em canvas grande) — abra o PNG com a ferramenta Read; `show --region x,y,w,h --grid --png f.png` dá zoom com régua; `view` aceita `tiles` ("3x2") para canvas grande; `inspecionar` descreve em palavras regiões, camadas e brilho. Depois de desenhar, confira o resultado: os comandos de desenho já devolvem o frame (grade, imagem
e avisos). Use `view` (com `region`+`grid` para zoom, `compare` para diff, `onion`), `check` para
um relatório com coordenadas e `reference` para proporções de anatomia e técnicas de pixel art.
Na CLI: `show --region x,y,w,h --grid --png f.png`, `show --diff 0,1`, `check projeto`,
`reference proporcoes --height 32`.
O usuário pode acompanhar ao vivo com `node bin/anima.mjs view projeto.anima.json`.

## Para mexer no código

- Engine (TypeScript puro): `src/engine/` — comandos em `commands.ts` (schemas Zod viram as ferramentas).
- Servidor MCP: `mcp/`. CLI: `cli/anima.ts`. Chat via API e app web: `server/`, `web/`.
- Princípios de animação e anatomia usados pela IA: `server/prompt.ts`; referências sob demanda: `src/engine/reference.ts`.
- Feedback visual e checagens: `src/engine/view.ts` (imagens), `src/engine/analyze.ts` (check).
- Testes: `npm test`. Tipos: `npm run typecheck`.
