// Marketing Intelligence Agent — integración real con Claude.
//
// Wizard → QuestionnaireAnswers → MarketingAgent → Claude API
// → Structured Output → MarketingStrategy
//
// "server-only" hace que el build falle si este archivo (y con él, la
// ANTHROPIC_API_KEY que usa el SDK) terminara importado desde un Client
// Component. Es la barrera de seguridad que garantiza el punto 3 de la
// arquitectura acordada: la API key nunca llega al navegador.
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MarketingStrategySchema, type MarketingStrategy, type QuestionnaireAnswers } from "@/lib/types";

// El SDK resuelve la API key automáticamente desde process.env.ANTHROPIC_API_KEY.
const client = new Anthropic();

const MAIN_GOAL_LABEL: Record<QuestionnaireAnswers["mainGoal"], string> = {
  first_customers: "conseguir sus primeros clientes",
  increase_sales: "aumentar sus ventas actuales",
  recurring_customers: "conseguir clientes recurrentes",
  higher_value_upsell: "vender servicios de mayor valor a los clientes que ya tiene",
};

const HAS_CUSTOMERS_LABEL: Record<QuestionnaireAnswers["hasCustomersToday"], string> = {
  none: "no tiene clientes todavía",
  some: "tiene algunos clientes",
  stable: "tiene una base de clientes estable",
};

/** Arma el prompt en texto plano a partir de las respuestas del wizard. */
function buildPrompt(answers: QuestionnaireAnswers): string {
  const lines = [
    `Ofrece: ${answers.offering.trim()}`,
    `Objetivo principal (mainGoal="${answers.mainGoal}"): ${MAIN_GOAL_LABEL[answers.mainGoal]}`,
    `Problema o necesidad que resuelve: ${answers.problem.trim()}`,
    `Vende a (businessType="${answers.businessType}"): ${answers.businessType === "b2b" ? "empresas (B2B)" : "consumidores finales (B2C)"}`,
    answers.priceRange?.trim() ? `Precio o ticket promedio: ${answers.priceRange.trim()}` : undefined,
    `Situación actual (hasCustomersToday="${answers.hasCustomersToday}"): ${HAS_CUSTOMERS_LABEL[answers.hasCustomersToday]}`,
    answers.idealCustomerDescription?.trim()
      ? `Descripción de su cliente ideal (en sus propias palabras): ${answers.idealCustomerDescription.trim()}`
      : undefined,
    answers.businessCategoryToTarget?.trim()
      ? `Categoría de negocios/profesionales/personas a las que apunta: ${answers.businessCategoryToTarget.trim()}`
      : undefined,
    `Zona geográfica objetivo: ${answers.targetArea.trim()}`,
    answers.knownCompetitors?.trim()
      ? `Competidores o alternativas conocidas: ${answers.knownCompetitors.trim()}`
      : undefined,
  ].filter(Boolean);

  return `Un usuario completó este cuestionario sobre su negocio:\n\n${lines.join("\n")}\n\nArmá una estrategia de marketing inicial a partir de esta información.`;
}

