// Monta o vídeo final: junta as 12 cenas (quadros 180x320 a 12/s), sobrepõe as legendas em fonte de pixel,
// amplia 6x sem suavizar (1080x1920) e põe a narração do vídeo original.
// Uso: node examples/cidade/montar.mjs <video_original.mp4>  →  examples/cidade/cidade_pixel.mp4
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { W, H, FPS, ROOT } from "./lib/comum.mjs";

const DIR = path.join(ROOT, "examples/cidade");
const CENAS = ["01_praca", "02_shopping", "03_corredor", "04_lounge", "05_cctv", "06_monitores", "07_catraca", "08_praca_grade", "09_torre", "10_feira", "11_progresso", "12_final"];
const QUADROS = [72, 103, 83, 66, 62, 37, 40, 47, 52, 34, 35, 90];
// legendas: [início, fim, texto]; *palavra* = destaque amarelo
const LEG = [
  [0.5, 1.5, "Você já reparou como"], [1.5, 3, "a cidade moderna trocou"], [3, 4, "a *praça* pública por"], [4, 6, "labirintos *climatizados?*"],
  [9.5, 11, "Historicamente,"], [11, 12, "o espaço público sempre"], [12, 13, "foi o lugar da"], [13, 13.5, "troca,"], [13.5, 14.5, "do encontro imprevisto e"],
  [14.5, 16.5, "da diversidade."], [16.5, 17.5, "Mas hoje,"], [17.5, 18, "a gente vive a"], [18, 20, "ascensão do *'espaço-lixo':*"], [20, 21.5, "ambientes privados que mascaram"],
  [21.5, 22.5, "o *controle* sob o"], [22.5, 24, "disfarce de conforto,"], [24, 26, "ar-condicionado e segurança."],
  [28, 29, "Parece que você tem"], [29, 30, "*liberdade* total,"], [30, 31, "mas o desenho do"], [31, 31.5, "chão,"], [31.5, 32.5, "os trajetos longos e"],
  [32.5, 34.5, "a *vigilância* constante programam"], [34.5, 35.5, "o seu passo."], [35.5, 36, "Ali,"], [36, 37, "quem não *consome* não"], [37, 38.5, "*pertence.*"],
  [38.5, 40, "O público vira privado,"], [40, 41, "e a convivência vira"], [41, 42.5, "*segregação.*"],
  [44, 45, "A arquitetura e o"], [45, 46.5, "urbanismo não são *neutros:*"], [46.5, 47.5, "ou eles integram as"], [47.5, 49, "pessoas na cidade,"],
  [49, 50.5, "ou aprofundam a *desigualdade*"], [50.5, 52.5, "disfarçada de *progresso.*"], [52.5, 53.5, "Para quem a cidade"], [53.5, 55.5, "está sendo *desenhada?*"],
];

const original = process.argv[2];
if (!original || !existsSync(original)) throw new Error("passe o vídeo original (para a narração)");
const tmp = path.join(DIR, ".montagem");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(path.join(tmp, "seq"), { recursive: true });
mkdirSync(path.join(tmp, "leg"), { recursive: true });

// 1) sequência única de quadros
let n = 0;
CENAS.forEach((c, i) => {
  const q = path.join(DIR, "cenas", c, "quadros");
  const files = existsSync(q) ? readdirSync(q).filter((f) => f.endsWith(".png")).sort() : [];
  if (files.length !== QUADROS[i]) console.warn(`aviso: ${c} tem ${files.length} quadros (esperado ${QUADROS[i]})`);
  for (let k = 0; k < QUADROS[i]; k++) {
    const src = files.length ? path.join(q, files[Math.min(k, files.length - 1)]) : null;
    if (src) symlinkSync(src, path.join(tmp, "seq", `f_${String(n).padStart(5, "0")}.png`));
    n++;
  }
});

// 2) legendas: um PNG 180x320 transparente por legenda (caixa escura + texto em pixel, destaque amarelo)
const anima = (...a) => execFileSync("node", [path.join(ROOT, "bin/anima.mjs"), ...a], { cwd: ROOT, encoding: "utf8" });
const tw = (s) => [...s].length * 4 - 1;
LEG.forEach(([, , txt], i) => {
  const plain = txt.replace(/\*/g, "");
  const w = tw(plain), x0 = Math.round(W / 2 - w / 2), Y = 252;
  const shapes = [{ type: "rect", x: x0 - 3, y: Y - 3, w: w + 6, h: 11, color: "caixa", filled: true }];
  let x = x0;
  for (const [j, part] of txt.split("*").entries()) {
    if (!part) continue;
    shapes.push({ type: "texto", texto: part, x, y: Y, color: j % 2 ? "destaque" : "letra", sombra: "sombra" });
    x += tw(part) + 1;
  }
  const proj = path.join(tmp, "leg", `l${i}.anima.json`), cmd = path.join(tmp, "leg", `l${i}.json`);
  writeFileSync(cmd, JSON.stringify([
    { name: "set_palette", input: { colors: [{ key: "a", hex: "#26242e", name: "caixa" }, { key: "b", hex: "#f4efe4", name: "letra" }, { key: "c", hex: "#f4c040", name: "destaque" }, { key: "d", hex: "#0c0b10", name: "sombra" }] } },
    { name: "draw_shapes", input: { shapes, preview: false } },
  ]));
  anima("new", proj, `${W}x${H}`, "1");
  anima("run", proj, cmd, "-q");
  anima("export", proj, path.join(tmp, "leg", `l${i}.png`), "--scale", "1", "--frame", "0");
});

// 3) ffmpeg: base a 12/s + legendas (overlay com enable), amplia 6x (neighbor), narração do original
const inputs = ["-framerate", String(FPS), "-i", path.join(tmp, "seq", "f_%05d.png")];
LEG.forEach((_, i) => inputs.push("-i", path.join(tmp, "leg", `l${i}.png`)));
inputs.push("-i", original);
let chain = "[0:v]format=rgba[v0]";
LEG.forEach(([a, b], i) => { chain += `;[v${i}][${i + 1}:v]overlay=0:0:enable='between(t,${a},${b - 0.001})'[v${i + 1}]`; });
chain += `;[v${LEG.length}]scale=${W * 6}:${H * 6}:flags=neighbor,format=yuv420p[out]`;
const out = path.join(DIR, "cidade_pixel.mp4");
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", chain, "-map", "[out]", "-map", `${LEG.length + 1}:a`, "-r", "30", "-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-shortest", out], { stdio: "inherit" });
rmSync(tmp, { recursive: true, force: true });
console.log("ok:", out, `(${n} quadros, ${(n / FPS).toFixed(1)} s)`);
