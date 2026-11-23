// 64x64 — mesma pose do 32 (r7), redesenhado à mão. Virado para a DIREITA, luz da direita (o build espelha).
export function draw(g) {
  const fillProfile = (prof, k) => { for (const [y, x0, x1] of prof) for (let x = x0; x <= x1; x++) g.px(x, y, k); };
  const limb = (pts, ks) => { // segmento com espessura: ks = cores da esquerda p/ direita
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      ks.forEach((k, j) => g.line(x0 + j, y0, x1 + j, y1, k));
    }
  };

  // ---------- alça + bolsa (atrás) ----------
  limb([[27, 25], [20, 39]], ['n', 'm']);
  [[25, 29], [23, 33], [21, 37]].forEach(([x, y]) => g.px(x + 1, y, 'l'));
  g.rows(14, 39, [
    '.lllllllmn.',
    'llmmmmmmmnn',
    'mnnnnggnnnn',
    'mmmmmghmmnn',
    'mmlmmmmmmnn',
    'mmmmmmmmnnn',
    'mmmmmmmnnnn',
    '.nnnnnnnnn.',
  ]);
  g.px(16, 43, 'l'); g.px(18, 43, 'l'); g.px(20, 43, 'l');

  // ---------- braço de trás (escuro) ----------
  limb([[26, 30], [22, 34]], ['e', 'f']);
  g.rows(20, 33, ['.ee.', 'effe', '.ff.']); // cotovelo
  limb([[21, 34], [18, 32]], ['f']);
  limb([[21, 35], [18, 33]], ['e']);
  g.rows(15, 30, ['.ee.', 'eeef', 'eeff', '.ff.']);
  g.line(15, 30, 12, 27, 'e'); g.line(14, 31, 11, 30, 'e'); g.line(14, 32, 11, 33, 'f'); g.line(16, 29, 15, 26, 'e');

  // ---------- perna de trás (escura) ----------
  limb([[25, 46], [21, 51]], ['e', 'e', 'f']);
  g.rows(19, 50, ['.ee.', 'eeef', 'efff', '.ff.']); // joelho
  limb([[20, 54], [17, 57]], ['e', 'f']);
  g.rows(15, 56, ['.eef', 'eeff']); // tornozelo
  g.rows(11, 58, ['.eeeeeefff.', 'eeeffeffff.']);

  // ---------- coluna + pélvis ----------
  g.rows(28, 39, ['cbb', 'dcc', 'cbb', 'dcc']);
  g.rows(23, 42, [
    '....cbbbbaa..',
    '..ccbbbbbbbaa',
    '.dcbbddbbbbbc',
    '..dccddccbbc.',
  ]);

  // ---------- caixa torácica ----------
  g.rows(30, 26, ['dcc', 'cbb']); // pescoço
  g.rows(24, 28, [
    '...ccbbbbbbbbba.',
    '..cbbbbbbbbbbbbb',
    '.ccbkdddddbbbbba',
    '.cbbbbbbbcddddbb',
    '.cbbbbbbbbbbbbbb',
    '.ccbkdddddbbbbba',
    '.cbbbbbbbcddddbb',
    '.cbbbbbbbbbbbbb.',
    '..cbkdddddbbbbb.',
    '..cbbbbbbcdddbb.',
    '...ccbbbbbbbbb..',
    '....ccddddcc....',
  ]);

  // ---------- perna da frente ----------
  limb([[32, 46], [36, 50]], ['b', 'b', 'c']);
  g.rows(35, 50, ['.aab.', 'abbbc', 'bbbcc', '.ccc.']); // joelho
  limb([[37, 54], [38, 56]], ['a', 'b', 'c']);
  g.rows(36, 53, ['.abc.']);
  g.rows(37, 57, ['.abbc', 'abbcc']); // tornozelo
  g.rows(37, 58, ['.aabbbbbbbbc', 'abbbbcbcbccc']);

  // ---------- cabeça ----------
  // silhueta do crânio
  fillProfile([
    [6, 34, 44], [7, 31, 46], [8, 29, 48], [9, 28, 49], [10, 27, 49], [11, 27, 50],
    [12, 26, 50], [13, 26, 50], [14, 26, 50], [15, 26, 50], [16, 26, 50], [17, 27, 50], [18, 27, 50],
    [19, 28, 50], [20, 28, 49], [21, 29, 48], [22, 30, 49], [23, 30, 50],
  ], 'b');
  // sombreamento: nuca/base mais escura, frente-alto clara
  fillProfile([[12, 26, 27], [13, 26, 27], [14, 26, 28], [15, 26, 28], [16, 26, 29], [17, 26, 29], [18, 26, 30], [19, 27, 31], [20, 28, 32], [21, 29, 33], [22, 30, 33], [23, 30, 34]], 'c');
  fillProfile([[17, 26, 26], [18, 26, 27], [19, 27, 28], [20, 28, 29], [21, 29, 30], [22, 30, 31], [23, 30, 31]], 'd');
  fillProfile([[10, 42, 48], [11, 44, 49], [12, 46, 50], [13, 47, 50], [14, 49, 50]], 'a');
  // rachadura na nuca
  g.px(31, 12, 'd'); g.px(32, 13, 'd'); g.px(32, 14, 'd'); g.px(33, 15, 'd');
  // órbitas (perto maior, longe menor) com sombra da sobrancelha
  g.rows(35, 13, [
    '.ccccc...cccc.',
    'ckkkkkc.ckkkkc',
    'kkkkkkk.ckkkkb',
    'kkkkkkk.ckkkkb',
    'ckkkkkc..kkkcb',
    '.ckkkc...ckc..',
  ]);
  // nariz
  g.rows(43, 19, ['kk', 'dk', '.c']);
  // maçã do rosto
  g.px(46, 19, 'c'); g.px(47, 20, 'c');
  // dentes superiores, linha da boca, dentes inferiores e mandíbula
  g.rows(31, 24, [
    'ddcccbbkbbkbbkbbkbb.',
    '.ddccbbkbbkbbkbbkab.',
    '...ddccckkkkkkkkkk..',
    '....dccbbkbbkbbkba..',
    '.....dccbbbbbbbbb...',
    '......dcccbbbbbb....',
  ]);
  // bandana
  fillProfile([
    [4, 35, 43], [5, 32, 46], [6, 30, 48], [7, 28, 49], [8, 27, 50], [9, 26, 50], [10, 25, 41], [11, 25, 33],
  ], 's');
  fillProfile([[4, 40, 43], [5, 41, 46], [6, 43, 48], [7, 45, 49], [8, 47, 50], [9, 48, 50]], 'r');
  fillProfile([[5, 32, 34], [6, 30, 33], [7, 28, 31], [8, 27, 29], [9, 26, 28], [10, 25, 27], [11, 25, 33], [10, 34, 41], [9, 42, 50]], 't');
  // dobras
  g.px(37, 6, 't'); g.px(38, 7, 't'); g.px(39, 8, 't');
  g.px(42, 5, 's'); g.px(44, 6, 's'); g.px(38, 4, 'r'); g.px(39, 4, 'r'); g.px(36, 5, 'r'); g.px(37, 5, 'r');
  // sombra projetada da bandana no crânio
  fillProfile([[10, 42, 49], [11, 34, 43]], 'c');
  g.px(44, 10, 'c');
  // nó e pontas
  g.rows(19, 9, [
    '...ttss.',
    '..tsrrst',
    '.ttssst.',
    'tts.tt..',
    'ts...t..',
    'tt...tt.',
    't.....t.',
  ]);

  // ---------- braço da frente ----------
  const painted = new Set(); const px0 = g.px;
  g.px = (x, y, k) => { painted.add(x + ',' + y); px0(x, y, k); };
  g.rows(38, 30, ['.aab.', 'aabbc', 'abbcc', '.bcc.']); // ombro
  limb([[40, 34], [41, 35]], ['a', 'c']);
  g.rows(40, 35, ['.ab.', 'abbc', '.bcc']); // cotovelo
  limb([[42, 38], [43, 39]], ['b', 'c']);
  g.rows(43, 36, ['.aab.', 'abbbb', 'bdbdb', 'bcbcc', '.ccc.']);
  g.px = px0;
  for (const p of painted) { const [x, y] = p.split(',').map(Number);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const q = (x+dx)+','+(y+dy); const k = g.get(x+dx, y+dy);
      if (!painted.has(q) && 'abcd'.includes(k) && k !== '.') g.px(x+dx, y+dy, 'o'); } }
  // pomo e guarda
  g.rows(42, 40, ['hg']);
  g.rows(48, 31, ['hg', 'hg', 'hg', 'hg', 'hg', 'hg', 'hg', 'hg', 'hh']);
  // punho (mão fechada)
  g.rows(43, 36, ['.aab.', 'abbbb', 'bdbdb', 'bcbcc', '.ccc.']);
  // lâmina do cutelo
  g.rows(50, 31, [
    '...........v.',
    '..........vw.',
    '........vvwx.',
    '.....vvvwwx..',
    'vvvvvwwwvxx..',
    'wwwwwwvvxx...',
    'xwwvvxxxx....',
    'xxxxx........',
  ]);
}
