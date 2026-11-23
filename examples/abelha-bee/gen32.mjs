// abelha 32x32, sprites desenhados à mão, animada por troca de poses
import { writeFileSync } from "node:fs";
const W = 32, H = 32, N = 16;
const pal = [
  ["o", "#3b2014", "contorno"], ["h", "#8a4a22", "cabelo"], ["H", "#5a2e18", "cabelo-sombra"],
  ["s", "#f2b36a", "pele"], ["S", "#d98a4c", "pele-sombra"], ["c", "#f08a64", "bochecha"],
  ["e", "#ffffff", "olho-brilho"], ["p", "#24120a", "pupila"], ["m", "#9a2e2e", "boca"],
  ["v", "#f4b81c", "colete"], ["V", "#c88410", "colete-sombra"],
  ["a", "#f6a23a", "abdomen"], ["A", "#d27820", "abdomen-sombra"], ["b", "#8a4a1c", "listra"],
  ["w", "#eef8fa", "asa"], ["W", "#8fb0bf", "asa-contorno"],
];
const grid = () => Array.from({ length: H }, () => Array(W).fill("."));
const stamp = (g, rows, x, y) => rows.forEach((r, j) => [...r].forEach((c, i) => { if (c !== "." && c !== " " && g[y + j] && x + i >= 0 && x + i < W) g[y + j][x + i] = c; }));
const put = (g, x, y, c) => { if (g[y]?.[x] !== undefined) g[y][x] = c; };

// ---- cabeça (18 de largura) ----
const antA = ["..aa..........aa..", "...o..........o...", "....o........o...."];
const antB = ["..aa..........aa..", "...o..........o...", "....o........o...."]; // substituído abaixo (balanço)
const head = [
  "....oooooooooo....",
  "..ohhhhhhhhhhHHo..",
  ".ohhhhhhhhhhhhHHo.",
  "ohhhhhhhhhhhhhhHHo",
  "ohhhsshhhhhssshHHo",
  "ohhssssssssssssHHo",
  "ohhsepssssssepsHHo",
  "ohhsppssssssppsHHo",
  "ohhsppssssssppsHHo",
  "ohhcsssssssssscHHo",
  "ohhsssmssssmsssHHo",
  "ohhssssmmmmssssHHo",
  "ohhSSSSSSSSSSSSHHo",
  ".ohhooooooooooHHo.",
  "..oo..........oo..",
];
const body = [
  "...osssso...",
  "..ovvvvvvo..",
  ".ovvvvvvvVo.",
  ".ovvvvvvvVo.",
  ".oVVVVVVVVo.",
  ".oaaaaaaaao.",
  ".obbbbbbbbo.",
  ".oaaaaaaaAo.",
  ".obbbbbbbbo.",
  "..oaaaaaAo..",
  "...oooooo...",
  "..ossoosso..",
  "..ossoosso..",
  "..ossoosso..",
  "..oooooooo..",
];
const wingL = [
  "......WWW",
  "....WWwwW",
  "..WWwwwwW",
  ".WwwwwwwW",
  "WwwwwwwW.",
  "WwwwwwW..",
  ".WWWW....",
];
const mirror = (rows) => rows.map((r) => [...r].reverse().join("").replace(/[()]/g, ""));

function frame(t) {
  const L = { asa: grid(), corpo: grid(), cabeca: grid(), bracos: grid() };
  const dxs = [0, 1, 2, 1, 0, -1, -2, -1];
  const dx = dxs[t % 8];
  const dy = [3, 4, 5].includes(t % 8) ? 1 : 0;           // respira: cabeça desce 1 px
  const flap = t % 2 ? -1 : 0;                              // asas batem
  const sway = t % 8 < 4 ? 0 : 1;                           // antenas atrasadas
  // asas
  stamp(L.asa, wingL, 2, 22 + flap);
  stamp(L.asa, mirror(wingL), 21, 22 + flap);
  // corpo
  stamp(L.corpo, body, 10, 17);
  // cabeça
  const hd = head.map((r) => [...r]);
  if (t === 11) { for (const i of [3, 4, 12, 13]) { hd[6][i] = "s"; hd[8][i] = "s"; } hd[7][3] = hd[7][4] = hd[7][12] = hd[7][13] = "p"; }
  const hdr = hd.map((r) => r.join(""));
  stamp(L.cabeca, hdr, 7, 3 + dy);
  const antL = sway ? ["...aa.........aa...", "...o..........o...."] : ["..aa..........aa..", "...o..........o..."];
  // antenas (2 poses): 0 abertas, 1 inclinadas para a direita
  const A0 = [["..aa..........aa..", "...o..........o...", "....o........o...."]][0];
  const A1 = ["...aa........aa...", "...o..........o...", "....o........o...."];
  stamp(L.cabeca, sway ? A1 : A0, 7, dy);
  // braço na cintura
  stamp(L.bracos, ["oooo", "ssso", "osso", "ss..", "oo.."], 21, 19);
  put(L.bracos, 23, 22, "o");
  // braço acenando (mão sobe e desce de lado: cisalhamento)
  const sh = (y) => (y <= 15 ? dx : y <= 17 ? Math.trunc(dx / 2) : 0);
  const row = (y, x0, str) => stamp(L.bracos, [str], x0 + sh(y), y);
  row(10, 4, "oooo"); row(11, 3, "osssso"); row(12, 3, "osssso");
  for (let y = 13; y <= 18; y++) row(y, 4, "osso");
  stamp(L.bracos, ["osssoooo", "osssssss", "ooooooo"], 4, 19);
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
writeFileSync(new URL("./cmds32.json", import.meta.url), JSON.stringify(cmds));
