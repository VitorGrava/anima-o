"""Abelha 32x32 — partes desenhadas à mão (ASCII), compostas por frame."""
import json, sys
from lib_abelha import Canvas, part, commands

W = H = 32

# --- cabeça (x7..23, y4..16) ----------------------------------------------
HEAD = part("""
 4|....hhHHHhhhh....
 5|..hhHHHhhhhhhhh..
 6|.hhHHhhhhhkhhhhh.
 7|hHhhhhhkhhhhhhhhh
 8|hHhPPphhhkhhhhhhh
 9|hHkpkkkpphkkkpkhh
10|hHkpoooopoooopkhh
11|hHkpbowwpbowwpkhh
12|hHkpiiwwpiiwwpkhh
13|hhkrrpmtttmprrkhh
14|hhhkpppmmmppqkhhh
15|hhhhkqpppppqkhhhh
16|.hhhk..qqq..khhh.
""")
EYES_CLOSED = part("""
11|hHkpppppppppppkhh
12|hHkpooopppooopkhh
""")

ANT_UP = part("""
1|.NN.........NN.
2|..Nn......nN...
3|....n....n.....
""")  # x6..20
ANT_DOWN = part("""
1|...............
2|.NNn......nNN..
3|....n....n.....
""")

VEST = part("""
16|.Ccd...dcv.
17|CccdpPpdxcv
18|Cccdpppdccv
19|.vcdpppdcv.
""")  # x10..20

ABD = part("""
19|...ppppppp...
20|.Pppppppppqq.
21|Pppppppppppqq
22|Llllllllllllk
23|Ppppppppppppq
24|.Llllllllllk.
25|.qpppppppppq.
26|...qqqqqqq...
""")  # x9..21

LEGS = part("""
27|.pq..pq.
28|.pq..pq.
29|.pq..pq.
30|ppq..pqq
""")  # x11..18

# braço que acena (x2..10, y11..18): três poses do antebraço girando no cotovelo
ARM_A = part("""
11|.P.P.....
12|PpPp.....
13|.pppq....
14|..ppq....
15|...pq....
16|....pq...
17|....pq.pp
18|.....qqpq
""")
ARM_B = part("""
11|...P.P...
12|..pPpP...
13|..pppq...
14|...ppq...
15|....pq...
16|....pq...
17|....pq.pp
18|....qqqpq
""")
ARM_C = part("""
11|.....P.P.
12|....PpPp.
13|....pppq.
14|....ppq..
15|....pq...
16|....pq...
17|....pq.pp
18|....qqqpq
""")
ARM_HIP = part("""
16|pq...
17|.pq..
18|..pq.
19|...pq
20|..pq.
21|.pq..
""")  # x20..24

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
    wings.put(wr, 20, wy)
    wings.put(wr, 1, wy, flip=True)

    c = Canvas(W, H)
    c.put(ABD, 9, 19)
    c.put(LEGS, 11, 27)
    c.put(VEST, 10, 16 + bob)
    c.put(ARM_HIP, 20, 16 + bob)
    arm = {"A": ARM_A, "B": ARM_B, "C": ARM_C}[wave]
    c.put(arm, 2, 11 + bob)
    c.put(ANT_DOWN if f in (4, 7) else ANT_UP, 6, 1 + bob)
    c.put(HEAD, 7, 4 + bob)
    if blink:
        c.put(EYES_CLOSED, 7, 11 + bob)
    return wings.rows(), c.rows()


if __name__ == "__main__":
    wings, body = zip(*[frame(f) for f in range(8)])
    durs = [140, 100, 140, 100, 140, 100, 140, 100]
    cmds = commands(W, H, [("asas", list(wings)), ("corpo", list(body))], durs)
    json.dump(cmds, open(sys.argv[1], "w"), ensure_ascii=False)
    for r in body[0]:
        print(r)
