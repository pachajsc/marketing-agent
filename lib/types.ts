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

/**
 * Criterio del scoring de calificación (Fase 7) al que suma una evidencia.
 * Pesos máximos fijos (ver lib/qualification/qualify-prospects.ts):
 * relevance 30, location 20, contact 20, completeness 15, signals 15.
 */
export const QualificationCriterionSchema = z.enum([
  "relevance",
  "location",
  "contact",
  "completeness",
  "signals",
]);
export type QualificationCriterion = z.infer<typeof QualificationCriterionSchema>;

/**
 * Una señal que justifica (o no) la prioridad de un prospecto. Mismo
 * vocabulario de procedencia que Claim (fact/inference/assumption), con una
 * regla adicional: solo un "fact" puede sumar puntos. Una inferencia o un
 * supuesto puede mostrarse, pero nunca subir el score.
 */
export const QualificationEvidenceSchema = z
  .object({
    text: z.string().min(1),
    source: ClaimSourceSchema,
    /** Criterio al que suma `points`. Ausente en evidencias que no puntúan. */
    criterion: QualificationCriterionSchema.optional(),
    /** Puntos que aporta al score. Siempre 0 si `source` no es "fact". */
    points: z.number().int().min(0),
    /** Datos concretos en los que se apoya (ej: "prospect.phone", "answers.targetArea"). */
    basedOn: z.array(z.string().min(1)).min(1),
  })
  .refine((evidence) => evidence.source === "fact" || evidence.points === 0, {
    message: "Solo una evidencia 'fact' puede sumar puntos.",
  })
  .refine((evidence) => evidence.points === 0 || evidence.criterion !== undefined, {
    message: "Una evidencia que suma puntos tiene que indicar su criterio.",
  });
export type QualificationEvidence = z.infer<typeof QualificationEvidenceSchema>;

/** Prioridad de prospección derivada del score con thresholds fijos (no la decide ningún modelo). */
export const ProspectPrioritySchema = z.enum(["high", "medium", "low"]);
export type ProspectPriority = z.infer<typeof ProspectPrioritySchema>;

export const QualificationBreakdownSchema = z.object({
  relevance: z.number().int().min(0).max(30),
  location: z.number().int().min(0).max(20),
  contact: z.number().int().min(0).max(20),
  completeness: z.number().int().min(0).max(15),
  signals: z.number().int().min(0).max(15),
});
export type QualificationBreakdown = z.infer<typeof QualificationBreakdownSchema>;

/**
 * Calificación de un prospecto (Fase 7). `score` es prioridad de
 * prospección según señales observables — NO una probabilidad de
 * conversión. Las invariantes (score = suma del breakdown = suma de los
 * puntos de la evidencia, por criterio) se validan acá para que nadie pueda
 * presentar un número que no se explique con la evidencia.
 */
export const ProspectQualificationSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    priority: ProspectPrioritySchema,
    breakdown: QualificationBreakdownSchema,
    evidence: z.array(QualificationEvidenceSchema),
    /** Información relevante que no conocemos con los datos disponibles. */
    unknowns: z.array(z.string().min(1)),
    summary: z.string().min(1),
  })
  .refine(
    (q) => q.score === Object.values(q.breakdown).reduce((sum, points) => sum + points, 0),
    { message: "score tiene que ser la suma del breakdown." }
  )
  .refine(
    (q) =>
      QualificationCriterionSchema.options.every(
        (criterion) =>
          q.breakdown[criterion] ===
          q.evidence
            .filter((evidence) => evidence.criterion === criterion)
            .reduce((sum, evidence) => sum + evidence.points, 0)
      ),
    { message: "Cada criterio del breakdown tiene que coincidir con los puntos de su evidencia." }
  );
export type ProspectQualification = z.infer<typeof ProspectQualificationSchema>;

/**
 * Prospect + su calificación. Extiende ProspectSchema sin tocar ningún
 * campo existente: un consumidor que solo conoce Prospect sigue funcionando.
 */
