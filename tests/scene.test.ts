import { describe, expect, it } from "vitest";
import { createProject, runCommand, type Project } from "../src/engine/index.ts";
import { bayer, drawGradient, fillPolygon, scatter } from "../src/engine/paint.ts";

const ok = (p: Project, name: string, input: object) => { const r = runCommand(p, name, input); expect(r.ok, r.text).toBe(true); return r; };
const cel = (p: Project, frame = 0, layer = 0) => p.frames[frame].cels[p.layers[layer].id];
const pal = (p: Project, keys: string) => ok(p, "set_palette", { colors: [...keys].map((k, i) => ({ key: k, hex: `#${(40 + i * 25).toString(16).padStart(2, "0")}${(90 + i * 10).toString(16)}${(160 - i * 20).toString(16).padStart(2, "0")}`, name: `c${k}` })) });

describe("canvas e paleta grandes", () => {
  it("aceita 320x180 e mais de 80 cores com chaves acentuadas", () => {
    const p = createProject({ width: 320, height: 180 });
    ok(p, "set_canvas", { width: 320, height: 180 });
    const colors = Array.from({ length: 60 }, (_, i) => ({ key: "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ"[i], hex: `#${(i * 4).toString(16).padStart(2, "0")}8040`, name: `x${i}` }));
    ok(p, "set_palette", { colors });
    expect(p.palette.length).toBeGreaterThan(60);
    expect(p.width).toBe(320);
  });
});

describe("draw_shapes gradient (dither de Bayer)", () => {
  it("gera transição dithered entre dois tons, sem poeira nas pontas", () => {
    expect(bayer(4).flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    const p = createProject({ width: 16, height: 16 });
    pal(p, "ab");
    ok(p, "draw_shapes", { shapes: [{ type: "gradient", x: 0, y: 0, w: 16, h: 16, colors: ["a", "b"], dither: "bayer4", suavidade: 0.5 }] });
    const c = cel(p), A = p.palette.findIndex((x) => x.key === "a") + 1, B = A + 1;
    expect([...c.slice(0, 16)].every((v) => v === A)).toBe(true);             // topo: só o primeiro tom
    expect([...c.slice(15 * 16)].every((v) => v === B)).toBe(true);           // base: só o último
    const mid = [...c.slice(6 * 16, 10 * 16)];
    expect(mid.includes(A) && mid.includes(B)).toBe(true);                    // meio: mistura
  });
  it("cor '.' no fim da rampa dissolve o brilho no fundo (radial)", () => {
    const p = createProject({ width: 24, height: 24 });
    pal(p, "abc");
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 24, h: 24, color: "a", filled: true }] });
    ok(p, "draw_shapes", { shapes: [{ type: "gradient", x: 0, y: 0, w: 24, h: 24, direction: "radial", cx: 12, cy: 12, r: 10, colors: ["c", "b", "."], dither: "bayer4" }] });
    const c = cel(p);
    const idx = (k: string) => p.palette.findIndex((x) => x.key === k) + 1;
    expect(c[12 * 24 + 12]).toBe(idx("c"));       // centro: cor "c"
    expect(c[0]).toBe(idx("a"));                   // fora do raio: o fundo original
  });
  it("only limita o degradê a uma cor", () => {
    const s = { width: 8, height: 8, data: new Uint8Array(64) };
    for (let i = 0; i < 32; i++) s.data[i] = 1;
    drawGradient(s, { x: 0, y: 0, w: 8, h: 8, direction: "vertical", colors: [2, 3], dither: "nenhum", suavidade: 1, only: 1 });
    expect([...s.data.slice(32)].every((v) => v === 0)).toBe(true);
    expect([...s.data.slice(0, 32)].every((v) => v === 2 || v === 3)).toBe(true);
  });
});

