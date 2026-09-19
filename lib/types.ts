// Tipos compartidos del Marketing Agent.
// Se van completando a medida que avanzamos en los pasos del roadmap
// (ver README.md).

import { z } from "zod";

/** Objetivo comercial principal declarado en el cuestionario (Paso 1). */
export type MainGoal =
  | "first_customers"
  | "increase_sales"
  | "recurring_customers"
  | "higher_value_upsell";

/** Segmento de mercado: a quién le vende. */
export type BusinessType = "b2b" | "b2c";

/** Madurez comercial actual: sin clientes, algunos, o base estable. */
export type HasCustomersToday = "none" | "some" | "stable";

/** Respuestas del cuestionario guiado (Paso 1). */
export interface QuestionnaireAnswers {
  /** Qué producto o servicio vende. */
  offering: string;
  /** Qué quiere conseguir principalmente con este producto/servicio. */
  mainGoal: MainGoal;
  /** Qué problema o necesidad resuelve. */
  problem: string;
  /** A quién le vende: empresas o consumidores finales. */
  businessType: BusinessType;
  /** Precio o ticket promedio aproximado. */
  priceRange?: string;
  /** Madurez comercial actual (sin clientes / algunos / base estable). */
  hasCustomersToday: HasCustomersToday;
  /** Descripción narrativa del cliente ideal, con sus propias palabras. */
  idealCustomerDescription?: string;
  /** Categoría de negocios/profesionales/personas a las que apunta (universal, no depende de businessType). Alimenta la búsqueda en Google Maps más adelante. */
  businessCategoryToTarget?: string;
  /** Zona geográfica donde quiere conseguir nuevos clientes. */
  targetArea: string;
  /** Competidores conocidos, si los tiene identificados. */
  knownCompetitors?: string;
}

/**
 * De dónde sale una afirmación dentro de la estrategia:
 * - "fact": viene directo de una respuesta del usuario en QuestionnaireAnswers.
 * - "inference": se deriva razonablemente de uno o más hechos, pero no fue
 *   dicho explícitamente.
 * - "assumption": no tiene respaldo en los datos — el modelo la necesitó
 *   para completar la estrategia, pero es una hipótesis a validar.
 */
export const ClaimSourceSchema = z.enum(["fact", "inference", "assumption"]);
export type ClaimSource = z.infer<typeof ClaimSourceSchema>;

/** Qué tan seguro está el modelo de una afirmación (independiente de su procedencia). */
export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * Una afirmación individual dentro de la estrategia, con su procedencia
 * declarada en vez de mezclada en un string plano.
 */