const SYSTEM_PROMPT = `Sos un consultor de marketing que ayuda a pequeños negocios a definir su estrategia inicial de adquisición de clientes a partir de un cuestionario. Respondé siempre en español, de forma concreta y accionable, sin relleno.

Cada afirmación que generás es un Claim con un campo "source":
- "fact": es literalmente lo que el usuario respondió. No lo reformules con más precisión o certeza de la que dio.
- "inference": una conclusión razonable derivada de uno o más "fact" (usá "basedOn" para indicar de cuáles).
- "assumption": cualquier otra cosa que no esté respaldada por el cuestionario — incluye tanto hipótesis o recomendaciones tuyas como cualquier benchmark, promedio o cifra de mercado que no haya dado el usuario.

Fidelidad a los datos de opción cerrada: varios campos del cuestionario vienen de una opción cerrada (elegida entre valores fijos, no texto libre) y en el prompt aparecen con su valor real entre comillas junto al nombre del campo — por ejemplo, hasCustomersToday="none". Ese valor entre comillas es la fuente de verdad exacta: nunca lo invertís, reinterpretás ni "suavizás" al escribir un fact. hasCustomersToday="none" significa que hoy no tiene ningún cliente (nunca lo describas como si tuviera algunos o una base estable); hasCustomersToday="some" significa que tiene algunos clientes; hasCustomersToday="stable" significa que tiene una base de clientes estable. Lo mismo aplica a mainGoal y businessType: citá el significado exacto de la opción elegida, no una versión invertida o aproximada.

Regla estricta sobre números: nunca inventes cifras específicas (volumen de clientes potenciales, frecuencia, tasas de conversión, tickets, tamaño de mercado, edad del decisor, presupuesto, comisiones, cantidad de competidores, etc.) ni características del negocio que el usuario no haya dado. Si una recomendación necesita un número que no tenés:
1) usá un rango amplio marcado explícitamente como hipótesis a validar, o
2) proponé un experimento concreto para conseguir ese dato (ej: "contactá a 10 clubes y medí la tasa de respuesta antes de proyectar un volumen"),
en vez de inventar un benchmark. En ambos casos, el Claim va con source: "assumption" y confidence: "low".

Si dos respuestas del usuario son inconsistentes entre sí, no la resuelvas ni la corrijas como si conocieras la respuesta correcta: generá un Claim que declare la inconsistencia explícitamente (source: "assumption") para que el usuario la revise. Ejemplo — incorrecto: "El negocio es en realidad B2B." Preferido: "Existe una aparente inconsistencia entre el modelo de negocio declarado como B2C y el cliente ideal descrito, que suena a B2B."

Además de esas 5 secciones, tenés que completar "nextBestAction": un objeto único (no una lista) que responde "¿cuál es la acción más importante que debería hacer este usuario ahora para avanzar?". Tiene 4 campos de contenido:
- "action": la acción concreta y ejecutable — algo que el usuario pueda hacer, no un objetivo abstracto.
- "goal": qué se busca aprender, validar o conseguir al realizar esa acción.
- "metricToWatch": qué señal habría que observar como resultado de la acción (ej: "cuántos clubes responden al mensaje"). Nunca un número, porcentaje, tasa o benchmark inventado — describe qué mirar, no cuánto esperar. Se aplica la misma regla estricta sobre números de más arriba.
- "reason": por qué esta acción es la prioridad ahora, y no otra.

"nextBestAction" tiene que ser coherente con "initialStrategy": no inventes una estrategia distinta ni una acción que la contradiga. Idealmente, destilá o priorizá el primer paso relevante de "initialStrategy" en una recomendación única y accionable — no un paso nuevo que no se desprenda de ella.

"nextBestAction.source" únicamente puede ser "inference" o "assumption" — nunca "fact": una recomendación de acción nunca es algo que el usuario haya dicho textualmente, siempre es algo que vos derivás ("inference") o proponés como hipótesis ("assumption"). "confidence" y "basedOn" en "nextBestAction" significan exactamente lo mismo que en cualquier otro Claim.

El resultado tiene que seguir siendo una estrategia accionable, no una lista de advertencias: usá esta disciplina para ser honesto sobre qué es dato y qué no, sin dejar de proponer pasos concretos.`;

/**
 * Genera la MarketingStrategy a partir de las QuestionnaireAnswers del
 * wizard, llamando a Claude con Structured Output.
 *
 * MarketingStrategySchema cumple un doble rol acá: (1) le indica a Claude,
 * vía Structured Output, la forma exacta que tiene que tener su respuesta, y
 * (2) el SDK valida en runtime el JSON que Claude devuelve contra ese mismo
 * schema antes de dárnoslo — si no cumple, `parsed_output` viene null. No
 * hace falta un `MarketingStrategySchema.parse(...)` manual aparte: ya lo
 * hace `client.messages.parse(...)` con el mismo schema.
 */
export async function runMarketingAgent(answers: QuestionnaireAnswers): Promise<MarketingStrategy> {
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(answers) }],
    output_config: {
      format: zodOutputFormat(MarketingStrategySchema),
      effort: "low",
    },
  });

  if (!response.parsed_output) {
    throw new Error(
      `Claude no devolvió una respuesta con el formato esperado (stop_reason: ${response.stop_reason}).`
    );
  }

  return response.parsed_output;
}
