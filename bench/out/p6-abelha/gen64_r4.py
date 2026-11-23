"""Abelha 64x64 — massas por construção (elipses medidas na referência) com sombreamento
esférico de luz cima-esquerda; rosto, mãos, colete e detalhes pintados à mão (ASCII)."""
import json, math, sys
from lib_abelha import Canvas, part, commands, fill_holes

W = H = 64
LX, LY = -0.62, -0.78  # luz de cima-esquerda


def tone(nx, ny, keys, hi=0.42, lo=-0.30):
    """keys = (luz, base, sombra); nx, ny normalizados (-1..1) no volume"""
    d = nx * LX + ny * LY
    return keys[0] if d > hi else keys[2] if d < lo else keys[1]


def ellipse(c, cx, cy, rx, ry, keys, cond=None, hi=0.42, lo=-0.30):
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if nx * nx + ny * ny <= 1.0 and (cond is None or cond(x, y)):
                if 0 <= x < W and 0 <= y < H:
                    c.px[y][x] = tone(nx, ny, keys, hi, lo)


def thick_line(c, pts, r, keys, cap=True):
    """membro: segmento(s) com raio r, sombreado pela normal da direção"""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0) or 1
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        nxp, nyp = -uy, ux
        for y in range(int(min(y0, y1) - r - 2), int(max(y0, y1) + r + 3)):
            for x in range(int(min(x0, x1) - r - 2), int(max(x0, x1) + r + 3)):
                px, py = x + 0.5 - x0, y + 0.5 - y0
                t = max(0, min(L, px * ux + py * uy))
                dx, dy = px - t * ux, py - t * uy
                if dx * dx + dy * dy <= r * r and 0 <= x < W and 0 <= y < H:
                    s = (dx * nxp + dy * nyp) / r
                    c.px[y][x] = tone(s * nxp, s * nyp, keys, 0.35, -0.25)


# ---------------------------------------------------------------- cabeça
HCX, HCY = 32, 20          # centro do crânio
FACE_RX, FACE_RY = 11.0, 9.6


def hair_hw(Y):
    """meia-largura do chanel em cada linha: copa redonda, lateral levemente abaulada, pontas viram para dentro"""
    if Y < HCY:
        t = (Y - HCY) / 13.5
        return 14.8 * math.sqrt(max(0.0, 1 - t * t))
    if Y < 27:
        return 14.8 + 0.25 * math.sin((Y - HCY) / 7 * math.pi)
    return 14.8 - ((Y - 27) ** 2) * 0.32


def hair_mask(x, y):
    X, Y = x + 0.5, y + 0.5
    return Y <= 31.5 and abs(X - HCX) <= hair_hw(Y)


def face_mask(x, y):
    X, Y = x + 0.5, y + 0.5
    rx = FACE_RX * (1 - max(0, (Y - 24)) * 0.035)  # queixo afina
    return ((X - HCX) / rx) ** 2 + ((Y - 21.5) / FACE_RY) ** 2 <= 1


def fringe_y(x):
    """linha da franja: risca à esquerda (alto) varrendo para a direita (baixo)"""
    X = x + 0.5
    return 12.5 + 0.20 * (X - 22) + (1.5 if X > 36 else 0) + (1 if X > 40 else 0)


