// abelha 32x32 v2: formas redondas, paleta rica, desenhada à mão
import { writeFileSync } from "node:fs";
const W = 32, H = 32, N = 16;
const pal = [
  ["o", "#3a1c24", "contorno"],
  ["L", "#b8662f", "cabelo-luz"], ["h", "#8a4222", "cabelo"], ["H", "#5c2a22", "cabelo-sombra"],
  ["K", "#ffe2b4", "pele-luz"], ["s", "#ffbf80", "pele"], ["S", "#e88a5a", "pele-sombra"], ["c", "#ff7a6a", "bochecha"],
  ["e", "#ffffff", "olho-brilho"], ["i", "#c46a2c", "iris"], ["p", "#2a1018", "pupila"], ["m", "#b83a40", "boca"],
  ["Y", "#fff078", "colete-luz"], ["v", "#ffcb1f", "colete"], ["V", "#e8960e", "colete-sombra"],
  ["l", "#ffc866", "abdomen-luz"], ["a", "#ff9a2c", "abdomen"], ["A", "#e0601c", "abdomen-sombra"], ["b", "#7a3418", "listra"],
  ["w", "#f6fdff", "asa"], ["u", "#b9e4f4", "asa-sombra"], ["W", "#5f94c0", "asa-contorno"],
  ["n", "#ff8a1e", "antena"],
];
const grid = () => Array.from({ length: H }, () => Array(W).fill("."));
const stamp = (g, rows, x, y) => rows.forEach((r, j) => [...r].forEach((c, i) => { if (c !== "." && g[y + j] && x + i >= 0 && x + i < W) g[y + j][x + i] = c; }));
const chk = (rows, w, name) => rows.forEach((r, i) => { if ([...r].length !== w) throw new Error(`${name} linha ${i}: ${[...r].length} != ${w}: ${r}`); });

// cabeça 20 de largura: cabelo (bob) + rosto de 14
const hr = (mid, edge = "o") => `${edge}hh${mid}HH${edge}`;
const head = [
  ".....oooooooooo.....",
  "...ooLLLhhhhhhHHoo..".slice(0, 20),
  "..oLLLhhhhhhhhhhHHo.".slice(0, 20),
  ".oLLhhhhhhhhhhhhhHHo",
  hr("hhsshhhhhhsshh"),
  hr("hssssssssssssh"),
  hr("ssssssssssssss"), // eye row placeholders replaced below
  hr("ssssssssssssss"),
  hr("ssssssssssssss"),
  hr("csssssssssssss".slice(0, 13) + "c"),
  hr("ssssmssssmssss"),
  hr("sssssmmmmsssss"),
  hr("SSSSSSSSSSSSSS"),
  ".ohhoooooooooooHHo.".slice(0, 20),
  "...oo..........oo...",
];
// ajusta linhas (fixas à mão para garantir 20 colunas)
head[1] = "...oLLLhhhhhhhHHo..."; // 20
head[2] = "..oLLLhhhhhhhhhHHo.."; // 20
head[3] = ".oLLhhhhhhhhhhhhHHo."; // 20
head[13] = ".ohhoooooooooooooHHo"; // 20 -> ajustado abaixo
head[13] = ".ohh" + "o".repeat(12) + "HHo.".slice(0, 4); // 20
const eye = [["pp", "ep", "pp"]];
const antA = ["...nn..........nn...", "....o..........o....", ".....o........o....."];
const antB = ["....nn........nn....", ".....o.........o....", ".....o........o....."];
const body = [
  "....ossssso...", // 14? (corrigido abaixo)
  "...ovvvvvvo...",
  "..oYvvvvvvVo..",
  ".oYvvvvvvvvVo.",
  ".ovvvvvvvvvVo.",
  ".oVVVVVVVVVVo.",
  ".olaaaaaaaaAo.",
  ".obbbbbbbbbbo.",
  ".olaaaaaaaaAo.",
  "..obbbbbbbbo..",
  "...olaaaaAo...",
  "....oooooo....",
  "...ossoosso...",
  "...ossoosso...",
  "..oooo..oooo..",
];
body[0] = "....ossssso..."; // 14
const wingL = [
  ".....WWW.",
  "...WWwwwW",
  ".WWwwwwwW",
  "WwwwwwuuW",
  "WwwwuuuW.",
  ".WwuuuW..",
  "..WWWW...",
];
const mirror = (rows) => rows.map((r) => [...r].reverse().join(""));
chk(head, 20, "head"); chk(antA, 20, "antA"); chk(antB, 20, "antB"); chk(body, 14, "body"); chk(wingL, 9, "wing");

function frame(t) {
  const L = { asa: grid(), corpo: grid(), cabeca: grid(), bracos: grid() };
  const dxs = [0, 1, 2, 1, 0, -1, -2, -1];
  const dx = dxs[t % 8];
  const dy = [3, 4, 5].includes(t % 8) ? 1 : 0;
  const flap = t % 2 ? -1 : 0;
  const sway = t % 8 >= 4;
  stamp(L.asa, wingL, 1, 22 + flap);
  stamp(L.asa, mirror(wingL), 22, 22 + flap);
  stamp(L.corpo, body, 9, 17);
  const hd = head.map((r) => [...r]);
  const E = (cx, blink) => { // olho 3x3 em hd[6..8], começando na coluna cx
    for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) hd[6 + j][cx + k] = blink ? (j === 1 ? "p" : "s") : eye[0][j][k];
  };
  E(6, t === 11); E(12, t === 11);
  stamp(L.cabeca, hd.map((r) => r.join("")), 6, 3 + dy);
  stamp(L.cabeca, sway ? antB : antA, 6, dy);
  // braço na cintura (direita)
  stamp(L.bracos, ["oooo", "ssso", ".sso", "sso.", "oo.."], 22, 20);
  // braço acenando
  const sh = (y) => (y <= 16 ? dx : y <= 18 ? Math.trunc(dx / 2) : 0);
  const row = (y, x0, str) => stamp(L.bracos, [str], x0 + sh(y), y);
  row(10, 5, "oo"); row(11, 4, "osso"); row(12, 3, "ossssо".replace("о", "o")); row(13, 3, "osssso");
  for (let y = 14; y <= 19; y++) row(y, 4, "osso");
  stamp(L.bracos, ["ossoooo", "ossssss", "oooooo"], 4, 20);
  return L;
}
const cmds = [
  { name: "set_palette", input: { colors: pal.map(([key, hex, name]) => ({ key, hex, name })) } },
  ...["asa", "corpo", "cabeca", "bracos"].map((name) => ({ name: "add_layer", input: { name } })),
  { name: "add_frames", input: { count: N - 1 } },
];
for (let t = 0; t < N; t++) {
  const L = frame(t);
  for (const l of ["asa", "corpo", "cabeca", "bracos"]) cmds.push({ name: "draw_rows", input: { frames: t, layer: l, rows: L[l].map((r) => r.join("")) } });
}
cmds.push({ name: "update_layer", input: { layer: "Base", delete: true } });
cmds.push({ name: "set_frame_timing", input: { frames: "all", duration_ms: [100, 100, 110, 120, 120, 120, 110, 100, 100, 100, 110, 140, 120, 110, 110, 100] } });
writeFileSync(new URL("./cmds32b.json", import.meta.url), JSON.stringify(cmds));