export const ClaimSchema = z.object({
  /** El texto de la afirmación en sí. */
  text: z.string().min(1),
  /** De dónde sale: hecho, inferencia o supuesto. */
  source: ClaimSourceSchema,
  /** Opcional: qué tan seguro está el modelo de esta afirmación. */
  confidence: ConfidenceSchema.optional(),
  /**
   * Opcional: en qué se basa (ej: qué respuesta de QuestionnaireAnswers, o
   * qué otro razonamiento). Si está presente, ninguna entrada puede ser un
   * string vacío.
   */
  basedOn: z.array(z.string().min(1)).optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * Procedencia válida para un NextBestAction: a diferencia de un Claim
 * cualquiera, una acción recomendada nunca puede ser "fact" — el usuario
 * nunca declara textualmente cuál debería ser su próxima acción, así que
 * siempre es algo que el agente derivó ("inference") o propuso
 * ("assumption"). Se deriva de ClaimSourceSchema (no se repiten los
 * literales a mano) para que seguir siendo el mismo vocabulario de
 * procedencia en todo el proyecto.
 */
export const NextBestActionSourceSchema = ClaimSourceSchema.exclude(["fact"]);
export type NextBestActionSource = z.infer<typeof NextBestActionSourceSchema>;

/**
 * La acción más importante que el usuario debería tomar ahora para avanzar
 * con su producto o servicio. A diferencia del resto de MarketingStrategy,
 * es un objeto único (no un array de Claims): "la próxima acción" es por
 * definición una sola cosa, no una colección de afirmaciones — convertirla
 * en lista diluiría la idea de prioridad única.
 *
 * Reusa el mismo vocabulario de procedencia que Claim (source/confidence/
 * basedOn tienen exactamente el mismo significado) en vez de definir uno
 * nuevo, pero separa el contenido en 4 campos en lugar de un solo `text`
 * para distinguir explícitamente acción, objetivo, señal a observar y motivo.
 */
export const NextBestActionSchema = z.object({
  /** La acción concreta y ejecutable — algo que el usuario pueda hacer, no un objetivo abstracto. */
  action: z.string().min(1),
  /** Qué se busca aprender, validar o conseguir al realizar esa acción. */
  goal: z.string().min(1),
  /**
   * Qué señal observar como resultado de la acción (ej: "cuántos clubes
   * responden al mensaje"). Nunca un número, porcentaje o benchmark
   * inventado — describe qué mirar, no cuánto esperar.
   */
  metricToWatch: z.string().min(1),
  /** Por qué esta acción es la prioritaria ahora, y no otra. */
  reason: z.string().min(1),
  /** De dónde sale la recomendación: nunca "fact" (ver NextBestActionSourceSchema). */
  source: NextBestActionSourceSchema,
  /** Opcional: qué tan seguro está el modelo de esta recomendación. Mismo significado que en Claim. */
  confidence: ConfidenceSchema.optional(),
  /** Opcional: en qué se basa. Mismo significado y misma restricción (sin strings vacíos) que en Claim. */
  basedOn: z.array(z.string().min(1)).optional(),
});
export type NextBestAction = z.infer<typeof NextBestActionSchema>;

/**
 * Estrategia de marketing generada por el MarketingAgent a partir de
 * QuestionnaireAnswers (Paso 2). Los primeros 5 campos son listas de
 * Claims (no un string plano) para separar hechos, inferencias y supuestos
 * en vez de presentarlos todos con el mismo tono de certeza. `nextBestAction`
 * es la excepción deliberada: un objeto único, no una lista (ver su propio
 * comentario más arriba).
 *
 * El schema (no una interface separada) es la fuente de verdad del
 * contrato: describe la forma tanto para el compilador (vía z.infer) como
 * para runtime validation y Structured Output, evitando mantener dos
 * definiciones independientes del mismo tipo.
 */
export const MarketingStrategySchema = z.object({
  idealCustomerProfile: z.array(ClaimSchema).min(1),
  problemOrNeed: z.array(ClaimSchema).min(1),
  valueProposition: z.array(ClaimSchema).min(1),
  acquisitionChannels: z.array(ClaimSchema).min(1),
  initialStrategy: z.array(ClaimSchema).min(1),
  nextBestAction: NextBestActionSchema,
});

export type MarketingStrategy = z.infer<typeof MarketingStrategySchema>;

/**
 * Un negocio encontrado como prospecto vía Google Maps (Paso 3).
 *
 * Schema Zod (no interface) desde el Paso 4: el ProspectingAgent necesita
 * validar esta forma como Structured Output de Claude, mismo mecanismo que
 * MarketingStrategySchema.
 *
 * `primaryType`, `types` y `userRatingCount` son enriquecimiento agregado
 * para Qualification (Paso 4): datos crudos que Google Places devuelve tal
 * cual, sin interpretar. Todavía no son fact/inference/assumption ni
 * alimentan ningún score o veredicto de fit — eso es responsabilidad de la
 * etapa de Qualification, no de este tipo.
 */
export const ProspectSchema = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string().optional(),
  website: z.string().optional(),
  rating: z.number().optional(),
  mapsUrl: z.string(),
  /** Tipo principal del lugar según la taxonomía de Google Places (ej: "gym", "restaurant"). */
  primaryType: z.string().optional(),
  /** Todos los tipos que Google le asigna al lugar, en el mismo orden que los devuelve. */
  types: z.array(z.string()).optional(),
  /** Cantidad de reseñas detrás de `rating`. Sin esto, un rating de 5.0 con 2 reseñas y uno con 400 son indistinguibles. */
  userRatingCount: z.number().optional(),
});
export type Prospect = z.infer<typeof ProspectSchema>;

