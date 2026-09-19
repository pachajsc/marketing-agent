// Capa Tool sobre search_businesses — expone la capability de prospecting
// como una función que el código del ProspectingAgent invoca directamente
// para cada búsqueda ya groundeada (ver lib/agent/prospecting-agent.ts).
//
// No contiene lógica de IA: solo valida el input contra
// SearchProspectsInputSchema (el mismo schema que ya valida el body de
// /api/prospects, ver lib/tools/search-prospects-types.ts) y delega la
// ejecución real.
//
// Desde la Fase 6, esa ejecución real pasa por MCP: este Tool ya no llama a
// searchProspects() (lib/integrations/google-places.ts) directamente, sino
// a searchBusinessesViaMcp() (lib/mcp/prospecting-mcp-client.ts), que le
// habla al servidor MCP standalone (mcp/prospecting-server/server.ts) — el
// único que sigue importando google-places.ts. El Agent no necesitó
// cambiar una sola línea para este cambio de implementación: exactamente la
// separación que buscaba la Fase 4 (Agent → Tool → [integración
// intercambiable]).
//
// Claude nunca ejecuta esta función directamente: solo propone un
// ProspectingPlan (Structured Output) que el código valida/groundea y recién
// ahí decide qué búsquedas ejecutar llamando a esta función. Ver
// docs/agent-roadmap.md, Fases 3, 5 y 6.
//
// Vive en lib/tools/ (no en lib/agent/tools/): un Tool no es propiedad de un
// Agent específico — es una capability que cualquier Agent podría invocar.
import { searchBusinessesViaMcp } from "@/lib/mcp/prospecting-mcp-client";
import { SearchProspectsInputSchema } from "@/lib/tools/search-prospects-types";
import type { Prospect } from "@/lib/types";

/**
 * Ejecuta el tool: valida el input contra SearchProspectsInputSchema y, si
 * es válido, llama a searchBusinessesViaMcp(). Es la única puerta entre una
 * búsqueda del plan ya groundeada y el servidor MCP.
 */
export async function runSearchProspectsTool(rawInput: unknown): Promise<Prospect[]> {
  const parsed = SearchProspectsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(`Input inválido para search_prospects: ${parsed.error.message}`);
  }

  return searchBusinessesViaMcp(parsed.data);
}
