"""Gera os comandos da casa de pedra (96x96, perspectiva de 1 ponto).
Uso: python3 gen.py <saida.json> [--frames 4]
"""
import json, random, sys, math

W = H = 96
VP = (104.0, 30.0)   # ponto de fuga (fora do quadro, à direita, no horizonte)
YH = 30              # horizonte
SBACK = 0.62         # escala do plano de trás

PAL = [
    ("0", "#232c52", "ceu-1"), ("1", "#36406e", "ceu-2"), ("2", "#5c5a88", "ceu-3"),
    ("3", "#9a7896", "ceu-4"), ("4", "#d99a7c", "ceu-5"), ("5", "#f2c48a", "sol"),
    ("6", "#6e6c8e", "morro-longe"), ("7", "#515877", "morro-perto"),
    ("8", "#2f4440", "arvore"), ("9", "#3d5a48", "arvore-luz"), ("a", "#243230", "arvore-sombra"),
    ("b", "#4a6a36", "grama-sombra"), ("c", "#5b7f3c", "grama"), ("d", "#75984a", "grama-luz"),
    ("e", "#93b259", "grama-brilho"), ("f", "#36492e", "grama-escura"),
    ("g", "#b0a58e", "caminho-luz"), ("h", "#8a7f6c", "caminho"), ("i", "#5a5248", "caminho-junta"),
    ("j", "#7a7886", "pedra-frente"), ("k", "#918e98", "pedra-frente-luz"), ("l", "#5e5c6a", "pedra-frente-sombra"),
    ("m", "#45424f", "junta-frente"),
    ("n", "#b8a68a", "pedra-lado"), ("o", "#d6c4a0", "pedra-lado-luz"), ("p", "#8c7c68", "junta-lado"),
    ("q", "#c25a3e", "telha"), ("r", "#e07e52", "telha-luz"), ("s", "#93393a", "telha-sombra"),
    ("t", "#5e2330", "telha-linha"), ("u", "#3a2230", "beiral"),
    ("v", "#8a5530", "madeira"), ("w", "#a86e3c", "madeira-luz"), ("x", "#5e3522", "madeira-sombra"),
    ("y", "#3a2420", "madeira-escura"),
    ("z", "#ffe39a", "janela"), ("A", "#ffb54a", "janela-media"), ("B", "#d9732e", "janela-borda"),
    ("C", "#fff6d0", "janela-quente"),
    ("D", "#d4ccd0", "fumaca-luz"), ("E", "#a9a3b2", "fumaca"), ("F", "#7f7b92", "fumaca-sombra"),
    ("G", "#e86a7c", "flor-rosa"), ("H", "#f4d65a", "flor-amarela"), ("I", "#b8d4f4", "flor-azul"),
    ("J", "#2a2230", "contorno"),
    ("K", "#8f9a4a", "grama-luz-janela"), ("L", "#9a8a80", "pedra-luz-janela"),
    ("N", "#2f5232", "arbusto-sombra"), ("O", "#4a7a40", "arbusto"),
]

def grid():
    return [["." for _ in range(W)] for _ in range(H)]

def rows(g):
    out = ["".join(r) for r in g]
    assert all(len(r) == W for r in out), "largura errada"
    assert len(out) == H
    return out

def put(g, x, y, c):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < H:
        g[y][x] = c

def proj(p, s):
    return (VP[0] + (p[0] - VP[0]) * s, VP[1] + (p[1] - VP[1]) * s)

def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def splat_quad(g, A, B, C, D, fn, n=260):
    """Amostra o quadrilátero A(u0,v0) B(u1,v0) C(u1,v1) D(u0,v1) e pinta fn(u,v)."""
    for i in range(n + 1):
        u = i / n
        top = lerp(A, B, u); bot = lerp(D, C, u)
        for j in range(n + 1):
            v = j / n
            p = lerp(top, bot, v)
            c = fn(u, v)
            if c:
                put(g, math.floor(p[0]), math.floor(p[1]), c)

def inside_poly(pts, x, y):
    ins = False
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xi:
                ins = not ins
    return ins

def fill_poly(g, pts, fn):
    for y in range(H):
        for x in range(W):
            if inside_poly(pts, x + 0.5, y + 0.5):
                c = fn(x, y)
                if c:
                    g[y][x] = c

