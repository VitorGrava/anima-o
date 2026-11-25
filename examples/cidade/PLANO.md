# "A cidade que divide ou unifica?" em pixel art

Refazer em PIXEL ART o vídeo vertical de 60 s (ilustração plana, narração em português) mantendo cenas, tempos,
enquadramentos e movimentos de câmera. Os quadros do original (2 por segundo, 270x480) estão em
`/tmp/claude-0/-home-user-anima-o/99abadf4-1863-5491-8eb0-dc306b8f0158/scratchpad/cidade/f_001.png` … `f_120.png`
(f_N mostra o instante t ≈ (N-1)/2 s). OLHE os quadros da sua cena antes de desenhar.

## Formato comum
- Canvas **180x320**, **12 quadros/s** (o vídeo final é ampliado 6x → 1080x1920). Biblioteca: `examples/cidade/lib/comum.mjs`
  (`W`, `H`, `FPS`, `pessoa()` = pessoinhas de perfil caminhando em 3 tamanhos, `PESSOA_PALETA`, `BLUSAS`, `gerar()` que roda
  os comandos e exporta cada quadro em PNG). Não altere a biblioteca; estenda no gen da sua cena.
- Cada cena: pasta `examples/cidade/cenas/<id>/` com `gen.mjs` (gera tudo por script) e a saída de `gerar()`:
  `quadros/f_0000.png …` com EXATAMENTE `round(duração × 12)` quadros, e `<id>.gif` de prévia.
- Sem legendas da narração (eu sobreponho depois, numa faixa entre y≈240 e y≈275: deixe essa faixa sem
  detalhe importante). Títulos e placas que aparecem DENTRO da cena original (A CIDADE QUE / DIVIDE OU UNIFICA?, SHOPPING,
  JOIAS, LIQUIDAÇÃO ATÉ 70% OFF, ESPAÇO-LIXO, CONTROLE DE ACESSO, PROPRIEDADE PRIVADA, VIVA O PROGRESSO, SEGREGAÇÃO &
  ESPAÇO PÚBLICO etc.) você desenha com `draw_shapes type:"texto"` (fonte de pixel 3x5 com acentos; `escala` 2–3 para títulos).
- Movimento de câmera (pan, zoom, tilt): desenhe o cenário MAIOR que o canvas numa camada e mova com `transform` (offset) quadro
  a quadro, ou redesenhe por quadro no script. Zoom: troque de enquadramento por cortes curtos ou desenhe 2–3 escalas;
  NÃO amplie pixels (nada de pixel gordo misturado com pixel fino).
- Estilo: pixel art limpa e plana como o original (cores chapadas com 2–3 tons por material, sem contorno preto, contorno
  seletivo onde ajudar), luz quente nas cenas de praça/rua, fria e cinza no shopping, noite azul-escura no fim.
  Pessoas pequenas e muitas (vida na cidade), com cores variadas de blusa e de pele.
- Regras do projeto: pesquise referências de pixel art (cidade/praça/shopping/multidão em pixel art vertical, ex.: itch.io,
  OpenGameArt, eBoy, Kirokaze, Octavi Navarro) e liste 5 características antes de desenhar; faça rodadas olhando PNGs
  (`node bin/anima.mjs show … --png`), compare com o quadro original, descarte o que piorar. Não faça commit.