export const QualifiedProspectSchema = ProspectSchema.extend({
  qualification: ProspectQualificationSchema,
});
export type QualifiedProspect = z.infer<typeof QualifiedProspectSchema>;

/**
 * Canal para el que se redacta un mensaje comercial (Fase 8). Solo define el
 * FORMATO (corto, conversacional): el proyecto no envía mensajes por ningún
 * canal.
 */
export const SalesMessageChannelSchema = z.enum(["whatsapp"]);
export type SalesMessageChannel = z.infer<typeof SalesMessageChannelSchema>;

/**
 * Sobre qué es una afirmación del mensaje:
 * - "prospect": algo sobre el negocio contactado. Solo puede citar hechos
 *   reales del Prospect (Google Places) o evidencia "fact" de su qualification.
 * - "offering": algo sobre el producto/servicio del usuario. Puede citar sus
 *   respuestas o la MarketingStrategy (nunca supuestos).
 */
export const SalesMessageClaimSubjectSchema = z.enum(["prospect", "offering"]);
export type SalesMessageClaimSubject = z.infer<typeof SalesMessageClaimSubjectSchema>;

/**
 * Lo que devuelve Claude (Structured Output) antes de pasar por la
 * validación de factualidad del código. Cada claim cita, por id, los datos
 * del contexto en los que se apoya: el código verifica que existan y que
 * sean de una fuente permitida — no se confía solo en el prompt.
 */
export const SalesMessageDraftSchema = z.object({
  /** Mensaje completo, listo para copiar. */
  message: z.string().min(1),
  /** Pregunta final de baja fricción. Tiene que aparecer literalmente en `message`. */
  cta: z.string().min(1),
  claims: z
    .array(
      z.object({
        /** Fragmento literal de `message` que contiene la afirmación. */
        quote: z.string().min(1),
        about: SalesMessageClaimSubjectSchema,
        /** Ids de los datos del contexto que la respaldan (ej: "prospect.website"). */
        basedOn: z.array(z.string().min(1)).min(1),
      })
    )
    .min(1),
});
export type SalesMessageDraft = z.infer<typeof SalesMessageDraftSchema>;

/** Afirmación del mensaje ya validada, con su procedencia derivada por el código (no declarada por Claude). */
export const SalesMessageClaimSchema = z.strictObject({
  quote: z.string().min(1),
  about: SalesMessageClaimSubjectSchema,
  /** "fact" si todo lo citado es hecho; "inference" si cita alguna inferencia. Nunca "assumption". */
  source: ClaimSourceSchema.exclude(["assumption"]),
  basedOn: z.array(z.string().min(1)).min(1),
});
export type SalesMessageClaim = z.infer<typeof SalesMessageClaimSchema>;

/**
 * Mensaje comercial personalizado para un prospecto calificado (Fase 8).
 * Se genera bajo demanda y NO se envía: el usuario lo revisa y lo copia.
 */
export const SalesMessageSchema = z.strictObject({
  /** Identificador estable del prospecto: su `mapsUrl` de Google (el proyecto no tiene otro id). */
  prospectId: z.string().min(1),
  channel: SalesMessageChannelSchema,
  message: z.string().min(1),
  cta: z.string().min(1),
  claims: z.array(SalesMessageClaimSchema).min(1),
  /** Lo que no sabemos del prospecto (de su qualification): el mensaje no puede afirmarlo. */
  unknowns: z.array(z.string().min(1)),
});
export type SalesMessage = z.infer<typeof SalesMessageSchema>;

/**
 * Estado comercial de un prospecto guardado en la app (SaaS). Lo cambia el
 * usuario (o la aprobación de un mensaje, para "ready"): sin WhatsApp no hay
 * forma automática de saber si alguien respondió, así que "replied" y
 * "qualified" son siempre marcas manuales. Ver lib/workspace/prospect-status.ts.
 */
export const ProspectStatusSchema = z.enum(["new", "ready", "contacted", "replied", "qualified", "rejected"]);
export type ProspectStatus = z.infer<typeof ProspectStatusSchema>;