/**
 * Resultado del ProspectingAgent (Paso 4): una lista de Prospect reales.
 * "reales" no es una convención de nombre — es una garantía arquitectónica:
 * cada Prospect de esta lista tiene que provenir del tool_result de
 * search_prospects (y, en definitiva, de Google Places), nunca de texto
 * libre inventado por el modelo. Ver lib/agent/prospecting-agent.ts.
 */
export const ProspectingResultSchema = z.object({
  prospects: z.array(ProspectSchema),
});
export type ProspectingResult = z.infer<typeof ProspectingResultSchema>;

/**
 * En qué campo de QuestionnaireAnswers (o derivado) se apoya una búsqueda
 * propuesta por el ProspectingAgent (Fase 3). Enum cerrado a propósito: si
 * Claude propone un basedOnField fuera de esta lista, el parseo de Zod ya lo
 * rechaza — no puede inventar una fuente nueva.
 *
 * - "businessCategoryToTarget+targetArea": la búsqueda principal, literal,
 *   la misma que hoy ejecuta el Agent siempre que ese dato exista.
 * - "idealCustomerDescription": un ángulo adicional que Claude interpretó a
 *   partir de la descripción libre del cliente ideal. Por ser interpretación
 *   de texto libre, nunca puede fundamentar una búsqueda "fact" (ver
 *   groundProspectingSearch en prospecting-agent.ts).
 *
 * Deliberadamente NO incluye knownCompetitors: un competidor es un rival, no
 * un cliente potencial — usarlo como base de búsqueda de prospectos
 * confundiría el propósito del dato.
 */
export const ProspectingSearchBasedOnSchema = z.enum([
  "businessCategoryToTarget+targetArea",
  "idealCustomerDescription",
]);
export type ProspectingSearchBasedOn = z.infer<typeof ProspectingSearchBasedOnSchema>;

/**
 * Una búsqueda propuesta por el ProspectingAgent dentro de un
 * ProspectingPlan. `category`/`area` acá son la propuesta de Claude — el
 * código nunca las ejecuta tal cual: `groundProspectingSearch` en
 * prospecting-agent.ts las recalcula desde `answers` según `basedOnField`
 * antes de que puedan llegar a Google Places (mismo principio de grounding
 * de entrada que ya regía la Fase 1, ahora aplicado a un plan en vez de a un
 * único tool_use).
 */
export const ProspectingSearchSchema = z.object({
  category: z.string().min(1),
  area: z.string().min(1),
  /** Tope de resultados para esta búsqueda en particular. Nunca inventado sin motivo (ver SYSTEM_PROMPT). */
  limit: z.number().int().positive().max(20).optional(),
  /** Procedencia de esta búsqueda puntual — mismo vocabulario que Claim. */
  source: ClaimSourceSchema,
  /** En qué dato de QuestionnaireAnswers se apoya. */
  basedOnField: ProspectingSearchBasedOnSchema,
  /** Por qué esta búsqueda es relevante para este negocio en particular. */
  rationale: z.string().min(1),
});
export type ProspectingSearch = z.infer<typeof ProspectingSearchSchema>;

/**
 * Estrategia de prospección propuesta por el ProspectingAgent (Fase 3):
 * reemplaza la decisión trivial "¿llamo a search_prospects o no?" por
 * "¿qué búsquedas tienen sentido dado este negocio?". Sigue sin poder
 * ejecutarse directamente: `runProspectingAgent` valida cada `search` con
 * `groundProspectingSearch` y, según la política de ejecución vigente (solo
 * `source: "fact"` se ejecuta automáticamente — ver prospecting-agent.ts),
 * decide cuáles llegan realmente a Google Places.
 */
export const ProspectingPlanSchema = z.object({
  searches: z.array(ProspectingSearchSchema),
  /** Resumen del criterio general detrás del plan completo. */
  rationale: z.string().min(1),
});
export type ProspectingPlan = z.infer<typeof ProspectingPlanSchema>;
