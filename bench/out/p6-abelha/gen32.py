"""Abelha 32x32 — partes desenhadas à mão (ASCII), compostas por frame."""
import json, sys
from lib_abelha import Canvas, part, commands, fill_holes

W = H = 32

# --- cabeça (x7..23, y3..16) ----------------------------------------------
HEAD = part("""
 3|......hhhhhhh......
 4|....hhHHHHhhhhh....
 5|...hHHhhhhhhkhhh...
 6|..hHhhhhhhhkhhhhh..
 7|..hHhPpphhhkhhhhh..
 8|..hHpkkkpphhkkkhh..
 9|.hhpoooopppoooophh.
10|hhHpibowpppibowpkhh
11|hhHpioowpppioowpkhh
12|hhHppiipppppiippkhh
13|.hhrrppmbbbbmrrpkh.
14|.hhkpppppmmmppqkhh.
15|..hhkqpppppqkhhh...
16|...hk...qqq...kh...
""")  # x6..24

def closed_eyes(head, y_head, y_lash):
    """olhos fechados: tira olho/íris/brilho das linhas dos olhos e desenha a pálpebra curva"""
    out = []
    for y, row in enumerate(head):
        if y + y_head < y_lash - 2 or y + y_head > y_lash + 1:
            continue
        r = "".join("p" if ch in "obiw" else ch for ch in row)
        if y + y_head == y_lash:
            orig = head[y_lash - 2 - y_head]  # linha dos cílios
            r = "".join("o" if orig[j] == "o" else r[j] for j in range(len(r)))
        out.append(r)
    return out


EYES_CLOSED = closed_eyes(HEAD, 3, 11)

ANT_UP = part("""
0|.Nn.........nN.
1|N..n.......n..N
2|....n.....n....
3|.....n...n.....
4|.....n...n.....
""")  # x8..22
ANT_DOWN = part("""
0|...............
1|..nn.......nn..
2|.n..n.....n..n.
3|.N...n...n...N.
4|.....n...n.....
""")

VEST = part("""
16|..Ccd...dcv..
17|.CCcdpPpdxcv.
18|.Cccdpppdccv.
19|.Cccdpppdccv.
20|..vcd...dcv..
""")  # x9..21

ABD = part("""
19|.....ppppp.....
20|...PPppppppq...
21|..PPppppppppq..
22|.LLlllllllllll.
23|PPppppppppppqqq
24|PLLllllllllllkq
25|.Ppppppppppppq.
26|...qqpppppqq...
""")  # x8..22

LEGS = part("""
27|.pq...pq.
28|.pq...pq.
29|.pq...pq.
30|ppq...pqq
""")  # x11..19

# braço que acena (x0..10, y10..19): três poses do antebraço girando no cotovelo
ARM_A = part("""
10|.P.P.......
11|.pPpP......
12|.pppq......
13|..ppq......
14|..pq.......
15|...pq......
16|...pq......
17|...pq...pp.
18|....pq.pq..
19|....qqpq...
""")
ARM_B = part("""
10|...P.P.....
11|...pPpP....
12|...pppq....
13|....pq.....
14|....pq.....
15|....pq.....
16|....pq.....
17|....pq..pp.
18|....pq.pq..
19|....qqpq...
""")
ARM_C = part("""
10|.....P.P...
11|.....pPpP..
12|.....pppq..
13|.....pq....
14|.....pq....
15|....pq.....
16|....pq.....
17|....pq..pp.
18|....pq.pq..
19|....qqpq...
""")
ARM_HIP = part("""
17|pq.....
18|.ppq...
19|...ppq.
20|...pq..
21|.ppq...
22|pq.....
""")  # x21..27

WING_UP = part("""
 9|.......aA.
10|.....aAAa.
11|....aAaas.
12|...aAaass.
13|..aaaass..
14|.aaass....
15|asss......
""")  # lado direito, x20..29
WING_MID = part("""
12|......aAAa.
13|...aaAAaas.
14|.aaAaaasss.
15|aaaasss....
16|.ass.......
""")
WING_DOWN = part("""
14|...aaa....
15|.aaAaaa...
16|aaAaass...
17|.aasss....
""")


def at(rows, x, y0, dy=0):
    """rows com prefixo de y já removido: devolve (rows, x, y)"""
    return rows, x, y0 + dy


def frame(f):
    wave = ["A", "B", "C", "B", "A", "B", "C", "B"][f]
    wing = ["up", "mid", "down", "mid", "up", "mid", "down", "mid"][f]
    bob = [0, 0, 0, 1, 1, 1, 1, 0][f]          # respiração: tronco e cabeça descem 1 px
    antb = [0, 0, 0, 0, 1, 1, 1, 1][f]          # antena atrasada 1 frame (follow-through)
    blink = f == 5

    wings = Canvas(W, H)
    wr = {"up": WING_UP, "mid": WING_MID, "down": WING_DOWN}[wing]
    wy = {"up": 9, "mid": 12, "down": 14}[wing] + bob
    wings.put(wr, 21, wy)
    wings.put(wr, 1, wy, flip=True)

    c = Canvas(W, H)
    c.put(ABD, 8, 19)
    c.put(LEGS, 11, 27)
    c.put(VEST, 9, 16 + bob)
    c.put(ARM_HIP, 21, 17 + bob)
    arm = {"A": ARM_A, "B": ARM_B, "C": ARM_C}[wave]
    c.put(arm, 0, 10 + bob)
    c.put(HEAD, 6, 3 + bob)
    if blink:
        c.put(EYES_CLOSED, 6, 9 + bob)
    fill_holes(c, diag=False)
    ant = Canvas(W, H)
    ant.put(ANT_DOWN if f in (4, 7) else ANT_UP, 8, 0 + bob)
    return wings.rows(), c.rows(), ant.rows()


if __name__ == "__main__":
    wings, body, ant = zip(*[frame(f) for f in range(8)])
    durs = [140, 100, 140, 100, 140, 100, 140, 100]
    cmds = commands(W, H, [("asas", list(wings)), ("corpo", list(body)), ("antenas", list(ant))], durs)
    json.dump(cmds, open(sys.argv[1], "w"), ensure_ascii=False)
    for r in body[0]:
        print(r)