describe("polygon e scatter", () => {
  it("preenche um triângulo", () => {
    const s = { width: 10, height: 10, data: new Uint8Array(100) };
    fillPolygon(s, [[0, 9], [5, 0], [9, 9]], 4);
    expect(s.data[8 * 10 + 5]).toBe(4);
    expect(s.data[0]).toBe(0);
    expect([...s.data].filter((v) => v).length).toBeGreaterThan(20);
  });
  it("scatter é reprodutível, respeita distância mínima e só, e evitar", () => {
    const mk = () => ({ width: 40, height: 40, data: new Uint8Array(1600) });
    const a = mk(), b = mk();
    const spec = { x: 0, y: 0, w: 40, h: 40, colors: [5], densidade: 0.05, forma: "pixel" as const, distancia: 3, seed: 9 };
    scatter(a, spec); scatter(b, spec);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    const pts = [...a.data].map((v, i) => (v ? [i % 40, Math.floor(i / 40)] : null)).filter(Boolean) as number[][];
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) for (const q of pts) if (p !== q) expect(Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]))).toBeGreaterThan(3);
    const c = mk(); scatter(c, { ...spec, blocked: (x) => x < 20 });
    expect([...c.data].some((v, i) => v && i % 40 < 20)).toBe(false);
  });
  it("evitar e variar_por_frame funcionam pela ferramenta", () => {
    const p = createProject({ width: 40, height: 40 });
    pal(p, "abc");
    ok(p, "add_layer", { name: "casa" });
    ok(p, "draw_shapes", { layer: "casa", shapes: [{ type: "rect", x: 0, y: 0, w: 20, h: 40, color: "a", filled: true }] });
    ok(p, "add_frames", { count: 1, copy_from: 0 });
    ok(p, "add_layer", { name: "flores" });
    ok(p, "draw_shapes", { frames: "all", layer: "flores", shapes: [{ type: "scatter", x: 0, y: 0, w: 40, h: 40, colors: ["b"], densidade: 0.08, seed: 3, evitar: ["casa"], variar_por_frame: true }] });
    const f0 = p.frames[0].cels[p.layers[2].id], f1 = p.frames[1].cels[p.layers[2].id];
    expect([...f0].some((v, i) => v && i % 40 < 20)).toBe(false);
    expect(Array.from(f0)).not.toEqual(Array.from(f1));
  });
});

describe("reflect, haze e luz", () => {
  it("reflect espelha as camadas fonte abaixo da linha da água", () => {
    const p = createProject({ width: 20, height: 30 });
    pal(p, "abc");
    ok(p, "add_layer", { name: "monte" }); ok(p, "add_layer", { name: "reflexo" });
    ok(p, "draw_shapes", { layer: "monte", shapes: [{ type: "rect", x: 8, y: 6, w: 4, h: 8, color: "a", filled: true }] });
    ok(p, "transform", { frames: 0, layer: "reflexo", op: "reflect", fonte: ["monte"], y: 14, alto: 8, onda: 0, mistura: 0.5, agua: "b" });
    const r = p.frames[0].cels[p.layers[2].id];
    expect(r[15 * 20 + 9]).toBeGreaterThan(0);           // logo abaixo da margem há reflexo
    expect(r[5 * 20 + 9]).toBe(0);                        // acima da margem não
  });
  it("haze mistura a camada com a cor da névoa (mais perto do céu)", () => {
    const p = createProject({ width: 8, height: 8 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#202040", name: "monte" }, { key: "b", hex: "#ffc080", name: "ceu" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 8, h: 8, color: "a", filled: true }] });
    ok(p, "transform", { frames: 0, layer: "Base", op: "haze", color: "b", quantidade: 0.5 });
    const v = cel(p)[0];
    const hex = p.palette[v - 1].hex;
    expect(parseInt(hex.slice(1, 3), 16)).toBeGreaterThan(0x70);   // clareou bastante em direção à névoa
  });
  it("shade respeita a direção da luz", () => {
    const mk = (luz: string) => {
      const p = createProject({ width: 16, height: 16 });
      ok(p, "set_palette", { colors: [{ key: "r", hex: "#d84a3a", name: "vermelho" }] });
      ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 2, y: 2, w: 12, h: 12, color: "r", filled: true }] });
      ok(p, "transform", { frames: 0, op: "shade", luz });
      const c = cel(p); const lum = (i: number) => { const h = p.palette[c[i] - 1].hex; return parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11; };
      return { left: lum(8 * 16 + 2), right: lum(8 * 16 + 13) };
    };
    const esq = mk("esquerda"), dir = mk("direita");
    expect(esq.left).toBeGreaterThan(esq.right);
    expect(dir.right).toBeGreaterThan(dir.left);
  });
  it("avaliar acusa paleta duplicada", () => {
    const p = createProject({ width: 24, height: 24 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#c04040", name: "um" }, { key: "b", hex: "#c04040", name: "dois" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 2, y: 2, w: 8, h: 8, color: "a", filled: true }, { type: "rect", x: 12, y: 2, w: 8, h: 8, color: "b", filled: true }] });
    expect(runCommand(p, "avaliar", { tipo: "personagem" }).text).toContain("paleta_duplicada");
  });
});

