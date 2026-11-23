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

## Rodada 3: 05 slime pulando, 06 moeda girando

| anim | nota | o que ficou bom | o que ficou ruim |
|---|---|---|---|
| 05 slime | 8,5/10 | squash na antecipação e no impacto, stretch no lançamento e na queda, volume mantido (144–160 px), apogeu e impacto segurados, sombra no chão que encolhe no ar, rosto fofo | antecipação e impacto quase idênticos (mesma forma achatada); corpo mais "cápsula" que "gota" |
| 06 moeda | 9/10 | 12 frames com largura seguindo \|cos\|, emblema de cruz na frente e losango no verso (dá para ver que vira), perfil fino de lado, faces seguradas | cor `h` (ouro-sombra) sem uso; um pixel solto no emblema |

**Atritos → correção**
- O erro de campo aninhado dizia só "expected string, received undefined" (o agente usou `color` no lugar de `hex`) → chave desconhecida em **qualquer nível** vira erro com o caminho e a sugestão (`colors[0]."color" não existe (quis dizer "hex"?)`); campo ausente diz "falta este campo obrigatório", em português.
- `tools <nome>` não mostrava os campos dos itens de lista → agora expande objetos aninhados com `*` nos obrigatórios.
- `--help` em qualquer subcomando; `run -q`; folha de frames omitida quando grande; `check`/`view`/`reference` dentro do `run` imprimem o relatório inteiro.
- `check` cobrava volume e movimento numa moeda girando → `tipo: "rotacao"`.
- Os dois agentes escreveram um gerador próprio de elipse com contorno e luz → nova forma **`blob`** em `draw_shapes` (superelipse, contorno escuro, luz de cima-esquerda, sombra, brilho; `squareness` 2 = elipse, 3–4 = slime).
- Guia: notas de como cada ferramenta vira comando na CLI; texto de exportação unificado entre MCP e CLI.

## Os 12 princípios (artigo da Alura, pedido do usuário)
Fonte: https://www.alura.com.br/artigos/12-principios-animacao (definições conceituais e um exemplo animado por princípio, sem números práticos).
- `server/prompt.ts`: seção com os 12, cada um ligado ao que fazer na engine; passo 2b do checklist de entrega.
- `reference principios`: definição do artigo + "Na engine:" + qual regra do `check` verifica.
- `check` imprime o **painel dos 12** (✓ / ! / –), calculado do movimento real: squash (forma deforma com volume constante), antecipação (passo oposto antes do maior), staging (tamanho e contraste), pose a pose (poses seguradas), sobreposição (camadas com picos em frames diferentes), ease, arcos, ação secundária (camadas que se movem), timing, exagero (amplitude), desenho sólido (herda as regras de estilo) e apelo (avaliação humana, com a pergunta certa).
- `tests/style.test.ts`: o prompt cita os 12; `reference principios` traz os 12 e a fonte; cada medição do painel tem um caso que passa e um que falha.

## Rodada 4: 07 cavaleiro idle, 08 caminhada (já com os 12 princípios no guia e no painel do check)

| anim | nota | o que ficou bom | o que ficou ruim |
|---|---|---|---|
| 07 cavaleiro | 7,5/10 | elmo com pluma, tabardo, cinto, botas; respiração com a cabeça descendo 2 px e o torso 1 px; pluma que atrasa; piscada; tempos de 110 a 700 ms | só 4 frames; a cabeça sobe mal (abria uma fresta no pescoço), então o movimento é só para baixo |
| 08 caminhada | 7,5/10 | 5 camadas (braço e perna de trás mais escuros, tronco com mochila, bandana que balança), 8 poses (contato, abaixo, passagem, acima + espelho), braços contra as pernas | furo de 1 px entre os pés nos frames 3 e 7; um serrilhado; sem balanço claro do corpo para cima e para baixo |

O painel dos 12 da caminhada deu 11 ✓ (apelo é sempre "–", avaliação humana).