## Cenas (início–fim em s, duração → nº de quadros a 12/s)
| id | tempo | quadros | o que acontece no original |
|---|---|---|---|
| 01_praca | 0–6 | 72 | Praça ao entardecer (céu pêssego): coreto branco com telhado vermelho, igreja com torre e cruz, árvores, postes, calçada de pedras ondulada, canteiros de flores; muita gente caminhando, bancas. Título no alto "A CIDADE QUE / DIVIDE OU UNIFICA?" (UNIFICA? em amarelo) que some ~3 s. Câmera faz pan lento para a direita revelando, no fim, um prédio de vidro azul "SHOPPING" e um carrinho de pipoca. |
| 02_shopping | 6–14,6 | 103 | Fachada do shopping à noite/azul: letreiro "SHOPPING", portas de vidro, dentro claro com vitrines e escada rolante, segurança à direita, placa "ABERTO 10h–22h". Homem de camiseta amarela entra pela esquerda e atravessa a porta; a câmera avança (zoom) para dentro: átrio claro, depois andares com lojas coloridas (BELEZA, JOIAS, LIVROS, MODA, CALÇADOS) e escadas rolantes diagonais com gente subindo; a câmera sobe (tilt) pelos andares. |
| 03_corredor | 14,6–21,5 | 83 | Corredor do shopping em perspectiva frontal, piso claro brilhante: lojas TECH (telas azuis), CAFÉ (balcão, gente sentada, placa CAPINHAS num quiosque), JOIAS (vitrine escura com spots), MODA, PERFUMES, ÓCULOS, CALÇADOS; pan para a direita, pessoas andando com sacolas. Aos ~18 s escurece levemente e aparece o título "ESPAÇO-LIXO" (grande) com "JUNKSPACE — REM KOOLHAAS" pequeno embaixo. |
| 04_lounge | 21,5–27 | 66 | Área de descanso: parede de ripas de madeira, sofá azul-cinza com 2 pessoas no celular, planta, teto com spots. Pan para a direita: painel vermelho "LIQUIDAÇÃO / ATÉ 70% OFF", visor "21°C", câmera de segurança no teto; no fim, zoom rápido na câmera (lente preta, luz vermelha piscando). |
| 05_cctv | 27–32,2 | 62 | Vista da câmera de segurança: piso cinza visto de cima em perspectiva, pessoas pequeninas andando, faixa colorida de lojas no fundo e placa verde "SAÍDA", HUD de câmera ("CAM 07 · PISO 1" e relógio 14:32:10 contando), depois aparecem linhas amarelas no chão e grades/corrimãos guiando trajetos longos. |
| 06_monitores | 32,2–35,3 | 37 | Sala escura: parede de monitores com as imagens das câmeras (pessoas andando), vigia de costas (silhueta, cabeça) em primeiro plano à esquerda; um retângulo vermelho de rastreio segue uma pessoa num monitor; leve zoom. |
| 07_catraca | 35,3–38,6 | 40 | Fundo azul-escuro, faixa "CONTROLE DE ACESSO", catraca branca com visor. Mulher com sacola vermelha de compras passa: luz verde ✓. Depois um homem de camiseta vermelha sem sacola: luz vermelha ✕; o segurança de uniforme estende o braço barrando. |
| 08_praca_grade | 38,6–42,5 | 47 | A mesma praça da cena 01 (reuse o cenário), agora mais apagada/dessaturada: uma grade preta de ferro sobe/surge na frente e uma placa vermelha "PROPRIEDADE PRIVADA / ACESSO SOMENTE A CLIENTES" aparece; pessoas ficam do lado de fora. |
| 09_torre | 42,5–46,8 | 52 | Torre de vidro espelhado azul enorme atrás de um muro cinza com portão de grade e câmera; pessoas passam na calçada; a câmera sobe (tilt) mostrando a torre que se afina para o alto, céu cinza nublado. |
| 10_feira | 46,8–49,6 | 34 | Rua viva: sobrados coloridos (azul, laranja, rosa) com varandas e bandeirinhas, lojas MERCADINHO, SAPATARIA, LIVROS, PASTEL, PADARIA, toldos listrados, barraca de frutas, gente caminhando, carrinho; céu quente. |
| 11_progresso | 49,6–52,5 | 35 | Mesma rua da cena 10 vista de mais longe, e por trás dela, dominando, a torre de vidro com muro e um outdoor "VIVA O PROGRESSO / Residencial Horizonte" e placa "PROPRIEDADE PRIVADA". |
| 12_final | 52,5–60 | 90 | Noite azul-escura com estrelas, skyline de prédios com janelas, luzes da cidade embaixo; mulher negra de cabelo crespo preso e blusa amarela de costas olhando a cidade; ~55,5 s ela se vira de frente (rosto calmo); ~57 s aparece o título "SEGREGAÇÃO" e depois "& ESPAÇO PÚBLICO" (amarelo). |
