// Rasterizador simples em JS (cenas 09–12): desenha num buffer de chaves de paleta e devolve linhas para draw_rows.
// Permite cenário MAIOR que o canvas (tilt/pan): desenha o mundo e recorta a janela da câmera por quadro.
import { PESSOA_PALETA } from "../lib/comum.mjs";

const EXTRA = [...Array(0xff - 0xc0 + 1)].map((_, i) => String.fromCharCode(0xc0 + i)).filter((c) => c !== "\u00d7" && c !== "\u00f7").join("");
const POOL = "0abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" + EXTRA;
export class Paleta {
  constructor() { this.cores = [...PESSOA_PALETA]; this.livres = [...POOL]; this.porHex = {}; }
  c(hex, name) {
    hex = hex.toLowerCase();
    if (this.porHex[hex]) return this.porHex[hex];
    const key = this.livres.shift();
    if (!key) throw new Error("paleta cheia");
    this.cores.push({ key, hex, name: name ?? "c" + key });
    return (this.porHex[hex] = key);
  }
  cmd() { return { name: "set_palette", input: { colors: this.cores } }; }
}

const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
export const bayer = (x, y) => (B4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16;
/** limiar com zona de dither estreita (s = largura da transição): evita área grande em xadrez */
export const passo = (f, x, y, s = 0.3) => Math.min(1, Math.max(0, (f - 0.5) / s + 0.5)) > bayer(x, y);

export class Tela {
  constructor(w, h, ox = 0, oy = 0) { this.w = w; this.h = h; this.ox = ox; this.oy = oy; this.d = new Array(w * h).fill(null); }
  // coordenadas de MUNDO: (x - ox, y - oy) no buffer
  set(x, y, k) { x = Math.round(x) - this.ox; y = Math.round(y) - this.oy; if (k == null || x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[y * this.w + x] = k; }
  get(x, y) { x -= this.ox; y -= this.oy; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null; return this.d[y * this.w + x]; }
  rect(x, y, w, h, k) { for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) this.set(i, j, k); }
  hline(x1, x2, y, k) { for (let i = Math.round(x1); i <= Math.round(x2); i++) this.set(i, y, k); }
  vline(x, y1, y2, k) { for (let j = Math.round(y1); j <= Math.round(y2); j++) this.set(x, j, k); }
  line(x1, y1, x2, y2, k) {
    const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let i = 0; i <= n; i++) this.set(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, k);
  }
  /** polígono preenchido (regra par-ímpar, centro dos pixels) */
  poly(pts, k, fn) {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.set(x, y, fn ? fn(x, y) : k);
    }
  }
  ellipse(cx, cy, rx, ry, k, fn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, fn ? fn(x, y) : k);
      }
  }
  /** degradê vertical com dither de Bayer entre tons (t de 0..1 ao longo de h) */
  gradV(x, y, w, h, keys, fn) {
    for (let j = 0; j < h; j++) {
      const t = (j / Math.max(1, h - 1)) * (keys.length - 1);
      for (let i = 0; i < w; i++) {
        const a = Math.floor(t), f = t - a;
        const k = keys[Math.min(keys.length - 1, a + (passo(f, x + i, y + j) ? 1 : 0))];
        if (!fn || fn(x + i, y + j)) this.set(x + i, y + j, k);
      }
    }
  }
  /** carimba linhas (" " e "." preservam) — ex.: pessoa() */
  stamp(rows, x, y) {
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== " " && ch !== ".") this.set(x + i, y + j, ch); }));
  }
  /** linhas de texto da janela (vx, vy, w, h) em coordenadas de mundo */
  rows(vx = this.ox, vy = this.oy, w = this.w, h = this.h) {
    const out = [];
    for (let y = vy; y < vy + h; y++) {
      let s = "";
      for (let x = vx; x < vx + w; x++) s += this.get(x, y) ?? ".";
      out.push(s);
    }
    return out;
  }
  clone() { const t = new Tela(this.w, this.h, this.ox, this.oy); t.d = this.d.slice(); return t; }
}

/** comandos para montar um projeto de N quadros com uma camada de cena desenhada por quadro e uma de textos */
export function montar({ pal, quadros, cena, textos }) {
  const cmds = [pal.cmd(), { name: "update_layer", input: { layer: "Base", name: "cena" } }];
  for (let r = quadros - 1; r > 0; r -= 64) cmds.push({ name: "add_frames", input: { count: Math.min(64, r) } }); // add_frames aceita no máximo 64
  for (let f = 0; f < quadros; f++) cmds.push({ name: "draw_rows", input: { layer: "cena", frames: [f], x: 0, y: 0, rows: cena(f), preview: false } });
  cmds.push({ name: "add_layer", input: { name: "textos" } });
  for (let f = 0; f < quadros; f++) {
    const sh = textos ? textos(f) : [];
    if (sh.length) cmds.push({ name: "draw_shapes", input: { layer: "textos", frames: [f], shapes: sh, preview: false } });
  }
  return cmds;
}
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

