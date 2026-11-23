// Dragãozinho voando 32x32, 4 frames. uso: node gen.mjs > cmds.json
// Corpo, cabeça, rabo e patas numa camada; asa de trás e asa da frente em camadas próprias.
const W = 32, H = 32;
const PAL = [
  ['B', '#3f9e8a', 'corpo'], ['b', '#6cc79a', 'corpo-luz'], ['d', '#2b6f77', 'corpo-sombra'],
  ['C', '#f2e2b0', 'barriga'], ['c', '#d2b98a', 'barriga-sombra'],
  ['M', '#a8e0c8', 'membrana'], ['m', '#7fbfae', 'membrana-sombra'],
  ['F', '#2b6f77', 'asa-fundo'], ['f', '#245a66', 'asa-fundo-sombra'],
  ['A', '#f28a3a', 'acento'], ['a', '#c4572a', 'acento-sombra'],
  ['W', '#ffffff', 'olho'], ['P', '#1b1a2e', 'pupila'], ['h', '#f2e2b0', 'chifre'],
];

const grid = () => Array.from({ length: H }, () => Array(W).fill('.'));
const toRows = (g) => g.map((r) => r.join(''));
function put(g, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; }

// ---------- corpo + cabeça (base, sem contorno, sem sombreamento) ----------
// spans [y, x0, x1] na posição dy=0
const BODY = [
  // crânio
  [6, 22, 25], [7, 20, 27], [8, 19, 28], [9, 18, 28], [10, 18, 29], [11, 18, 29], [12, 18, 29],
  [13, 19, 29], [14, 19, 28], [15, 20, 27],
  // pescoço + tronco (feijão inclinado: peito alto à direita, quadril mais baixo)
  [14, 15, 18], [15, 12, 21], [16, 10, 22], [17, 9, 22], [18, 8, 21], [19, 8, 21], [20, 9, 20],
  [21, 10, 19], [22, 12, 17],
];
function bodyMask(dy) {
  const s = new Set();
  for (const [y, x0, x1] of BODY) for (let x = x0; x <= x1; x++) s.add(x + ',' + (y + dy));
  return s;
}

// ---------- rabo: curva com espessura, ponta em pá (acento) ----------
function tailPts(dy, lag) {
  // base no quadril, controle e ponta; lag move a ponta (follow-through)
  const p0 = [9, 18 + dy], p1 = [3, 21 + dy + Math.round(lag / 2)], p2 = [1, 15 + dy + lag];
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], t]);
  }
  return pts;
}

// ---------- asa: polígono no referencial do ombro, girado por ângulo ----------
// pose estendida apontando para trás (x negativo), ângulo positivo = para cima
function wingPoly(len, fold) {
  // ombro (0,0), cotovelo, ponta; borda de fuga com 2 dedos (recortes)
  const L = len;
  return {
    bone: [[0, 0], [-0.45 * L, -0.25 * L * (1 - fold)], [-L, -0.05 * L]],
    poly: [[1, 0.5], [-0.45 * L, -0.25 * L * (1 - fold) - 0.6], [-L - 0.6, -0.05 * L - 0.4],
      [-0.85 * L, 0.32 * L], [-0.7 * L, 0.18 * L], [-0.55 * L, 0.45 * L], [-0.38 * L, 0.3 * L], [-0.2 * L, 0.42 * L], [1, 1.5]],
  };
}
// ângulo positivo gira a ponta (que está em x<0) para cima
function rotUp([x, y], deg) { const a = deg * Math.PI / 180; const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, y * c + x * s]; }
function inPoly(px, py, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function drawWing(g, sx, sy, deg, len, fold, cMem, cMemS, cBone) {
  const w = wingPoly(len, fold);
  const R = (p) => { const [x, y] = rotUp(p, deg); return [sx + x, sy + y]; };
  const poly = w.poly.map(R);
  const tip = R(w.bone[2]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inPoly(x + 0.5, y + 0.5, poly)) {
      // membrana: mais escura perto da borda de fuga (longe do osso)
      put(g, x, y, cMem);
    }
  }
  // sombra da membrana: pixels sem membrana em cima (borda de fuga de baixo) -> tom escuro
  const mem = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mem[y][x] === cMem) {
    const dn = y + 1 < H ? mem[y + 1][x] : '.';
    if (dn === '.') put(g, x, y, cMemS);
  }
  // osso (braço da asa)
  const bone = w.bone.map(R);
  for (let k = 0; k < bone.length - 1; k++) line(g, bone[k], bone[k + 1], cBone);
  return tip;
}
function line(g, [x0, y0], [x1, y1], c) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5) + 1;
  for (let i = 0; i <= n; i++) { const t = i / n; put(g, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c); }
}


