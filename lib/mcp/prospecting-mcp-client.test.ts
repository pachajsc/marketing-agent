// Test de integración real (no mockeado): spawnea de verdad
// mcp/prospecting-server/server.ts vía `npx tsx` y le habla por stdio con un
// Client MCP real. No viola la regla de "no llamadas reales a servicios
// externos" — no se llama a Google Places ni a Anthropic; lo que se
// verifica es que el protocolo MCP en sí funciona de punta a punta (nuestro
// propio proceso, hablándole a nuestro propio proceso). Por eso NO se mockea
// "@modelcontextprotocol/sdk" ni "node:child_process" en este archivo, a
// diferencia del resto de la suite.
//
// GOOGLE_MAPS_API_KEY no está seteada en el entorno de test (verificado):
// eso hace que el servidor golpee la rama de GooglePlacesConfigError antes
// de intentar ninguna conexión de red, lo cual es exactamente el camino que
// este test ejercita para probar el wiring sin tocar la red real.
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { closeProspectingMcpClient, searchBusinessesViaMcp } from "./prospecting-mcp-client";

const SERVER_ENTRY = path.resolve(process.cwd(), "mcp/prospecting-server/server.ts");

describe("MCP prospecting server (integración real, sin red externa)", () => {
  afterAll(async () => {
    await closeProspectingMcpClient();
  });

  it(
    "expone exactamente el tool search_businesses vía tools/list",
    async () => {
      const transport = new StdioClientTransport({ command: "npx", args: ["tsx", SERVER_ENTRY] });
      const client = new Client({ name: "test-client", version: "0.0.0" });
      await client.connect(transport);

      try {
        const { tools } = await client.listTools();
        const names = tools.map((tool) => tool.name);

        expect(names).toContain("search_businesses");
        const tool = tools.find((t) => t.name === "search_businesses");
        expect(tool?.inputSchema.properties).toHaveProperty("category");
        expect(tool?.inputSchema.properties).toHaveProperty("area");
      } finally {
        await client.close();
      }
    },
    15_000
  );

  it(
    "sin GOOGLE_MAPS_API_KEY, el error de config llega hasta el Client como excepción legible",
    async () => {
      await expect(
        searchBusinessesViaMcp({ category: "clubes de padel", area: "Ciudad de Buenos Aires" })
      ).rejects.toThrow(/google places/i);
    },
    15_000
  );
});
