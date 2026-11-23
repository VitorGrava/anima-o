# Benchmark de visão (cena 320x180 com 4 defeitos conhecidos, agentes sem acesso ao código)

Defeitos: ciano 2x2 em (233,121); verde 3x3 em (100,120); triângulo verde flutuando no céu (154,45); linha preta de 1 px em x=268, y150..164.

| canal | defeitos achados | erro de posição | tokens a mais (vs escala 1) |
|---|---|---|---|
| escala 1 (prévia antiga, 320x180) | 2 de 4 (perdeu ciano e linha preta) | ≤ 2 px | — |
| escala 2 (640x360) | 3 de 4 (perdeu a linha preta de 1 px) | ≤ 2 px | ~+230 |
| **escala 3 (960x540)** | **4 de 4** | ≤ 2 px | **+850** |
| 6 quadrantes com régua | 4 de 4 | até ~4 px | +3.600 |
| `check` em texto | 0 de 4 (cena toda opaca: não há "pixel solto") | — | — |

Conclusões: escala 3 é o melhor custo-benefício para REVISAR; quadrantes só quando houver dúvida; 1 px de largura exige ≥ 3x.

## Custo por desenho (texto + imagem, estimado: texto/3,5 e largura*altura/750)
| canvas | antes | depois |
|---|---|---|
| 32x32 | ~1.680 | 249 |
| 64x64 | ~2.500 | 249 |
| 320x180 | ~1.100–1.230 | 577 |
| folha de 12 frames 32x32 (só imagem) | ~16.000 | ~890 |

Mudanças: escala automática por tamanho do quadro (≤64 px: 384 px; ≤128: 640; maior: 960 na leitura / 640 na prévia), texto só do trecho alterado, folha de contato (uma imagem para N frames), `batch` (uma imagem por etapa), padrões tolerantes (`frames` opcional), `set_palette preset`.
