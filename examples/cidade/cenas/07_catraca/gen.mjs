// Cena 07 — catraca / controle de acesso (35,3–38,6 s, 40 quadros).
// Fundo azul-escuro, faixa "CONTROLE DE ACESSO", catraca branca com visor. A mulher com sacola vermelha passa (luz verde ✓);
// depois o homem de camiseta vermelha, sem sacola, é barrado (luz vermelha ✕) e o segurança estende o braço.
import { gerar, W, H } from "../../lib/comum.mjs";
import { PALETA, addFrames, cmd, shapes, rows, rect, line, texto, px, figura } from "../_shopping.mjs";

const ID = "07_catraca", N = 40;
const c = [];
c.push(cmd("set_palette", { colors: PALETA }));
c.push(cmd("update_layer", { layer: "Base", rename: "fundo" }));
for (const n of ["gente", "catraca", "visor", "guarda"]) c.push(cmd("add_layer", { name: n }));

const CHAO = 178;
const F = [];
F.push(rect(0, 0, W, H, "O"));
F.push({ type: "gradient", x: 0, y: 0, w: W, h: 76, colors: ["0", "O"], dither: "bayer4", suavidade: 0.3 }, rect(0, 80, W, CHAO - 80, "J"));
F.push({ type: "gradient", x: 0, y: 276, w: W, h: H - 276, colors: ["O", "0"], dither: "bayer4", suavidade: 0.4 });
F.push(line(0, CHAO, W, CHAO, "Y"), line(0, CHAO + 1, W, CHAO + 1, "I"));
// viga e colunas do fundo
F.push(rect(0, 74, W, 6, "0"), line(0, 80, W, 80, "I"));
for (const x of [24, 86, 148]) F.push(rect(x, 80, 3, CHAO - 80, "I"), line(x + 3, 80, x + 3, CHAO - 1, "0"));
// faixa CONTROLE DE ACESSO
F.push(rect(16, 82, 108, 13, "0"), rect(17, 83, 106, 11, "i"), line(17, 93, 122, 93, "h"));
F.push(texto("CONTROLE DE ACESSO", 70, 86, "M", { alinhar: "centro" }));
// reflexos fracos no piso
c.push(shapes("fundo", 0, F));

// catraca (bloco duplo, tampo claro)
const CT = [];
CT.push({ type: "ellipse", x: 30, y: 235, w: 98, h: 8, color: "0", filled: true });
CT.push(rect(46, 180, 78, 10, "e"), rect(46, 179, 78, 2, "c"), line(123, 180, 123, 189, "f"));
CT.push(rect(34, 188, 86, 6, "w"), line(34, 188, 119, 188, "w"), rect(34, 193, 86, 1, "e"));
CT.push(rect(34, 194, 86, 44, "d"), rect(34, 194, 86, 3, "c"), rect(116, 188, 4, 50, "e"), line(119, 188, 119, 237, "f"));
CT.push(rect(34, 234, 86, 4, "e"));
// leitor de cartão na ponta esquerda
CT.push(rect(36, 185, 13, 6, "i"), rect(37, 186, 11, 4, "h"));
// visor (moldura)
CT.push(rect(66, 206, 22, 14, "h"), rect(67, 207, 20, 12, "i"));
c.push(shapes("catraca", 0, CT));
c.push(addFrames(N - 1, 0));

// estados do visor (visor interno: x 67..86, y 207..218)
const ok = (q) => q >= 8 && q <= 18, nao = (q) => q >= 26;
for (let q = 0; q < N; q++) {
  const V = [];
  if (ok(q)) {
    V.push(line(71, 212, 74, 215, "V"), line(72, 212, 74, 214, "V"), line(74, 215, 81, 208, "V"), line(74, 214, 80, 208, "V"));
    V.push(rect(39, 187, 7, 2, "V"));
  } else if (nao(q)) {
    if (q < 30 || q % 4 < 3) V.push(line(73, 209, 80, 216, "R"), line(74, 209, 81, 216, "R"), line(80, 209, 73, 216, "R"), line(81, 209, 74, 216, "R"), rect(39, 187, 7, 2, "R"));
  } else V.push(line(73, 213, 80, 213, "g"), rect(41, 187, 3, 2, "g"));
  if (V.length) c.push(shapes("visor", q, V));
}

// mulher com sacola vermelha (atrás da catraca), passa da esquerda para a direita
const mulher = { A: 90, pele: "1", cabelo: "6", blusa: "w", calca: "8", tras: "e", trasPerna: "i", sacola: "R", coque: true };
for (let q = 0; q < 34; q++) {
  const x = Math.round(-14 + 7.4 * q);
  const lento = ok(q) ? 0 : 0;
  const r = figura({ ...mulher, pose: "andar", frame: Math.floor(q / 2) + lento });
  if (x > W + 4) break;
  c.push(rows("gente", q, x - 34, 232 - 90, r));
}
// homem de camiseta vermelha, sem sacola: chega e para diante da catraca
const homem = { A: 92, pele: "4", cabelo: "5", blusa: "R", calca: "9", tras: "S", trasPerna: "i" };
for (let q = 18; q < N; q++) {
  const t = Math.min(1, (q - 18) / 8);
  const x = Math.round(-36 + 56 * (1 - (1 - t) * (1 - t)));
  const parado = q >= 26;
  const r = figura({ ...homem, pose: parado ? "parado" : "andar", frame: Math.floor(q / 2) });
  c.push(rows("gente", q, x - 35, 236 - 92, r));
}
// segurança à direita, de frente para a catraca; estende o braço barrando
const guarda = { A: 96, pele: "4", cabelo: "5", blusa: "O", calca: "I", tras: "0", trasPerna: "O", sapato: "0", bone: "i", dir: -1 };
for (let q = 0; q < N; q++) {
  const pose = q < 29 ? "parado" : q < 31 ? "barrar_meio" : "barrar";
  const r = figura({ ...guarda, pose });
  c.push(rows("guarda", q, 152 - 36, 238 - 96, r));
  // distintivo e listra do uniforme
  c.push(shapes("guarda", q, [px([[147, 238 - 96 + 33]], "y")]));
}

gerar({ nome: ID, comandos: c.flat(), quadros: N, saida: `examples/cidade/cenas/${ID}` });
console.log("ok", ID, N);
