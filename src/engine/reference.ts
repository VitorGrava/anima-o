/**
 * Referências de anatomia e de pixel art, consultáveis pela IA sob demanda
 * (comando `reference`). As proporções são calculadas em pixels para o
 * tamanho do sprite, para a IA não precisar converter de cabeça.
 */
import { normalizeHex } from "./project.ts";

export const REFERENCE_TOPICS = [
  "principios",
  "proporcoes",
  "articulacoes",
  "rosto_mao",
  "quadrupede",
  "caminhada",
  "corrida",
  "pose",
  "linhas_curvas",
  "sombreamento",
  "paletas",
  "rampa",
  "tamanhos",
  "estudo",
  "circulos",
  "cenario",
] as const;
export type ReferenceTopic = (typeof REFERENCE_TOPICS)[number];

export interface ReferenceOptions {
  /** proporcoes: altura total do sprite em pixels. */
  height?: number;
  /** proporcoes: estilo (cabeças de altura). */
  style?: "realista" | "estilizado" | "chibi";
  /** rampa: cor base em hex. */
  base_color?: string;
  /** rampa: número de tons (3–7). */
  steps?: number;
}

// ---------- proporções ----------

interface Preset {
  heads: number;
  label: string;
  /** Pontos de referência, em "cabeças" a partir do topo da cabeça. */
  marks: [string, number][];
  shoulderWidth: number; // em cabeças
  note: string;
}

const PRESETS: Record<NonNullable<ReferenceOptions["style"]>, Preset> = {
  realista: {
    heads: 7.5,
    label: "realista / heroico (7,5 a 8 cabeças)",
    marks: [
      ["queixo", 1],
      ["ombros (linha)", 1.35],
      ["peito / mamilos", 2],
      ["cotovelo e cintura", 3],
      ["virilha (metade da altura)", 3.75],
      ["ponta dos dedos (meio da coxa)", 4.75],
      ["joelho", 5.5],
      ["tornozelo", 7.2],
      ["chão", 7.5],
    ],
    shoulderWidth: 2,
    note: "Homem: ombros ≈ 2 cabeças de largura; mulher ≈ 1,5–1,75, quadril de largura parecida com o ombro.",
  },
  estilizado: {
    heads: 4,
    label: "estilizado de jogo (4 cabeças; o mais comum em sprites de 32–48 px)",
    marks: [
      ["queixo", 1],
      ["ombros (linha)", 1.2],
      ["peito", 1.55],
      ["cotovelo e cintura", 2],
      ["virilha", 2.2],
      ["ponta dos dedos", 2.6],
      ["joelho", 3.1],
      ["tornozelo", 3.8],
      ["chão", 4],
    ],
    shoulderWidth: 1.5,
    note: "Pernas ≈ 45–50% da altura; cabeça grande lê melhor o rosto e a emoção em poucos pixels.",
  },
  chibi: {
    heads: 2.5,
    label: "chibi / mascote (2 a 3 cabeças)",
    marks: [
      ["queixo", 1],
      ["ombros (linha)", 1.1],
      ["cintura", 1.55],
      ["virilha", 1.7],
      ["joelho", 2.1],
      ["chão", 2.5],
    ],
    shoulderWidth: 1.1,
    note: "Cabeça ≈ 40% da altura, membros curtos e grossos. Ótimo para sprites de 16–24 px.",
  },
};

export type BodyStyle = NonNullable<ReferenceOptions["style"]>;

/** Segmentos do corpo em pixels para uma altura total e um estilo (as mesmas medidas do reference proporcoes). */
export function bodyProportions(height: number, style: BodyStyle) {
  const pr = PRESETS[style];
  const unit = height / pr.heads;                       // altura de uma cabeça
  const mk = (name: string): number | undefined => pr.marks.find(([n]) => n.startsWith(name))?.[1];
  const floor = mk("chão") ?? pr.heads;
  const shoulder = mk("ombros") ?? 1.2;
  const crotch = mk("virilha") ?? floor * 0.5;
  const hip = crotch - 0.12;                              // a articulação do quadril fica um pouco acima da virilha
  const knee = mk("joelho") ?? (hip + floor) / 2;
  const ankle = mk("tornozelo") ?? floor - 0.12;
  const elbow = mk("cotovelo") ?? mk("cintura") ?? (shoulder + crotch) / 2;
  const finger = mk("ponta dos dedos") ?? crotch + 0.2;
  const px = (h: number) => h * unit;
  return {
    head: unit,                                           // altura da cabeça
    neck: px(0.16),
    torso: px(hip - shoulder),                            // ombro → quadril
    thigh: px(knee - hip),
    shin: px(ankle - knee),
    footH: Math.max(1.6, px(floor - ankle)),
    footL: px(0.62),
    upperArm: px(elbow - shoulder),
    foreArm: px((finger - elbow) * 0.78),
    handR: Math.max(0.9, px(0.12)),
  };
}

