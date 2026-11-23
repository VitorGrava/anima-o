// Desenho virado para a DIREITA com luz da direita (o build espelha).
export function draw(g) {
  const thick = (x0, y0, x1, y1, k, k2 = k) => { g.line(x0, y0, x1, y1, k); g.line(x0 + 1, y0, x1 + 1, y1, k2); };
  // alça da bolsa pelas costas + bolsa (mais baixa, livre do braço)
  g.line(13, 13, 10, 19, 'n');
  g.rows(8, 20, ['llmn', 'mgmn', 'mmnn']);
  // braço de trás (escuro)
  g.line(13, 15, 11, 17, 'e');
  g.line(10, 16, 9, 16, 'f');
  g.rows(7, 15, ['ee', 'ff']);
  // perna de trás (escura)
  thick(12, 23, 10, 26, 'e', 'f');
  g.rows(9, 26, ['eef']);
  thick(9, 27, 8, 28, 'e', 'f');
  g.rows(6, 29, ['effff']);
  // tronco
  g.rows(15, 13, ['dc']);
  g.rows(12, 14, [
    '.cbbbbb',
    'cbdddbb',
    'cbbbbba',
    'cbdddbb',
    'ccbbbbb',
    '.cdddc.',
  ]);
  g.rows(14, 20, ['cb']);
  g.rows(12, 21, ['.cbbba', 'dcb.bc']);
  // perna da frente
  thick(16, 23, 18, 25, 'b', 'c');
  g.rows(18, 25, ['ab', 'bc']);
  thick(19, 27, 19, 28, 'b', 'c');
  g.rows(19, 29, ['abbbc']);
  // cabeça
  g.rows(10, 2, [
    '.......tsrrr....',
    '.....tsssssrr...',
    '..ttsssssssssrr.',
    '.tsbbbbbbbaaaa..',
    'tt.cbbbbbbbbbaa.',
    't..cbbbbkkbbkkb.',
    '...ccbbbkkbbkkb.',
    '....ccbbbbbkbba.',
    '.....dccbbbcbb..',
    '.....ccbbbbbbba.',
    '.....dkakakakak.',
    '......dccccbbb..',
  ]);
  // braço da frente + cutelo
  g.rows(19, 14, ['ab', 'bc']);
  g.px(20, 16, 'b');
  g.rows(20, 17, ['ab', 'bc']);
  g.px(21, 19, 'b');
  g.rows(22, 19, ['ab', 'bc']);
  g.rows(24, 16, ['......v', '...vvvw', 'gvwwwwx', 'gxxxxx.', 'h......']);
}
