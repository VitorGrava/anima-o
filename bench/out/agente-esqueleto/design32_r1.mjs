// Desenho virado para a DIREITA com luz da direita (o build espelha).
export function draw(g) {
  // braço de trás (escuro)
  g.line(13, 14, 10, 16, 'e');
  g.line(10, 17, 8, 17, 'f');
  g.rows(7, 17, ['ef', 'ff']);
  // perna de trás
  g.rows(12, 22, ['ee', 'ee']);
  g.rows(11, 24, ['ee', 'ef']);
  g.line(10, 26, 9, 28, 'f');
  g.rows(7, 29, ['efff']);
  // tronco
  g.rows(15, 12, ['dc']);
  g.rows(13, 13, [
    'ccbbbbaa',
    'cddddcba',
    'ccbbbbba',
    'cdddddcb',
    '.ccbbbb.',
  ]);
  g.rows(14, 18, ['cb', 'cb']);
  g.rows(12, 20, ['cbbbbba', 'dcc.cbb']);
  // alça e bolsa
  g.line(20, 13, 14, 19, 'm');
  g.rows(9, 19, ['lmmn', 'mmmn', 'mmnn']);
  // perna da frente
  g.rows(17, 22, ['bb.', '.bb']);
  g.rows(19, 24, ['ab', 'bc']);
  g.line(19, 26, 19, 28, 'b');
  g.rows(19, 29, ['abbc']);
  // cabeça
  g.rows(9, 1, [
    '.......tssrr....',
    '.....tsssssrrr..',
    '...ttsssssssssr.',
    '.tsscbbbbbbbaaa.',
    'ts..cbbkkbbkkba.',
    't...cbbkkbbkkba.',
    '....ccbbbbkbbba.',
    '.....ccbbbbbbbb.',
    '......ckakakaka.',
    '.......cbkbkbkb.',
    '........cccbbb..',
  ]);
  // braço da frente + cutelo
  g.rows(20, 13, ['ab', 'bc']);
  g.line(21, 15, 21, 17, 'b');
  g.line(21, 18, 22, 18, 'b');
  g.rows(22, 18, ['ab', 'bc']);
  g.rows(24, 16, ['.....vv', 'gvvvvvw', 'gwwwwx.', 'h......']);
}
