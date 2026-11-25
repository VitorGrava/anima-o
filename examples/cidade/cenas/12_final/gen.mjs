// Cena 12 — noite azul-escura, skyline; mulher de blusa amarela de costas que se vira de frente;
// títulos "SEGREGAÇÃO" e "& ESPAÇO PÚBLICO". 52,5–60 s = 90 quadros.
import { W, H } from "../../lib/comum.mjs";
import { Paleta, Tela, rodar, passo, bayer } from "../_px912.mjs";

const N = 90;
const pal = new Paleta();
const c = (h, n) => pal.c(h, n);
const ceu = ["#161a33", "#1c2140", "#24284b", "#2e2f55", "#3b355e", "#4a3d66"].map((h, i) => c(h, "ceu" + i));
const estrela = c("#e8e4d0", "estrela"), estrelaFraca = c("#8a88a8", "estrela-fraca");
const torreC = c("#173040", "torre"), torreLado = c("#10232f", "torre-lado"), janelaCiano = c("#5fb8bc", "janela-ciano"), janelaCianoEsc = c("#3a7f88", "janela-ciano-esc");
const longe = c("#3a3258", "predios-longe"), medio = c("#2a2440", "predios-medio"), perto = c("#201b30", "predios-perto");
const luz = c("#f0b85a", "janela-quente"), luzFraca = c("#a87840", "janela-quente-fraca");
const cupula = c("#5a5478", "cupula"), chaoNoite = c("#17151f", "chao-noite"), mureta = c("#262230", "mureta"), muretaLuz = c("#3a3448", "mureta-luz");
const piso = c("#4a3428", "piso"), pisoLuz = c("#6a4a34", "piso-luz");
// mulher
const cab = c("#141016", "cabelo"), cabLuz = c("#2c2228", "cabelo-luz"), cabBorda = c("#3e3036", "cabelo-borda");
const pele = c("#7c4a30", "pele"), peleLuz = c("#97603e", "pele-luz"), peleSomb = c("#5a3322", "pele-sombra"), boca = c("#4a2218", "boca");
const olhoB = c("#ece6da", "olho-branco"), brinco = c("#f0c848", "brinco");
const am = c("#dcaa2e", "amarelo"), amLuz = c("#eec450", "amarelo-luz"), amSomb = c("#b08420", "amarelo-sombra"), amDobra = c("#8c6618", "amarelo-dobra");
const gola = c("#f2eee4", "branco"), golaSomb = c("#cdc6b6", "branco-sombra"), costura = c("#a86a22", "gola-costas");
const aviao = c("#e84848", "aviao-luz");
const titulo = c("#f4ecd8", "titulo"), tituloAm = c("#f0bc40", "titulo-amarelo"), tituloSomb = c("#0e0c1a", "titulo-sombra");

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
// ---------- fundo estático (uma vez) ----------
const F = new Tela(W, H);
for (let y = 0; y < 232; y++) for (let x = 0; x < W; x++) {
  const t = Math.pow(y / 231, 1.5) * (ceu.length - 1), a = Math.floor(t);
  F.set(x, y, ceu[Math.min(ceu.length - 1, a + (passo(t - a, x, y, 0.4) ? 1 : 0))]);
}
const estrelas = [];
for (let i = 0; i < 70; i++) estrelas.push([Math.floor(rnd() * W), Math.floor(rnd() * 170), rnd() < 0.3, Math.floor(rnd() * 24)]);
// prédios distantes (silhueta lilás)
for (let x = -4; x < W; ) { const w = 6 + Math.floor(rnd() * 12), h = 14 + Math.floor(rnd() * 30); F.rect(x, 200 - h, w, h + 40, longe); x += w + Math.floor(rnd() * 3); }
// cúpula à direita
F.ellipse(164, 196, 16, 18, cupula); F.ellipse(164, 196, 15, 17, longe);
for (let a = 0; a < 6; a++) F.line(150 + a * 5, 196, 164, 179, cupula);
// torres altas com faixas de janelas ciano
function torre(x, y, w) {
  F.rect(x, y, w, 240 - y, torreC); F.rect(x + w - 3, y, 3, 240 - y, torreLado);
  for (let yy = y + 3; yy < 236; yy += 3) { F.hline(x + 2, x + w - 5, yy, janelaCiano); F.set(x + w - 3, yy, janelaCianoEsc); F.set(x + w - 2, yy, janelaCianoEsc); }
}
torre(2, 128, 18); torre(72, 92, 22); torre(142, 140, 16);
// cidade média e perto, com janelas acesas
function bloco(cor, yBase, hmin, hmax, wmin, wmax, dens) {
  for (let x = -3; x < W; ) {
    const w = wmin + Math.floor(rnd() * (wmax - wmin)), h = hmin + Math.floor(rnd() * (hmax - hmin));
    F.rect(x, yBase - h, w, h + 30, cor);
    for (let yy = yBase - h + 2; yy < yBase + 6; yy += 3) for (let xx = x + 1; xx < x + w - 1; xx += 2) if (rnd() < dens) F.set(xx, yy, rnd() < 0.7 ? luz : luzFraca);
    x += w + (rnd() < 0.3 ? 1 : 0);
  }
}
bloco(medio, 212, 6, 22, 5, 12, 0.18);
bloco(perto, 222, 2, 12, 6, 14, 0.22);
// faixa escura com luzinhas (cidade lá embaixo)
F.rect(0, 226, W, 40, chaoNoite);
const luzinhas = [];
for (let i = 0; i < 60; i++) luzinhas.push([Math.floor(rnd() * W), 228 + Math.floor(Math.pow(rnd(), 1.6) * 30), Math.floor(rnd() * 30)]);
// mureta e piso
F.rect(0, 266, W, 4, muretaLuz); F.rect(0, 270, W, 36, mureta);
for (let x = 6; x < W; x += 22) F.rect(x, 270, 2, 36, muretaLuz);
F.rect(0, 306, W, 14, piso); F.hline(0, W - 1, 306, pisoLuz);