# ---------------- geometria da casa ----------------
FX0, FX1 = 14, 50          # frente (x)
FYT, FYB = 52, 78          # topo e base da parede
PEAK = (32.0, 34.0)
F_TL, F_TR, F_BR, F_BL = (FX0, FYT), (FX1, FYT), (FX1, FYB), (FX0, FYB)
B_TR = proj(F_TR, SBACK); B_BR = proj(F_BR, SBACK); B_PEAK = proj(PEAK, SBACK)

rng = random.Random(7)

def masonry(courses, unit, seed, base, light, dark, joint, quoin=None):
    """Padrão de pedras: (u em unidades, v 0..1) -> cor."""
    r = random.Random(seed)
    # para cada fiada, posições das juntas verticais
    layout = []
    for k in range(courses):
        xs = []; pos = -r.random() * 3
        while pos < unit + 6:
            w = r.choice([3, 4, 4, 5, 6])
            xs.append((pos, pos + w, r.random()))
            pos += w
        layout.append(xs)
    def fn(u, v, U):
        k = min(courses - 1, int(v * courses))
        fv = v * courses - k
        if fv < 1.0 / 3.0:
            return joint
        for (a, b, tone) in layout[k]:
            if a <= U < b:
                if U - a < 0.9:
                    return joint
                if quoin is not None and quoin(U):
                    return quoin(U)
                if tone > 0.82:
                    return light
                if tone < 0.18:
                    return dark
                if fv > 0.85 and U - a > 0.9:
                    return dark if tone < 0.5 else base
                return base
        return base
    return fn

def build_house():
    g = grid()
    # ---- parede da frente (na sombra, fria) ----
    mf = masonry(9, 36, 11, "j", "k", "l", "m")
    front_pts = [(FX0, FYT), PEAK, (FX1, FYT), (FX1, FYB), (FX0, FYB)]
    def ffront(x, y):
        v = (y - FYT) / (FYB - FYT)
        U = x - FX0
        if y < FYT:  # empena: continua as fiadas para cima
            return mf(0, v % 1.0, U)
        c = mf(0, v, U)
        # cunhais: pedras grandes e claras na quina direita (que pega um pouco de luz)
        if x >= FX1 - 3:
            fv = (v * 9) % 1
            k = int(v * 9)
            if fv < 1 / 3:
                return "m"
            if k % 2 == 0 and x >= FX1 - 3:
                return "k" if x < FX1 - 1 else "k"
            if k % 2 == 1 and x >= FX1 - 2:
                return "k"
        return c
    fill_poly(g, front_pts, ffront)
    # ---- parede lateral (no sol, quente) ----
    ms = masonry(9, 30, 23, "n", "o", "p", "p")
    def fside(u, v):
        U = u * 26
        c = ms(u, v, U)
        if U < 2.0:  # cunhal da quina, claro
            k = int(v * 9); fv = (v * 9) % 1
            if fv < 1 / 3:
                return "p"
            return "o"
        return c
    # mapeamento inverso por pixel: x -> escala s -> profundidade u; y -> altura v
    for x in range(FX1, W):
        s = (x + 0.5 - VP[0]) / (FX1 - VP[0])
        if s < SBACK or s > 1:
            continue
        u = (1 - s) / (1 - SBACK)
        yt = VP[1] + (FYT - VP[1]) * s; yb = VP[1] + (FYB - VP[1]) * s
        for y in range(int(yt), int(yb) + 1):
            if y + 0.5 < yt or y + 0.5 > yb:
                continue
            v = (y + 0.5 - yt) / (yb - yt)
            g[y][x] = fside(u, v)
    return g

def roof_quad():
    over = 2.0
    # beiral com balanço: estende a borda de baixo para fora da parede
    E0 = (FX1 + over, FYT + over)
    E1 = proj((FX1 + over, FYT + over), SBACK)
    R0 = (PEAK[0], PEAK[1] - 1)
    R1 = proj((PEAK[0], PEAK[1] - 1), SBACK)
    # o telhado avança 1 px para a frente da empena
    return R0, R1, E1, E0