function proportions(height: number, style: NonNullable<ReferenceOptions["style"]>): string {
  const pr = PRESETS[style];
  const head = height / pr.heads;
  const px = (heads: number) => Math.round(heads * head);
  const mark = (name: string) => pr.marks.find(([n]) => n.startsWith(name))?.[1] ?? 0;
  const seg = (from: string, to: string) => Math.max(1, Math.round((mark(to) - mark(from)) * head));
  const lines = [
    `Proporções — ${pr.label} para um sprite de ${height} px de altura.`,
    `Cabeça ≈ ${head.toFixed(1)} px de altura (largura ≈ ${(head * 0.85).toFixed(1)} px).`,
    "",
    "Linhas de referência (distância do topo da cabeça, em pixels):",
    ...pr.marks.map(([n, h]) => `  y ≈ ${String(px(h)).padStart(3)}  ${n}`),
    "",
    `Largura dos ombros ≈ ${px(pr.shoulderWidth)} px. ${pr.note}`,
    "",
    "Espessuras e tamanhos sugeridos para esta altura:",
    `  braço: ${Math.max(1, Math.round(height / 14))} px de largura · perna (coxa): ${Math.max(2, Math.round(height / 10))} px · pescoço: 1–${Math.max(1, Math.round(head / 4))} px (ou nenhum em estilos de cabeça grande)`,
    `  mão: ${Math.max(1, Math.round(head * 0.3))}×${Math.max(1, Math.round(head * 0.3))} px (≈ 3/4 do tamanho do rosto em estilo realista) · pé: ${Math.max(2, Math.round(head * 0.6))} px de comprimento × ${Math.max(1, Math.round(head * 0.25))} px de altura`,
    `  comprimento do braço (ombro → ponta dos dedos) ≈ ${seg("ombros (linha)", "ponta dos dedos")} px; a ponta dos dedos termina na altura da metade da coxa`,
    "",
    "Segmentos para articular (cada um numa camada, com o pivô no topo; o comprimento NÃO muda durante a animação):",
    `  coxa ≈ ${seg("virilha", "joelho")} px · canela + pé ≈ ${seg("joelho", "chão")} px · braço (parte de cima) ≈ ${seg("ombros (linha)", "cotovelo e cintura")} px · antebraço + mão ≈ ${seg("cotovelo e cintura", "ponta dos dedos")} px`,
    `  Altura do quadril em pé ≈ ${seg("virilha", "chão")} px do chão; no passo, a perna esticada sobe ou desce o quadril 1–2 px.`,
    "",
    "Dicas: meça a silhueta com `check` (ele mostra altura e largura por camada) e compare com esta tabela. Se a cabeça for maior que o planejado, o personagem ganha cara de criança; se as pernas forem curtas, parece pesado.",
  ];
  return lines.join("\n");
}

// ---------- tópicos de texto ----------

const CENARIO = [
  "Receita de CENÁRIO / PAISAGEM (testada numa cena 320x180 que foi de 79 a 95 no avaliar tipo=cena). Tamanho: cenas inteiras funcionam bem entre 160 e 320 px de largura; 10–12 fps se animar.",
  "1. Camadas de trás para frente, uma por plano: ceu, estrelas, nuvens, montanhas3 (longe), montanhas2, montanhas1 (perto), lago, reflexo, floresta, campo, construções, detalhes, sombras, personagem, efeitos (fumaça, vaga-lumes), primeiro_plano, vinheta.",
  "2. Céu e água: NUNCA faixas retas. draw_shapes type=gradient com a rampa de cima para baixo e dither bayer4 (suavidade 0.6–0.75, ondas 2). Degradê com dither fraco (< 10%) vira poeira: a engine já arredonda isso.",
  "3. Sol e brilhos: gradient direction=radial; termine a rampa com a cor \".\" (transparente) para o brilho se DISSOLVER no céu em vez de recortar um disco. Reflexo do sol na água: o mesmo radial + scatter forma=onda nas cores do sol.",
  "4. Relevo: polygon com o contorno do terreno (deslocamento do ponto médio, rugosidade 0.55) + os cantos de baixo. Um polígono por plano; depois transform op=haze em cada plano com força crescente com a distância (longe 0.4, meio 0.2, perto 0.05) na cor do horizonte: é a perspectiva atmosférica, a coisa que mais dá profundidade.",
  "5. Reflexo na água: transform op=reflect (fonte = montanhas e floresta, y = margem, alto curto, onda 1–1.6, mistura 0.5): sólido e só o final dissolve; reflexo longo demais e pontilhado enche o lago de ruído.",
  "6. Textura: draw_shapes type=scatter (grama forma=tufo, flores/estrelas forma=cruz, água forma=onda, pedras forma=traco) com distancia >= 3 e seed diferente por plano; use evitar:[camadas] para não cair sobre construções e only:cor para ficar dentro de um plano. Planos grandes e lisos ('papel recortado') são o defeito nº 1: o avaliar acusa como areas_chapadas.",
  "7. Primeiro plano que ENQUADRA (árvore grande de silhueta, capim escuro) cria profundidade; vinheta leve (radial com \".\" no centro e cor escura na ponta, dither) concentra o olhar. Protagonista pequeno e legível, com sombra no chão (radial dissolvendo).",
  "8. Cor: poucos matizes por plano, sombras mais frias e luzes mais quentes; o céu dá a cor do ar para todo o resto (haze, reflexo e sombras puxam para ela). Feche com reduce_colors (ex.: 90–110 cores numa cena rica) e avaliar tipo=cena.",
  "8b. PERSPECTIVA CONSISTENTE: escolha UM horizonte (linha dos olhos, y) e UM ponto de fuga (x no horizonte). Tudo que recua (lateral de casa, caminho, cerca, margem do rio) converge para ele; casas e caixas: draw_shapes type=box3d (frente + lateral que recua + telhado de duas águas, com tábuas e telhas em perspectiva; a lateral que fica de frente para o sol recebe a luz e a frente fica na sombra). Casa desenhada de frente num caminho que converge é a incoerência mais notada. NÃO acrescente personagens ou objetos que o pedido não mencionou.",
  "9. Animar cenário: poucos loops independentes de períodos diferentes (fumaça sobe em ciclo de 8 frames, brilho da água com scatter variar_por_frame, estrelas em grupos de fases, vaga-lumes em órbita). Nada parado por mais de 1 s; o aviso de emenda do loop do check é falso positivo para elementos que recomeçam (fumaça).",
].join("\n");

