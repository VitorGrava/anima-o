// Rua viva com sobrados coloridos, toldos listrados, placas, varais de bandeirinhas e barraca de frutas (cenas 10 e 11).
// Desenha em coordenadas de MUNDO numa Tela; `s` = escala (1 na cena 10, ~0,72 na cena 11).

export function coresRua(pal) {
  const c = (h, n) => pal.c(h, n);
  return {
    fachadas: {
      bege: [c("#ead3a6", "bege"), c("#d4b98c", "bege-somb")], azul: [c("#6f92c4", "azul"), c("#5a7aac", "azul-somb")],
      laranja: [c("#e49a62", "laranja"), c("#c97e4c", "laranja-somb")], caramelo: [c("#cf9468", "caramelo"), c("#b37a52", "caramelo-somb")],
      salmao: [c("#e27a5c", "salmao"), c("#c66248", "salmao-somb")], amarelo: [c("#ecc25c", "amarelo"), c("#d2a644", "amarelo-somb")],
      rosa: [c("#e8a0a0", "rosa"), c("#cc8484", "rosa-somb")],
    },
    janela: c("#5e3a30", "janela"), janelaLuz: c("#8a5a44", "janela-luz"), moldura: c("#f6e8cc", "moldura"),
    placa: c("#3a2c2a", "placa"), placaTxt: c("#f6eed8", "placa-texto"),
    listra: { vermelho: c("#d8483a", "toldo-vermelho"), verde: c("#3f9a6a", "toldo-verde"), azul: c("#3c6cb8", "toldo-azul"), laranja: c("#e8862e", "toldo-laranja"), amarelo: c("#eab832", "toldo-amarelo") },
    branco: c("#f7f1e3", "toldo-branco"),
    loja: c("#f4dcae", "loja-fundo"), lojaSomb: c("#d9b98a", "loja-sombra"),
    produtos: [c("#d84838", "p-verm"), c("#3c78c8", "p-azul"), c("#4aa070", "p-verde"), c("#e8b020", "p-amar"), c("#8a5ac0", "p-roxo"), c("#e86a9a", "p-rosa"), c("#e88a30", "p-laranja")],
    flor: c("#e04848", "flor"), folha: c("#4c8c4a", "folha"),
    fio: c("#6a4a3c", "fio"), lampada: c("#fff1b0", "lampada"),
    calcada: c("#e2c99e", "calcada"), calcadaSomb: c("#c9ae84", "calcada-sombra"), meioFio: c("#a88c6c", "meio-fio"),
    asfalto: c("#5a4f4c", "asfalto"), asfaltoEsc: c("#4a4140", "asfalto-esc"), faixa: c("#efe4cc", "faixa"), faixaLaranja: c("#e0904a", "faixa-laranja"),
    guarda: c("#d23c30", "guarda-sol"), guardaSomb: c("#a82c24", "guarda-sol-somb"), mesa: c("#8a5a3a", "madeira"), mesaLuz: c("#b07a4e", "madeira-luz"),
    fruta: [c("#f0c838", "fruta-amarela"), c("#e8862e", "fruta-laranja"), c("#7ab840", "fruta-verde"), c("#d84838", "fruta-vermelha")],
    roda: c("#2c2626", "roda"),
  };
}

const LOJAS_COR = ["vermelho", "verde", "azul", "laranja", "amarelo"];

/**
 * casas: [{ w, andares, cor, loja, toldo }]. x0: borda esquerda da 1ª casa; yb: linha da calçada (base das lojas).
 * Devolve os textos (draw_shapes texto) em coordenadas de MUNDO.
 */