// ---------- asas desenhadas à mão (origem x=5; y absoluto com dy=0) ----------
const WINGS = [
  { y: 2, rows: [ // 0: em cima
    '.....B.......',
    '....MB.......',
    '...MMMB......',
    '..MMMMB......',
    '.MMMMMMB.....',
    '..mMMMMB.....',
    '...mMMMMB....',
    '...MMMMMB....',
    '..MMMMMMMB...',
    '...mmMMMMB...',
    '.....mMMMMB..',
    '......mMMMB..',
    '.......mMMMB.',
  ] },
  { y: 10, rows: [ // 1: descendo, aberta
    '....BBB......',
    '...MMMMBB....',
    '..MMMMMMMBB..',
    '...mMMMMMMMB.',
    '....mmMMMMMMB',
    '......mmMM...',
  ] },
  { y: 14, rows: [ // 2: embaixo
    '..........MB.',
    '........MMMB.',
    '.......MMMMB.',
    '......MMMMB..',
    '.....MMMMMB..',
    '......mMMB...',
    '.....MMMMB...',
    '......mMB....',
    '......MMB....',
    '.......mB....',
    '.......B.....',
  ] },
  { y: 9, rows: [ // 3: subindo, dobrada
    '........BB...',
    '......BBMMB..',
    '....BBMMMMB..',
    '..BBmMMMMMMB.',
    '.....mmMMMMB.',
    '.......mmMMMB',
  ] },
];
function stamp(g, x0, y0, rows, map) {
  rows.forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') put(g, x0 + i, y0 + j, map[c] || c); }));
}

// ---------- montagem de um frame ----------
// fase: 0 asas em cima, 1 descendo (abertas), 2 embaixo, 3 subindo (dobradas)
const BODY_DY = [1, 0, -1, 0];
const TAIL_LAG = [-2, 0, 2, 1];   // ponta do rabo atrasada em relação ao corpo
const NEAR = [{ deg: 68, len: 11, fold: 0 }, { deg: 15, len: 12, fold: 0 }, { deg: -50, len: 11, fold: 0 }, { deg: 35, len: 9, fold: 0.7 }];
const FAR = [{ deg: 82, len: 10, fold: 0 }, { deg: 28, len: 10, fold: 0 }, { deg: -30, len: 9, fold: 0 }, { deg: 50, len: 8, fold: 0.7 }];

