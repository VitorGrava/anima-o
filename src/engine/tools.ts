/**
 * Definições de ferramentas (nome, descrição, JSON Schema) geradas dos schemas
 * Zod dos comandos. Usadas pelo agente via API e pelo servidor MCP.
 */
import { z } from "zod";
import { COMMANDS } from "./commands.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown> & { type: "object" };
}

/** Remove os limites ±MAX_SAFE_INTEGER que o Zod adiciona a todo inteiro (só ruído no prompt). */
function stripSafeIntBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSafeIntBounds);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if ((k === "minimum" || k === "maximum") && Math.abs(v as number) === Number.MAX_SAFE_INTEGER) continue;
    out[k] = stripSafeIntBounds(v);
  }
  return out;
}

export function jsonSchemaOf(schema: z.ZodType): ToolDefinition["inputSchema"] {
  const { $schema: _ignored, ...rest } = stripSafeIntBounds(z.toJSONSchema(schema, { io: "input" })) as Record<string, unknown>;
  return rest as ToolDefinition["inputSchema"];
}

export function commandTools(exclude: string[] = []): ToolDefinition[] {
  return COMMANDS.filter((c) => !exclude.includes(c.name)).map((c) => ({
    name: c.name,
    description: c.description,
    inputSchema: jsonSchemaOf(c.schema),
  }));
}