def build_roof():
    g = grid()
    R0, R1, E1, E0 = roof_quad()
    courses = 6
    r = random.Random(5)
    offs = [r.random() for _ in range(courses)]
    tones = {}
    def froof(u, v):
        k = min(courses - 1, int(v * courses))
        fv = v * courses - k
        nt = 9
        t = u * nt + (0.5 if k % 2 else 0)
        ti = math.floor(t); ft = t - ti
        key = (k, ti)
        if key not in tones:
            tones[key] = r.random()
        tone = tones[key]
        if fv > 0.78:
            return "t"           # sombra sob a fiada seguinte
        if ft < 0.10 and fv > 0.35:
            return "s"           # junta entre telhas (só na metade de baixo)
        if fv < 0.25:
            return "r"           # borda de cima de cada fiada pega luz
        if tone < 0.15:
            return "s"
        return "q"
    splat_quad(g, R0, R1, E1, E0, froof, n=300)
    # cumeeira: linha clara de telhas de cumeeira
    for i in range(101):
        p = lerp(R0, R1, i / 100)
        put(g, p[0], p[1], "r")
        put(g, p[0], p[1] - 1, "s")
    # borda do beiral (embaixo) e da empena de trás: escuro
    for i in range(201):
        p = lerp(E0, E1, i / 200)
        put(g, p[0], p[1], "u")
        p = lerp(R1, E1, i / 200)
        put(g, p[0] + 1, p[1], "t")
    # barra da empena (borda do telhado na frente): 2 px de telha em corte
    Lft = (FX0 - 3, FYT + 2)
    for (a, b) in [(R0, Lft), (R0, E0)]:
        for i in range(201):
            p = lerp(a, b, i / 200)
            put(g, p[0], p[1], "t")
            put(g, p[0], p[1] + 1, "s")
    return g

def build_shadow_under_roof():
    """Sombra que o beiral projeta na parede e na empena."""
    g = grid()
    R0, R1, E1, E0 = roof_quad()
    Lft = (FX0 - 3, FYT + 2)
    # na empena da frente: 2 px abaixo das linhas da barra
    for (a, b) in [(R0, Lft), (R0, E0)]:
        for i in range(201):
            p = lerp(a, b, i / 200)
            put(g, p[0], p[1] + 2, "l")
    # na lateral: faixa sob o beiral
    for i in range(201):
        u = i / 200
        s = 1 - (1 - SBACK) * u
        p = proj((FX1, FYT), s)
        put(g, p[0], p[1], "p")
        put(g, p[0], p[1] + 1, "p")
    return g

