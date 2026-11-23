// retoques à mão no 32x32 reduzido: brilho dos olhos e lâmina clara da espada (chaves: s = aço claro, u = brilho ciano)
import { readFileSync, writeFileSync } from "node:fs";
const f = new URL("./cmds-32r.json", import.meta.url);
const cmds = JSON.parse(readFileSync(f, "utf8"));
const rows = cmds[1].input.rows.map((r) => [...r]);
for (let y = 4; y <= 22; y++) if (rows[y][27] !== "." && rows[y][27] !== "a") rows[y][27] = "s";
rows[11][13] = "u"; rows[11][18] = "u"; rows[12][13] = "u";
cmds[1].input.rows = rows.map((r) => r.join(""));
writeFileSync(f, JSON.stringify(cmds));
