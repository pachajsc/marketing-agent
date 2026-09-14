// Contrato de la primera capability de prospecting: buscar negocios reales
// que matcheen un nicho + zona, vía Google Places API (New).
//
// `Prospect` (la forma de salida) ya vive en lib/types.ts — es la fuente de
// verdad del contrato de datos del proyecto (ver AGENTS.md) — así que acá
// solo se define el input de esta capability, sin duplicar esa forma.
//
// A diferencia de QuestionnaireAnswers (interface sin schema, decisión
// deliberada porque ese input ya se valida en el wizard antes de llegar al
// servidor — ver isStepValid), este input llega desde afuera sin garantía
// previa: por eso el schema Zod es la fuente de verdad acá, y el tipo se
// deriva con z.infer, mismo patrón que MarketingStrategySchema.
import { z } from "zod";

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
});

export type SearchProspectsInput = z.infer<typeof SearchProspectsInputSchema>;
