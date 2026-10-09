import type { ProspectStatus } from "@/lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/workspace/prospect-status";

/**
 * El estado se lee por relleno además del color, como las referencias de un
 * plano: se distingue al sol y sin depender de ver colores.
 *   Nuevo: contorno · Listo: rayado · Contactado: lleno tinta ·
 *   Respondió: lleno agua · Calificado: lleno plaza · Descartado: tachado.
 */
const SWATCH: Record<ProspectStatus, string> = {
  new: "border-tinta bg-hoja",
  ready: "border-tinta rayado",
  contacted: "border-tinta bg-tinta",
  replied: "border-agua bg-agua",
  qualified: "border-plaza bg-plaza",
  rejected: "border-lapiz bg-hoja",
};

function Swatch({ status }: { status: ProspectStatus }) {
  return (
    <span aria-hidden="true" className={`relative inline-block h-3 w-3 shrink-0 rounded-[2px] border-[1.5px] ${SWATCH[status]}`}>
      {status === "rejected" && <span className="absolute left-[-2px] top-1/2 h-[1.5px] w-[13px] -rotate-45 bg-lapiz" />}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProspectStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${
        status === "rejected" ? "text-lapiz line-through" : "text-tinta"
      }`}
    >
      <Swatch status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Referencias: la leyenda de estados, como el recuadro de una guía de calles. */
export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-grafito">Referencias</span>
      {STATUS_ORDER.map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  );
}
