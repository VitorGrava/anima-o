# Dragão sobre o tesouro (512x512, estático, 2 versões)

`dragao.png`: dragão vermelho-dourado deitado sobre a montanha de ouro num salão de anão.
`dragao_dourado.png`: o mesmo dragão, coberto de ouro derretido, saindo de um rio de ouro incandescente.
Dragão original, só inspirado no arquétipo "grande dragão sobre o tesouro". Nenhum design de filme ou jogo foi copiado.

Para gerar: `node examples/dragao/gen.mjs [normal|dourado|ambos]`. O script recria os `.anima.json` e exporta os PNGs em escala 2.

## Como é feito
- Fundo, colunas, portal, pilhas de ouro, moedas, joias, taças, rio de ouro, cascatas e brilhos usam `draw_shapes` (gradient, polygon, ellipse, rect, terrain, scatter) e `transform` (haze por plano, outline seletivo, reflect no ouro líquido).
- Dragão: geometria própria no script, com tubos de esferas ao longo de splines (pescoço, tronco e cauda formam um tubo só), elipsoides (ombro, coxa) e polígonos (membrana, espinhos, garras). Cada parte tem profundidade z e normal. Cada pixel recebe a rampa do seu material. As escamas seguem as coordenadas u/v do tubo e as placas da barriga ficam do lado ventral. Onde uma parte da frente encosta numa de trás, sai uma linha escura. O resultado vai para a engine por `draw_rows`, que depois aplica `outline seletivo` e `clean`.
- Versão dourada: a geometria é a mesma, com a paleta trocada por ouro e uma luz de "metal" (normal para baixo reflete o rio claro, normal para cima reflete o teto escuro). Tem filetes que escorrem pela pele, gotas nos pontos mais baixos, faixa incandescente onde o corpo entra no ouro, reflexo, vapor e fumaça feitos com ruído e dither.

## Referências estudadas (só localmente, nada copiado nem redistribuído)
- pixie.haus, "Dragon perched on gold hoard": pose e asas como moldura. https://pixie.haus/pixelart/146844/dragon-perched-on-gold-hoard-fantasy
- Redshrike e colaboradores, "RPG Enemies: 11 Dragons" (OpenGameArt): rampas vermelho-roxo, espinhos e chifres. https://opengameart.org/content/rpg-enemies-9-dragons
- Master484, "Dragon 1 (M484)" (OpenGameArt): cabeça, olho e dentes. https://opengameart.org/content/dragon-1-m484
- Ninjikin, "Treasure+" (itch.io): montanha de moedas e joias. https://ninjikin.itch.io/treasure
- "gold treasure icons" (OpenGameArt): moeda com aro escuro e brilho. https://opengameart.org/content/gold-treasure-icons
- Captainskolot, "4 Fiery Dungeon Backgrounds" (itch.io): caverna de lava e luz de baixo. https://captainskolot.itch.io/4-fiery-dungeon-backgrounds-pixel-art-lava-cave-magma-chambers-and-infernal-dep
- "molten metal texture" (OpenGameArt): cores do metal derretido. https://opengameart.org/content/molten-metal-texture

## 5 características seguidas
Arte 1 (normal):
1. Pose: corpo pesado deitado e afundado no ouro, pescoço em S erguendo a cabeça acima do corpo, asas meio abertas formando a moldura por trás. Cauda dá a volta pela frente.
2. Cabeça longa em cunha, com cerca de 1/6 do comprimento, sobrancelha saliente sobre o olho, chifres varrendo para trás e espinhos na bochecha.
3. Rampas com mudança de matiz: vermelho com sombra roxa e luz laranja, barriga ocre-creme, chifres marfim, ouro com sombra marrom-avermelhada e luz amarelo-creme.
4. Contorno seletivo no tom escuro de cada material, nunca preto. Moedas com aro escuro e brilho de 1 px.
5. Acento: olho amarelo com pupila em fenda, garganta em brasa e o raio de luz da janela acendendo a cabeça.

Arte 2 (dourada):
1. Mesma silhueta e mesma pose. A parte de baixo some sob a superfície do ouro derretido.
2. Luz forte de baixo: as faces viradas para baixo ficam quase brancas e o dorso fica bronze escuro, como metal.
3. Ouro líquido em filetes que engrossam e terminam em gota, com pingos concentrados no queixo, nas pontas das asas e na barriga.
4. Rio com núcleo amarelo-branco, bordas laranja e veias de crosta escura, mais reflexo do dragão, respingos e vapor aceso.
5. Acento: olho vermelho-laranja contra o ouro, e cascatas de ouro saindo da parede da forja.