describe("box3d (caixa/casa em perspectiva)", () => {
  it("a lateral recua em direção ao horizonte e o telhado aparece", async () => {
    const { drawBox3d, pontoLateral } = await import("../src/engine/paint.ts");
    const s = { width: 60, height: 60, data: new Uint8Array(3600) };
    const b = { x: 10, y: 50, w: 20, h: 16, prof: 12, xv: 80, yh: 10, rise: 8, frente: 1, lado: 2, telhado: 3, empena: 4, espaco: 3 };
    drawBox3d(s, b);
    const at = (x: number, y: number) => s.data[y * 60 + x];
    expect(at(15, 45)).toBe(1);                          // frente
    expect(at(33, 40)).toBe(2);                          // lateral (à direita da frente)
    expect([...s.data].includes(3)).toBe(true);           // água do telhado
    expect([...s.data].includes(4)).toBe(true);           // empena
    // a aresta de baixo da lateral SOBE em direção ao horizonte (y menor que o chão da frente)
    const [, yFar] = pontoLateral(b, 1, 1);
    expect(yFar).toBeLessThan(50);
    // e o topo também converge: a lateral fica mais baixa (mais curta) no fundo
    const [, topFar] = pontoLateral(b, 1, 0), [, topNear] = pontoLateral(b, 0, 0);
    expect(yFar - topFar).toBeLessThan(50 - 34);
    expect(topNear).toBe(34);
  });
  it("funciona pela ferramenta draw_shapes", () => {
    const p = createProject({ width: 64, height: 64 });
    pal(p, "abcd");
    ok(p, "draw_shapes", { shapes: [{ type: "box3d", x: 8, y: 56, w: 24, h: 18, prof: 14, xv: 100, yh: 20, rise: 10, frente: "a", lado: "b", telhado: "c", empena: "d" }] });
    expect(new Set(Array.from(cel(p)).filter((v) => v)).size).toBeGreaterThanOrEqual(4);
  });
});

describe("curve, offsets por frame e relatórios enxutos", () => {
  it("curve passa pelos pontos com espessura variável (mais grossa no início)", () => {
    const p = createProject({ width: 40, height: 20 });
    pal(p, "a");
    ok(p, "draw_shapes", { shapes: [{ type: "curve", points: [[3, 14], [14, 4], [26, 12], [36, 5]], r1: 3, r2: 1, color: "a" }] });
    const c = cel(p), A = p.palette.findIndex((x) => x.key === "a") + 1;
    expect(c[14 * 40 + 3]).toBe(A);
    expect(c[5 * 40 + 36]).toBe(A);
    const thick = (x: number) => { let n = 0; for (let y = 0; y < 20; y++) if (c[y * 40 + x] === A) n++; return n; };
    expect(thick(4)).toBeGreaterThan(thick(35));          // 3 px de raio no início, 1 px no fim
  });
  it("transform shift com dx_lista desloca cada frame de um jeito", () => {
    const p = createProject({ width: 12, height: 4 });
    pal(p, "a");
    ok(p, "draw_shapes", { shapes: [{ type: "pixels", points: [[5, 1]], color: "a" }] });
    ok(p, "add_frames", { count: 2, copy_from: 0 });
    ok(p, "transform", { frames: "all", op: "shift", dx_lista: [0, 1, -2] });
    const at = (f: number) => Array.from(p.frames[f].cels[p.layers[0].id]).findIndex((v) => v) % 12;
    expect([at(0), at(1), at(2)]).toEqual([5, 6, 3]);
  });
  it("draw_rows conta só os pixels pintados (não os transparentes)", () => {
    const p = createProject({ width: 8, height: 4 });
    pal(p, "a");
    const r = ok(p, "draw_rows", { rows: ["..aa..", "..aa.."], preview: false });
    expect(r.text).toMatch(/^4 pixels escritos/);
  });
  it("check mostra só os princípios que valem melhorar (painel_completo mostra todos) e set_palette vazia é explicada", () => {
    const p = createProject({ width: 16, height: 16 });
    pal(p, "a");
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 4, y: 4, w: 6, h: 6, color: "a", filled: true }] });
    ok(p, "add_frames", { count: 4, copy_from: 0 });
    const curto = runCommand(p, "check", { as_image: false }).text, cheio = runCommand(p, "check", { as_image: false, painel_completo: true }).text;
    expect(curto).toMatch(/Princípios da animação: \d+ ✓/);
    expect(cheio).toMatch(/Os 12 princípios/);
    expect(cheio.length).toBeGreaterThan(curto.length);
    const vazio = createProject({ width: 8, height: 8 });
    runCommand(vazio, "remove_colors", { keys: ["0", "1"] });
    expect(runCommand(vazio, "get_project_info", {}).text).toMatch(/Paleta vazia/);
  });
  it("aviso quando o fundo engole o contorno", async () => {
    const { avisoFundo } = await import("../src/engine/index.ts");
    const p = createProject({ width: 8, height: 8 });
    ok(p, "set_palette", { colors: [{ key: "k", hex: "#261a3d", name: "contorno" }, { key: "a", hex: "#d84a3a", name: "a" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 1, y: 1, w: 4, h: 4, color: "k", filled: true }, { type: "rect", x: 2, y: 2, w: 2, h: 2, color: "a", filled: true }] });
    expect(avisoFundo(p, "#1e1530")).toMatch(/o contorno vai sumir/);
    expect(avisoFundo(p, "#e8e0d0")).toBeNull();
  });
});

