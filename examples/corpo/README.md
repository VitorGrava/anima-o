# corpo 3D único (`draw_shapes type="corpo"`)

Lição do dragão (`examples/dragao/`): a primeira versão montava o corpo com cápsulas separadas, cada uma com luz e contorno
próprios, e lia como "colagem". A versão final (crítico 6,5 → 9,8) só chegou lá com um renderizador próprio no script:
um campo de distância 3D único, unido por smooth-min, com luz pela normal. Agora isso é um comando da engine.

```json
{ "type": "corpo",
  "partes": [
    { "nome": "espinha", "pontos": [[30,30,10,6],[46,58,8,11],[70,62,6,14],[118,66,2,9],[148,92,0,2]] },
    { "nome": "ombro",   "elipse": { "cx": 56, "cy": 66, "z": 16, "rx": 10, "ry": 10, "rz": 8 } } ],
  "unir": [["espinha","ombro",12]],
  "rampa": ["r0","r1","r2","r3","r4"], "luz": "cima-esquerda", "contorno": "seletivo",
  "escamas": { "cor": "r1", "tamanho": 5 }, "especular": "brilho", "borda_luz": { "cor": "brilho", "dir": "cima-esquerda" } }
```

- `pontos`: tubo por spline, `[x, y, z, raio]` (z maior = mais perto). `elipse`: massa de ombro, quadril, cabeça.
- `unir`: pares que se fundem (k = raio da fusão). Sem a lista, tudo se funde com `fusao`.
- Contorno só na silhueta e onde uma parte passa na frente de outra; "seletivo" fica mais claro no lado da luz.
- Chifres, garras, dentes e membranas vão por cima, com polígonos.

`cmds.json` gera `corpo.png` (160x112, ~0,4 s).