function frame(f) {
  const dy = BODY_DY[f];
  const g = grid();
  const m = bodyMask(dy);
  // rabo
  const tp = tailPts(dy, TAIL_LAG[f]);
  const tail = new Set();
  for (const [x, y, t] of tp) {
    tail.add(Math.round(x) + ',' + Math.round(y));
    if (t < 0.45) tail.add(Math.round(x) + ',' + Math.round(y - 1)); // grosso na base
  }
  const all = new Set([...m, ...tail]);
  const has = (x, y) => all.has(x + ',' + y);
  for (const k of all) {
    const [x, y] = k.split(',').map(Number);
    let c = 'B';
    if (!has(x, y - 1)) c = 'b';
    if (!has(x, y + 1) || (!has(x + 1, y) && y > 15 + dy)) c = 'd';
    put(g, x, y, c);
  }
  // barriga creme: faixa de baixo do tronco e frente do pescoço
  for (const k of m) {
    const [x, y] = k.split(',').map(Number);
    const yy = y - dy;
    const belly = (yy >= 19 && yy <= 22 && x >= 11 && x <= 19 && has(x, y + 1) === false) ||
      (yy >= 19 && yy <= 21 && x >= 12 && x <= 19) || (yy >= 15 && yy <= 18 && x >= 19 && x <= 21 + (yy - 15) * 0 && x >= 19 + (18 - yy) * 0);
    if (belly) put(g, x, y, (yy >= 21 || x === 12) ? 'c' : 'C');
  }
  // focinho/bochecha: maxilar creme
  for (let x = 22; x <= 27; x++) put(g, x, 15 + dy, 'C');
  for (let x = 24; x <= 28; x++) put(g, x, 14 + dy, x === 28 ? 'd' : 'C');
  put(g, 29, 13 + dy, 'B'); put(g, 28, 11 + dy, 'd'); // narina
  // olho 3x3 com pupila para a frente e brilho
  const ey = 9 + dy;
  [[23, 0, 'W'], [24, 0, 'W'], [25, 0, 'W'], [23, 1, 'W'], [24, 1, 'W'], [25, 1, 'P'], [23, 2, 'W'], [24, 2, 'P'], [25, 2, 'P']].forEach(([x, o, c]) => put(g, x, ey + o, c));
  put(g, 22, ey - 1, 'd'); put(g, 23, ey - 1, 'd'); // sobrancelha
  // chifres (para trás)
  put(g, 21, 6 + dy, 'h'); put(g, 20, 5 + dy, 'h'); put(g, 19, 4 + dy, 'h');
  // patas encolhidas (voo): dianteira sob o peito, traseira para trás
  put(g, 19, 21 + dy, 'B'); put(g, 20, 22 + dy, 'd'); put(g, 19, 22 + dy, 'B');
  put(g, 11, 22 + dy, 'B'); put(g, 10, 23 + dy, 'B'); put(g, 9, 23 + dy, 'd'); put(g, 11, 23 + dy, 'd');
  // pá do rabo (acento)
  const [tx, ty] = tp[tp.length - 1];
  const px = Math.round(tx), py = Math.round(ty);
  [[-1, -1, 'A'], [0, -1, 'A'], [-1, 0, 'A'], [0, 0, 'A'], [1, 0, 'a'], [0, 1, 'a'], [1, 1, 'a']].forEach(([ox, oy, c]) => put(g, px + ox, py + oy, c));

  // asas
  const near = grid(), far = grid();
  const n = NEAR[f], fa = FAR[f];
  const Wg = WINGS[f];
  stamp(far, 5 + 3, Wg.y + dy - 1, Wg.rows, { M: 'F', m: 'f', B: 'f' });
  stamp(near, 5, Wg.y + dy, Wg.rows, {});
  return { body: g, near, far };
}

const cmds = [];
cmds.push({ name: 'set_palette', input: { colors: PAL.map(([key, hex, name]) => ({ key, hex, name })) } });
cmds.push({ name: 'update_layer', input: { layer: 'Base', name: 'asa_fundo' } });
cmds.push({ name: 'add_layer', input: { name: 'corpo' } });
cmds.push({ name: 'add_layer', input: { name: 'asa_frente' } });
cmds.push({ name: 'add_frames', input: { count: 3 } });
const fr = [0, 1, 2, 3].map(frame);
for (const [layer, key] of [['asa_fundo', 'far'], ['corpo', 'body'], ['asa_frente', 'near']]) {
  cmds.push({ name: 'draw_frames', input: { layer, preview: false, items: fr.map((F, i) => ({ frame: i, rows: toRows(F[key]) })) } });
  cmds.push({ name: 'transform', input: { layer, op: 'outline', mode: 'seletivo', frames: 'all' } });
}
cmds.push({ name: 'set_frame_timing', input: { frames: 'all', duration_ms: [150, 110, 140, 110] } });
// validador de largura
for (const F of fr) for (const k of ['body', 'near', 'far']) for (const r of toRows(F[k])) if (r.length !== W) throw new Error('largura ' + r.length);
console.log(JSON.stringify(cmds));