const TEXT: Record<Exclude<ReferenceTopic, "proporcoes" | "rampa" | "paletas" | "circulos">, string> = {
  cenario: CENARIO,
  principios: `Os 12 princípios da animação (Disney: Frank Thomas, Ollie Johnston e John Lounsbery, anos 1930) e como aplicá-los nesta engine.
Definições a partir do artigo "Os 12 princípios da animação" (Alura): https://www.alura.com.br/artigos/12-principios-animacao
O comando check imprime um painel (✓ / ! / –) dos que dá para medir; os outros pedem o seu olho.

1. SQUASH AND STRETCH (comprimir e esticar): deformar temporariamente o objeto durante o movimento, dando peso e elasticidade (saltos, impactos).
   Na engine: mude a largura e a altura do blob/elipse mantendo o volume (largura × altura ≈ constante); amasse no contato, estique na velocidade. check: volume_pulou.
2. ANTICIPATION (antecipação): preparar o espectador para a ação seguinte; o personagem se prepara antes de agir (bolinha achatada antes do salto).
   Na engine: 1–2 frames de recuo/agachamento no sentido oposto antes da ação, com a pose segurada (set_frame_timing). check: antecipação no painel.
3. STAGING (encenação): disposição clara dos elementos para o público entender a ação; posição, enquadramento, composição e cor dirigem a atenção ao ponto focal.
   Na engine: fundo em camada separada, menos saturado e com menos contraste que o personagem; um ponto focal só; a pose deve ler só pela silhueta (view check="silhueta"). check: contraste_fraco e tamanho da figura.
4. STRAIGHT AHEAD ACTION AND POSE TO POSE (ação direta e pose a pose): direta = quadro a quadro em ordem (espontâneo, mas inconsistente); pose a pose = poses-chave primeiro e transições depois (mais controle de ritmo e qualidade, pode ficar rígido).
   Na engine: para ciclos e ações combinadas, use pose a pose: desenhe os extremos com draw_frames, confira com view frames="all", depois os intermediários. Use ação direta para fogo, fumaça e água (formas orgânicas imprevisíveis), variando a ponta e mantendo a base.
5. FOLLOW THROUGH AND OVERLAPPING ACTION (continuidade e sobreposição): partes continuam se movendo depois que o corpo para (cabelo, antena); partes diferentes se movem em tempos distintos (braços um pouco depois das pernas). Dão inércia, peso e massa.
   Na engine: cabelo, capa, cauda, braços e acessórios em camadas próprias, atrasados 1–2 frames em relação ao corpo. check: camadas com picos de movimento em frames diferentes.
6. SLOW IN AND SLOW OUT (aceleração e desaceleração): o movimento começa e termina gradualmente, em vez de ter velocidade constante.
   Na engine: mais frames perto das poses-chave e menos no meio (spacing), e frames seguros com set_frame_timing. check: sem_ease.
7. ARCS (movimento em arco): o movimento segue trajetórias curvas (braços, pernas, objetos), mais orgânico e fluido; deve ser intencional.
   Na engine: calcule as posições ao longo de uma curva (parábola num salto, arco do braço com transform rotate em torno da articulação). check: arco no painel (quando há deslocamento nos dois eixos).
8. SECONDARY ACTION (ação secundária): ações extras (gestos, expressões, partes que não fazem o movimento principal) dão vida e emoção (a sobrancelha que dobra junto com a bolinha).
   Na engine: piscar, respirar, olhos que seguem o objeto, faíscas, sombra que reage, em camadas separadas. check: mais de uma camada se movendo.
9. TIMING (temporização): duração e velocidade de cada movimento definem ritmo, fluidez, emoção e urgência; dominar o timing é fundamental.
   Na engine: 50–80 ms em ações rápidas, 80–120 em caminhada, 150–250 em respiração; nunca todos iguais. check: tempo_uniforme.
10. EXAGGERATION (exagero): amplificar movimentos, formas e características para dar estilo e atratividade, sem tornar irreal.
   Na engine: poses um pouco mais extremas que o real (em poucos pixels o sutil não lê), deformação e amplitude visíveis. check: amplitude no painel.
11. SOLID DRAWING (desenho volumétrico): desenhos sólidos e tridimensionais, com formas, volumes, proporções e perspectiva coerentes (peso e profundidade).
   Na engine: uma fonte de luz só, contorno escuro do próprio material, blocos grandes de luz e sombra (sem pillow shading, banding nem ruído); formas redondas com draw_shapes blob; medidas de anatomia com reference proporcoes. check: pillow_shading, contorno_claro, luz_inconsistente, ruido, banding.
12. APPEAL (apelo): a animação deve ser agradável de ver; designs cativantes, expressões, movimentos elegantes e personalidade (a bolinha de olhos grandes que extrapolam o corpo).
   Na engine: silhueta simpática, cabeça e olhos maiores (estilizado/chibi), 1 px de brilho no olho, paleta coesa. Avaliação humana: pergunte "eu me importaria com este personagem?".`,

  articulacoes: `Articulações e amplitude (para girar segmentos com transform rotate):
- Cada articulação tem um pivô fixo; o segmento gira em torno dele e o segmento seguinte acompanha. Comprimentos NÃO mudam durante a animação (coxa e canela sempre do mesmo tamanho).
- Ombro: braço vai de ~50° para trás a 180° para frente (e abre para o lado). Em caminhada, balança ±20–30°.
- Cotovelo: só dobra para a frente (antebraço vai em direção à frente do braço), de 0° até ~145°. Nunca dobra para trás.
- Quadril: perna vai ~20° para trás e até ~120° para frente. Em caminhada, passo de ±25–30°.
- Joelho: só dobra para trás (canela vai para trás da coxa), de 0° a ~135°. Nunca hiperestende para a frente.
- Tornozelo: pé sobe ~20° e desce ~45°; no apoio o pé fica plano, na impulsão o calcanhar sobe.
- Pescoço/cabeça: gira ~±70°, inclina ~45°; no movimento, a cabeça compensa o tronco para manter os olhos no alvo.
- Coluna/tronco: inclina e torce; ombros e quadril giram em sentidos opostos (contra-rotação) em caminhada e golpes.
- Centro de massa: fica sobre o pé de apoio (ou entre os dois pés). Pose com o corpo fora desse apoio sem justificar (inclinação, impulso) parece que vai cair.
- Para sprites pequenos, a articulação é a mudança de direção do contorno, não um detalhe: um joelho dobrado se lê por um "dente" na silhueta.
- NA ENGINE: draw_figure aplica estes limites sozinho (ajusta o ângulo e avisa) e mantém o comprimento dos ossos constante; use-o para figuras humanas em vez de desenhar os membros à mão. Convenção dos ângulos: 0° = pendurado, + = para a frente (ombro 90° = braço horizontal à frente; quadril 90° = coxa horizontal à frente; joelho/cotovelo = flexão).`,

  rosto_mao: `Rosto e mãos (anatomia traduzida para poucos pixels):
Rosto (realista, de frente): olhos na metade da altura da cabeça; a distância entre os olhos ≈ a largura de um olho; base do nariz na metade entre olhos e queixo; boca ≈ 1/3 do caminho entre o nariz e o queixo; topo das orelhas na altura das sobrancelhas, base na do nariz.
Estilizado/jovem: olhos mais baixos (abaixo da metade da cabeça) e maiores; quanto menor o nariz e a boca, mais "fofo".
Em pixels:
- Cabeça de 5–6 px (sprite de 16 px): olhos = 1 px cada, separados por 1 px; boca e nariz normalmente omitidos ou 1 px de tom mais escuro.
- Cabeça de 8–10 px (sprite de 32 px): olhos 1×2 px (ou 2×2 com brilho de 1 px), boca de 2–3 px, nariz só por uma sombra de 1 px.
- Olhar: o pixel escuro dentro do branco do olho indica a direção; 1 px de deslocamento já muda para onde o personagem olha.
- Piscar = 1 frame com os olhos reduzidos a uma linha de 1 px.
- Rosto de perfil: o olho fica perto da borda da frente; nariz e queixo definem a silhueta.
Mãos:
- Não desenhe dedos em sprites pequenos: a mão é um bloco (2×2 a 3×3 px) em tom de pele, mais escuro quando vem por trás do corpo.
- Mão aberta: bloco + 1 px de polegar separado; punho: bloco quadrado compacto; segurando objeto: o objeto sobrepõe a mão e 1 px de pele aparece nas pontas.
- Comprimento da mão ≈ 3/4 do rosto (realista); em estilo cartum, mão grande exagera ação.
- Mãos e pés pertencem às extremidades: são onde o follow-through aparece primeiro.`,

  quadrupede: `Quadrúpedes (cães, gatos, cavalos, criaturas):
- Estrutura: cabeça, pescoço, tronco (tórax + abdômen), 4 patas, cauda. O tórax é a parte mais forte e a pélvis (garupa) a que impulsiona.
- Pata dianteira: o "cotovelo" aponta para trás, perto da barriga. Pata traseira: o "jarrete" (o que parece um joelho para trás) forma um Z; o verdadeiro joelho fica escondido junto ao corpo.
- A espinha ondula levemente: no trote, a cabeça e a garupa sobem e descem em opostos.
- Proporções (variam por espécie): cavalo ≈ quadrado (comprimento do corpo ≈ altura da cernelha, pernas ≈ metade da altura); cão e gato ≈ corpo 1,2–1,5× a altura da cernelha, cabeça ≈ 1/3 do comprimento do corpo; cauda de gato ≈ comprimento do corpo.
- Andar (4 tempos): pata traseira esquerda → dianteira esquerda → traseira direita → dianteira direita; sempre 2–3 patas no chão. Ciclo de 8 frames (2 por apoio).
- Trote: patas em diagonal juntas (diant. esq. + tras. dir.), com um instante de suspensão. Galope: 2–3 tempos com fase de suspensão, coluna que arqueia e estica.
- Silhueta: cabeça, orelhas, cauda e o espaço entre as patas precisam se ler; deixe sempre um vazio entre as 4 patas.
- Sprite de 32 px: patas com 2 px de largura, 6–8 px de altura; cabeça 6–8 px.`,

  caminhada: `Ciclo de caminhada (vista lateral). Poses-chave:
1. CONTATO: pé da frente toca o chão (calcanhar), pé de trás ainda no chão na ponta; passo mais aberto; braços na extensão máxima (braço oposto à perna da frente vai à frente). Cabeça na altura média.
2. ABAIXO (recoil/down): peso desce sobre a perna da frente, que dobra; é o ponto MAIS BAIXO do corpo (−1 a −2 px). Perna de trás sai do chão.
3. PASSAGEM: perna de trás passa pela perna de apoio (que está reta); braços ao lado do corpo; corpo em altura média subindo. É a pose-chave mais difícil de ler: o pé que passa fica dobrado e levantado.
4. ACIMA (up): perna de apoio estica na ponta do pé, é o ponto MAIS ALTO (+1 px); a perna que passa estende à frente.
Depois repete espelhado (outro lado) = 8 frames para o ciclo completo (2 passos). Versão enxuta de 6 frames: contato, abaixo, passagem (×2 lados) — suprimindo o "acima".
- Braços sempre contra as pernas (braço direito com perna esquerda). Balanço dos braços é menor que o das pernas.
- A cabeça sobe e desce 1 px; o tronco inclina levemente para a frente; quadril e ombros contra-rotacionam.
- Os pés não podem escorregar: o pé de apoio recua a mesma distância que o corpo avança (se o fundo rola, ele rola na velocidade do apoio).
- Tempos: 80–120 ms por frame (≈ 9–12 fps); 8 frames ≈ 0,8 s por ciclo. Mais lento = personagem pesado/cansado; mais rápido = leve/apressado.
- Sprites de 16–24 px: 4 frames bastam (contato, passagem, contato espelhado, passagem espelhada) com o corpo subindo 1 px na passagem.`,

  corrida: `Ciclo de corrida (vista lateral):
- Diferença da caminhada: há uma fase de SUSPENSÃO com os dois pés fora do chão; o corpo inclina 10–20° para a frente; passadas maiores; braços dobrados ~90° batendo contra as pernas.
- Poses-chave: (1) CONTATO: pé da frente pousa sob o centro de massa, perna dobrada; (2) ABAIXO: corpo no ponto mais baixo, joelho da frente flexionado absorvendo; (3) IMPULSO: perna de trás estende e empurra o chão; (4) SUSPENSÃO: ambos no ar, corpo no ponto mais alto, perna de trás recolhida (calcanhar perto do glúteo), joelho da frente avança. Repete espelhado = 6–8 frames.
- Cabeça estável (a que "olha para frente"), tronco inclinado, braço da frente dobrado e alto, braço de trás estendido para trás.
- Tempos: 50–80 ms por frame; ciclo de 6–8 frames ≈ 0,4–0,6 s.
- Cabelo, capa e acessórios chegam 1–2 frames depois do corpo (follow-through); poeira atrás do pé que impulsiona.
- Para corrida de sprite pequeno, exagere a inclinação e o espaço entre as pernas: o que lê rápido é a silhueta em "A" e depois em "<".`,

  pose: `Pose e gesto (como evitar o personagem "duro"):
- Linha de ação: uma curva simples (C, S ou reta) que atravessa cabeça-coluna-perna de apoio. Desenhe-a antes da anatomia: se a pose não se lê só por essa linha, nenhum detalhe salva.
- Contrapposto: peso numa perna; o quadril se inclina para o lado do apoio e os ombros inclinam no sentido oposto, formando um "S". Em idle, isso é o que evita o personagem de "manequim".
- Silhueta primeiro: pose legível sem interior (use view check="silhueta"). Evite braços colados ao tronco e "tangentes" (contornos que se tocam/alinham sem querer): afaste o braço do tronco 1 px.
- Poses-chave extremas e claras; ações ocupam o canvas em diagonais (mais dinâmico que verticais/horizontais).
- Equilíbrio: se o corpo se inclina para um lado, uma perna ou braço compensa para o outro.
- Peso: sprites pesados têm antecipação longa e recuperação lenta; leves têm o contrário.
- Em pixel art, 1 px de deslocamento da cabeça, do ombro ou do joelho já muda a atitude; poucas e boas mudanças por frame.`,

  linhas_curvas: `Linhas, curvas e contorno em pixel art:
- Linha "pixel-perfect": 1 px de espessura sem cantos duplos (L). Em diagonal de 45° cada pixel toca o anterior só pela quina; em outras inclinações use segmentos regulares: 1:2 (2-2-2), 1:3 (3-3-3) ou alternados 2-1-2-1 (inclinação 1,5). Nunca irregular (2-2-1-2-2).
- Curvas: os segmentos crescem ou diminuem aos poucos (…5-3-2-1-1 → …1-1-2-3-5); o ápice da curva é a maior reta. Curva de círculo pequeno = formas redondas feitas de blocos pré-definidos.
- Cantos vivos: um pixel de canto a menos (corte de 1 px) suaviza ombro, joelho e queixo.
- Contorno: 1 px, escuro e colorido (não preto) para sprites sombreados; mais grosso embaixo e no lado da sombra; "selout" (contorno claro ou da cor do preenchimento no lado da luz) dissolve a borda e dá volume.
- Pixels órfãos: nenhum pixel solto sem função. Anti-aliasing manual: no máximo 1 tom intermediário nos degraus que incomodam; nada em detalhes de 1 px.
- Tangentes: evite que dois contornos se encostem em 1 pixel ou corram paralelos grudados; sobreponha de verdade ou afaste.
- Preencha formas com massas, não com ruído: agrupe pixels da mesma cor em clusters que expliquem o volume (ombro redondo, antebraço cilíndrico).`,

  sombreamento: `Sombreamento e luz:
- Uma fonte de luz só, igual em todos os frames (padrão: cima-esquerda). Luz principal clareia o topo e o lado da luz; a sombra de forma fica no lado oposto e embaixo.
- Rampa de cor por material: 3–5 tons (sombra funda, sombra, base, luz, brilho). A maior área é o tom BASE; sombra e luz ocupam áreas menores e bem decididas.
- Mude o matiz ao longo da rampa (hue shifting): sombras puxam para azul/roxo e mais saturadas; luzes puxam para amarelo/laranja. Escurecer só com preto/cinza deixa a arte lavada. Use o tópico "rampa" para gerar uma rampa pronta.
- Luz refletida: 1 px de tom intermediário na borda da sombra, vindo do chão/ambiente, tira o ar de recorte chapado.
- Luz de recorte (rim light): linha de 1 px mais clara no contorno do lado oposto à luz, boa para destacar o personagem do fundo.
- Evite: "pillow shading" (sombra em volta de toda a forma), banding (faixas paralelas ao contorno), ruído de pixels soltos (dither irregular) e brilhos espalhados.
- Dither: só em áreas grandes de transição e em xadrez 50%; abaixo de ~32 px de sprite, prefira cortes duros.
- Sombra no chão: elipse achatada de 1–2 tons, mais escura/larga quando o personagem está perto do chão; ajuda a ler altura em pulos.
- Teste: view check="luz_sombra" mostra se as sombras formam poucas áreas coesas; check="cinza" mostra se o valor (claro/escuro) separa personagem e fundo.`,

  tamanhos: `Tamanho do sprite × nível de detalhe:
- 8×8: ícones/itens; uma ideia só. 16×16: personagem de 3 cabeças, olhos de 1 px, cor de 4–6 tons; tipo NES/GB.
- 24×24 a 32×32: personagem de 3,5–4 cabeças; cabeça 8–10 px; olhos 1×2; mãos e pés em blocos; 8–12 cores (SNES/GBA).
- 48×48: 4–5 cabeças; começam a aparecer dedos agrupados, dobras da roupa (convenção retrô: 12–16 cores; estilos detalhados usam mais).
- 64×64 e acima: anatomia e roupas detalhadas; exige disciplina com clusters e rampas; use camadas por membro.
- Regra: quanto menor o sprite, mais a silhueta e o contraste fazem o trabalho; corte detalhes antes de adicionar.
- Cabeça em pixels por altura (estilizado): 16→5–6 px, 24→7, 32→8–9, 48→11–12, 64→14–16.
- Pixels não devem ser misturados em escalas: nunca gire/escale um sprite por um fator não inteiro e use como arte final (distorce a grade).
- Um personagem + o cenário no mesmo canvas deve usar a MESMA densidade de pixel.`,

  estudo: `Onde estudar (fontes de referência reconhecidas na comunidade de pixel art):
- Alura — "Os 12 princípios da animação" (https://www.alura.com.br/artigos/12-principios-animacao): definições e um exemplo animado de cada princípio.
- Pedro Medeiros (saint11): tutoriais curtos de animação e pixel art (cartilhas sobre ciclos, impacto, efeitos).
- Derek Yu — "Pixel Art Tutorial": fundamentos de contorno, sombreamento e cor.
- Slynyrd — "Pixelblog": série longa sobre paleta, sombreamento, animação e cenários.
- Lospec: biblioteca de paletas e tutoriais.
- 2D Will Never Die: regras de animação 2D em pixel art; já refletidas no prompt do diretor.
- Jogos para observar: Celeste, Metal Slug, Chrono Trigger, Hyper Light Drifter, Owlboy, Streets of Rage 4 (quadros-chave, anticipação e peso).
- Livros de anatomia para artistas (Bridgman, Loomis, "Constructive Anatomy") e "The Animator's Survival Kit" (Richard Williams) para ciclos e peso.
Estas fontes são pontos de estudo, não conteúdo copiado: use os princípios e crie arte própria.`,
};

