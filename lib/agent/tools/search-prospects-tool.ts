// Capa Tool sobre searchProspects() — expone la capability determinística de
// Google Places (lib/prospecting/google-places.ts) como un Tool de Anthropic
// que el ProspectingAgent puede invocar vía tool_use.
//
// No contiene lógica de IA: solo valida el input que mandó el modelo contra
// SearchProspectsInputSchema (el mismo schema que ya valida el body de
// /api/prospects, ver lib/prospecting/types.ts) y delega en searchProspects().
// Los errores de Google Places (GooglePlacesConfigError, GooglePlacesRequestError)
// se propagan tal cual — no se ocultan ni se convierten en un tool_result de
// error, porque no hay ninguna estrategia de retry en este primer Agent (ver
// AGENTS.md / Paso 9): si Google falla, toda la request falla, igual que
// antes de que existiera este Tool.
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { searchProspects } from "@/lib/prospecting/google-places";
import { SearchProspectsInputSchema } from "@/lib/prospecting/types";
import type { Prospect } from "@/lib/types";

export const SEARCH_PROSPECTS_TOOL_NAME = "search_prospects";

/**
 * Definición del tool para Anthropic. `input_schema` se genera desde
 * SearchProspectsInputSchema (z.toJSONSchema) en vez de escribir un JSON
 * Schema paralelo a mano — mismo principio de "una sola fuente de verdad"
 * que ya sigue MarketingStrategySchema con zodOutputFormat.
 */
export const searchProspectsTool: Anthropic.Tool = {
  name: SEARCH_PROSPECTS_TOOL_NAME,
  description:
    "Busca negocios reales en una categoría y zona geográfica usando Google Places (Google Maps). " +
    "Usala cuando corresponda conseguir prospectos concretos (nombre, dirección, teléfono, sitio web, rating y link de Maps) " +
    "para una categoría de negocio dentro de un área geográfica. " +
    "category y area tienen que ser exactamente los valores provistos como contexto — nunca inventes ni modifiques " +
    "una categoría o zona distinta de la dada. " +
    "limit es opcional (tope de resultados, entre 1 y 20): omitilo si no tenés un motivo concreto para fijar un número, " +
    "en vez de inventar una cantidad. " +
    "Devuelve una lista de prospectos reales, que puede estar vacía si no hay negocios que matcheen — una lista vacía " +
    "es un resultado válido, no un error.",
  input_schema: {
    type: "object",
    ...(z.toJSONSchema(SearchProspectsInputSchema) as Record<string, unknown>),
  },
};

/**
 * Ejecuta el tool: valida el input crudo que mandó el modelo (tool_use.input
 * llega tipado como `unknown`) contra SearchProspectsInputSchema y, si es
 * válido, llama a searchProspects(). Es la única puerta entre el tool_use
 * del modelo y la llamada real a Google Places.
 */
export async function runSearchProspectsTool(rawInput: unknown): Promise<Prospect[]> {
  const parsed = SearchProspectsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      `El modelo invocó "${SEARCH_PROSPECTS_TOOL_NAME}" con un input inválido: ${parsed.error.message}`
    );
  }

  return searchProspects(parsed.data);
}
