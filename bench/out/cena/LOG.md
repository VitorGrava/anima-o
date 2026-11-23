# Cena 320x180 — rodadas (cada uma: nota do `avaliar tipo=cena` + leitura visual + o que mudou na ferramenta)
| rodada | nota | veredito | mudança na ferramenta |
|---|---|---|---|
| r01 | ver abaixo | linha de base: faixas duras, sol escondido, tudo chapado | canvas até 512 px; `avaliar tipo=cena` |
| r01 | 79 | linha de base: faixas duras, tudo chapado, sol escondido | canvas até 512 px; `avaliar tipo=cena` |
| r02 | 86 | MELHOR: céu com dither Bayer, sol radial dissolvendo no céu, montanhas em polígono fractal, pinheiros; lago em zigue-zague regular demais | `draw_shapes` gradient (Bayer) e polygon |
| r03 | 92 | MELHOR: estrelas, nuvens acesas por baixo, reflexo do sol com ondas, grama em tufos, flores, pinheiros variados; defeito: flores sobre a casa, caminho chapado | scatter (pixel/traco/cruz/tufo/onda), gradient `only`, distancia até 48 |
