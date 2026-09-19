// Cliente MCP (Fase 6) — lado Host de la conexión con
// mcp/prospecting-server/server.ts. Es lo único en este proyecto que sabe
// que "search_businesses" vive detrás de un proceso MCP separado; para
// prospecting-agent.ts, `searchBusinessesViaMcp` se ve igual que cualquier
// otra función async — el detalle de que cruza un proceso queda encapsulado
// acá, exactamente lo que Fase 4 (separación Agent/Tools/Integrations) pedía
// para poder reemplazar una implementación sin reescribir el Agent.
//
// "server-only": este módulo spawnea un proceso hijo y le pasa
// GOOGLE_MAPS_API_KEY por entorno — no puede ejecutarse en el navegador.
import "server-only";

import path from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ProspectingResultSchema, type Prospect } from "@/lib/types";
import type { SearchProspectsInput } from "@/lib/tools/search-prospects-types";

// Forma del payload de error que arma server.ts en el catch del tool.
// Validado con Zod (no duck-typing manual) por el mismo motivo que el resto
// del proyecto: no confiar en la forma de algo que cruzó un límite externo
// sin verificarla primero.
const ToolErrorPayloadSchema = z.object({
  kind: z.enum(["config", "request", "unexpected"]),
  message: z.string(),
  status: z.number().optional(),
});

const SEARCH_BUSINESSES_TOOL_NAME = "search_businesses";
const SERVER_ENTRY = path.resolve(process.cwd(), "mcp/prospecting-server/server.ts");

/**
 * El servidor MCP no tiene configurada la integración con Google Places
 * (GOOGLE_MAPS_API_KEY ausente en el proceso hijo). Reconstruida acá a
 * partir del payload de error del tool — ver `server.ts` — porque una
 * excepción tipada de otro proceso no cruza el límite de stdio tal cual.
 */
export class McpProspectingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpProspectingConfigError";
  }
}

/**
 * El servidor MCP reportó un error al llamar a Google Places (`status` es
 * el status HTTP original cuando se conoce, 0 si no hubo respuesta).
 */
export class McpProspectingRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "McpProspectingRequestError";
    this.status = status;
  }
}

/**
 * El cliente se conecta una sola vez por proceso del servidor Next.js
 * (módulo singleton, conexión lazy) y se reutiliza entre requests — spawnear
 * un proceso Node nuevo en cada búsqueda sería un costo innecesario. Si la
 * conexión se cae, `onclose` limpia la promesa cacheada para reconectar en
 * el próximo uso en vez de quedar rota para siempre.
 */
let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const transport = new StdioClientTransport({
        // `npx tsx` (no require.resolve): StdioClientTransport spawnea con
        // cross-spawn, que resuelve el binario correcto (incluyendo
        // npx.cmd en Windows) a través del PATH. Evita depender de
        // `require` en un módulo que Next.js puede compilar como ESM.
        command: "npx",
        args: ["tsx", SERVER_ENTRY],
        // Entorno explícito y mínimo: el proceso MCP solo necesita hablar
        // con Google Places, nunca con Anthropic — no le pasamos
        // process.env completo (que incluiría ANTHROPIC_API_KEY) para no
        // exponerle secrets que no le corresponden.
        env: {
          ...getDefaultEnvironment(),
          ...(process.env.GOOGLE_MAPS_API_KEY
            ? { GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY }
            : {}),
        },
      });

      const client = new Client({ name: "prospecting-agent-host", version: "0.1.0" });
      transport.onclose = () => {
        clientPromise = null;
      };
      await client.connect(transport);
      return client;
    })();
  }
  return clientPromise;
}

/**
 * Reconstruye, del lado del Host, la distinción config/request/unexpected
 * que ya existía antes de que el request pasara por un proceso MCP — ver el
 * catch de server.ts, que arma este mismo payload como JSON en el primer
 * bloque de texto del resultado de error. Si el payload no tiene la forma
 * esperada (servidor MCP de otra versión, error de transporte, etc.), cae a
 * un Error genérico con el texto crudo en vez de fallar al parsear.
 */
function parseToolErrorPayload(content: unknown): Error {
  const firstBlock = Array.isArray(content) ? content[0] : undefined;
  const rawText =
    firstBlock && typeof firstBlock === "object" && "text" in firstBlock
      ? String((firstBlock as { text: unknown }).text)
      : undefined;

  if (rawText) {
    try {
      const parsed = ToolErrorPayloadSchema.safeParse(JSON.parse(rawText));
      if (parsed.success) {
        const payload = parsed.data;
        if (payload.kind === "config") return new McpProspectingConfigError(payload.message);
        if (payload.kind === "request") return new McpProspectingRequestError(payload.message, payload.status ?? 0);
        return new Error(payload.message);
      }
    } catch {
      // rawText no era JSON — cae al mensaje crudo debajo.
    }
  }

  return new Error(rawText ?? "El servidor MCP de prospecting devolvió un error.");
}

/**
 * Ejecuta el tool MCP "search_businesses" con un input ya groundeado (ver
 * groundProspectingSearch en prospecting-agent.ts) y devuelve los Prospect
 * reales. MCP no es una vía para saltarse validaciones: el
 * `structuredContent` que vuelve del proceso hijo se re-valida acá contra
 * ProspectingResultSchema antes de confiar en él — cruzar un límite de
 * proceso no exime del mismo principio de grounding que rige el resto del
 * proyecto.
 */
export async function searchBusinessesViaMcp(input: SearchProspectsInput): Promise<Prospect[]> {
  const client = await getClient();

  const result = await client.callTool({
    name: SEARCH_BUSINESSES_TOOL_NAME,
    arguments: input,
  });

  if (result.isError) {
    throw parseToolErrorPayload(result.content);
  }

  const parsed = ProspectingResultSchema.safeParse(result.structuredContent);
  if (!parsed.success) {
    throw new Error(
      `El servidor MCP de prospecting devolvió una respuesta con forma inesperada: ${parsed.error.message}`
    );
  }

  return parsed.data.prospects;
}

/**
 * Cierra la conexión (y el proceso hijo) si está abierta. Uso genuino más
 * allá de tests: un shutdown ordenado del servidor Next.js no debería dejar
 * el proceso MCP huérfano corriendo.
 */
export async function closeProspectingMcpClient(): Promise<void> {
  if (!clientPromise) return;
  const client = await clientPromise;
  clientPromise = null;
  await client.close();
}
