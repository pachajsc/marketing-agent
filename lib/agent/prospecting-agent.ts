// Prospecting Agent — segundo agente real del proyecto, y el primero que
// usa tool_use: en vez de generar directamente un resultado (como hace
// MarketingAgent con Structured Output puro), este Agent puede decidir
// invocar una herramienta y usar su resultado real antes de responder.
//
// Flujo:
//   QuestionnaireAnswers + MarketingStrategy
//     → messages.create() (con el tool search_prospects disponible)
//     → ¿tool_use?
//         no  → el Agent decidió que no corresponde buscar (ej: falta
//               businessCategoryToTarget) → { prospects: [] }
//         sí  → runSearchProspectsTool() ejecuta la búsqueda real
//               (searchProspects() → Google Places)
//             → el resultado real se agrega como tool_result
//             → messages.parse() con Structured Output (ProspectingResultSchema)
//             → ProspectingResult
//
// "server-only": misma barrera que marketing-agent.ts — este módulo (y la
// ANTHROPIC_API_KEY que usa el SDK) nunca puede importarse desde un Client
// Component.
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  ProspectingResultSchema,
  type MarketingStrategy,
  type ProspectingResult,
  type QuestionnaireAnswers,
} from "@/lib/types";
import {
  runSearchProspectsTool,
  searchProspectsTool,
  SEARCH_PROSPECTS_TOOL_NAME,
} from "@/lib/agent/tools/search-prospects-tool";

const client = new Anthropic();

const MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `Sos un agente de prospecting. Tu única función es decidir si corresponde buscar prospectos reales para el negocio del usuario y, si corresponde, invocar la herramienta "${SEARCH_PROSPECTS_TOOL_NAME}" para conseguirlos.

Reglas estrictas:
- "category" y "area" en la llamada a la herramienta tienen que ser EXACTAMENTE los valores que te doy entre comillas como businessCategoryToTarget y targetArea. Son literales, no sugerencias: nunca los traduzcas, elijas una variante, un barrio distinto, una ciudad distinta o una categoría relacionada.
- Nunca inventes un valor de "limit". Si no tenés un motivo concreto para fijar un tope, omitilo del tool call y dejá que la herramienta use su propio default.
- Si no te doy un businessCategoryToTarget, no podés buscar: no inventes ninguno. En ese caso no llames a la herramienta.
- La estrategia de marketing, si te la doy, es contexto descriptivo únicamente — para entender mejor a quién le vende el usuario. Nunca la uses para elegir una categoría o zona distinta de las que te di literalmente, ni para inventar características del cliente ideal que no estén en ese contexto.
- Los prospectos reales SIEMPRE vienen del resultado de la herramienta. Nunca inventes, completes, corrijas ni agregues un prospecto que no esté en ese resultado, y nunca omitas uno que sí esté (salvo que la herramienta haya devuelto una lista vacía, en cuyo caso el resultado final también es una lista vacía).
- Tu respuesta final tiene que reproducir exactamente la lista de prospectos que te devolvió la herramienta, sin modificar ninguno de sus campos (name, address, phone, website, rating, mapsUrl).`;

/** Arma el prompt en texto plano a partir del contexto grounded del Agent. */
function buildPrompt(answers: QuestionnaireAnswers, strategy: MarketingStrategy | undefined): string {
  const lines = [
    `Ofrece: ${answers.offering.trim()}`,
    `Vende a (businessType="${answers.businessType}"): ${answers.businessType === "b2b" ? "empresas (B2B)" : "consumidores finales (B2C)"}`,
    answers.businessCategoryToTarget?.trim()
      ? `businessCategoryToTarget="${answers.businessCategoryToTarget.trim()}"`
      : "businessCategoryToTarget: no fue provisto.",
    `targetArea="${answers.targetArea.trim()}"`,
  ];

  if (strategy && strategy.idealCustomerProfile.length > 0) {
    lines.push(
      "",
      "Contexto descriptivo del cliente ideal, según la estrategia de marketing ya generada (usalo solo para entender mejor el negocio, nunca para elegir una categoría o zona distinta de las de arriba):",
      ...strategy.idealCustomerProfile.map((claim) => `- (${claim.source}) ${claim.text}`)
    );
  }

  lines.push(
    "",
    `¿Corresponde buscar prospectos reales para este negocio? Si es así, invocá "${SEARCH_PROSPECTS_TOOL_NAME}". Si no corresponde (por ejemplo, falta businessCategoryToTarget), no llames a la herramienta.`
  );

  return lines.join("\n");
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
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildPrompt(answers, strategy) },
  ];

  const decision = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
    tools: [searchProspectsTool],
  });

  const toolUse = decision.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === SEARCH_PROSPECTS_TOOL_NAME
  );

  if (!toolUse) {
    // El Agent decidió no buscar (ej: falta businessCategoryToTarget). No hay
    // datos reales que devolver — nunca se inventa un prospecto acá.
    return { prospects: [] };
  }

  const prospects = await runSearchProspectsTool(toolUse.input);

  messages.push(
    { role: "assistant", content: decision.content },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(prospects),
        },
      ],
    }
  );

  // Segunda llamada: sin `tools` (este primer Agent hace como máximo una
  // búsqueda, nunca un segundo tool_use — ver Paso 9) y con Structured
  // Output para que la respuesta final quede tipada, mismo patrón que
  // runMarketingAgent en marketing-agent.ts.
  const final = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
    output_config: {
      format: zodOutputFormat(ProspectingResultSchema),
      effort: "low",
    },
  });

  if (!final.parsed_output) {
    throw new Error(
      `Claude no devolvió una respuesta con el formato esperado (stop_reason: ${final.stop_reason}).`
    );
  }

  return final.parsed_output;
}
