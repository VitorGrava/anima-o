#!/usr/bin/env node
// Executa a CLI em TypeScript direto, via tsx (sem etapa de build).
import { register } from "tsx/esm/api";

register();
const { main } = await import("../cli/anima.ts");
try {
  const code = await main(process.argv.slice(2));
  if (code >= 0) process.exit(code);
} catch (e) {
  console.error(`erro: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
