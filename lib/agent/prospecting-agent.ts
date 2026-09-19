// Prospecting Agent — Fase 3: la decisión del Agent dejó de ser un booleano
// trivial ("¿llamo a search_prospects?") para pasar a ser una estrategia de
// prospección: qué búsquedas tienen sentido para este negocio en particular,
// dado lo que el usuario efectivamente contó (nunca lo que no contó).
//
// Cambio de mecanismo respecto a la versión anterior: ya no se usa
// tool_use/tool_result. Claude nunca decide ejecutar nada directamente —
// solo propone un ProspectingPlan (Structured Output, mismo patrón que
// MarketingStrategySchema en marketing-agent.ts). El código es quien decide
// qué parte de ese plan se ejecuta de verdad, y lo hace en dos pasos:
//
//   1. Grounding (groundProspectingSearch): cada búsqueda propuesta se
//      recalcula contra `answers` según su `basedOnField` — los valores que
//      Claude haya escrito en `category`/`area` se descartan si no
//      corresponden a un campo real y presente. Si no hay grounding
//      posible, la búsqueda se descarta entera.
//   2. Política de ejecución (EXECUTABLE_SOURCES): de las búsquedas
//      groundeadas, solo se ejecutan contra Google Places las que tienen
//      source "fact" — el mismo comportamiento por default que existía
//      antes de esta fase (una búsqueda literal con
//      businessCategoryToTarget/targetArea). Las "inference"/"assumption"
//      quedan documentadas en el plan pero no disparan una llamada real y
//      facturable sin revisión humana (eso es trabajo de una fase futura de
//      UI/dashboard, no de este Agent).
//
// Flujo:
//   QuestionnaireAnswers + MarketingStrategy
//     → messages.parse() con Structured Output (ProspectingPlanSchema)
//     → ProspectingPlan { searches, rationale }
//     → groundProspectingSearch() por cada search (código, no prompt)
//     → ejecutar solo las groundeadas con source "fact" (runSearchProspectsTool)
//     → { prospects } — exactamente lo que devolvieron esas ejecuciones,
//       nunca reconstruido ni re-pasado por Claude.
//
// "server-only": misma barrera que marketing-agent.ts — este módulo (y la
// ANTHROPIC_API_KEY que usa el SDK) nunca puede importarse desde un Client
// Component.
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  ProspectingPlanSchema,
  type ClaimSource,
  type MarketingStrategy,
  type ProspectingPlan,
  type ProspectingResult,
  type ProspectingSearch,
  type QuestionnaireAnswers,
} from "@/lib/types";
import { runSearchProspectsTool } from "@/lib/tools/search-prospects-tool";

const client = new Anthropic();

const MODEL = "claude-opus-5";

// Política de ejecución: solo estas fuentes disparan una búsqueda real
// contra Google Places sin revisión humana. Ver comentario de flujo arriba.
const EXECUTABLE_SOURCES: ReadonlySet<ClaimSource> = new Set(["fact"]);

const SYSTEM_PROMPT = `Sos un agente de prospección. Tu tarea es proponer un plan de búsquedas de prospectos reales para el negocio del usuario — no ejecutás nada vos mismo, solo proponés un plan que el código va a validar y ejecutar.

El plan es un objeto con "searches" (lista de búsquedas propuestas) y "rationale" (criterio general detrás del plan).

Cada búsqueda tiene:
- "category": la categoría/nicho a buscar.
- "area": la zona geográfica.
- "limit" (opcional): tope de resultados. Nunca lo inventes sin un motivo concreto — omitilo si no lo tenés.
- "source": "fact" | "inference" | "assumption" — de dónde sale esta búsqueda en particular.
- "basedOnField": en qué dato del usuario se apoya. Solo hay dos valores válidos:
  - "businessCategoryToTarget+targetArea": la búsqueda principal y literal.
  - "idealCustomerDescription": un ángulo adicional que vos interpretaste de la descripción libre del cliente ideal.
- "rationale": por qué esta búsqueda en particular tiene sentido para este negocio.

Reglas estrictas, sin excepciones:

1. Si te doy businessCategoryToTarget Y targetArea, proponé siempre una búsqueda con basedOnField="businessCategoryToTarget+targetArea", source="fact", category y area copiados EXACTAMENTE como te los di entre comillas — nunca los traduzcas, elijas una variante, un barrio distinto, una ciudad distinta o una categoría relacionada. Si falta businessCategoryToTarget, NO propongas ninguna búsqueda con este basedOnField.

2. Una búsqueda con basedOnField="idealCustomerDescription" NUNCA puede tener source="fact" — como mucho es "inference" (si se desprende razonablemente del texto) o "assumption" (si es una interpretación más arriesgada). Solo proponé esto si idealCustomerDescription realmente menciona un ángulo, nicho o variante que businessCategoryToTarget no cubre ya literalmente. Si idealCustomerDescription no aporta nada nuevo, o no fue provisto, no propongas ninguna búsqueda con este basedOnField. El "area" de estas búsquedas también tiene que ser exactamente targetArea — nunca inventes ni infieras una zona distinta.

3. Nunca propongas una búsqueda basada en knownCompetitors: un competidor es un rival, no un cliente potencial.

4. Nunca inventes una categoría, zona o característica del cliente ideal que no esté respaldada por lo que te dí. Si no tenés información suficiente para ninguna búsqueda, devolvé "searches" como una lista vacía y explicá por qué en "rationale".

5. MarketingStrategy (si te la doy) es contexto para entender mejor el negocio — nunca la uses como basedOnField ni para justificar una búsqueda que no se desprenda de los campos de arriba.`;

