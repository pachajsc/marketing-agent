import { isDemoMode } from "@/lib/demo/demo-mode";

/**
 * Franja visible en todas las pantallas cuando AI_MODE=demo: lo que se ve son
 * respuestas grabadas de ejemplo, no resultados del negocio del usuario.
 */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div role="status" className="bg-tinta px-4 py-2 text-center text-xs font-semibold text-tapa">
      Modo demo: respuestas de ejemplo grabadas (caso pádel en Buenos Aires). No se usa IA ni Google, no hay costo y los
      datos no representan tu negocio.
    </div>
  );
}
