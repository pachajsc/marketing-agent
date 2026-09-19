#!/usr/bin/env node
// Servidor MCP — Fase 6.
//
// Responsabilidad concreta y única: exponer "search_businesses" como
// capability MCP, delegando en searchProspects() (la misma integración real
// contra Google Places que ya usa el resto del proyecto). No importa nada
// de Anthropic, de QuestionnaireAnswers, ni de ninguna regla de negocio de
// nuestro dominio (grounding, fact/inference/assumption): esas
// responsabilidades siguen viviendo en lib/agent/prospecting-agent.ts, del
// lado del Client. Ver docs/agent-roadmap.md, Fase 5-6, para el
// razonamiento completo de este límite.
//
// Proceso standalone (no bundleado por Next.js), ejecutado vía `tsx` y
// hablado por stdio: el Host (nuestro backend) lo spawnea como hijo y le
// habla por stdin/stdout — no levanta ningún puerto HTTP.
//
// No duplica lógica de Google Places: importa searchProspects() y los
// mismos schemas Zod que ya son la fuente de verdad del resto del proyecto
// (lib/integrations/google-places.ts, lib/tools/search-prospects-types.ts,
// lib/types.ts) — mismo código, un segundo punto de entrada nada más.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  GooglePlacesConfigError,
  GooglePlacesRequestError,
  searchProspects,
} from "@/lib/integrations/google-places";
import { SearchProspectsInputSchema } from "@/lib/tools/search-prospects-types";
import { ProspectingResultSchema } from "@/lib/types";

const server = new McpServer({
  name: "prospecting-mcp-server",
  version: "0.1.0",
});

server.registerTool(
  "search_businesses",
  {
    title: "Search businesses",
    description:
      "Busca negocios reales en una categoría y zona geográfica usando Google Places (Google Maps). " +
      "category y area son literales: este tool nunca interpreta, traduce ni corrige lo que se le pasa — " +
      "esa responsabilidad es de quien lo invoca, no de este servidor. " +
      "limit es opcional (tope de resultados, entre 1 y 20). " +
      "Devuelve una lista de negocios reales, que puede estar vacía si no hay resultados — una lista vacía " +
      "es un resultado válido, no un error.",
    inputSchema: SearchProspectsInputSchema,
    outputSchema: ProspectingResultSchema,
  },
  async (input) => {
    try {
      const prospects = await searchProspects(input);
      const structuredContent = { prospects };
      return {
        structuredContent,
        content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
      };
    } catch (error) {
      // MCP no oculta el error de Google: lo devuelve como resultado de
      // error del tool (isError), para que el Client lo distinga de una
      // búsqueda válida sin resultados. Nunca expone la API key ni detalles
      // internos — mismo criterio que ya aplican los Route Handlers del
      // proyecto.
      //
      // El texto es JSON (no prosa libre) a propósito: cruzar el límite de
      // proceso no debería degradar la distinción que ya existía entre
      // config/request/error inesperado — lib/mcp/prospecting-mcp-client.ts
      // parsea este mismo formato para reconstruir esa distinción del lado
      // del Host, y route.ts sigue pudiendo diferenciar 500/429/502 igual
      // que antes de que existiera este servidor.
      const payload =
        error instanceof GooglePlacesConfigError
          ? { kind: "config" as const, message: "El servidor MCP no tiene configurada la integración con Google Places." }
          : error instanceof GooglePlacesRequestError
            ? { kind: "request" as const, message: `Google Places respondió con un error (status ${error.status}).`, status: error.status }
            : { kind: "unexpected" as const, message: "Error inesperado buscando negocios." };
      return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Error fatal iniciando el servidor MCP de prospecting:", error);
  process.exit(1);
});
