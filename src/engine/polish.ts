/**
 * Acabamento de pixel art sobre uma camada: sombreamento automático de arte chapada,
 * contorno seletivo (sel-out) e limpeza de quinas em L. Funções puras sobre índices
 * de paleta; quem chama decide como criar as cores novas.
 */

const ORTH: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Contorno seletivo: cada pixel transparente encostado (4 vizinhos) na arte recebe um tom
 * escuro do material vizinho (`pick`); `lit` = o contorno está no lado da luz (cima/esquerda),
 * onde fica mais claro. `source` é onde se lê a arte; o resultado vai para `target`.
 */
export function selectiveOutline(
  source: Uint8Array, target: Uint8Array, w: number, h: number,
  pick: (neighbor: number, lit: boolean) => number,
  luminance: (idx: number) => number,
): number {
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (source[k]) continue;
    let best = 0, lit = false;
    for (const [dx, dy] of ORTH) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const c = source[yy * w + xx];
      if (c && (!best || luminance(c) < luminance(best))) { best = c; lit = dx === 1 || dy === 1; }
    }
    if (best) { target[k] = pick(best, lit); n++; }
  }
  return n;
}

/**
 * Sombreamento automático de arte chapada: em cada região de cor única, a borda voltada
 * para a luz (cima/esquerda) ganha o tom claro e a borda oposta (baixo/direita) o tom de sombra,
 * com `depth` pixels de sombra. Regiões finas (claro e sombra ao mesmo tempo) ficam na base.
 * `ramp(idx)` devolve {light, shadow} (0 = não sombrear essa cor, ex.: contornos).
 * `detail(idx)`: cores de detalhe (olhos, boca, listras) que contam como parte da região vizinha,
 * para não criar rebordos em volta delas.
 */
export function autoShade(
  data: Uint8Array, w: number, h: number, depth: number,
  ramp: (idx: number) => { light: number; shadow: number } | null,
  detail: (idx: number) => boolean = () => false,
  luz: "cima-esquerda" | "cima" | "cima-direita" | "esquerda" | "direita" = "cima-esquerda",
): number {
  // (lx, ly) = direção PARA a luz: as bordas voltadas para ela ganham o tom claro
  const [lx, ly] = { "cima-esquerda": [-1, -1], cima: [0, -1], "cima-direita": [1, -1], esquerda: [-1, 0], direita: [1, 0] }[luz];
  const src = data.slice();
  const cache = new Map<number, { light: number; shadow: number } | null>();
  // a própria luz/sombra da cor conta como a mesma região: rodar de novo não empilha rebordos
  const same = (x: number, y: number, c: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const v = src[y * w + x];
    if (v === c || detail(v)) return true;
    const r = cache.get(c);
    return !!r && (v === r.light || v === r.shadow);
  };
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = src[y * w + x];
    if (!c) continue;
    if (!cache.has(c)) cache.set(c, ramp(c));
    const r = cache.get(c);
    if (!r) continue;
    const lit = (ly !== 0 && !same(x, y + ly, c)) || (lx !== 0 && !same(x + lx, y, c));
    let shade = false;
    for (let d = 1; d <= depth && !shade; d++) if ((ly !== 0 && !same(x, y - ly * d, c)) || (lx !== 0 && !same(x - lx * d, y, c))) shade = true;
    if (lit && shade) continue;
    if (lit && r.light) { data[y * w + x] = r.light; n++; }
    else if (shade && r.shadow) { data[y * w + x] = r.shadow; n++; }
  }
  return n;
}

/**
 * Limpeza de quinas em L num contorno de 1 px (`line`): tira o pixel de ponta que forma um L
 * quando os dois lados opostos estão vazios (não mexe se houver arte encostada, para não abrir
 * buraco na silhueta; `blocked` marca a arte de outras camadas). Devolve quantos pixels removeu.
 */
export function cleanCorners(data: Uint8Array, w: number, h: number, line: number, blocked?: Uint8Array): number {
  let n = 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[y * w + x] !== line) continue;
    const N = at(x, y - 1) === line, S = at(x, y + 1) === line, W = at(x - 1, y) === line, E = at(x + 1, y) === line;
    if (Number(N) + Number(S) + Number(W) + Number(E) !== 2) continue;
    const L = (N && E && !S && !W) || (N && W && !S && !E) || (S && E && !N && !W) || (S && W && !N && !E);
    if (!L) continue;
    const opp = [N ? [0, 1] : [0, -1], E ? [-1, 0] : [1, 0]];
    if (!opp.every(([dx, dy]) => at(x + dx, y + dy) === 0)) continue;
    if (blocked && ORTH.some(([dx, dy]) => blocked[(y + dy) * w + x + dx])) continue;   // há arte de outra camada encostada
    data[y * w + x] = 0; n++;
  }
  return n;
}

/** Cores de DETALHE de uma camada: tudo cuja região é minúscula (≤ 8 px) ou fina (1 px de espessura): olhos, boca, listras, brilhos. */
export function detailColors(data: Uint8Array, w: number, h: number): Set<number> {
  const seen = new Uint8Array(w * h);
  const big = new Set<number>(), all = new Set<number>();
  for (let start = 0; start < w * h; start++) {
    const c = data[start];
    if (!c || seen[start]) continue;
    all.add(c);
    const stack = [start];
    seen[start] = 1;
    let n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % w, y = (k - x) / w;
      n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of ORTH) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (!seen[q] && data[q] === c) { seen[q] = 1; stack.push(q); }
      }
    }
    const thin = Math.min(x1 - x0 + 1, y1 - y0 + 1) <= 1;
    if (n > 8 && !thin) big.add(c);
  }
  return new Set([...all].filter((c) => !big.has(c)));
}