import { gerar, ROOT } from "../lib/comum.mjs";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
/** Gera a cena; com PREV="0,20,51" gera só esses quadros numa folha PNG (rodadas rápidas). */
export function rodar({ nome, pal, quadros, cena, textos, saida }) {
  const prev = process.env.PREV;
  if (!prev) {
    const comandos = montar({ pal, quadros, cena, textos });
    return gerar({ nome, comandos, quadros, saida });
  }
  const lista = prev.split(",").map(Number);
  const cmds = montar({ pal, quadros: lista.length, cena: (i) => cena(lista[i]), textos: textos ? (i) => textos(lista[i]) : null });
  const dir = process.env.PREVDIR || "/tmp/claude-0/-home-user-anima-o/99abadf4-1863-5491-8eb0-dc306b8f0158/scratchpad/prev";
  mkdirSync(dir, { recursive: true });
  const proj = path.join(dir, `${nome}.anima.json`), cf = path.join(dir, `${nome}.cmds.json`);
  writeFileSync(cf, JSON.stringify(cmds));
  const anima = (...a) => execFileSync("node", [path.join(ROOT, "bin/anima.mjs"), ...a], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  anima("new", proj, "180x320", "12");
  const out = anima("run", proj, cf, "-q");
  const erros = out.split("\n").filter((l) => /^ERRO/.test(l));
  if (erros.length) throw new Error(erros.join("\n"));
  const png = path.join(dir, `${nome}_prev.png`);
  anima("export", proj, png, "--scale", process.env.ESC || "2", "--columns", String(lista.length));
  console.log(png);
}

/**
 * Pessoa GRANDE de perfil (~28 px), ciclo de 8 quadros, desenhada por articulações (pernas e braços por linhas).
 * x = canto esquerdo da caixa de 9 px; yPe = linha da sola. cores: chaves { pele, cabelo, blusa, calca, sapato, cabeloTipo }
 */
export function pessoaG(T, x, yPe, frame, dir, { pele = "2", cabelo = "5", blusa, calca = "8", sapato = "5", tipo = "curto", mochila = null, escala = 1 } = {}) {
  const p = ((((frame % 8) + 8) % 8) / 8) * Math.PI * 2;
  const s = Math.sin(p), c = Math.cos(p);
  const bob = Math.abs(c) > 0.7 ? 0 : -1; // sobe na passagem
  const X = (lx) => (dir > 0 ? x + lx : x + 8 - lx);
  const put = (lx, y, k) => T.set(X(Math.round(lx)), Math.round(y), k);
  const seg = (ax, ay, bx, by, k, larg = 2) => {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let i = 0; i <= n; i++) { const xx = ax + ((bx - ax) * i) / n, yy = ay + ((by - ay) * i) / n; for (let w = 0; w < larg; w++) put(xx + w, yy, k); }
  };
  const hy = yPe - 12 + bob, hx = 3.5;
  const perna = (fase, k) => {
    const fx = hx + 4.2 * Math.sin(fase), lev = Math.max(0, -Math.cos(fase)) * 2.2 * (Math.sin(fase) > -0.2 ? 1 : 0.4);
    const kx = (hx + fx) / 2 + 1.2, ky = hy + 6 - lev * 0.5;
    seg(hx, hy, kx, ky, k); seg(kx, ky, fx, yPe - 1 - lev, k);
    put(fx, yPe - lev, sapato); put(fx + 1, yPe - lev, sapato); put(fx + 2, yPe - lev, sapato);
  };
  const braco = (fase, k) => {
    const sx = 4, sy = hy - 9, ex = sx + 2.2 * Math.sin(fase), ey = sy + 4, hx2 = sx + 3.6 * Math.sin(fase) + (Math.sin(fase) > 0 ? 1 : 0), hy2 = sy + 8;
    seg(sx, sy, ex, ey, blusa, 2); seg(ex, ey, hx2, hy2, pele, 1); put(hx2, hy2 + 1, pele);
  };
  // atrás: perna e braço do lado de lá
  perna(p + Math.PI, calca);
  braco(p, blusa);
  // tronco
  for (let y = hy - 10; y <= hy; y++) for (let lx = 2; lx <= 6; lx++) {
    if ((y === hy - 10) && (lx === 2 || lx === 6)) continue;
    put(lx, y, y >= hy - 1 ? calca : blusa);
  }
  if (mochila) for (let y = hy - 9; y <= hy - 4; y++) { put(1, y, mochila); put(0, y, y > hy - 9 && y < hy - 4 ? mochila : null); }
  perna(p, calca);
  // cabeça 6x6 + pescoço
  const ty = hy - 18;
  put(4, ty + 7, pele); put(5, ty + 7, pele);
  const cab = ["..hhh.", ".hhhhh", "hhhsss", "hhssss", ".hssss", "..sss."];
  cab.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") put(i + 1, ty + 1 + j, ch === "h" ? cabelo : pele); }));
  if (tipo === "coque") { put(2, ty, cabelo); put(3, ty, cabelo); put(2, ty - 1, cabelo); put(3, ty - 1, cabelo); }
  if (tipo === "longo") for (let j = 3; j < 8; j++) put(1, ty + j, cabelo);
  if (tipo === "bone") { for (let i = 2; i <= 7; i++) put(i, ty + 1, cabelo); put(7, ty + 2, cabelo); }
  braco(p + Math.PI, blusa);
}