def head(c, eyes="open"):
    # massa de cabelo
    for y in range(0, 40):
        for x in range(W):
            if hair_mask(x, y):
                nx, ny = (x + 0.5 - HCX) / 14.8, (y + 0.5 - (HCY + 4)) / 15
                c.px[y][x] = tone(nx, ny, ("H", "h", "k"), 0.55, -0.15)
    # faixa de brilho do cabelo (anel no alto da cabeça)
    for y in range(0, 20):
        for x in range(W):
            if not hair_mask(x, y):
                continue
            d = math.hypot((x + 0.5 - HCX) / 14.8, (y + 0.5 - HCY) / 13.5)
            ang = math.atan2(y + 0.5 - HCY, x + 0.5 - HCX)
            if 0.70 < d < 0.84 and -2.75 < ang < -1.25:
                c.px[y][x] = "H"
    # risca e mechas (linhas de 1 px no tom escuro)
    for (x, y) in [(27, 7), (27, 8), (26, 9), (26, 10), (29, 9), (30, 10), (31, 11), (33, 11), (34, 12),
                   (37, 10), (38, 11), (39, 12), (40, 14), (21, 15), (20, 17), (44, 16), (45, 19)]:
        c.px[y][x] = "k"
    # rosto
    for y in range(8, 36):
        for x in range(W):
            if face_mask(x, y) and y + 0.5 > fringe_y(x):
                nx, ny = (x + 0.5 - HCX) / FACE_RX, (y + 0.5 - 21) / FACE_RY
                c.px[y][x] = tone(nx, ny, ("P", "p", "q"), 0.62, -0.55)
    # cabelo: sombra interna junto ao rosto, mechas e pontas separadas
    for y in range(8, 33):
        for x in range(W):
            if c.px[y][x] in "Hh" and hair_mask(x, y):
                if any(face_mask(x + dx, y) and y + 0.5 > fringe_y(x + dx) for dx in (-1, 1)):
                    c.px[y][x] = "k"
    for (x, y0, y1, k) in [(19, 21, 29, "k"), (22, 23, 30, "k"), (42, 22, 30, "k"), (45, 20, 28, "k"),
                           (20, 14, 20, "H"), (21, 12, 15, "H"), (44, 13, 17, "h")]:
        for y in range(y0, y1 + 1):
            if hair_mask(x, y) and c.px[y][x] in "Hhk":
                c.px[y][x] = k
    for (x, y) in [(22, 31), (42, 31), (19, 30), (45, 30)]:
        c.px[y][x] = "."
    # sombra que o cabelo projeta no rosto (1 px sob a franja)
    for x in range(W):
        y = int(math.floor(fringe_y(x) + 0.5))
        if 0 <= y < H and c.px[y][x] in "Ppq" and face_mask(x, y):
            c.px[y][x] = "q"
    # sobrancelhas (grossas; a direita arqueada, levantada)
    c.put(part("""
|kkkkk.
|.....k
"""), 24, 15)
    c.put(part("""
|..kkk.
|.k...k
|k.....
"""), 35, 14)
    c.put(part("|kkk"), 25, 15)
    # olhos grandes olhando para a esquerda (íris encostada no canto esquerdo)
    if eyes == "open":
        EYE = part("""
|.oooooo
|oibbowo
|oiooowo
|oioooww
|.iiiiww
|..iiww.
""")
        c.put(EYE, 23, 19)
        c.put(EYE, 34, 19)
        c.put(part("|o......o"), 22, 19)   # cílio externo esquerdo
        c.put(part("|o"), 41, 19)          # cílio externo direito
    elif eyes == "half":
        EYE = part("""
|.......
|.oooooo
|oibbowo
|.iiiiww
""")
        c.put(EYE, 23, 19)
        c.put(EYE, 34, 19)
    else:
        EYE = part("""
|.......
|.......
|.......
|oo...oo
|.ooooo.
""")
        c.put(EYE, 23, 19)
        c.put(EYE, 34, 19)
    # nariz e bochechas
    c.put(part("|q"), 32, 26)
    c.put(part("""
|.rrr
|rrr.
"""), 23, 26)
    c.put(part("""
|rrr.
|.rrr
"""), 38, 26)
    # boca: sorriso aberto, canto direito subindo (maroto)
    c.put(part("""
|.........m
|mbbbbbbbm.
|.mbbbbbmm.
|..mmmmm...
"""), 28, 26)


def antennae(c, phase):
    """antenas: hastes de 1 px saindo do alto da cabeça com a ponta enrolada"""
    up = phase == 0
    L = part("""
|.nNn...
|n...n..
|N...n..
|....n..
|.....n.
|.....n.
|......n
|......n
""") if up else part("""
|.......
|.nNn...
|n...n..
|N....n.
|.....n.
|......n
|......n
|......n
""")
    c.put(L, 21, 0)
    c.put(L, 37, 0, flip=True)