// ---------- paletas ----------

const PALETTES: Record<string, { title: string; hex: string[]; note: string }> = {
  sweetie16: {
    title: "Sweetie 16 (Grafxkid)",
    hex: ["1a1c2c", "5d275d", "b13e53", "ef7d57", "ffcd75", "a7f070", "38b764", "257179", "29366f", "3b5dc9", "41a6f6", "73eff7", "f4f4f4", "94b0c2", "566c86", "333c57"],
    note: "Equilibrada e saturada; a paleta padrão do anima-o usa os mesmos tons mais escuro e claro.",
  },
  db16: {
    title: "DawnBringer 16",
    hex: ["140c1c", "442434", "30346d", "4e4a4e", "854c30", "346524", "d04648", "757161", "597dce", "d27d2c", "8595a1", "6daa2c", "d2aa99", "6dc2ca", "dad45e", "deeed6"],
    note: "Clássica, terrosa; ótima para fantasia e cenários.",
  },
  pico8: {
    title: "PICO-8",
    hex: ["000000", "1d2b53", "7e2553", "008751", "ab5236", "5f574f", "c2c3c7", "fff1e8", "ff004d", "ffa300", "ffec27", "00e436", "29adff", "83769c", "ff77a8", "ffccaa"],
    note: "Muito saturada, contraste alto; boa para sprites minúsculos.",
  },
};