**Atritos → correção**
- `check` dava "volume mudou 22%" numa caminhada (pernas abrem e fecham) → figura articulada (3+ camadas se movendo) tolera 38% de variação de área, e o painel marca squash como "–" quando não há deformação.
- O "pose a pose" exigia segurar 1,8× → 1,3× (contato de 120 ms contra 90 ms já é uma pose segurada).
- "Emenda do loop: 204 px" não dizia se era problema → agora compara com a diferença média entre frames seguidos e só avisa se for 1,6× maior.
- Ninguém conferia o comprimento dos segmentos → `segmento_muda`: camada com a mesma massa e comprimento muito diferente entre frames.
- A fresta que abre entre camadas (cabeça sobe e deixa um vão no pescoço) não era vista → `figura_partida`, que inclui camadas estáticas pequenas (o tronco parado).
- Contar colunas é a maior fonte de erro ao desenhar por texto → `draw_rows`/`draw_frames` avisam "linha N tem X, a maioria tem Y".
- `reference proporcoes` dava um braço de 13 px que não cabe → agora dá os comprimentos para articular (coxa, canela + pé, braço, antebraço) calculados das medidas do estilo.
- `update_layer` pedia `rename` e `add_layer` pede `name` → `name` vale nos dois.
- `check` mostrava a "base" só das camadas que se movem e parecia que o personagem flutuava → imprime também a caixa de tudo.
- Exagero: num idle o movimento sutil é de propósito → "–" quando o passo é menor que 2 px.
- `new` ganha `--camada <nome>` e imprime a dica de `--vazio`; `show --region` sem o cabeçalho; `run -q` sem o resumo; `tools export` com as flags descritas.

## Rodada 5: 09 golpe de espada, 10 cachorro andando

| anim | nota | o que ficou bom | o que ficou ruim |
|---|---|---|---|
| 09 golpe de espada | 7,5/10 | 8 frames: pose parada, espada erguida, antecipação agachada, golpe com rastro (smear), impacto segurado, follow-through baixo e volta; membros com comprimento constante (IK de 2 ossos do próprio agente); tempos de 40 a 220 ms | rosto sem olho (um bloco de pele); banding no sombreamento; a lâmina quase se solta do corpo no impacto; espada encosta no topo do quadro |
| 10 cachorro andando | 6/10 | marcha de 4 tempos com as patas defasadas, corpo que desce 1 px nos contatos, rabo e orelha que se mexem, patas de longe mais escuras | cabeça parece de gato/leão, patas curtas e escuras (viram "blocos"), espinha reta (salsicha), olho de 1 px que não lê, sem zigue-zague do jarrete |

**Atritos → correção**
- `set_frame_timing` só aceitava um número → aceita lista, uma duração por frame (`frames:"all", duration_ms:[120,90,...]`), com erro claro se o tamanho não bate.
- `anima run ... | head` derrubava o Node com EPIPE e **deixava os tempos sem aplicar** (perda de trabalho) → `run` salva antes de imprimir e ignora EPIPE; teste de regressão com `| head`.
- O painel marcava ease e arcos como "–" num ciclo no lugar, onde o corpo mal anda mas as pernas fazem arcos → quando o centro quase não se move, mede a camada que mais se move.
- "✓ Follow Through" era otimista → a nota diz que só mede a defasagem entre camadas e pede para conferir se rabo/cabelo/capa atrasam em relação ao corpo.
- `reference quadrupede` não tinha medidas → calcula corpo, cabeça, cauda, segmentos das patas, passada e elevação do pé a partir da altura; descreve a marcha no lugar.
- Serrilhado/banding repetiam uma linha por frame → agrupados numa linha só com a lista de frames; gramática de "figura partida".
- `new` cria "Base" mesmo com `--vazio` → documentado no CLAUDE.md/AGENTS.md (`--camada <nome>`).

**Não resolvido, de propósito:** o `check` não vê "lâmina cobrindo o rosto" nem "pé que escorrega". São específicos de cena e o prompt já manda conferir à mão (view check="silhueta", região + grade). Faltaria um comando de pose por ossos (IK) para ciclos: os dois agentes escreveram o próprio; fica como próxima melhoria.

## Anatomia humana (pedido do usuário: "esse programa tem um erro muito ruim em anatomia humana")

**Diagnóstico (visto nas animações 07, 08 e 09):** braço da frente da caminhada era um toco de ~4 px sem ombro, cotovelo nem mão; no golpe de espada a mão que segura a espada **não tinha braço ligado** (o punho flutuava no peito ou no rosto) e o outro braço era uma vara reta; cabeça sem pescoço (e sem olho no guerreiro); tronco como bloco rígido; pernas como tubos sem joelho; pé como mancha escura; comprimento dos membros variando de um frame para outro.

**Causa:** a IA desenha cada frame do zero, pixel a pixel, sem esqueleto por baixo. A engine só tinha texto de referência e conferências depois do fato. Nada impedia um braço de ficar desconectado. Os dois agentes que mais lidaram com humanos reinventaram sozinhos um gerador de ossos (IK).