/** Arma el prompt en texto plano a partir del contexto grounded del Agent. */
function buildPrompt(answers: QuestionnaireAnswers, strategy: MarketingStrategy | undefined): string {
  const lines = [
    `Ofrece: ${answers.offering.trim()}`,
    `Vende a (businessType="${answers.businessType}"): ${answers.businessType === "b2b" ? "empresas (B2B)" : "consumidores finales (B2C)"}`,
    `Problema o necesidad que resuelve: ${answers.problem.trim()}`,
    answers.businessCategoryToTarget?.trim()
      ? `businessCategoryToTarget="${answers.businessCategoryToTarget.trim()}"`
      : "businessCategoryToTarget: no fue provisto.",
    `targetArea="${answers.targetArea.trim()}"`,
    answers.idealCustomerDescription?.trim()
      ? `idealCustomerDescription: "${answers.idealCustomerDescription.trim()}"`
      : "idealCustomerDescription: no fue provisto.",
    answers.knownCompetitors?.trim()
      ? `knownCompetitors (NUNCA uses esto como base de una búsqueda de prospectos): "${answers.knownCompetitors.trim()}"`
      : undefined,
  ].filter(Boolean);

  if (strategy && strategy.idealCustomerProfile.length > 0) {
    lines.push(
      "",
      "Contexto descriptivo del cliente ideal, según la estrategia de marketing ya generada (usalo solo para entender mejor el negocio, nunca como basedOnField):",
      ...strategy.idealCustomerProfile.map((claim) => `- (${claim.source}) ${claim.text}`)
    );
  }

  lines.push("", "Proponé el plan de búsquedas de prospectos para este negocio.");

  return lines.join("\n");
}

/**
 * Recalcula category/area de una búsqueda propuesta contra los datos reales
 * de `answers`, según su `basedOnField` — nunca confía en los valores que
 * Claude haya escrito en `search.category`/`search.area`. Devuelve `null`
 * cuando el grounding no es posible (falta el dato de respaldo, o la
 * combinación basedOnField/source es inválida), y en ese caso la búsqueda se
 * descarta enteramente en vez de ejecutarse con datos parcialmente
 * inventados.
 */
function groundProspectingSearch(
  search: ProspectingSearch,
  answers: QuestionnaireAnswers
): ProspectingSearch | null {
  if (search.basedOnField === "businessCategoryToTarget+targetArea") {
    const category = answers.businessCategoryToTarget?.trim();
    const area = answers.targetArea?.trim();
    // La búsqueda principal es siempre literal: solo tiene sentido como
    // "fact". Si Claude la marcó como inference/assumption, o si falta el
    // dato de respaldo, se descarta.
    if (!category || !area || search.source !== "fact") return null;
    return { ...search, category, area };
  }

  if (search.basedOnField === "idealCustomerDescription") {
    const area = answers.targetArea?.trim();
    // Interpretación de texto libre: nunca puede ser "fact". El área nunca
    // se infiere — sigue siendo siempre targetArea, igual que la principal.
    if (!answers.idealCustomerDescription?.trim() || !area || search.source === "fact") {
      return null;
    }
    return { ...search, area };
  }

  // basedOnField no reconocido (no debería pasar: Zod ya lo valida como
  // enum cerrado) — se descarta por defecto, nunca se ejecuta a ciegas.
  return null;
}

/**
 * Genera un ProspectingResult a partir de QuestionnaireAnswers y (opcional)
 * la MarketingStrategy ya generada. `strategy` es opcional a propósito: el
 * prospecting solo necesita category/area (ya presentes en `answers`) para
 * funcionar, y la UI (ProspectsSection) es deliberadamente independiente de
 * que la estrategia haya terminado de cargar — ver ese componente.
 */
export async function runProspectingAgent(
  answers: QuestionnaireAnswers,
  strategy?: MarketingStrategy
): Promise<ProspectingResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(answers, strategy) }],
    output_config: {
      format: zodOutputFormat(ProspectingPlanSchema),
      effort: "low",
    },
  });

  if (!response.parsed_output) {
    throw new Error(
      `Claude no devolvió un plan con el formato esperado (stop_reason: ${response.stop_reason}).`
    );
  }

  const plan: ProspectingPlan = response.parsed_output;

  const groundedSearches = plan.searches
    .map((search) => groundProspectingSearch(search, answers))
    .filter((search): search is ProspectingSearch => search !== null);

  const executableSearches = groundedSearches.filter((search) => EXECUTABLE_SOURCES.has(search.source));

  // De-duplicado por category+area: distintas búsquedas groundeadas pueden
  // colapsar al mismo par literal (ej. dos propuestas con el mismo
  // basedOnField principal) — no tiene sentido gastar dos requests
  // idénticos contra Google Places.
  const uniqueByCategoryArea = new Map<string, ProspectingSearch>();
  for (const search of executableSearches) {
    uniqueByCategoryArea.set(`${search.category} ${search.area}`, search);
  }

  const results = await Promise.all(
    Array.from(uniqueByCategoryArea.values()).map((search) =>
      runSearchProspectsTool({ category: search.category, area: search.area, limit: search.limit })
    )
  );

  // El array final es exactamente la concatenación de lo que devolvieron
  // las ejecuciones reales: no se vuelve a pasar por Claude, no se
  // serializa/deserializa, no se reconstruye.
  return { prospects: results.flat() };
}