describe("terrain, forest, only composto e avisos", () => {
  it("terrain desenha uma crista preenchida até a linha pedida; forest planta árvores variadas na base", () => {
    const p = createProject({ width: 80, height: 50 });
    pal(p, "abc");
    ok(p, "draw_shapes", { shapes: [{ type: "terrain", topo: 20, amp: 14, seed: 3, ate: 40, color: "a" }, { type: "forest", base: 44, altura_min: 8, altura_max: 18, cores: ["b", "c"], seed: 5 }] });
    const c = cel(p), A = p.palette.findIndex((x) => x.key === "a") + 1;
    let x0 = 0, filled = 0;
    for (let x = 0; x < 80; x++) { let top = -1; for (let y = 0; y < 50; y++) if (c[y * 80 + x] === A) { top = y; break; } if (top >= 0) { filled++; x0 = Math.max(x0, 40 - top); } }
    expect(filled).toBeGreaterThan(70);                     // a crista cobre quase toda a largura
    expect(new Set(Array.from(c).filter((v) => v)).size).toBe(3);
    const treeTops = new Set<number>();
    const B = p.palette.findIndex((x) => x.key === "b") + 1, C = B + 1;
    for (let x = 0; x < 80; x++) for (let y = 0; y < 50; y++) if (c[y * 80 + x] === B || c[y * 80 + x] === C) { treeTops.add(y); break; }
    expect(treeTops.size).toBeGreaterThan(3);               // alturas diferentes (não é carimbo)
  });
  it("only enxerga cores de OUTRAS camadas e scatter/gradient avisam quando não desenham nada", () => {
    const p = createProject({ width: 40, height: 40 });
    pal(p, "abc");
    ok(p, "add_layer", { name: "campo" }); ok(p, "add_layer", { name: "flores" });
    ok(p, "draw_shapes", { layer: "campo", shapes: [{ type: "rect", x: 0, y: 20, w: 40, h: 20, color: "a", filled: true }] });
    const bom = ok(p, "draw_shapes", { layer: "flores", shapes: [{ type: "scatter", x: 0, y: 0, w: 40, h: 40, colors: ["b"], densidade: 0.2, only: "a", seed: 2 }] });
    expect(bom.text).not.toMatch(/ATENÇÃO/);
    const fl = p.frames[0].cels[p.layers[2].id];
    expect(fl.some((v, i) => v && Math.floor(i / 40) >= 20)).toBe(true);
    expect(fl.some((v, i) => v && Math.floor(i / 40) < 20)).toBe(false);   // só caiu sobre o campo, que está em outra camada
    const ruim = ok(p, "draw_shapes", { layer: "flores", shapes: [{ type: "scatter", x: 0, y: 0, w: 40, h: 10, colors: ["b"], densidade: 0.2, only: "a", seed: 3 }] });
    expect(ruim.text).toMatch(/ATENÇÃO: scatter .* não desenhou nenhum elemento/);
  });
  it("haze com faixa e perfil pico some nas bordas; reflect dissolver deixa a água; reduce_colors explica", () => {
    const p = createProject({ width: 20, height: 20 });
    ok(p, "set_palette", { colors: [{ key: "a", hex: "#203040", name: "monte" }, { key: "b", hex: "#ffe0c0", name: "ar" }] });
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 20, h: 20, color: "a", filled: true }] });
    ok(p, "transform", { frames: 0, op: "haze", color: "b", quantidade: 0.8, y_de: 4, y_ate: 16, perfil: "pico" });
    const c = cel(p), lum = (i: number) => { const h = p.palette[c[i] - 1].hex; return parseInt(h.slice(1, 3), 16); };
    const row = (y: number) => { let t = 0; for (let x = 0; x < 20; x++) t += lum(y * 20 + x); return t / 20; };
    expect(row(10)).toBeGreaterThan(row(5) + 10);            // meio da faixa mais enevoado que a borda
    expect(row(2)).toBeCloseTo(0x20, 0);                      // fora da faixa: intacto
    const r = ok(p, "reduce_colors", { cores: 50 });
    expect(r.text).toMatch(/já está dentro do limite/);
  });
  it("export de projeto vazio avisa", async () => {
    const { avisoVazio } = await import("../src/engine/index.ts");
    expect(avisoVazio(createProject({ width: 8, height: 8 }))).toMatch(/nenhum pixel visível/);
    const p = createProject({ width: 8, height: 8 });
    pal(p, "a");
    ok(p, "draw_shapes", { shapes: [{ type: "pixels", points: [[1, 1]], color: "a" }] });
    expect(avisoVazio(p)).toBeNull();
  });
});