**Solução:** pôr a anatomia dentro da engine, por construção.
- `src/engine/rig.ts`: esqueleto humanoide. A IA escolhe ÂNGULOS de articulação; ossos com comprimento constante (as mesmas proporções do `reference proporcoes`), limites anatômicos aplicados e avisados (cotovelo só dobra para a frente, joelho só para trás), pescoço, mão presa à arma, pé mais baixo no chão, membros como cápsulas com luz.
- Comando `draw_figure`: presets (parado, caminhada_*), `cycle: "caminhada"` (8 frames prontos), `tween` (interpola entre poses-chave com ease in/out: pose a pose, slow in/out e arcos de graça), `facing`, `style` (realista / estilizado / chibi), materiais por cor (a engine cria contorno, sombra e luz), `light`.
- Prompt: passo 0a manda usar `draw_figure` para humanos e lista os erros que o esqueleto evita; `reference articulacoes` e CLAUDE.md/AGENTS.md apontam para ele.
- `tests/anatomy.test.ts` (16 testes): comprimento dos ossos constante nos 8 frames e em poses extremas; proporções por estilo; limites anatômicos; sola no chão em todos os frames; pulo; ciclo sem frestas nem pixel solto; arma presa à mão em 4 ângulos; pescoço; tween com ease; `facing: left`; o prompt orienta o uso.

## Verificação da anatomia com agentes novos (08 caminhada v2, 09 golpe de espada v2)

Dois agentes novos, só com o pedido e o guia, usaram `draw_figure` por conta própria:
- **09 v2 (golpe):** anatomia correta em todos os frames (ombro → cotovelo → mão, espada saindo da mão, pescoço, pé no chão), 8 frames com poses-chave e `tween`. Painel dos 12: 1 a 10 ✓. Atritos: o exemplo de ângulo da arma na descrição estava ERRADO (170° pendura a espada; 180° é para baixo) e confundiu o agente; faltavam presets de golpe e rastro (smear); 27 cores.
- **08 v2 (caminhada):** ciclo correto por `cycle: "caminhada"`; o agente acrescentou chapéu e mochila por script e a mochila ficou deslocada (não havia âncora do tronco); 35 cores; cabelo "cortina"; braços pouco visíveis; avisos falsos de antecipação e emenda do loop num ciclo no lugar.

**Correções**
- Documentação do `weapon.angle` corrigida (0° cima, 90° frente horizontal, 180° baixo, negativo = trás; −60° = armada atrás da cabeça) e presets `golpe_armar`, `golpe_impacto`, `golpe_seguir`; `weapon.trail` desenha o rastro da lâmina.
- `accessories` (chapéu, mochila, capa) ancorados no corpo e que seguem a inclinação do tronco e da cabeça; `hair` curto/longo/careca; `amplitude` exagera o balanço (princípio 10).
- Paleta: o `draw_figure` só cria as cores usadas (sem metal/ouro se não há arma), reaproveita cores quase iguais e usa um contorno compartilhado por padrão: a caminhada de 8 frames com chapéu e mochila saiu com **19 cores em vez de 35**. `outline: "por-material"` e `tons: 5` dão paletas mais ricas quando o estilo pede.
- **O número de cores é decisão de estilo, não regra** (pedido do usuário): o `check` não cobra mais "4–16 cores"; só avisa se o estilo pedido tiver limite (`max_cores`, CLI `--max-cores`). O prompt diz que o retrô usa 4–16 e o detalhado, dezenas. O portão do bench não limita mais a paleta.
- Falsos positivos em caminhada no lugar: antecipação "não se aplica" e emenda do loop só acusa salto maior em figura articulada.
- Erros: o primeiro problema de validação vem na primeira linha; `frames` em formato errado lista os formatos aceitos; `draw_shapes pixels` aceita `{x, y}`.
- CLI: `anima guide` agora é curto (o completo em `--completo`); `new` não traz mais as cores 0 e 1 por padrão (`--cores-padrao`); `show all --png` não despeja o texto.
- A saída antiga com 35 cores foi para `bench/out/_historico/` (fora do portão).

## Rig: esqueleto opcional e invisível que dita o movimento (ideia do usuário)

**Ideia:** animar por ossos; um esqueleto invisível dita o movimento e, se for bem feito, a animação por cima também será. **Decisão do usuário:** o rig só existe se for explícito.

