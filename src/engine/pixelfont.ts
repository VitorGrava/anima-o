/**
 * Fonte de pixel 3x5 (maiúsculas, dígitos, pontuação) com acentos do português desenhados acima
 * (altura total 7: 2 linhas de acento + 5 do corpo). Letras minúsculas viram maiúsculas.
 * Para placas, títulos e legendas em pixel art.
 */
import type { Surface } from "./draw.ts";

const G: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110", "4": "101101111001001",
  "5": "111100110001110", "6": "011100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001110",
  ".": "000000000000010", ",": "000000000010100", ":": "000010000010000", ";": "000010000010100", "!": "010010010000010",
  "?": "110001010000010", "'": "010010000000000", '"': "101101000000000", "-": "000000111000000", "+": "000010111010000",
  "%": "101001010100101", "/": "001001010100100", "(": "010100100100010", ")": "010001001001010", "&": "010101010101011",
  "°": "010101010000000", "=": "000111000111000", "_": "000000000000111", " ": "000000000000000",
};
// acentos: [letra base, desenho de 2 linhas x 3 colunas]
const ACC: Record<string, [string, string]> = {
  "Á": ["A", "001010"], "À": ["A", "100010"], "Â": ["A", "010101"], "Ã": ["A", "011110"],
  "É": ["E", "001010"], "Ê": ["E", "010101"], "Í": ["I", "001010"], "Ó": ["O", "001010"], "Ô": ["O", "010101"],
  "Õ": ["O", "011110"], "Ú": ["U", "001010"], "Ü": ["U", "101000"],
};

/** Largura em px do texto (escala 1, espaçamento 1). */
export function textWidth(text: string, escala = 1, espaco = 1): number {
  const n = [...text].length;
  return n ? (n * 3 + (n - 1) * espaco) * escala : 0;
}

/**
 * Desenha `text` com o canto superior esquerdo do CORPO das letras em (x, y) (acentos ficam em y-2..y-1).
 * `alinhar`: "esquerda" | "centro" | "direita" em relação a x. `sombra`: cor do contorno/sombra 1 px (direita-baixo).
 */
export function drawText(s: Surface, text: string, x: number, y: number, cor: number, escala = 1, espaco = 1, alinhar: "esquerda" | "centro" | "direita" = "esquerda", sombra?: number): number {
  const chars = [...text.normalize("NFC").toUpperCase().replace(/[—–]/g, "-")];
  const w = textWidth(chars.join(""), escala, espaco);
  let cx = alinhar === "centro" ? Math.round(x - w / 2) : alinhar === "direita" ? x - w : x;
  let painted = 0;
  const put = (px: number, py: number, c: number) => {
    for (let dy = 0; dy < escala; dy++) for (let dx = 0; dx < escala; dx++) {
      const xx = px + dx, yy = py + dy;
      if (xx < 0 || yy < 0 || xx >= s.width || yy >= s.height) continue;
      s.data[yy * s.width + xx] = c; painted++;
    }
  };
  const pass = (ox: number, oy: number, c: number) => {
    let xx = cx;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const cedilla = ch === "Ç";
      let base = cedilla ? "C" : ch, acc = "";
      if (ACC[ch]) [base, acc] = ACC[ch];
      const g = G[base] ?? G["?"];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r * 3 + k] === "1") put(xx + (k + ox) * escala, y + (r + oy) * escala, c);
      if (acc) for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) if (acc[r * 3 + k] === "1") put(xx + (k + ox) * escala, y + (r - 2 + oy) * escala, c);
      if (cedilla) put(xx + (1 + ox) * escala, y + (5 + oy) * escala, c);
      xx += (3 + espaco) * escala;
    }
  };
  if (sombra !== undefined) pass(1, 1, sombra);
  pass(0, 0, cor);
  return painted;
}
