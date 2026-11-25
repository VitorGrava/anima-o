// Torre de vidro espelhado + muro com espetos, portão e guarita (cenas 09 e 11).
import { bayer } from "./_px912.mjs";

export function coresTorre(pal) {
  return {
    vidro: ["#1e2d42", "#2a3f5c", "#355173", "#47688c", "#6a8cae", "#9cb6cf", "#c4d4e2"].map((h, i) => pal.c(h, "vidro" + i)),
    topo: pal.c("#262c36", "cobertura"), topoLuz: pal.c("#4a5260", "cobertura-luz"),
    muro: pal.c("#a2a8b0", "muro"), muroLuz: pal.c("#b8bdc4", "muro-luz"), muroSomb: pal.c("#878d96", "muro-sombra"),
    espeto: pal.c("#454a54", "espeto"), portao: pal.c("#3b4048", "portao"), grade: pal.c("#5e646e", "grade"),
    guarita: pal.c("#e4e6e8", "guarita"), guaritaSomb: pal.c("#c2c6cb", "guarita-sombra"), vigia: pal.c("#20242b", "vidro-escuro"),
    placa: pal.c("#c8302c", "placa-vermelha"), branco: pal.c("#f4f2ee", "branco"),
  };
}

/** reflexos de nuvem: [y (mundo), meia-altura, u central (-1..1), meia-largura em u, força] */
export function torre(T, C, { cx, yTopo, yBase, wTopo, wBase, andar = 6, colunas = 16, reflexos = [], cobertura = true }) {
  const V = C.vidro, n = V.length - 1;
  for (let y = Math.ceil(yTopo); y < yBase; y++) {
    const fr = (y - yTopo) / (yBase - yTopo), half = (wTopo + (wBase - wTopo) * fr) / 2;
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half) - 1;
    const linhaAndar = ((Math.round(yBase) - y) % andar) === 0;
    let colAnt = null;
    const andarIdx = Math.floor((Math.round(yBase) - y) / andar), yc = Math.round(yBase) - (andarIdx + 0.5) * andar;
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / half;
      const col = Math.floor(((u + 1) / 2) * colunas);
      const mont = colAnt !== null && col !== colAnt; colAnt = col;
      // tom constante por painel (centro do painel): mosaico limpo, sem ruído
      const uc = ((col + 0.5) / colunas) * 2 - 1;
      let tom = 0.9 + 2.4 * Math.pow(Math.max(0, 1 - Math.abs(uc - 0.12) * 1.05), 1.3) + 0.5 * (1 - fr);
      for (const [ry, rh, ru, rw, a] of reflexos) {
        const dy = (yc - ry) / rh, du = (uc - ru) / rw;
        tom += a * Math.exp(-dy * dy - du * du * du * du);
      }
      let k = Math.round(tom - 0.15);
      if (linhaAndar || mont) k += 1;
      if (x === x0) k = 0; else if (x === x1) k = Math.min(k, 1);
      T.set(x, y, V[Math.max(0, Math.min(n, k))]);
    }
  }
  if (cobertura) {
    const half = wTopo / 2 + 3;
    T.rect(cx - half, yTopo - 4, half * 2, 4, C.topo);
    T.hline(cx - half, cx + half - 1, yTopo - 4, C.topoLuz);
  }
}

/** muro com espetos de y0 (topo) a y1 (chão), de xa a xb; portão e guarita */
export function muro(T, C, { xa, xb, y0, y1, portao, guarita, placa, painel = 30 }) {
  T.rect(xa, y0, xb - xa, y1 - y0, C.muro);
  T.rect(xa, y0, xb - xa, 2, C.muroSomb);
  T.hline(xa, xb, y0 + 2, C.muroLuz);
  for (let x = xa; x < xb; x++) {
    if (((x - xa) % painel) === 0) T.vline(x, y0 + 3, y1 - 1, C.muroSomb);
    // espetos: triângulos 3x3 a cada 4 px
    const m = ((x - xa) % 4 + 4) % 4;
    if (m === 1) T.vline(x, y0 - 3, y0 - 1, C.espeto);
    else if (m === 0 || m === 2) T.set(x, y0 - 1, C.espeto);
  }
  T.rect(xa, y1 - 2, xb - xa, 2, C.muroSomb);
  if (portao) {
    const [px, pw] = portao, ph = Math.round((y1 - y0) * 0.78);
    T.rect(px, y1 - ph, pw, ph, C.portao);
    for (let x = px + 2; x < px + pw - 1; x += 3) T.vline(x, y1 - ph + 2, y1 - 1, C.grade);
    T.hline(px, px + pw - 1, y1 - ph + Math.round(ph * 0.3), C.grade);
  }
  if (guarita) {
    const [gx, gw, gh] = guarita;
    T.rect(gx, y1 - gh, gw, gh, C.guarita);
    T.rect(gx + gw - 2, y1 - gh, 2, gh, C.guaritaSomb);
    T.rect(gx + 3, y1 - gh + 4, gw - 7, Math.round(gh * 0.32), C.vigia);
    // camera no canto de cima
    T.rect(gx + gw - 6, y1 - gh - 3, 4, 2, C.espeto); T.set(gx + gw - 3, y1 - gh - 1, C.espeto); T.set(gx + gw - 7, y1 - gh - 3, C.placa);
  }
  if (placa) { const [qx, qy, qw, qh] = placa; T.rect(qx, qy, qw, qh, C.placa); }
}