const KEYS = "0123456789abcdef";

function palettes(): string {
  const out: string[] = ["Paletas prontas (cole o JSON em set_palette → colors):"];
  for (const p of Object.values(PALETTES)) {
    const colors = p.hex.map((h, i) => ({ key: KEYS[i], hex: `#${h}`, name: `${p.title.split(" ")[0].toLowerCase()}-${i}` }));
    out.push("", `${p.title} — ${p.note}`, JSON.stringify(colors));
  }
  out.push(
    "",
    "Dica: renomeie as cores por função (contorno, pele-sombra...) depois de aplicar, e descarte as que o sprite não usa.",
    "Para um personagem: contorno (a cor mais escura), 3–4 tons de pele/roupa base, 1 acento chamativo; o fundo usa tons menos saturados.",
  );
  return out.join("\n");
}

// ---------- rampa de cor com mudança de matiz ----------

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Gira o matiz `from` em direção a `to` pelo caminho mais curto, por `t` (0..1). */
function hueToward(from: number, to: number, t: number): number {
  const d = ((to - from + 540) % 360) - 180;
  return from + d * t;
}

/**
 * Rampa de `steps` tons (escuro → claro) com mudança de matiz: sombras em direção
 * a azul/roxo (260°) e mais saturadas; luzes em direção a amarelo (55°).
 * O tom do meio (base) é a cor dada.
 */
