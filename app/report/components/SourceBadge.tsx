import type { ClaimSource, Confidence } from "@/lib/types";

// Movido desde app/report/page.tsx (Fase 7) sin cambios de estilo: ahora lo
// usan tanto los Claims de la estrategia como la evidencia de calificación
// de ProspectsSection.

const SOURCE_LABEL: Record<ClaimSource, string> = {
  fact: "Hecho",
  inference: "Inferencia",
  assumption: "Supuesto",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const BADGE_STYLE: Record<ClaimSource, string> = {
  // Leyenda de la guía: hecho en tinta, inferencia en agua, supuesto sobre amarillo de tapa.
  fact: "bg-tinta/[0.07] text-tinta",
  inference: "bg-agua/10 text-agua",
  assumption: "bg-tapa/45 text-tinta",
};

/** Badge de procedencia (Hecho / Inferencia / Supuesto). */
export function SourceBadge({ source }: { source: ClaimSource }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_STYLE[source]}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

/**
 * Fila de badges (source + confidence) compartida entre ClaimCard y
 * NextBestActionCard — evita repetir la misma franja de JSX en las dos
 * tarjetas.
 */
export function SourceBadgeRow({ source, confidence }: { source: ClaimSource; confidence?: Confidence }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-2">
      <SourceBadge source={source} />
      {confidence && (
        <span className="text-xs text-grafito">
          Confianza: {CONFIDENCE_LABEL[confidence]}
        </span>
      )}
    </div>
  );
}