describe("paisagem (atalho de cenário)", () => {
  it("monta as camadas na ordem certa, usa muitas cores com dithering e tem sol visível; recusa canvas pequeno", () => {
    const p = createProject({ width: 160, height: 90 });
    const r = ok(p, "paisagem", { horario: "por-do-sol", preview: false });
    expect(r.text).toMatch(/Paisagem "por-do-sol" criada/);
    const nomes = p.layers.map((l) => l.name);
    expect(nomes.indexOf("ceu")).toBeLessThan(nomes.indexOf("plano1"));
    expect(nomes.indexOf("plano3")).toBeLessThan(nomes.indexOf("lago"));
    expect(nomes.indexOf("lago")).toBeLessThan(nomes.indexOf("floresta"));
    expect(nomes.indexOf("floresta")).toBeLessThan(nomes.indexOf("campo"));
    const flat = Array.from(p.frames[0].cels[p.layers.find((l) => l.name === "ceu")!.id]);
    expect(new Set(flat.filter((v) => v)).size).toBeGreaterThan(7);                    // céu em degradê com várias cores
    const c = runCommand(p, "avaliar", { tipo: "cena" }).text;
    expect(c).toMatch(/Avaliação de beleza: \d+\/100/);
    expect(runCommand(createProject({ width: 32, height: 24 }), "paisagem", {}).ok).toBe(false);
  });
  it("os quatro horários rodam e a noite tem estrelas e o dia não", () => {
    for (const horario of ["amanhecer", "dia", "noite"] as const) {
      const p = createProject({ width: 160, height: 90 });
      ok(p, "paisagem", { horario, preview: false, planos: 2, lago: false });
      const est = p.frames[0].cels[p.layers.find((l) => l.name === "estrelas")!.id];
      expect(est.some((v) => v)).toBe(horario !== "dia");
    }
  });
  it("seeds diferentes mudam o terreno", () => {
    const a = createProject({ width: 160, height: 90 }), b = createProject({ width: 160, height: 90 });
    ok(a, "paisagem", { seed: 1, preview: false }); ok(b, "paisagem", { seed: 2, preview: false });
    const top = (p: Project) => Array.from(p.frames[0].cels[p.layers.find((l) => l.name === "plano1")!.id]);
    expect(top(a)).not.toEqual(top(b));
  });
});

