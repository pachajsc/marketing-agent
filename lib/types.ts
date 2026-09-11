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
 * Estrategia de marketing generada por el MarketingAgent a partir de
 * QuestionnaireAnswers (Paso 2). Cada campo es ahora una lista de Claims
 * (no un string plano) para separar hechos, inferencias y supuestos en
 * vez de presentarlos todos con el mismo tono de certeza.
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
});

export type MarketingStrategy = z.infer<typeof MarketingStrategySchema>;

/** Un negocio encontrado como prospecto vía Google Maps (Paso 3). */
export interface Prospect {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  mapsUrl: string;
}