# ---------------------------------------------------------------- corpo
def body(c):
    # abdômen em bulbo
    ACX, ACY, ARX, ARY = 32, 47, 13.5, 8.6
    ellipse(c, ACX, ACY, ARX, ARY, ("P", "p", "q"), hi=0.5, lo=-0.35)
    # listras curvas (centro mais baixo: volta em torno do bulbo)
    for y in range(36, 58):
        for x in range(W):
            if c.px[y][x] not in "Ppq":
                continue
            dx = (x + 0.5 - ACX) / ARX
            for y0 in (45.0, 50.5):
                yc = y0 + 1.6 * (1 - dx * dx)
                if abs(y + 0.5 - yc) <= 1.5:
                    nx, ny = dx, (y + 0.5 - ACY) / ARY
                    c.px[y][x] = "L" if nx * LX + ny * LY > 0.45 else "l"
    # colete (por cima do topo do abdômen)
    VEST = part("""
31|......CCCd.........dcvv......
32|....CCCCCd.........dccvvv....
33|...CCCCCcd.........dcccvvv...
34|..CCCCcccd..p...p..dccccvv...
35|..CCCcccccd.PpppP.dcccccvv...
36|..CCccccccd.PpppP.dccxxxcv...
37|..CCccccccd.ppppp.dcxxxxxv...
38|..CCccccccd.ppppp.dccxxxcv...
39|..CCcccccccd.ppp.dcccccccv...
40|..CCcccccccd.ppp.dcccccccv...
41|...Ccccccccd.ppq.dccccccvv...
42|...vcccccccd.....dcccccvvv...
43|....vvvvvvd.......dvvvvvv....
""")  # x18..46
    c.put(VEST, 18, 31)
    # pescoço
    c.put(part("""
|..q...q..
|.qqqqqqq.
"""), 28, 31)


def legs(c):
    thick_line(c, [(28.5, 53), (27.8, 61)], 1.6, ("P", "p", "q"))
    thick_line(c, [(36.5, 53), (37.5, 61)], 1.6, ("P", "p", "q"))
    c.put(part("""
|.ppppq.
|Pppppqq
|.qqqq..
"""), 23, 60)
    c.put(part("""
|.pppq..
|ppppqqq
|..qqqq.
"""), 35, 60)


HAND_UP = part("""
|...P..P.....
|..PP.Pp..P..
|..Pp.Pp.Pp..
|..Pp.Pp.Pp..
|..PppPppPp..
|P.PpppppppP.
|PPPppppppqq.
|.PPppppppq..
|..pppppppq..
|...ppppqq...
|....pppq....
""")


def wave_arm(c, pose):
    """pose: ângulo do antebraço em graus (0 = vertical); gira no cotovelo"""
    sh, el = (23.5, 33.5), (15.5, 41.5)
    a = math.radians(pose)
    L = 11.0
    wr = (el[0] + L * math.sin(a), el[1] - L * math.cos(a))
    thick_line(c, [sh, el], 2.0, ("P", "p", "q"))
    thick_line(c, [el, wr], 1.8, ("P", "p", "q"))
    hx, hy = int(round(wr[0] - 6)), int(round(wr[1] - 10))
    c.put(HAND_UP, hx, hy)


def hip_arm(c):
    thick_line(c, [(40.5, 33.5), (49.5, 40.5)], 2.0, ("P", "p", "q"))
    thick_line(c, [(49.5, 40.5), (45, 45.5)], 1.8, ("P", "p", "q"))
    c.put(part("""
|..ppq.
|.ppppq
|pppqqq
|.pqq..
"""), 41, 43)


# ---------------------------------------------------------------- asas
def wing(c, cx, cy, rx, ry, ang, side):
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    R = int(max(rx, ry)) + 2
    for y in range(int(cy) - R, int(cy) + R + 1):
        for x in range(int(cx) - R, int(cx) + R + 1):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            u, v = dx * ca + dy * sa, -dx * sa + dy * ca
            if (u / rx) ** 2 + (v / ry) ** 2 <= 1 and 0 <= x < W and 0 <= y < H:
                nx, ny = dx / rx, dy / ry
                k = tone(nx, ny, ("A", "a", "s"), 0.35, -0.2)
                # nervura central
                if abs(v) < 0.6 and abs(u) < rx * 0.75:
                    k = "s"
                c.px[y][x] = k


