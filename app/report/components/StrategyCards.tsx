// Tarjetas de la estrategia (Claims y próxima mejor acción). Movidas sin
// cambios desde app/report/page.tsx para reutilizarlas en /strategy de la app.
import type { Claim, ClaimSource, MarketingStrategy, NextBestAction } from "@/lib/types";
import { SourceBadgeRow } from "./SourceBadge";

// Las claves de MarketingStrategy cuyo valor es un Claim[] — se calcula a
// partir de la forma real del tipo (no listando nombres a mano), así que si
// mañana se agrega o saca un campo Claim[], este tipo se actualiza solo.
// nextBestAction queda afuera porque su valor es un NextBestAction, no un
// Claim[]: por eso no puede pasar por STRATEGY_SECTIONS ni por .map().
type ClaimSectionKey = {
  [K in keyof MarketingStrategy]: MarketingStrategy[K] extends Claim[] ? K : never;
}[keyof MarketingStrategy];

// Qué sección de MarketingStrategy corresponde a cada título visible.
export const STRATEGY_SECTIONS: { key: ClaimSectionKey; title: string }[] = [
  { key: "idealCustomerProfile", title: "Cliente ideal" },
  { key: "problemOrNeed", title: "Problema o necesidad" },
  { key: "valueProposition", title: "Propuesta de valor" },
  { key: "acquisitionChannels", title: "Canales de adquisición" },
  { key: "initialStrategy", title: "Estrategia inicial" },
];

// Borde de la tarjeta según procedencia: neutro para hechos e inferencias,
// ámbar (sutil, no alarmista) para supuestos — para que se distingan de
// un vistazo sin depender solo de leer la etiqueta.
const CARD_BORDER: Record<ClaimSource, string> = {
  fact: "border-renglon",
  inference: "border-agua/30",
  assumption: "border-tapa-hondo",
};

/**
 * Tarjeta visual para un Claim individual. Local a esta página por ahora
 * (no es una abstracción global todavía) — si en el futuro otra pantalla
 * necesita mostrar Claims, ahí sí vale la pena moverla a components/.
 */
export function ClaimCard({ claim }: { claim: Claim }) {
  const isAssumption = claim.source === "assumption";
  return (
    <div className={`rounded-lg border bg-hoja p-3 ${CARD_BORDER[claim.source]}`}>
      <SourceBadgeRow source={claim.source} confidence={claim.confidence} />

      <p className="text-sm text-tinta">{claim.text}</p>

      {isAssumption && (
        <p className="mt-1.5 text-xs text-tinta">
          Conviene validar esto antes de actuar.
        </p>
      )}
      {claim.basedOn && claim.basedOn.length > 0 && (
        <p className="mt-1 text-xs text-lapiz">Basado en tus respuestas</p>
      )}
    </div>
  );
}

// Etiquetas de cada campo de contenido de NextBestAction, en el orden en
// que se muestran.
const NEXT_BEST_ACTION_FIELDS: { key: keyof Pick<NextBestAction, "action" | "goal" | "metricToWatch" | "reason">; label: string }[] = [
  { key: "action", label: "Acción recomendada" },
  { key: "goal", label: "Objetivo" },
  { key: "metricToWatch", label: "Qué observar" },
  { key: "reason", label: "Por qué ahora" },
];

/**
 * Tarjeta para NextBestAction — a diferencia de ClaimCard, no muestra un
 * único `text` sino 4 campos etiquetados (acción/objetivo/qué observar/por
 * qué ahora). No pasa por .map() como un Claim[] porque no lo es: es un
 * objeto único (ver el comentario de ClaimSectionKey más arriba).
 */
export function NextBestActionCard({ nextBestAction }: { nextBestAction: NextBestAction }) {
  const isAssumption = nextBestAction.source === "assumption";
  return (
    <div className={`rounded-lg border bg-hoja p-3 ${CARD_BORDER[nextBestAction.source]}`}>
      <SourceBadgeRow source={nextBestAction.source} confidence={nextBestAction.confidence} />

      <dl className="flex flex-col gap-2">
        {NEXT_BEST_ACTION_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <dt className="text-xs font-medium uppercase tracking-wide text-grafito">
              {label}
            </dt>
            <dd className="text-sm text-tinta">{nextBestAction[key]}</dd>
          </div>
        ))}
      </dl>

      {isAssumption && (
        <p className="mt-2 text-xs text-tinta">
          Conviene validar esto antes de actuar.
        </p>
      )}
      {nextBestAction.basedOn && nextBestAction.basedOn.length > 0 && (
        <p className="mt-1 text-xs text-lapiz">Basado en tus respuestas</p>
      )}
    </div>
  );
}
