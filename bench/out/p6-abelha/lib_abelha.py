"""Biblioteca comum: paleta, compositor de partes ASCII, validador de largura e
gerador de comandos para a CLI do anima-o."""
import json

# chave: (hex, nome). Nomes com -luz/-sombra para o contorno seletivo achar o material base.
PALETTE = [
    ("p", "#F39A34", "pelo"),
    ("P", "#FFC867", "pelo-luz"),
    ("q", "#C65A2A", "pelo-sombra"),
    ("h", "#93421A", "cabelo"),
    ("H", "#C46E36", "cabelo-luz"),
    ("k", "#5A1F1C", "cabelo-sombra"),
    ("c", "#FFCB3D", "colete"),
    ("C", "#FFEC96", "colete-luz"),
    ("v", "#E3912C", "colete-sombra"),
    ("d", "#F2D49B", "debrum"),
    ("l", "#7A2F1B", "listra"),
    ("L", "#A2462A", "listra-luz"),
    ("w", "#FFF6EA", "olho"),
    ("i", "#8A3A22", "iris"),
    ("o", "#2B1214", "pupila"),
    ("b", "#FFFFFF", "brilho"),
    ("m", "#6E1E2A", "boca"),
    ("t", "#FFFFFF", "dente"),
    ("r", "#F7765A", "bochecha"),
    ("a", "#D9ECF7", "asa"),
    ("A", "#FFFFFF", "asa-luz"),
    ("s", "#9DB9D8", "asa-sombra"),
    ("n", "#B4562A", "antena"),
    ("N", "#7A2F1B", "antena-sombra"),
    ("x", "#FFE27A", "favo"),
]
# dente e brilho são o mesmo branco: a engine reaproveita a cor; mantenha só um
PALETTE = [c for c in PALETTE if c[0] != "t"]
ALIAS = {"t": "b"}


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [["." for _ in range(w)] for _ in range(h)]

    def put(self, part, x0, y0, flip=False):
        rows = part.strip("\n").split("\n") if isinstance(part, str) else part
        rows = [r.rstrip("|").split("|")[-1] if "|" in r else r for r in rows]
        width = len(rows[0])
        for r in rows:
            assert len(r) == width, f"largura errada ({len(r)} != {width}): {r!r}"
        for dy, r in enumerate(rows):
            if flip:
                r = r[::-1]
            for dx, ch in enumerate(r):
                if ch in ". ":
                    continue
                if ch == "_":  # apaga
                    ch = "."
                x, y = x0 + dx, y0 + dy
                if 0 <= x < self.w and 0 <= y < self.h:
                    self.px[y][x] = ALIAS.get(ch, ch)

    def rows(self):
        return ["".join(r) for r in self.px]

    def bbox(self):
        ys = [y for y in range(self.h) if any(c != "." for c in self.px[y])]
        xs = [x for x in range(self.w) if any(self.px[y][x] != "." for y in range(self.h))]
        return (min(xs), min(ys), max(xs), max(ys)) if xs else None


def part(s):
    """Converte um bloco ASCII (linhas com prefixo opcional 'NN|') em lista validada."""
    rows = [ln for ln in s.split("\n") if ln.strip()]
    rows = [ln.split("|", 1)[1] if "|" in ln else ln.strip() for ln in rows]
    width = len(rows[0])
    for r in rows:
        assert len(r) == width, f"largura errada ({len(r)} != {width}): {r!r}"
    return rows


NO_OUTLINE = {"antenas"}


def commands(w, h, layers_frames, durations):
    """layers_frames: lista de (nome_camada, [rows por frame]) de baixo para cima."""
    cmds = [{"name": "set_palette", "input": {"colors": [{"key": k, "hex": x, "name": n} for k, x, n in PALETTE]}}]
    nframes = len(layers_frames[0][1])
    # a camada Base vira a primeira
    cmds.append({"name": "update_layer", "input": {"layer": "Base", "name": layers_frames[0][0]}})
    for name, _ in layers_frames[1:]:
        cmds.append({"name": "add_layer", "input": {"name": name, "position": "top"}})
    cmds.append({"name": "add_frames", "input": {"count": nframes - 1}})
    for name, frames in layers_frames:
        for f, rows in enumerate(frames):
            cmds.append({"name": "draw_rows", "input": {"frames": f, "layer": name, "x": 0, "y": 0,
                                                        "rows": rows, "contorno": "nenhum" if name in NO_OUTLINE else "seletivo", "preview": False}})
    cmds.append({"name": "set_frame_timing", "input": {"frames": "all", "duration_ms": durations}})
    return cmds


def fill_holes(canvas, key="k", max_size=2, diag=True):
    """Simula o contorno de 1 px e preenche os furos que sobrariam dentro da silhueta."""
    w, h, px = canvas.w, canvas.h, canvas.px
    filled = lambda x, y: 0 <= x < w and 0 <= y < h and px[y][x] != "."
    nb = [(-1, 0), (1, 0), (0, -1), (0, 1)] + ([(-1, -1), (1, -1), (-1, 1), (1, 1)] if diag else [])
    outline = {(x, y) for y in range(h) for x in range(w) if px[y][x] == "." and any(filled(x + dx, y + dy) for dx, dy in nb)}
    seen = set()
    for y in range(h):
        for x in range(w):
            if px[y][x] != "." or (x, y) in outline or (x, y) in seen:
                continue
            comp, stack, border = [], [(x, y)], False
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nx, ny = cx + dx, cy + dy
                    if not (0 <= nx < w and 0 <= ny < h):
                        border = True
                        continue
                    if px[ny][nx] == "." and (nx, ny) not in outline and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if not border and len(comp) <= max_size:
                for cx, cy in comp:
                    px[cy][cx] = key
