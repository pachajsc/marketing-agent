import Link from "next/link";
import type { ProspectEvent, ProspectEventType } from "@/lib/server/repository";
import type { ProspectStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/workspace/prospect-status";
import { timeAgo } from "./ui";

const EVENT_LABEL: Record<ProspectEventType, string> = {
  found: "Prospecto encontrado",
  message_generated: "Mensaje generado",
  message_approved: "Mensaje aprobado",
  message_rejected: "Mensaje rechazado",
  message_reopened: "Mensaje reabierto",
  status_changed: "Estado actualizado",
};

// Cada tipo de evento es una marca de la leyenda: relleno + color con un rol.
const EVENT_MARK: Record<ProspectEventType, string> = {
  found: "border-tinta bg-hoja",
  message_generated: "border-tinta bg-tapa",
  message_approved: "border-plaza bg-plaza",
  message_rejected: "border-avenida bg-hoja",
  message_reopened: "border-lapiz bg-hoja",
  status_changed: "border-tinta bg-tinta",
};

/** "new→contacted" → "Nuevo → Contactado". */
function describeDetail(event: ProspectEvent): string | null {
  if (event.type !== "status_changed" || !event.detail) return null;
  const [from, to] = event.detail.split("→") as [ProspectStatus, ProspectStatus];
  return `${STATUS_LABEL[from] ?? from} → ${STATUS_LABEL[to] ?? to}`;
}

export function eventLabel(type: ProspectEventType): string {
  return EVENT_LABEL[type];
}

/** Registro de eventos reales, como las anotaciones al margen de la guía. */
export function ActivityList({ events, showProspect }: { events: ProspectEvent[]; showProspect: boolean }) {
  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const detail = describeDetail(event);
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < events.length - 1 && (
              <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-renglon" />
            )}
            <span aria-hidden="true" className={`mt-1.5 h-3 w-3 shrink-0 rounded-[2px] border-[1.5px] ${EVENT_MARK[event.type]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-tinta">
                <span className="font-semibold">{EVENT_LABEL[event.type]}</span>
                {showProspect && (
                  <>
                    {" · "}
                    <Link href={`/prospects/${event.prospectId}`} className="hover:underline">
                      {event.prospectName}
                    </Link>
                  </>
                )}
              </p>
              <p className="text-xs text-grafito">
                {detail ? `${detail} · ` : ""}
                <time dateTime={event.createdAt}>{timeAgo(event.createdAt)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
