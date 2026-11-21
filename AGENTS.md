# anima-o — instruções para agentes (Codex, Claude Code e outros)

Este repositório é uma engine de animação pixel art feita para ser controlada por IA.

## Para desenhar e animar

Use o servidor MCP `anima` (ferramentas `open_project`, `draw_rows`, `draw_shapes`,
`transform`, `add_frames`, `view`, `export_file`, ...). As instruções do servidor trazem
os princípios de pixel art e de animação: siga-os.

Sem MCP, use a CLI pelo terminal:

```bash
node bin/anima.mjs new projeto.anima.json 32x32 12
node bin/anima.mjs run projeto.anima.json comandos.json   # [{"name": "...", "input": {...}}]
node bin/anima.mjs show projeto.anima.json 0 --png frame0.png --check silhueta
node bin/anima.mjs export projeto.anima.json saida.gif --scale 6
node bin/anima.mjs tools                                  # comandos e parâmetros
```

Depois de desenhar, confira o resultado (`view` no MCP, ou `show --png` e abra a imagem).
O usuário pode acompanhar ao vivo com `node bin/anima.mjs view projeto.anima.json`.

## Para mexer no código

- Engine (TypeScript puro): `src/engine/` — comandos em `commands.ts` (schemas Zod viram as ferramentas).
- Servidor MCP: `mcp/`. CLI: `cli/anima.ts`. Chat via API e app web: `server/`, `web/`.
- Princípios de animação usados pela IA: `server/prompt.ts`.
- Testes: `npm test`. Tipos: `npm run typecheck`.
