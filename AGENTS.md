# anima-o — instruções para agentes (Codex, Claude Code e outros)

Este repositório é uma engine de animação pixel art feita para ser controlada por IA.

## Para desenhar e animar

Use o servidor MCP `anima` (ferramentas `open_project`, `draw_rows`, `draw_shapes`,
`transform`, `add_frames`, `view`, `export_file`, ...). As instruções do servidor trazem
os princípios de pixel art e de animação: siga-os.

Sem MCP, **comece lendo o guia do animador** (`node bin/anima.mjs guide`: curto; `guide --completo` traz o guia inteiro com anatomia, princípios de pixel art e de
animação e checklist de entrega) e use a CLI pelo terminal:

```bash
node bin/anima.mjs new projeto.anima.json 32x32 12       # já define tamanho e fps (sobrescreve se existir); sem cores (defina a paleta) e com a camada "Base" (--camada <nome> renomeia; --cores-padrao traz as cores 0 e 1)
node bin/anima.mjs run projeto.anima.json comandos.json   # [{"name": "...", "input": {...}}]
node bin/anima.mjs show projeto.anima.json 0 --png frame0.png --check silhueta
node bin/anima.mjs export projeto.anima.json saida.gif --scale 6
node bin/anima.mjs export projeto.anima.json sheet.png --scale 6 --columns 8   # spritesheet; com --frame N, só um frame
node bin/anima.mjs show projeto.anima.json all            # todos os frames lado a lado, em texto
node bin/anima.mjs check projeto.anima.json [--efeito]    # defeitos, movimento e tempos (--efeito: brilho, chama, fumaça)
node bin/anima.mjs tools                                  # comandos e parâmetros
```

Figuras humanas: use o comando `draw_figure` (esqueleto por ângulos de articulação, com anatomia por construção; `cycle: "caminhada"`, `tween`, arma presa à mão), não desenhe membros à mão.
Depois de desenhar, confira o resultado: os comandos de desenho já devolvem o frame (grade, imagem
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