// ---------- mulher (τ: 0 = de costas, 1 = de frente) ----------
const CX = 90;
function mulher(T, tau, tauCorpo = tau) {
  const thc = (1 - tauCorpo) * Math.PI;
  let th = thc; // rotação: 0 = de frente, π = de costas
  let s = Math.sin(th), co = Math.cos(th);
  // manto (silhueta quase igual em todas as poses)
  const larg = 1 - 0.06 * Math.abs(s);
  const L = (dx) => CX + dx * larg;
  const OY = 205; // linha dos ombros (topo do manto)
  const manto = [[L(-7), OY], [L(-22), OY + 3], [L(-31), OY + 7], [L(-36), OY + 13], [L(-37), OY + 22], [L(-38), 270], [L(-40), 320], [L(40), 320], [L(38), 270], [L(37), OY + 22], [L(36), OY + 13], [L(31), OY + 7], [L(22), OY + 3], [L(7), OY]];
  T.poly(manto, am);
  // luz no ombro esquerdo e sombra à direita (luz quente da cidade vem da esquerda-trás)
  const dentro = (x, y) => { const k = T.get(x, y); return k === am; };
  const luzes = [];
  for (let y = OY; y < 320; y++) for (let x = CX - 42; x <= CX + 42; x++) {
    if (!dentro(x, y)) continue;
    const u = (x - CX) / 38;
    if (u > 0.52) luzes.push([x, y, amSomb]);
    else if (u < 0 && (!dentro(x, y - 3) || !dentro(x - 2, y))) luzes.push([x, y, amLuz]); // borda de luz no ombro e lado esquerdo
  }
  for (const [x, y, k] of luzes) T.set(x, y, k);
  // dobras verticais do manto
  for (const [dx, y0] of [[-24, 258], [22, 270]]) T.vline(L(dx), y0, 319, amDobra);
  // frente: faixa branca (vestido) com gola em V; desloca com a rotação
  if (co > 0.05) {
    const fx = CX + s * 17, half = 9 * co, V = OY + 22 * co + 4;
    T.poly([[fx - half, OY], [fx + half, OY], [fx + half * 0.9, 320], [fx - half * 0.9, 320]], gola);
    T.poly([[fx - half, OY], [fx + half, OY], [fx, V]], peleSomb); // decote em V
    T.poly([[fx - half + 1, OY], [fx + half - 1, OY], [fx, V - 2]], pele);
    T.line(fx - half, OY, fx, V, golaSomb); T.line(fx + half, OY, fx, V, golaSomb);
    T.vline(Math.round(fx + half * 0.95), OY + 2, 319, golaSomb);
    T.line(fx - half - 1, OY + 1, fx - half * 0.9 - 1, 319, amDobra); T.line(fx + half + 1, OY + 1, fx + half * 0.9 + 1, 319, amDobra);
  }
  if (co < 0) { // costas: costura da gola
    T.hline(CX - 8, CX + 8, OY + 1, costura); T.set(CX - 9, OY + 2, costura); T.set(CX + 9, OY + 2, costura);
  }
  // pescoço e cabeça usam a rotação da cabeça
  th = (1 - tau) * Math.PI; s = Math.sin(th); co = Math.cos(th);
  // pescoço
  T.rect(CX - 4, 194, 9, 12, co < 0 ? peleSomb : pele);
  T.rect(CX + 2, 194, 3, 12, peleSomb);
  if (co >= 0) T.hline(CX - 4, CX + 4, 197, peleSomb);
  // coque alto (puff crespo): borda irregular
  const px = CX - s * 1.5, py = 166;
  T.ellipse(px, py, 12, 9.5, cab);
  for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; T.ellipse(px + Math.cos(an) * 11, py + Math.sin(an) * 8.5, 2.3, 2.3, cab); }
  for (let i = 0; i < 26; i++) { const an = rndFix(i) * Math.PI * 2, r = Math.sqrt(rndFix(i + 50)) * 8; const xx = px + Math.cos(an) * r * 1.2, yy = py + Math.sin(an) * r; if (xx < px + 3 && yy < py + 3) T.set(xx, yy, cabLuz); }
  for (let a = 0; a < 40; a++) { // luz de borda (cidade) no arco de cima-esquerda
    const an = Math.PI + (a / 40) * Math.PI * 0.55, xx = Math.round(px + Math.cos(an) * 12.8), yy = Math.round(py + Math.sin(an) * 10.4);
    if (a % 5 !== 2) T.set(xx, yy, cabBorda);
  }
  // cabeça: esfera com rosto na longitude da frente
  const hx = CX, hy = 186, rx = 9, ry = 11;
  for (let y = Math.floor(hy - ry); y <= Math.ceil(hy + ry); y++) for (let x = Math.floor(hx - rx); x <= Math.ceil(hx + rx); x++) {
    const u = (x + 0.5 - hx) / rx, v = (y + 0.5 - hy) / ry;
    if (u * u + v * v > 1) continue;
    const phi = Math.asin(Math.max(-1, Math.min(1, u / Math.sqrt(Math.max(0.05, 1 - v * v)))));
    let d = Math.abs(phi - th); if (d > Math.PI) d = 2 * Math.PI - d;
    const rosto = d < 1.25 && v > -0.38 + 0.12 * Math.abs(u);
    let k = cab;
    if (rosto) k = u > 0.45 ? peleSomb : (u < -0.5 ? peleLuz : pele);
    else if (v > 0.5) k = peleSomb; // nuca / parte de baixo da mandíbula
    else if (u < -0.4 && v < 0.2) k = cabLuz;
    T.set(x, y, k);
  }
  // traços do rosto: projeta longitudes visíveis
  const proj = (lon, v) => { const ph = th + lon; return { vis: Math.cos(ph) > 0.5, x: Math.round(hx + Math.sin(ph) * rx * Math.sqrt(1 - v * v) - 0.5) }; };
  if (co > -0.2) {
    for (const lon of [-0.45, 0.45]) {
      const p = proj(lon, 0.1);
      if (!p.vis) continue;
      const y = Math.round(hy + 0.5);
      T.set(p.x - 1, y, olhoB); T.set(p.x, y, cab); if (Math.cos(th - lon) > 0.6) T.set(p.x + 1, y, olhoB);
      T.hline(p.x - 1, p.x + 1, y - 2, cab); // sobrancelha
    }
    const n = proj(0, 0.35); if (n.vis) { T.set(n.x, Math.round(hy + 3), peleSomb); T.set(n.x + 1, Math.round(hy + 4), peleSomb); }
    const m = proj(0, 0.6); if (m.vis) { T.hline(m.x - 1, m.x + 2, Math.round(hy + 6), boca); T.set(m.x - 2, Math.round(hy + 5), boca); T.set(m.x + 3, Math.round(hy + 5), boca); }
  }
  // orelhas com brincos (longitudes ±π/2)
  for (const lon of [-Math.PI / 2, Math.PI / 2]) {
    const ph = th + lon, vis = Math.cos(ph) > -0.3;
    if (!vis) continue;
    const x = Math.round(hx + Math.sin(ph) * (rx + 0.5) - 0.5);
    T.set(x, Math.round(hy), peleSomb); T.set(x, Math.round(hy + 1), peleSomb); T.set(x, Math.round(hy + 3), brinco);
  }
}
let sf = 3;
const tab = Array.from({ length: 200 }, () => ((sf = (sf * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff));
function rndFix(i) { return tab[i % tab.length]; }

const tauDe = (f) => (f < 36 ? 0 : f < 38 ? 0.28 : f < 40 ? 0.5 : f < 42 ? 0.74 : 1);
const T_TIT = 54, T_SUB = 60;

// janelas que acendem/apagam nas torres (ação secundária)
const trocas = Array.from({ length: 10 }, (_, i) => [[6, 74, 144][i % 3] + Math.floor(rndFix(i + 90) * 10), 0, Math.floor(rndFix(i + 120) * 90)]);
trocas.forEach((t, i) => { const yTopo = [128, 92, 140][i % 3]; t[1] = yTopo + 3 + 3 * Math.floor(rndFix(i + 150) * ((236 - yTopo) / 3 - 2)); });
function cena(f) {
  const T = F.clone();
  for (const [x, y, forte, ph] of estrelas) { const pisca = ((f + ph) % 24) < 3; T.set(x, y, forte && !pisca ? estrela : pisca ? null : estrelaFraca); }
  for (const [x, y, ph] of luzinhas) T.set(x, y, ((f + ph) % 30) < 4 ? luzFraca : luz);
  for (const [x, y, ph] of trocas) if (f > ph) { T.set(x, y, luz); T.set(x + 1, y, luz); }
  // avião piscando atravessando o céu devagar
  const ax = 186 - Math.floor(f * 0.5), ay = 22 + Math.floor(f * 0.06);
  if (f % 12 < 6) T.set(ax, ay, aviao); else T.set(ax, ay, estrelaFraca);
  // cabeça lidera a virada; o corpo acompanha 2 quadros depois (sobreposição de ação)
  mulher(T, tauDe(f), tauDe(f - 2));
  return T.rows();
}
function textos(f) {
  const sh = [];
  if (f >= T_TIT) sh.push({ type: "texto", texto: "SEGREGAÇÃO", x: 90, y: f === T_TIT ? 40 : 42, color: titulo, escala: 3, alinhar: "centro", sombra: tituloSomb });
  if (f >= T_SUB) {
    const y = f === T_SUB ? 64 : 66;
    // "&" desenhado à mão (o "&" da fonte 3x5 lê como "8")
    const E = ["..XX....", ".XXXX...", ".XX.XX..", ".XXXX...", "..XXX...", ".XXXXX.X", "XX..XXXX", "XX...XX.", "XXX.XXXX", ".XXXX.XX"];
    const pts = [], sombraPts = [];
    E.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === "X") { pts.push([27 + i, y + j]); sombraPts.push([28 + i, y + j + 1]); } }));
    sh.push({ type: "pixels", points: sombraPts, color: tituloSomb }, { type: "pixels", points: pts, color: tituloAm });
    sh.push({ type: "texto", texto: "ESPAÇO PÚBLICO", x: 41, y, color: tituloAm, escala: 2, sombra: tituloSomb });
  }
  return sh;
}

rodar({ nome: "12_final", pal, quadros: N, cena, textos, saida: "examples/cidade/cenas/12_final" });
