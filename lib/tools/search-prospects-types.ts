// Contrato del Tool search_prospects: buscar negocios reales que matcheen
// un nicho + zona, vía Google Places API (New).
//
// `Prospect` (la forma de salida) ya vive en lib/types.ts — es la fuente de
// verdad del contrato de datos del proyecto (ver AGENTS.md) — así que acá
// solo se define el input de esta capability, sin duplicar esa forma.
//
// A diferencia de QuestionnaireAnswers (interface sin schema, decisión
// deliberada porque ese input ya se valida en el wizard antes de llegar al
// servidor — ver isStepValid), este input llega desde afuera (del modelo, vía
// tool_use) sin garantía previa: por eso el schema Zod es la fuente de
// verdad acá, y el tipo se deriva con z.infer, mismo patrón que
// MarketingStrategySchema.
import { z } from "zod";

/**
 * Preferencia de cercanía: un centro (la ubicación real del dispositivo que
 * busca, nunca inventada) más un radio en km. Un único objeto (no dos campos
 * sueltos) a propósito: no tiene sentido un radio sin centro ni viceversa —
 * así no existe un estado parcial inválido que validar aparte.
 *
 * Mapea a `locationBias.circle` en Google Places Text Search (New): es una
 * preferencia, no una restricción dura — Google puede devolver resultados
 * fuera del radio si no hay suficientes adentro (Text Search (New) no
 * soporta un `locationRestriction` circular, solo rectangular). Ver
 * google-places.ts.
 */
export const SearchProximitySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Máximo 50 km: límite real del radio de `locationBias.circle` en la API de Google (50 000 m). */
  radiusKm: z.number().positive().max(50),
});

export type SearchProximity = z.infer<typeof SearchProximitySchema>;

export const SearchProspectsInputSchema = z.object({
  /** Categoría/nicho de negocio a buscar (ej: "gimnasios", "estudios contables"). */
  category: z.string().trim().min(1, "category es obligatorio."),
  /** Zona geográfica en texto libre (ej: "Ciudad de Buenos Aires, zona norte del GBA"). */
  area: z.string().trim().min(1, "area es obligatorio."),
  /**
   * Tope de resultados. Opcional: si no se especifica, searchProspects usa
   * su propio default. El máximo (20) coincide con el límite real de
   * pageSize de Text Search (New) sin paginar — ver google-places.ts.
   */
  limit: z.number().int().positive().max(20).optional(),
  /** Opcional: preferencia de cercanía a la ubicación real del dispositivo que busca. */
  proximity: SearchProximitySchema.optional(),
});

export type SearchProspectsInput = z.infer<typeof SearchProspectsInputSchema>;
