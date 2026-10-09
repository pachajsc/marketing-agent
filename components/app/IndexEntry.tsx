import Link from "next/link";
import type { ProspectPriority, ProspectStatus } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { Placa } from "./Tapa";
import { timeAgo } from "./ui";

/** Datos de una entrada del índice: solo lo que muestra la fila (sin la evidencia completa). */
export interface IndexEntryData {
  id: string;
  rank: number;
  name: string;
  /** Dirección corta (calle · ciudad). */
  place: string;
  category?: string;
  rating?: number;
  userRatingCount?: number;
  hasPhone: boolean;
  hasWebsite: boolean;
  score: number;
  priority: ProspectPriority;
  /** Por qué tiene esa prioridad, en una línea (del resumen de la calificación). */
  reason: string;
  status: ProspectStatus;
  lastActivityLabel: string | null;
  lastActivityAt: string | null;
}

const PRIORITY_LABEL: Record<ProspectPriority, string> = { high: "alta", medium: "media", low: "baja" };

/**
 * Una entrada del índice de la guía: placa con el número de orden, el nombre
 * en el índice condensado, la referencia (dirección) y la prioridad con su
 * prueba en una línea. Toda la fila es el enlace a la ficha.
 */
export function IndexEntry({ entry, order = 0 }: { entry: IndexEntryData; order?: number }) {
  const rejected = entry.status === "rejected";
  return (
    <li
      className="animate-[entrada_420ms_cubic-bezier(0.16,1,0.3,1)_both]"
      style={{ animationDelay: `${Math.min(order, 8) * 45}ms` }}
    >
      <Link
        href={`/prospects/${entry.id}`}
        className={`group flex gap-3 px-4 py-4 transition-colors duration-150 hover:bg-plano focus-visible:bg-plano sm:px-5 ${rejected ? "opacity-60" : ""}`}
      >
        <Placa rank={entry.rank} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <p className="indice text-lg font-bold leading-tight text-tinta group-hover:underline">{entry.name}</p>
            <span className="pt-1">
              <StatusBadge status={entry.status} />
            </span>
          </div>
          <p className="truncate text-sm text-grafito">{entry.place}</p>
          <p className="line-clamp-2 text-sm text-tinta">
            <span className="font-bold tabular-nums">{entry.score}</span>
            <span className="font-semibold"> · prioridad {PRIORITY_LABEL[entry.priority]}</span>
            <span className="text-grafito"> — {entry.reason}</span>
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-grafito">
            {entry.category && <span>{entry.category}</span>}
            {typeof entry.rating === "number" && (
              <span className="tabular-nums">
                ★ {entry.rating}
                {typeof entry.userRatingCount === "number" && ` (${entry.userRatingCount})`}
              </span>
            )}
            {entry.hasPhone && <span>Teléfono</span>}
            {entry.hasWebsite && <span>Sitio web</span>}
            {entry.lastActivityLabel && entry.lastActivityAt && (
              <span>
                {entry.lastActivityLabel} · {timeAgo(entry.lastActivityAt)}
              </span>
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}