export function rua(T, C, { x0, yb, s = 1, casas, seed = 1 }) {
  const S = (v) => Math.max(1, Math.round(v * s));
  const textos = [];
  let x = x0;
  const topos = [];
  casas.forEach((c, i) => {
    const w = S(c.w), [base, somb] = C.fachadas[c.cor];
    const lojaH = S(26), placaH = 7, toldoH = S(8), andarH = S(25);
    const yLoja = yb - lojaH, yToldo = yLoja - toldoH + S(2), yPlaca = yToldo - placaH - 1;
    const yTopo = yPlaca - 2 - c.andares * andarH - S(4) - S(c.extra ?? 0);
    topos.push([x, w, yTopo]);
    // fachada
    T.rect(x, yTopo, w, yb - yTopo, base);
    T.rect(x + w - S(2), yTopo, S(2), yb - yTopo, somb); // quina de sombra à direita
    T.rect(x, yTopo, w, 2, somb); T.hline(x - 1, x + w, yTopo - 1, somb); // platibanda
    // janelas por andar (2 por andar), com moldura clara e floreira
    for (let a = 0; a < c.andares; a++) {
      const ya = yTopo + S(6) + a * andarH, jw = S(9), jh = S(13);
      const gap = Math.round((w - 2 * jw) / 3);
      for (const jx of [x + gap, x + w - gap - jw]) {
        T.rect(jx - 1, ya - 1, jw + 2, jh + 2, C.moldura);
        T.rect(jx, ya, jw, jh, C.janela);
        T.rect(jx, ya, Math.max(1, Math.round(jw / 2) - 1), jh, C.janelaLuz);
        T.vline(jx + Math.round(jw / 2), ya, ya + jh - 1, C.moldura);
        if (((i + a + (jx > x + w / 2 ? 1 : 0)) % 2) === 0) { // floreira
          T.rect(jx - 1, ya + jh + 1, jw + 2, S(2), C.mesa);
          for (let k = 0; k < jw + 2; k += 2) T.set(jx - 1 + k, ya + jh, ((k / 2 + i) % 3) ? C.flor : C.folha);
        }
      }
    }
    // placa
    T.rect(x + S(2), yPlaca, w - S(4), placaH, C.placa);
    if (c.loja) textos.push({ type: "texto", texto: c.loja, x: x + Math.floor(w / 2), y: yPlaca + 1, color: C.placaTxt, alinhar: "centro" });
    // loja: fundo claro, prateleiras com produtos coloridos
    T.rect(x, yLoja, w, lojaH, C.loja);
    T.rect(x, yLoja, w, S(3), C.lojaSomb);
    let r = seed * 97 + i * 31;
    const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let px = x + S(3); px < x + w - S(3); px += S(3)) {
      const h = S(6 + rnd() * 9), k = C.produtos[Math.floor(rnd() * C.produtos.length)];
      T.rect(px, yb - S(3) - h, Math.max(1, S(3) - 1), h, k);
    }
    T.rect(x, yb - S(3), w, S(3), C.lojaSomb);
    // pilar entre lojas
    T.rect(x + w - S(2), yLoja, S(2), lojaH, somb);
    // toldo listrado
    const cor = C.listra[c.toldo ?? LOJAS_COR[i % LOJAS_COR.length]];
    for (let tx = 0; tx < w; tx++) {
      const k = Math.floor(tx / S(4)) % 2 ? C.branco : cor;
      T.vline(x + tx, yToldo, yToldo + toldoH - 2, k);
      if ((tx % S(4)) < S(4) - 1 || true) T.set(x + tx, yToldo + toldoH - 1, Math.floor(tx / S(4)) % 2 ? null : cor); // franja
    }
    x += w;
  });
  // varais de bandeirinhas e luzes entre casas vizinhas
  for (let i = 0; i + 1 < topos.length; i++) {
    const [xa, wa, ta] = topos[i], [xb, wbb, tb] = topos[i + 1];
    const y0 = Math.max(ta, tb) + S(28 + (i % 2) * 22), xi = xa + Math.round(wa * 0.55), xf = xb + Math.round(wbb * 0.45);
    for (let xx = xi; xx <= xf; xx++) {
      const t = (xx - xi) / (xf - xi), yy = Math.round(y0 + S(5) * Math.sin(Math.PI * t));
      T.set(xx, yy, C.fio);
      const n = xx - xi;
      if (i % 2 === 0) { // bandeirinhas
        if (n % S(5) === 1 && xx < xf - 1) { const k = C.produtos[(n / S(5) + i) % C.produtos.length | 0]; T.rect(xx, yy + 1, S(3), S(2), k); T.set(xx + 1, yy + 1 + S(2), k); }
      } else if (n % S(5) === 2) T.set(xx, yy + 1, C.lampada); // lâmpadas
    }
  }
  return textos;
}

