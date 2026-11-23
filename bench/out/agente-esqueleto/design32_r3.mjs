// Desenho virado para a DIREITA com luz da direita (o build espelha).
export function draw(g) {
  const thick = (x0, y0, x1, y1, k, k2 = k) => { g.line(x0, y0, x1, y1, k); g.line(x0 + 1, y0, x1 + 1, y1, k2); };
  // braço de trás (escuro), para trás em equilíbrio
  g.line(13, 15, 11, 17, 'e');
  g.line(10, 17, 9, 17, 'f');
  g.rows(7, 16, ['ee', 'ff']);
  // perna de trás (escura)
  thick(12, 23, 10, 26, 'e', 'f');
  g.rows(9, 26, ['eef']);
  thick(9, 27, 8, 28, 'e', 'f');
  g.rows(6, 29, ['effff']);
  // bolsa nas costas
  g.rows(9, 19, ['llmn', 'mgmn', 'mmnn']);
  // tronco (costelas com vazios escuros, lado de trás mais escuro)
  g.rows(15, 13, ['dc']);
  g.rows(12, 14, [
    '.cbbbbb',
    'cbkkkbb',
    'cbbbbbb',
    'cbkkkbb',
    '.cbbbb.',
  ]);
  g.rows(13, 19, ['cb', 'cb']);
  g.rows(12, 21, ['cbbbbaa', 'dc...ba']);
  // alça
  g.line(19, 14, 14, 19, 'm');
  // perna da frente
  thick(17, 23, 19, 25, 'b', 'c');
  g.rows(19, 25, ['ab', 'bc']);
  thick(19, 27, 19, 28, 'b', 'c');
  g.rows(19, 29, ['abbbc']);
  // cabeça
  g.rows(10, 2, [
    '......tssrrr....',
    '....tsssssrrrr..',
    '..ttsssssssssrr.',
    '.tsbbbbbbbbaaaa.',
    'tt.cbbbbbbbbbaa.',
    't..cbbbbkkbbkkb.',
    '...ccbbbkkbbkkb.',
    '...ccbbbbbbkbba.',
    '....ccbbbbbcbb..',
    '.....cbbbbbbbbb.',
    '.....ckbkbkbkbk.',
    '......ccbbbbbb..',
  ]);
  // braço da frente (separado do tronco por 1 px de vazio) + cutelo
  g.rows(19, 14, ['ab', 'bc']);
  g.line(20, 16, 20, 17, 'b');
  g.rows(20, 18, ['ab', '.b']);
  g.rows(22, 19, ['ab', 'bc']);
  g.rows(24, 16, ['......v', '...vvvw', 'gvwwwwx', 'gxxxxx.', 'h......']);
}