def build_chimney():
    g = grid()
    # chaminé sobre a água do telhado, perto da cumeeira, no fundo
    R0, R1, E1, E0 = roof_quad()
    base = lerp(lerp(R0, R1, 0.70), lerp(E0, E1, 0.70), 0.22)
    cx = int(base[0]) - 1; top = 23
    wf = 6   # face da frente
    for x in range(cx, cx + wf):
        ybot = int(base[1] + (x - cx) * 0.9) + 1
        for y in range(top, ybot):
            fy = (y - top) % 3
            c = "j"
            if fy == 0:
                c = "m"
            elif (x + (y // 3) * 2) % 4 == 0:
                c = "m"
            elif (x - cx) == 0:
                c = "k"
            g[y][x] = c
    # face lateral (no sol)
    for x in range(cx + wf, cx + wf + 2):
        ybot = int(base[1] + (x - cx) * 0.9) + 1
        for y in range(top - 1 + (x - cx - wf), ybot):
            g[y][x] = "o" if (y - top) % 3 else "p"
    # capa
    for x in range(cx - 1, cx + wf + 2):
        g[top - 1][x] = "o" if x > cx + 1 else "k"
        g[top][x] = "p" if x >= cx + wf else "l"
    g[top - 2][cx + wf + 1] = "."
    # boca (escura)
    for x in range(cx, cx + wf):
        g[top - 2][x] = "J"
    g[top - 2][cx - 1] = "k"; g[top - 2][cx + wf] = "o"
    return g, (cx + wf // 2, top - 3)

def build_details():
    g = grid()
    # ---- porta de madeira em arco ----
    dx0, dx1, dy0, dy1 = 19, 28, 63, 78  # x1 exclusivo
    arch = {0: 3, 1: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 3}
    for x in range(dx0, dx1):
        i = x - dx0
        top = dy0 + arch[i]
        for y in range(top, dy1):
            c = "v"
            if i in (0, 8):
                c = "y"
            elif i % 2 == 0:
                c = "x"          # junta entre tábuas
            elif i in (1,) :
                c = "w"
            if y == top and i not in (0, 8):
                c = "y"
            if y in (66, 74) and 0 < i < 8:
                c = "J"          # ferragens
            g[y][x] = c
    g[70][26] = "H"  # maçaneta
    # arco de pedra sobre a porta (aduelas)
    for x in range(dx0 - 1, dx1 + 1):
        i = x - dx0
        a = arch.get(i, 4)
        y = dy0 + a - 1
        g[y][x] = "k" if x < dx1 - 2 else "l"
        if 0 <= y - 1:
            g[y - 1][x] = "m"
    # degrau
    for x in range(dx0 - 1, dx1 + 1):
        g[78][x] = "h"; g[79][x] = "i"
    for x in range(dx0, dx1):
        g[78][x] = "g"
    # ---- janela acesa ----
    wx0, wx1, wy0, wy1 = 36, 45, 58, 67
    for y in range(wy0, wy1):
        for x in range(wx0, wx1):
            c = "z"
            if y >= wy0 + 5:
                c = "A"
            if x == wx0 + 1 and y < wy0 + 4:
                c = "C"
            if x in (wx0, wx1 - 1) or y in (wy0, wy1 - 1):
                c = "y"          # moldura
            if x == (wx0 + wx1) // 2 or y == wy0 + 4:
                c = "x"          # cruz da esquadria
            g[y][x] = c
    # topo em arco da moldura
    for x in range(wx0, wx1):
        g[wy0 - 1][x] = "m"
    g[wy0][wx0] = "m"; g[wy0][wx1 - 1] = "m"
    # peitoril de pedra clara
    for x in range(wx0 - 1, wx1 + 1):
        g[wy1][x] = "k"
        g[wy1 + 1][x] = "l"
    # venezianas
    for y in range(wy0, wy1):
        g[y][wx0 - 2] = "v" if y % 2 else "x"
        g[y][wx0 - 1] = "x"
        g[y][wx1] = "x"
        g[y][wx1 + 1] = "v" if y % 2 else "x"
    return g

def build_ground():
    g = grid()
    # grama: tons por profundidade (mais escura perto do horizonte = longe e na sombra da tarde)
    for y in range(YH, H):
        for x in range(W):
            g[y][x] = "c"
    return g

def path_center(y):
    # caminho sai da porta, desce e curva para a frente-direita
    t = (y - 79) / 17.0
    return 23.5 - 7 * math.sin(t * 2.4) + 6 * t, 9 + (y - 79) * 0.75

def build_path():
    g = grid()
    r = random.Random(3)
    for y in range(79, H):
        cx, w = path_center(y)
        for x in range(W):
            if abs(x + 0.5 - cx) <= w / 2:
                g[y][x] = "h"
    # pedras do calçamento: fiadas que alargam com a proximidade
    y = 79
    k = 0
    while y < H:
        hgt = 2 if y < 85 else 3
        cx, w = path_center(y)
        x = cx - w / 2 - r.random() * 3
        while x < cx + w / 2 + 3:
            sw = (3 if y < 85 else 4) + r.choice([0, 1, 2])
            for yy in range(y, min(H, y + hgt)):
                for xx in range(int(x), int(x + sw)):
                    if 0 <= xx < W and g[yy][xx] != ".":
                        if yy == y + hgt - 1 or xx == int(x):
                            g[yy][xx] = "i"
                        elif yy == y and xx < int(x + sw) - 1:
                            g[yy][xx] = "g"
            x += sw
        y += hgt
        k += 1
    # borda: grama invade a borda do caminho
    for y in range(79, H):
        cx, w = path_center(y)
        for side in (-1, 1):
            xe = int(cx + side * w / 2)
            if r.random() < 0.5 and 0 <= xe < W:
                g[y][xe] = "."
    return g

def build_garden():
    g = grid()
    # canteiro sob a janela: terra + flores
    for y in range(79, 83):
        for x in range(31, 52 - (82 - y) // 2):
            g[y][x] = "x" if y > 79 else "y"
    # arbustos nas quinas
    def bush(cx, cy, rx, ry):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                if d <= 1:
                    # luz da direita-cima
                    lx = (x + 0.5 - cx) / rx; ly = (y + 0.5 - cy) / ry
                    if lx - ly > 0.7:
                        c = "d"
                    elif lx - ly < -0.5:
                        c = "N"
                    else:
                        c = "O"
                    if 0 <= x < W and 0 <= y < H:
                        g[y][x] = c
    bush(11.5, 76.5, 5, 4.5)
    bush(54, 75, 5, 4.5)
    bush(72, 60, 3.5, 3)
    return g

def build_smoke(frame, nframes):
    g = grid()
    src = SMOKE_SRC
    spacing = 5.0
    phase = frame / nframes
    for k in range(-1, 7):
        t = (k + phase)
        h = t * spacing
        if h < -1:
            continue
        cy = src[1] - h
        cx = src[0] - h * 0.45 - math.sin(t * 1.1 + 0.5) * 1.0 + 0.5
        r = 2.0 + h * 0.10
        fade = max(0.0, (h - 14) / 18.0)
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                if y > src[1] + 1:
                    continue
                dx = x + 0.5 - cx; dy = y + 0.5 - cy
                d = (dx * dx + dy * dy) / (r * r)
                if d > 1:
                    continue
                # luz vem de cima-direita
                if dx - dy > r * 0.55:
                    c = "D"
                elif -dx + dy > r * 0.6:
                    c = "F"
                else:
                    c = "E"
                bay = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y % 4][x % 4] / 16.0
                if bay < fade:
                    continue
                if 0 <= x < W and 0 <= y < H:
                    # não deixa um tom escuro cobrir um claro já pintado (puffs se sobrepõem)
                    prev = g[y][x]
                    if prev == "D" and c != "D":
                        continue
                    g[y][x] = c
    return g

def build_glow(frame, nframes):
    """Luz da janela no chão e na parede; varia por frame (tremor da lareira)."""
    g = grid()
    inten = [1.0, 0.8, 0.95, 0.7][frame % 4] if nframes > 1 else 1.0
    # mancha no chão à frente da janela (trapézio)
    for y in range(83, 90):
        spread = (y - 82) * 0.8
        x0 = 35 - spread * 0.3; x1 = 46 + spread
        for x in range(int(x0), int(x1)):
            if (x + y) % 2 == 0 or (y < 87 and inten > 0.75):
                if (y - 83) / 7 < inten:
                    g[y][x] = "K"
    return g

SMOKE_SRC = (0, 0)

def build_shadows():
    g = grid()
    bay = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    # sombra projetada à esquerda (sol na direita): cunha no chão
    pts = [(14, 79.5), (1, 81), (9, 71), (14, 69)]
    fill_poly(g, pts, lambda x, y: "f" if bay[y % 4][x % 4] / 16 < 0.75 else None)
    # sombra de contato sob a frente e sob a lateral
    for x in range(FX0 - 1, FX1 + 1):
        g[FYB][x] = "f"
        if bay[(FYB + 1) % 4][x % 4] < 8:
            g[FYB + 1][x] = "f"
    for x in range(FX1, W):
        sc = (x + 0.5 - VP[0]) / (FX1 - VP[0])
        if sc < SBACK:
            break
        yb = VP[1] + (FYB - VP[1]) * sc
        put(g, x, yb, "f")
        put(g, x, yb + 1, "b")
    return g

def main():
    global SMOKE_SRC
    out = sys.argv[1]
    nframes = 1
    if "--frames" in sys.argv:
        nframes = int(sys.argv[sys.argv.index("--frames") + 1])
    cmds = []
    cmds.append({"name": "set_palette", "input": {"colors": [{"key": k, "hex": h, "name": n} for k, h, n in PAL]}})
    cmds.append({"name": "update_layer", "input": {"layer": "Base", "rename": "ceu"}})
    for name in ["morros", "arvores", "chao", "caminho", "sombras", "luz_chao", "jardim", "casa", "telhado", "sombra_beiral", "chamine", "detalhes", "fumaca"]:
        cmds.append({"name": "add_layer", "input": {"name": name}})
    # céu: degradê com dither
    cmds.append({"name": "draw_shapes", "input": {"layer": "ceu", "preview": False, "shapes": [
        {"type": "gradient", "x": 0, "y": 0, "w": 96, "h": 34, "colors": ["0", "1", "2", "3", "4"], "direction": "vertical", "dither": "bayer4", "suavidade": 0.7, "ondas": 1},
        {"type": "gradient", "x": 50, "y": 4, "w": 46, "h": 30, "colors": ["5", "4", "."], "direction": "radial", "cx": 92, "cy": 30, "r": 22, "dither": "bayer4"},
    ]}})
    cmds.append({"name": "draw_shapes", "input": {"layer": "morros", "preview": False, "shapes": [
        {"type": "terrain", "x": 0, "w": 96, "topo": 22, "amp": 4, "rugosidade": 0.5, "seed": 4, "ate": 34, "color": "6"},
        {"type": "terrain", "x": 0, "w": 96, "topo": 26, "amp": 3, "rugosidade": 0.5, "seed": 9, "ate": 34, "color": "7"},
    ]}})
    cmds.append({"name": "draw_shapes", "input": {"layer": "arvores", "preview": False, "shapes": [
        {"type": "forest", "x": 0, "w": 96, "base": 34, "altura_min": 5, "altura_max": 12, "seed": 12, "cores": ["a", "8", "9"], "tipo": "mista"},
    ]}})
    cmds.append({"name": "draw_rows", "input": {"layer": "chao", "preview": False, "rows": rows(build_ground())}})
    cmds.append({"name": "draw_shapes", "input": {"layer": "chao", "preview": False, "shapes": [
        {"type": "gradient", "x": 0, "y": 30, "w": 96, "h": 66, "colors": ["f", "b", "c"], "direction": "vertical", "dither": "bayer8", "suavidade": 0.9, "ondas": 1},
        {"type": "scatter", "x": 0, "y": 40, "w": 96, "h": 56, "colors": ["d"], "ponta": "e", "forma": "tufo", "densidade": 0.07, "distancia": 3, "seed": 21},
        {"type": "scatter", "x": 0, "y": 34, "w": 96, "h": 62, "colors": ["b", "f"], "forma": "tufo", "densidade": 0.06, "distancia": 3, "seed": 33},
    ]}})
    cmds.append({"name": "draw_rows", "input": {"layer": "sombras", "preview": False, "rows": rows(build_shadows())}})
    cmds.append({"name": "draw_rows", "input": {"layer": "caminho", "preview": False, "rows": rows(build_path())}})
    cmds.append({"name": "draw_rows", "input": {"layer": "jardim", "preview": False, "rows": rows(build_garden())}})
    cmds.append({"name": "draw_shapes", "input": {"layer": "jardim", "preview": False, "shapes": [
        {"type": "scatter", "x": 31, "y": 78, "w": 20, "h": 5, "colors": ["G", "H", "I"], "forma": "cruz", "densidade": 0.35, "distancia": 2, "seed": 5},
        {"type": "scatter", "x": 56, "y": 70, "w": 40, "h": 26, "colors": ["H", "G"], "forma": "pixel", "densidade": 0.02, "distancia": 4, "seed": 8, "evitar": ["caminho"]},
    ]}})
    cmds.append({"name": "draw_rows", "input": {"layer": "casa", "preview": False, "rows": rows(build_house())}})
    cmds.append({"name": "draw_rows", "input": {"layer": "telhado", "preview": False, "rows": rows(build_roof())}})
    cmds.append({"name": "draw_rows", "input": {"layer": "sombra_beiral", "preview": False, "rows": rows(build_shadow_under_roof())}})
    ch, SMOKE_SRC = build_chimney()
    cmds.append({"name": "draw_rows", "input": {"layer": "chamine", "preview": False, "rows": rows(ch)}})
    cmds.append({"name": "draw_rows", "input": {"layer": "detalhes", "preview": False, "rows": rows(build_details())}})
    if nframes > 1:
        cmds.append({"name": "add_frames", "input": {"count": nframes - 1, "copy_from": 0}})
    for f in range(nframes):
        cmds.append({"name": "draw_rows", "input": {"layer": "fumaca", "frames": f, "preview": False, "rows": rows(build_smoke(f, nframes))}})
        cmds.append({"name": "draw_rows", "input": {"layer": "luz_chao", "frames": f, "preview": False, "rows": rows(build_glow(f, nframes))}})
    json.dump(cmds, open(out, "w"))

if __name__ == "__main__":
    main()