/** calçada e rua de yb para baixo até yFim */
export function chao(T, C, { xa, xb, yb, s = 1, yFim }) {
  const S = (v) => Math.max(1, Math.round(v * s));
  const cal = S(22);
  T.rect(xa, yb, xb - xa, cal, C.calcada);
  T.hline(xa, xb, yb, C.calcadaSomb);
  for (let x = xa; x < xb; x += S(12)) T.set(x, yb + Math.round(cal / 2), C.calcadaSomb);
  T.rect(xa, yb + cal, xb - xa, S(3), C.meioFio);
  T.rect(xa, yb + cal + S(3), xb - xa, yFim - (yb + cal + S(3)), C.asfalto);
  const yf = yb + cal + S(16);
  for (let x = xa; x < xb; x++) if ((((x % S(16)) + S(16)) % S(16)) < S(8)) T.rect(x, yf, 1, S(2) > 1 ? 2 : 1, C.faixa);
  return { yRua: yb + cal + S(3), yFaixa: yf };
}

/** barraca de frutas com guarda-sol vermelho (x = esquerda, yb = chão) */
export function barraca(T, C, x, yb, s = 1) {
  const S = (v) => Math.max(1, Math.round(v * s));
  const w = S(26);
  T.vline(x + Math.round(w / 2), yb - S(34), yb - 1, C.mesa);
  T.poly([[x - S(3), yb - S(30)], [x + w + S(3), yb - S(30)], [x + w - S(3), yb - S(36)], [x + S(3), yb - S(36)]], C.guarda);
  T.hline(x - S(3), x + w + S(2), yb - S(30), C.guardaSomb);
  for (let k = 0; k < w + S(6); k += S(4)) T.set(x - S(3) + k, yb - S(29), C.guardaSomb);
  T.rect(x, yb - S(12), w, S(12), C.mesa);
  T.hline(x, x + w - 1, yb - S(12), C.mesaLuz);
  T.rect(x + 1, yb - S(4), w - 2, 1, C.mesaLuz);
  // frutas empilhadas em caixas
  let n = 0;
  for (let fx = x + 1; fx < x + w - 1; fx += 2) for (let fy = 0; fy < S(4); fy++) {
    const k = C.fruta[Math.floor((fx - x) / S(7)) % C.fruta.length];
    if (fy < S(3) - ((fx - x) % 4 === 1 ? 0 : 1)) { T.set(fx, yb - S(13) - fy, k); T.set(fx + 1, yb - S(13) - fy, n++ % 3 ? k : C.lampada); }
  }
}

/** carrinho de mão (frutas) com 2 rodas; x = esquerda */
export function carrinho(T, C, x, yb, s = 1) {
  const S = (v) => Math.max(1, Math.round(v * s));
  const w = S(20);
  T.rect(x, yb - S(12), w, S(7), C.mesa); T.hline(x, x + w - 1, yb - S(12), C.mesaLuz);
  for (let fx = x + 1; fx < x + w - 1; fx++) T.set(fx, yb - S(13), C.fruta[Math.floor(fx / 2) % 4]);
  for (let fx = x + 2; fx < x + w - 2; fx += 2) T.set(fx, yb - S(14), C.fruta[Math.floor(fx / 3) % 4]);
  T.line(x - 1, yb - S(10), x - S(6), yb - S(15), C.mesa);
  T.ellipse(x + S(4), yb - S(3), S(3), S(3), C.roda); T.ellipse(x + w - S(4), yb - S(3), S(3), S(3), C.roda);
}