**Como ficou (e por quê)**
- `project.rig` só existe depois de `rig_create`. Sem ele, o projeto não ganha nenhum campo, e `rig_pose`/`rig_bake`/`rig_part` dão erro claro.
- A **pose mora no frame** (`frame.pose`: ângulos por osso + raiz): copiar, mover, apagar e salvar frames leva a pose junto.
- A **arte de cada parte é desenhada uma vez, na pose de repouso, e guardada no rig** (não nos frames). O `rig_bake` sempre gira a partir dessa cópia limpa (4×4 subpixels com limiar de cobertura, o mesmo método que preserva contorno de 1 px; juntas arredondadas ao pixel; `snap_angle` opcional). Resultado: o bake é idempotente (pose A → B → A dá exatamente a primeira imagem) e não acumula erro.
- O bake escreve só em camadas marcadas `generated`; **retoque à mão fica em outra camada e sobrevive** a qualquer re-bake.
- Ossos genéricos (parent, at, length, mode absolute/relative, rest, sign, min, max): serve para humanoide (modelo pronto com 13 ossos e as proporções do `reference`, mais osso `espada`) e para esqueleto livre (`template: "vazio"` + `bones`).
- `rig_pose`: presets e ciclo de caminhada reaproveitados do `draw_figure`, `tween` com ease, `ground_lock`, limites anatômicos aplicados e avisados, erro para osso inexistente.
- `view bones=true` desenha o esqueleto por cima; `check` aponta parte presa a osso inexistente, ossos sem arte, frames sem pose e ângulo fora do limite.
- `draw_figure` continua existindo como o jeito rápido de ter um humano sem rig.
- `tests/rig.test.ts` (31 testes): opcional/explícito, comprimento dos ossos constante, juntas ligadas, limites, `facing: left`, pose no frame e salvar/abrir, `rig_part` (validações, cápsula, atualizar só z, remover), bake exato a 0° e a 90°, idempotência, massa preservada ao girar, espelho, `snap_angle`, retoque sobrevivendo, contorno opcional, ciclo sem frestas nem pixel solto, ordem das camadas, tween com ease, espada presa ao antebraço, troca de uma parte por arte própria, `view bones`, `check` do rig.
- Exemplo: `examples/rig-robo/` (arte própria de braços e pernas de aço presa aos ossos do humanoide, ciclo de caminhada).

**Limites conhecidos:** só vista lateral; sem IK de pé travado nem deslocamento da raiz (o ciclo é no lugar); em sprites muito pequenos (16–24 px) girar arte serrilha (use `snap_angle`); o pivô é uma célula inteira; a arte de uma parte precisa ser desenhada na pose de repouso.

## Passo 3 — cachorro quadrúpede (rig_create quadrupede + rig_walk IK)
- Agente entregou 8 frames, 4 patas no chão, sem `pe_escorrega`. Atritos: raiz não centraliza (cabeça cortada em 48x32, sem aviso), chão com período 6 (não divide 8, emenda salta), nomes `frames`/`frame` e `durations` inconsistentes, patas "tubo", sombras avermelhadas, `check` acusa furo entre as patas com chão visível.
- Contorno (pedido do usuário): halo único escuro de 1 px deixava pernas fundidas e pé em bloco preto. Pesquisa (Lospec outlines 1 e 2, Pixel Parmesan, Humbird0, pixel-perfect): contorno colorido pelo material, sel-out, claro no lado da luz, linhas internas com a cor da parte mais próxima ou omitidas, limpar quinas em L.
- Feito: `rig_bake outline "auto"` (sel-out + lado da luz). Falta: linhas internas entre partes sobrepostas, limpeza de L, aviso de silhueta cortada, centralizar raiz.

## Acabamento (abelha 32x32) — ferramenta para pixel art mais bonita
- Pedido do usuário: "faltou cor e ficou muito quadrado" (abelha). Causas: desenhar tudo à mão contando colunas dá caixa; paleta sem variedade de matiz; sombreamento fica a cargo do agente.
- Novo: `transform op shade` (3 tons automáticos, `skip` = cores de detalhe), `outline mode seletivo` (sel-out em qualquer camada), `clean` (quinas em L), `check cantos_quadrados`, `reference circulos` (moldes por diâmetro), guia "ACABAMENTO" no prompt. Exemplo: `examples/acabamento/` (chapado → acabado).
- Limites: `shade` só pinta rebordos de 1–3 px (não cria volume interno nem luz de 2 fontes); `clean` só remove quinas de ponta com lados vazios.
