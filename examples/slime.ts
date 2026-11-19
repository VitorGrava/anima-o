/**
 * Demo: um slime pulando em loop, feito só com comandos da engine —
 * exatamente as mesmas chamadas que a IA faz. Útil para testar sem chave de API.
 */
const NORMAL = [
  "....000000....",
  "..00lllggg00..",
  ".0llgggggggd0.",
  "0lggggggggggd0",
  "0gg01gggg01gd0",
  "0gg00gggg00gd0",
  "0ggggg00gggdd0",
  "0dggggggggddd0",
  ".0dddddddddd0.",
  "..0000000000..",
];

const SQUASH = [
  "...0000000000...",
  ".00lllggggggg00.",
  "0llggggggggggdd0",
  "0ggg01gggg01ggd0",
  "0ggg00gggg00gdd0",
  "0gggggg00ggggdd0",
  ".0dddddddddddd0.",
  "..000000000000..",
];

const STRETCH = [
  "....0000....",
  "..00llgg00..",
  ".0llgggggd0.",
  ".0lggggggd0.",
  "0lg01gg01gd0",
  "0gg00gg00gd0",
  "0gggg00gggd0",
  "0gggggggggd0",
  "0dgggggggdd0",
  ".0dggggggd0.",
  ".0dddddddd0.",
  "..00000000..",
];

export const SLIME_COMMANDS: { name: string; input: unknown }[] = [
  { name: "set_canvas", input: { name: "Slime pulando", width: 24, height: 24, fps: 8 } },
  {
    name: "set_palette",
    input: {
      colors: [
        { key: "0", hex: "#1a1c2c", name: "contorno" },
        { key: "1", hex: "#f4f4f4", name: "brilho" },
        { key: "g", hex: "#38b764", name: "slime" },
        { key: "d", hex: "#257179", name: "slime-sombra" },
        { key: "l", hex: "#a7f070", name: "slime-luz" },
        { key: "s", hex: "#333c57", name: "sombra-chao" },
      ],
    },
  },
  { name: "add_layer", input: { name: "sombra", position: "bottom" } },
  { name: "update_layer", input: { layer: "Base", rename: "slime" } },
  // frame 0: pose de repouso
  { name: "draw_rows", input: { layer: "slime", x: 5, y: 11, rows: NORMAL } },
  { name: "draw_shapes", input: { layer: "sombra", shapes: [{ type: "ellipse", x: 4, y: 20, w: 16, h: 3, color: "s" }] } },
  // frames 1-5 começam como cópia do 0
  { name: "add_frames", input: { count: 5, copy_from: 0 } },
  { name: "transform", input: { frames: { from: 1, to: 5 }, layer: "slime", op: "clear" } },
  { name: "draw_rows", input: { frames: [1, 5], layer: "slime", x: 4, y: 13, rows: SQUASH } }, // antecipação / aterrissagem
  { name: "draw_rows", input: { frames: [2, 4], layer: "slime", x: 6, y: 6, rows: STRETCH } }, // subindo / descendo
  { name: "draw_rows", input: { frames: 3, layer: "slime", x: 5, y: 2, rows: NORMAL } }, // topo do pulo
  { name: "transform", input: { frames: [2, 3, 4], layer: "sombra", op: "clear" } },
  { name: "draw_shapes", input: { frames: [2, 4], layer: "sombra", shapes: [{ type: "ellipse", x: 6, y: 20, w: 12, h: 3, color: "s" }] } },
  { name: "draw_shapes", input: { frames: 3, layer: "sombra", shapes: [{ type: "ellipse", x: 8, y: 21, w: 8, h: 2, color: "s" }] } },
  { name: "set_frame_timing", input: { frames: [0, 3], duration_ms: 220 } },
];
