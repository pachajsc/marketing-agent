// Tipos compartidos del Marketing Agent.
// Se van completando a medida que avanzamos en los pasos del roadmap
// (ver README.md).

/** Objetivo comercial principal declarado en el cuestionario (Paso 1). */
export type MainGoal =
  | "first_customers"
  | "increase_sales"
  | "recurring_customers"
  | "higher_value_upsell";

/** Segmento de mercado: a quién le vende. */
export type BusinessType = "b2b" | "b2c";

/** Si ya tiene clientes hoy o todavía no. */
export type HasCustomersToday = "yes" | "no" | "unsure";

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
  /** Si ya le vende a alguien hoy. */
  hasCustomersToday: HasCustomersToday;
  /** Descripción del cliente actual (si ya vende) o hipótesis de a quién le vendería. */
  idealCustomerDescription?: string;
  /** Tipo de negocio objetivo, solo si businessType === "b2b". Alimenta la búsqueda en Google Maps. */
  businessCategoryToTarget?: string;
  /** Rasgos del cliente ideal, solo si businessType === "b2c". */
  idealCustomerTraits?: string;
  /** Zona geográfica donde quiere conseguir nuevos clientes. */
  targetArea: string;
  /** Competidores conocidos, si los tiene identificados. */
  knownCompetitors?: string;
}

/** Análisis generado por IA a partir de las respuestas (Paso 2). */
export interface AnalysisResult {
  idealCustomerProfile: string;
  problemOrNeed: string;
  valueProposition: string;
  acquisitionChannels: string[];
  initialStrategy: string;
}

/** Un negocio encontrado como prospecto vía Google Maps (Paso 3). */
export interface Prospect {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  mapsUrl: string;
}