export function makeRamp(baseHex: string, steps = 5): string[] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(normalizeHex(baseHex).slice(i, i + 2), 16));
  const [h, s, l] = rgbToHsl(r, g, b);
  const n = Math.max(3, Math.min(7, Math.round(steps)));
  const mid = (n - 1) / 2;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i - mid) / mid; // -1 (sombra funda) … +1 (luz)
    const lightness = Math.max(0.08, Math.min(0.94, l + t * (t < 0 ? 0.3 : 0.26)));
    const hue = t < 0 ? hueToward(h, 260, -t * 0.35) : hueToward(h, 55, t * 0.3);
    const sat = Math.max(0, Math.min(1, s * (t < 0 ? 1 + -t * 0.15 : 1 - t * 0.18)));
    out.push(hslToHex(hue, sat, lightness));
  }
  out[Math.round(mid)] = normalizeHex(baseHex);
  return out;
}

/** Contorno de um material: um tom bem escuro e pouco saturado da mesma cor (não preto puro, não avermelhado). */
export function darkOutline(baseHex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(normalizeHex(baseHex).slice(i, i + 2), 16));
  const [h, sat, l] = rgbToHsl(r, g, b);
  return hslToHex(hueToward(h, 260, 0.18), Math.min(0.45, sat * 0.55), Math.max(0.07, Math.min(0.16, l * 0.3)));
}

