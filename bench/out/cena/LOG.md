# Cena 320x180 — rodadas (cada uma: nota do `avaliar tipo=cena` + leitura visual + o que mudou na ferramenta)
| rodada | nota | veredito | mudança na ferramenta |
|---|---|---|---|
| r01 | ver abaixo | linha de base: faixas duras, sol escondido, tudo chapado | canvas até 512 px; `avaliar tipo=cena` |
| r01 | 79 | linha de base: faixas duras, tudo chapado, sol escondido | canvas até 512 px; `avaliar tipo=cena` |
| r02 | 86 | MELHOR: céu com dither Bayer, sol radial dissolvendo no céu, montanhas em polígono fractal, pinheiros; lago em zigue-zague regular demais | `draw_shapes` gradient (Bayer) e polygon |
| r03 | 92 | MELHOR: estrelas, nuvens acesas por baixo, reflexo do sol com ondas, grama em tufos, flores, pinheiros variados; defeito: flores sobre a casa, caminho chapado | scatter (pixel/traco/cruz/tufo/onda), gradient `only`, distancia até 48 |
| r04 | 92 (visual melhor) | MELHOR visualmente: flores fora da casa, casa com luz/contorno seletivo, caminho texturizado | scatter `evitar`, shade `luz` (direção) |
| r05a | 86 | PIOROU e foi revertido: reflexo com dithering desde o começo encheu o lago de ruído e escondeu o reflexo do pôr do sol | `reflect` v1 (descartado) |
| r05 | 92 (régua corrigida: r03=r04=r05) / visual melhor | MELHOR visualmente: pinheiros espelhados na água, sólidos e dissolvendo só no fim, ondulação em faixas; régua `contraste` passou a usar percentis 5–95 da cena | `transform reflect` v2 |
| r06 | 92 / visual melhor | MELHOR: 3 planos de montanha com névoa crescente (longe rosado, perto escuro), mais profundidade e harmonia com o céu | `transform haze` |
| r07 | 92 / visual melhor | MELHOR: protagonista (abelha do projeto abelha32), pinheiro grande em 1º plano, vaga-lumes; defeitos: vaga-lumes grandes, abelha sobre a água | alfabeto de chaves de cor ampliado (80 → ~270), camadas até 32 |
| r08 | 95 | MELHOR: abelha no campo, vaga-lumes pequenos, pinheiro com luz de borda e agulhas, vinheta em dither nos cantos, paleta enxuta | `reduce_colors` (quantização por fusão), check `paleta_duplicada` |