def wings(c, phase, bob):
    # (ângulo, deslocamento) por fase: cima, meio, baixo, meio
    a = [-38, -15, 8, -15][phase]
    dy = [-2, 0, 2, 0][phase]
    ry = [5.0, 4.4, 3.6, 4.4][phase]
    for side in (1, -1):
        bx = 32 + side * 17
        wing(c, bx + side * 4, 31 + dy + bob, 10.5, ry, a * side, side)
        wing(c, bx + side * 1, 38 + bob + dy // 2, 6.5, 2.8, (a * 0.5 + 25) * side, side)


def shift(c, dy):
    if dy == 0:
        return c
    n = Canvas(W, H)
    for y in range(H):
        if 0 <= y - dy < H:
            n.px[y] = list(c.px[y - dy])
    return n


def frame(f):
    wave = [-28, -8, 12, -8, -28, -8, 12, -8][f]
    wphase = [0, 1, 2, 1, 0, 1, 2, 1][f]
    bob = [0, 0, 0, 1, 1, 1, 1, 0][f]
    eyes = {5: "half", 6: "closed"}.get(f, "open")
    antp = 1 if f in (4, 7) else 0

    wl = Canvas(W, H)
    wings(wl, wphase, bob)

    low = Canvas(W, H)        # abdômen e pernas (não respiram)
    body_part = Canvas(W, H)  # tronco, braços e cabeça (sobem e descem 1 px)
    legs(low)
    ab2 = Canvas(W, H)
    body_only_abd(ab2)
    for y in range(H):
        for x in range(W):
            if ab2.px[y][x] != ".":
                low.px[y][x] = ab2.px[y][x]

    up = Canvas(W, H)
    vest(up)
    hip_arm(up)
    wave_arm(up, wave)
    head(up, eyes)
    antennae(up, antp)
    up = shift(up, bob)
    for y in range(H):
        for x in range(W):
            if up.px[y][x] != ".":
                low.px[y][x] = up.px[y][x]
    fill_holes(low, diag=False)
    return wl.rows(), low.rows()


def body_only_abd(c):
    ACX, ACY, ARX, ARY = 32, 47, 13.5, 8.6
    ellipse(c, ACX, ACY, ARX, ARY, ("P", "p", "q"), hi=0.5, lo=-0.35)
    for y in range(36, 58):
        for x in range(W):
            if c.px[y][x] not in "Ppq":
                continue
            dx = (x + 0.5 - ACX) / ARX
            for y0 in (45.0, 50.5):
                yc = y0 + 1.6 * (1 - dx * dx)
                if abs(y + 0.5 - yc) <= 1.5:
                    nx, ny = dx, (y + 0.5 - ACY) / ARY
                    c.px[y][x] = "L" if nx * LX + ny * LY > 0.45 else "l"


def vest(c):
    """colete sem manga: ombros arredondados, abertura central com debrum, aba com canto redondo"""
    x0, x1, y0, y1 = 22, 42, 30, 44
    def inside(x, y):
        X, Y = x + 0.5, y + 0.5
        if not (x0 <= X <= x1 + 1 and y0 <= Y <= y1 + 1):
            return False
        # cantos arredondados: ombro r=5, aba r=4
        for (cx, cy, r) in [(x0 + 5, y0 + 5, 5), (x1 + 1 - 5, y0 + 5, 5), (x0 + 4, y1 + 1 - 4, 4), (x1 + 1 - 4, y1 + 1 - 4, 4)]:
            if (X < cx if cx < 32 else X > cx) and (Y < cy if cy < 38 else Y > cy):
                if (X - cx) ** 2 + (Y - cy) ** 2 > r * r:
                    return False
        return True
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if not inside(x, y):
                continue
            X = x + 0.5
            half = 3.0 + max(0, y - 40) * 0.5     # abertura alarga embaixo
            dxc = abs(X - 32)
            if dxc < half:
                k = "P" if (X < 31 and y < 36) else "q" if y >= 43 or X > 34 else "p"
            elif dxc < half + 1.2:
                k = "d"
            else:
                nx, ny = (X - 32) / 10.5, (y + 0.5 - 36) / 9
                k = tone(nx, ny, ("C", "c", "v"), 0.5, -0.35)
                if y == y1 or (y == y1 - 1 and not inside(x, y + 1)):
                    k = "v"
            c.px[y][x] = k
    # favo (hexágono) no peito direito
    c.put(part("""
|.xx.
|xddx
|.xx.
"""), 38, 35)


if __name__ == "__main__":
    wl, bl = zip(*[frame(f) for f in range(8)])
    durs = [140, 100, 140, 100, 140, 100, 140, 100]
    cmds = commands(W, H, [("asas", list(wl)), ("corpo", list(bl))], durs)
    json.dump(cmds, open(sys.argv[1], "w"), ensure_ascii=False)
    for r in bl[0]:
        print(r)