function ramp(base: string, steps: number): string {
  const tones = makeRamp(base, steps);
  const names = ["sombra-funda", "sombra", "base", "luz", "brilho", "luz-forte", "brilho-forte"];
  const n = tones.length;
  const label = (i: number) => (n === 5 ? names[i] : i === Math.round((n - 1) / 2) ? "base" : i < (n - 1) / 2 ? `sombra${i + 1}` : `luz${i}`);
  return [
    `Rampa com mudança de matiz a partir de ${normalizeHex(base)} (${n} tons, escuro → claro):`,
    ...tones.map((t, i) => `  ${t}  ${label(i)}`),
    "",
    "Sombras puxam para azul/roxo e ficam mais saturadas; luzes puxam para amarelo. O tom do meio é a sua cor original.",
    `JSON para set_palette (troque as chaves se já estiverem em uso): ${JSON.stringify(tones.map((hex, i) => ({ key: String(i + 1), hex, name: label(i) })))}`,
  ].join("\n");
}

// ---------- entrada ----------

/** Medidas em pixels para um quadrúpede (cão, gato, cavalo) a partir da altura da cernelha (ombro). */
function quadrupedMeasures(withers: number): string {
  const h = Math.max(6, withers);
  const r = (v: number) => Math.max(1, Math.round(v));
  return [
    "",
    `Medidas para um quadrúpede com ${h} px de altura (do chão à cernelha, o ombro):`,
    `  corpo (peito → garupa): ${r(h * 1.3)} px (cão/gato 1,2–1,5×; cavalo ≈ 1×) · cabeça: ${r(h * 0.45)} px · pescoço: ${r(h * 0.25)} px · cauda: ${r(h * 0.7)} px`,
    `  pata dianteira: ombro → cotovelo ${r(h * 0.25)} px, cotovelo → pé ${r(h * 0.5)} px · pata traseira: coxa ${r(h * 0.3)} px, jarrete ${r(h * 0.32)} px, canela ${r(h * 0.3)} px`,
    `  espessura das patas: ${Math.max(2, r(h * 0.12))} px (cão em 32–48 px: 2–3 px); pé: ${r(h * 0.12)}×${r(h * 0.1)} px`,
    "Marcha no lugar (loop com o corpo parado no quadro): 8 frames, cada pata defasada 2 frames da anterior (traseira esquerda, dianteira esquerda, traseira direita, dianteira direita).",
    `  passada ≈ ${r(h * 0.6)}–${r(h * 0.8)} px; o pé de apoio recua a mesma distância que o corpo avançaria; o pé de balanço sobe ${r(h * 0.12)}–${r(h * 0.2)} px e avança em arco.`,
    "  O corpo desce 1 px quando a pata da frente recebe o peso e sobe 1 px na passagem; a cabeça acompanha com 1 frame de atraso; a cauda balança em fase com atraso de 1–2 frames.",
    "  Patas do lado de longe: mais escuras (e 1–2 px acima do chão visual) para separar as quatro patas na silhueta.",
  ].join("\n");
}


