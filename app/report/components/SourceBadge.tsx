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
  fact: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  inference: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  assumption: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
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
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Confianza: {CONFIDENCE_LABEL[confidence]}
        </span>
      )}
    </div>
  );
}
