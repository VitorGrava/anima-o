# anima-o

Engine de animação **pixel art controlada por IA**. Você descreve o que quer ("um slime verde pulando em loop", "deixa o chapéu vermelho", "mais rápido") e o Claude desenha, anima e ajusta os sprites pixel por pixel. O canvas atualiza ao vivo a cada passo.

![demo](docs/demo.gif)

## Como rodar

Requer Node 21.7 ou mais novo.

```bash
npm install
```

```bash
cp .env.example .env   # e preencha ANTHROPIC_API_KEY
```

```bash
npm run dev
```

Abra http://localhost:5173. Sem chave de API dá para usar o editor manual e o botão **Demo**.

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor + interface com hot reload |
| `npm test` | testes da engine e do loop do agente |
| `npm run build` e `npm start` | build de produção |

## Usar com Claude Code ou Codex (sem chave de API)

A engine também é uma **ferramenta MCP**: agentes como o Claude Code e o Codex desenham e animam
usando a sua própria assinatura, sem `ANTHROPIC_API_KEY`. Eles recebem junto as regras de pixel art
e de animação, e enxergam cada frame como imagem.

Depois do `npm install`, registre o servidor no seu agente (troque `/caminho/anima-o` pelo caminho do repositório):

**Claude Code** (vale para todos os seus projetos):

```bash
claude mcp add --scope user anima -- node /caminho/anima-o/bin/anima.mjs mcp
```

Dentro desta pasta não precisa: o arquivo `.mcp.json` já registra o servidor.

**Codex**: adicione ao `~/.codex/config.toml`:

```toml
[mcp_servers.anima]
command = "node"
args = ["/caminho/anima-o/bin/anima.mjs", "mcp"]
```

Aí é só pedir: *"crie um slime pulando em loop e exporte um GIF"*. O projeto fica num arquivo
`.anima.json` no diretório em que o agente está, salvo a cada comando.

**Ver ao vivo** enquanto o agente desenha:

```bash
node /caminho/anima-o/bin/anima.mjs view animacao.anima.json
```

Abra o endereço que aparecer; o canvas atualiza sozinho a cada comando do agente.

### CLI

Para agentes sem MCP, scripts ou uso manual:

| Comando | O que faz |
|---|---|
| `anima mcp` | servidor MCP |
| `anima view [projeto]` | app no navegador acompanhando o arquivo ao vivo |
| `anima new <projeto> [LxA] [fps]` | cria um projeto vazio |
| `anima run <projeto> <comandos.json> [--png f.png]` | aplica uma lista de comandos `[{"name", "input"}]` (use `-` para ler do stdin); o último comando mostra a prévia (grade, avisos e imagem) |
| `anima show <projeto> [frame] [--png f.png] [--check silhueta]` | mostra o frame como texto e, opcionalmente, como imagem |
| `anima show ... --region x,y,w,h --grid` | zoom em uma área, com grade e coordenadas nas margens |
| `anima show ... --diff a,b` / `--onion` | o que mudou do frame a para o b / frame anterior em azul atrás do atual |
| `anima check <projeto> [--symmetric] [--png f.png]` | aponta defeitos da arte e da animação, com coordenadas |
| `anima reference <tópico> [--height N] [--style ...] [--color #hex]` | referências de anatomia e pixel art |
| `anima export <projeto> <saida.gif\|.png\|.json>` | exporta (`--scale`, `--columns`, `--frame`) |
| `anima tools` | lista os comandos com seus parâmetros |

Rode com `node bin/anima.mjs ...` ou instale o comando com `npm link`.

## Como funciona

```
 navegador (web/)                   servidor (server/)                Claude
┌──────────────────┐  POST /api/chat ┌───────────────────┐  tools   ┌─────────┐
│ canvas, timeline │ ──────────────▶ │ loop do agente    │ ───────▶ │         │
│ editor manual    │ ◀── SSE ─────── │ executa comandos  │ ◀─────── │         │
│ exporta GIF/PNG  │  texto, tool,   │ da engine, manda  │ tool_use │         │
└──────────────────┘  projeto        │ imagem p/ a IA ver│          └─────────┘
         │                           └───────────────────┘
         └──────── os dois usam a mesma engine (src/engine/) ────────┘
```

**A engine (`src/engine/`)** é TypeScript puro, sem DOM, e roda igual no navegador e no Node:

- `project.ts`: o modelo. Um projeto é uma grade de frames × camadas, e cada célula guarda índices de paleta (0 = transparente), como num GIF.
- `draw.ts`: primitivas de pixel art (linha de Bresenham, retângulo, elipse, balde, deslocamento, espelho, contorno automático).
- `commands.ts`: **a API que a IA controla.** Cada comando tem um schema Zod, que vira a definição de *tool* do Claude, e uma função que aplica o comando. Os comandos são atômicos: se falham, o projeto não muda.
- `ascii.ts`: a arte como texto, um caractere por pixel. É assim que a IA escreve sprites com precisão (`draw_rows`) e lê o que já existe (`view`).
- `view.ts`: imagens de conferência: recorte com zoom, grade com coordenadas, diff entre frames, onion skin e marcação de pixels com problema.
- `analyze.ts`: checagens automáticas (pixels soltos, furos, serrilhado, simetria, cores parecidas, volume que pula entre frames, pés que flutuam, emenda do loop) e medidas por camada.
- `reference.ts`: referências de anatomia (proporções calculadas em pixels, articulações, rosto e mãos, quadrúpedes, caminhada, corrida, pose) e de pixel art (linhas, sombreamento, paletas prontas, rampas com mudança de matiz).
- `render.ts`, `gif.ts`, `serialize.ts`: renderização RGBA, spritesheet, GIF animado e o formato `.anima.json`.

**O agente (`server/agent.ts`)** roda o loop de *tool use* com o Claude (`claude-opus-5-5`, pensamento adaptativo, streaming). A IA não enxerga enquanto desenha, então o feedback é automático: todo comando de desenho (`draw_rows`, `draw_shapes`, `transform`, `copy_layer_content`) devolve o frame editado como **grade de texto com régua, uma imagem PNG e avisos das checagens rápidas**, com os pixels problemáticos marcados em magenta. Para conferir de perto ou entre frames há `view` (zoom, grade, diff, onion skin) e `check` (relatório completo). Desligue com `"preview": false` em lotes grandes.

### Comandos disponíveis para a IA

| Comando | Para quê |
|---|---|
| `set_canvas` | nome, tamanho, fps |
| `set_palette`, `remove_colors` | cores. Mudar o hex de uma chave recolore toda a animação |
| `add_layer`, `update_layer` | camadas: criar, renomear, esconder, reordenar, apagar |
| `add_frames`, `delete_frames`, `move_frame`, `set_frame_timing` | timeline e tempo de cada frame |
| `draw_rows` | desenho pixel a pixel por texto (com prévia automática) |
| `draw_shapes` | pixels, linhas, retângulos, elipses, balde |
| `transform` | deslocar (com wrap), espelhar, trocar cor, contornar, limpar |
| `copy_layer_content` | copiar conteúdo entre frames/camadas com deslocamento |
| `view`, `get_project_info` | ver o estado: texto + imagem, com `region`/`grid` (zoom), `compare` (diff), `onion` |
| `check` | defeitos da arte e da animação, com coordenadas e medidas por camada |
| `reference` | proporções em pixels, articulações, ciclos de caminhada/corrida, paletas, rampas de cor |
| `export` | baixar GIF, spritesheet PNG ou JSON no navegador |

Exemplo de `draw_rows` (um coração 7×6):

```json
{ "rows": [".00.00.", "0rr0rr0", "0rrrrr0", ".0rrr0.", "..0r0..", "...0..."] }
```

`examples/slime.ts` mostra uma animação completa feita só com esses comandos.

### Conversa e edição

- A conversa fica no servidor (em memória), então a IA lembra do que fez. **Nova conversa** limpa esse histórico.
- O navegador é a fonte da verdade do projeto. Você pode editar à mão entre mensagens, e a IA recebe o estado atualizado a cada pedido.
- Cada rodada da IA pode ser desfeita com um único **Ctrl+Z**.

### Atalhos

`B` lápis · `E` borracha · `G` balde · `I` conta-gotas · `Espaço` play/pause · `←/→` frames · `Ctrl+Z` / `Ctrl+Shift+Z`

## Configuração (`.env`)

| Variável | Padrão | |
|---|---|---|
| `ANTHROPIC_API_KEY` | (nenhum) | obrigatória para a IA |
| `ANIMA_MODEL` | `claude-opus-5-5` | modelo usado |
| `ANIMA_EFFORT` | `high` | `low`, `medium`, `high`, `xhigh` ou `max`. Mais alto = arte mais cuidadosa, porém mais lento e mais caro |
| `PORT` | `5173` | porta do servidor |

O loop usa o fallback automático do servidor (`fallbacks: "default"`): se o modelo principal recusar um pedido, outro modelo continua a resposta na mesma chamada.