/** Círculos e elipses em pixels (larguras de cada linha) + como arredondar quinas: para desenhar à mão sem formas quadradas. */
function circles(): string {
  const disc = (d: number) => {
    const rows: number[] = [];
    for (let y = 0; y < d; y++) {
      let n = 0;
      for (let x = 0; x < d; x++) {
        const dx = (x + 0.5 - d / 2) / (d / 2), dy = (y + 0.5 - d / 2) / (d / 2);
        if (dx * dx + dy * dy <= 1.02) n++;
      }
      rows.push(n);
    }
    return rows;
  };
  const art = (d: number) => disc(d).map((n) => " ".repeat(Math.floor((d - n) / 2)) + "█".repeat(n)).join("\n");
  return [
    "Círculos em pixels (largura de cada linha, de cima para baixo). Use como molde para cabeças, barrigas, olhos e joelhos: formas orgânicas NÃO têm quina reta.",
    ...[4, 6, 8, 10, 12, 14, 16, 20, 24].map((d) => `  ${String(d).padStart(2)} px: ${disc(d).join(" ")}`),
    "",
    "Exemplo (12 px):",
    art(12),
    "",
    "Como arredondar uma quina (degraus que crescem em direção à reta): 1-2-3 para raio grande, 1-2 para raio médio, 1-1 para raio pequeno. Nunca 2-1-2 (serrilhado).",
    "- Cabeça redonda de personagem: pule 2–3 px nos cantos de cima e use o molde do diâmetro; evite topo reto e queixo reto (afine o queixo 2 px por lado).",
    "- Retas longas (4+ px) em silhueta orgânica viram caixa: quebre com uma curva de 1 px a cada 4–6 px.",
    "- Em sprite de 32 px, a cabeça costuma ter 14–18 px; use os moldes de 14, 16 ou 20.",
    "Acabamento recomendado: desenhe CHAPADO → `transform op shade` (3 tons com mudança de matiz) → `transform op outline mode seletivo` → `transform op clean` → retoque só os detalhes (olhos, brilho) → `check`.",
  ].join("\n");
}

export function reference(topic: ReferenceTopic, opts: ReferenceOptions = {}): string {
  switch (topic) {
    case "quadrupede":
      return TEXT.quadrupede + (opts.height ? quadrupedMeasures(Math.round(opts.height * 0.6)) : "");
    case "proporcoes": {
      const style = opts.style ?? "estilizado";
      return proportions(Math.max(8, Math.min(256, Math.round(opts.height ?? 32))), style);
    }
    case "rampa":
      return ramp(opts.base_color ?? "#c8794a", opts.steps ?? 5);
    case "paletas":
      return palettes();
    case "circulos":
      return circles();
    default:
      return TEXT[topic];
  }
}
