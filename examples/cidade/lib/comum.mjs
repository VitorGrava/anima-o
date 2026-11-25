// Biblioteca COMUM das cenas da animação "A cidade que divide ou unifica?" (pixel art, vertical).
// Todas as cenas usam: canvas 180x320 (x6 = 1080x1920), 12 quadros por segundo, as mesmas pessoinhas.
// NÃO altere este arquivo dentro de uma cena; se precisar de algo novo, faça localmente no gen da cena.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const W = 180, H = 320, FPS = 12;
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** chaves de paleta reservadas para as pessoas (cada cena inclui estas cores na própria paleta) */
export const PESSOA_PALETA = [
  { key: "1", hex: "#f2c9a0", name: "pele1" }, { key: "2", hex: "#c98d62", name: "pele2" }, { key: "3", hex: "#8a5638", name: "pele3" }, { key: "4", hex: "#5a3424", name: "pele4" },
  { key: "5", hex: "#1c1a24", name: "cabelo1" }, { key: "6", hex: "#6a4028", name: "cabelo2" }, { key: "7", hex: "#d8a84a", name: "cabelo3" },
  { key: "8", hex: "#2a3050", name: "calca1" }, { key: "9", hex: "#4a4040", name: "calca2" },
];
export const BLUSAS = ["#e8b020", "#d84838", "#3c78c8", "#4aa070", "#e86a9a", "#8a5ac0", "#f0f0e8", "#e88a30"];

/**
 * Pessoinha de perfil caminhando (tamanho "meio": 5x12; "longe": 3x7; "perto": 7x18).
 * frame: 0..3 (ciclo de caminhada), dir: 1 = para a direita, -1 = para a esquerda.
 * cores: chaves de 1 caractere { pele, cabelo, blusa, calca }.
 * Devolve linhas para draw_rows com " " (espaço) onde não há pessoa: preserva o que já está desenhado na camada.
 */
export function pessoa({ tam = "meio", frame = 0, dir = 1, pele = "2", cabelo = "5", blusa = "b", calca = "8" } = {}) {
  const f = ((frame % 4) + 4) % 4;
  let rows;
  if (tam === "longe") {
    rows = [".h.", ".s.", "bbb", ".b.", ".c.", f % 2 ? ".c." : "c.c", f % 2 ? ".c." : "c.c"];
  } else if (tam === "perto") {
    const pernas = [
      ["..ccc..", "..c.c..", ".c...c.", ".c...c.", "c.....c", "c.....c", "c.....c"],
      ["..ccc..", "..cc...", "..cc...", "..c.c..", "..c.c..", "..c..c.", "..c..c."],
      ["..ccc..", "..c.c..", ".c...c.", ".c...c.", "c.....c", "c.....c", "c.....c"],
      ["..ccc..", "...cc..", "...cc..", "..c.c..", "..c.c..", ".c..c..", ".c..c.."],
    ][f];
    const braco = f === 0 ? ["..bbbs.", ".bbbbs.", ".bbbb..", ".sbbb.."] : f === 2 ? [".sbbb..", ".sbbbb.", "..bbbb.", "..bbbs."] : ["..bbb..", ".bbbbb.", ".bbsbb.", "..bbb.."];
    rows = ["..hhh..", ".hhhhh.", ".hssss.", "..sss..", "...s...", ...braco, "..bbb..", ...pernas];
  } else {
    const pernas = [[".c.c.", "c...c", "c...c"], ["..cc.", "..c..", "..c.."], [".c.c.", "c...c", "c...c"], [".cc..", "..c..", "..c.."]][f];
    const braco = f === 0 ? "bbbbs" : f === 2 ? "sbbbb" : ".bbb.";
    rows = [".hhh.", ".hss.", "..s..", ".bbb.", braco, ".bbb.", ".bbb.", ".ccc.", ...pernas, ""];
    rows.pop();
    if (f % 2) rows.unshift("....."), rows.pop(); // sobe 1 px no passo (bob)
  }
  if (dir < 0) rows = rows.map((r) => [...r].reverse().join(""));
  const map = { h: cabelo, s: pele, b: blusa, c: calca };
  return rows.map((r) => [...r].map((ch) => (ch === "." ? " " : map[ch] ?? ch)).join(""));
}

/** Gera o projeto a partir de comandos e exporta cada quadro como PNG 180x320 em <saida>/f_0000.png */
export function gerar({ nome, comandos, quadros, saida, escalaPreview = 2 }) {
  const dir = path.resolve(saida);
  mkdirSync(dir, { recursive: true });
  const proj = path.join(dir, `${nome}.anima.json`), cmd = path.join(dir, `${nome}.cmds.json`);
  writeFileSync(cmd, JSON.stringify(comandos));
  const anima = (...a) => execFileSync("node", [path.join(ROOT, "bin/anima.mjs"), ...a], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  anima("new", proj, `${W}x${H}`, String(FPS));
  const out = anima("run", proj, cmd, "-q");
  const erros = out.split("\n").filter((l) => /^ERRO/.test(l));
  if (erros.length) throw new Error(erros.join("\n"));
  const fr = path.join(dir, "quadros");
  rmSync(fr, { recursive: true, force: true });
  mkdirSync(fr, { recursive: true });
  for (let i = 0; i < quadros; i++) anima("export", proj, path.join(fr, `f_${String(i).padStart(4, "0")}.png`), "--scale", "1", "--frame", String(i));
  anima("export", proj, path.join(dir, `${nome}.gif`), "--scale", String(escalaPreview));
  return proj;
}