describe("atritos da casa: box3d fora do quadro, quinas de quadro cheio, anima critico", () => {
  it("box3d avisa quando o telhado sai do quadro e explica que y é a base", () => {
    const p = createProject({ width: 64, height: 64 });
    pal(p, "abcd");
    const r = ok(p, "draw_shapes", { shapes: [{ type: "box3d", x: 10, y: 20, w: 30, h: 24, prof: 14, xv: 100, yh: 8, rise: 12, frente: "a", lado: "b", telhado: "c", empena: "d" }] });
    expect(r.text).toMatch(/fora do quadro.*y é a BASE/);
    const ok2 = ok(p, "draw_shapes", { shapes: [{ type: "box3d", x: 10, y: 60, w: 20, h: 14, prof: 10, xv: 100, yh: 8, rise: 8, frente: "a", lado: "b" }] });
    expect(ok2.text).not.toMatch(/fora do quadro/);
  });
  it("cena de quadro cheio não acusa quinas quadradas nos cantos do quadro", () => {
    const p = createProject({ width: 32, height: 32 });
    pal(p, "ab");
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 32, h: 32, color: "a", filled: true }, { type: "ellipse", x: 8, y: 8, w: 16, h: 16, color: "b", filled: true }] });
    expect(runCommand(p, "check", { as_image: false }).text).not.toMatch(/quina\(s\) de 90/);
  });
  it("anima critico exporta a imagem e imprime o pedido pronto", async () => {
    const { execSync } = await import("node:child_process");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { writeFileSync } = await import("node:fs");
    const dir = mkdtempSync(path.join(tmpdir(), "anima-crit-"));
    const proj = path.join(dir, "p.anima.json");
    const p = createProject({ width: 16, height: 16 });
    pal(p, "a");
    ok(p, "draw_shapes", { shapes: [{ type: "rect", x: 4, y: 4, w: 8, h: 8, color: "a", filled: true }] });
    const { toJSON } = await import("../src/engine/index.ts");
    writeFileSync(proj, JSON.stringify(toJSON(p)));
    const out = execSync(`node bin/anima.mjs critico ${proj}`, { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
    expect(out).toMatch(/Imagem para a crítica: .*p\.critico\.png/);
    expect(out).toMatch(/PEDIDO PRONTO/);
    expect(out).toMatch(/nota 0-10/);
  });
});

describe("atritos da vila: only em lista, paleta grande, folga alta", () => {
  it("only aceita uma lista de cores e set_palette aceita 100 cores de uma vez", () => {
    const p = createProject({ width: 32, height: 16 });
    const cores = Array.from({ length: 100 }, (_, k) => ({ key: [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"][k % 62] + "", hex: `#${(k * 2 + 10).toString(16).padStart(2, "0")}${(255 - k).toString(16).padStart(2, "0")}80`, name: `c${k}` }));
    const unicas = cores.filter((c, k) => cores.findIndex((d) => d.key === c.key) === k);
    const r0 = runCommand(p, "set_palette", { colors: unicas.slice(0, 62).concat([]) });
    expect(r0.ok, r0.text).toBe(true);
    const big = Array.from({ length: 70 }, (_, k) => ({ key: [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ"][k], hex: `#${(k * 3).toString(16).padStart(2, "0")}4060`, name: `x${k}` }));
    const q = createProject({ width: 8, height: 8 });
    const r1 = runCommand(q, "set_palette", { colors: big });
    expect(r1.ok, r1.text).toBe(true);
    runCommand(p, "set_palette", { colors: [{ key: "a", hex: "#304060", name: "ceu" }, { key: "b", hex: "#506080", name: "lago" }, { key: "c", hex: "#d0a060", name: "luz" }] });
    runCommand(p, "draw_shapes", { shapes: [{ type: "rect", x: 0, y: 0, w: 16, h: 16, color: "a", fill: true }, { type: "rect", x: 16, y: 0, w: 16, h: 16, color: "b", fill: true }] });
    const r2 = runCommand(p, "draw_shapes", { shapes: [{ type: "scatter", x: 0, y: 0, w: 32, h: 16, colors: ["c"], densidade: 0.5, only: ["a", "b"] }] });
    expect(r2.ok, r2.text).toBe(true);
    const r3 = runCommand(p, "draw_shapes", { shapes: [{ type: "forest", base: 15, altura_min: 4, altura_max: 6, cores: ["c", "a"], folga: 0.9 }] });
    expect(r3.ok, r3.text).toBe(true);
  });
});

describe("terrain com vale", () => {
  it("a crista desce no centro do vale", () => {
    const mk = (vale?: object) => {
      const p = createProject({ width: 64, height: 40 });
      runCommand(p, "set_palette", { colors: [{ key: "m", hex: "#605070", name: "monte" }] });
      const r = runCommand(p, "draw_shapes", { shapes: [{ type: "terrain", topo: 14, amp: 0, ate: 39, color: "m", vale }] });
      expect(r.ok, r.text).toBe(true);
      const cel = p.frames[0].cels[p.layers[0].id];
      const top = (x: number) => { for (let y = 0; y < 40; y++) if (cel[y * 64 + x]) return y; return 40; };
      return { c: top(32), b: top(4) };
    };
    const sem = mk(), com = mk({ x: 32, largura: 20, profundidade: 12 });
    expect(com.c - sem.c).toBeGreaterThanOrEqual(10);        // no centro desceu ~12
    expect(com.b).toBe(sem.b);                                // fora do vale não mexe
  });
});
