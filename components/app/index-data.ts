// Convierte un prospecto guardado en una entrada del índice (lo justo para la fila).
import type { ProspectRecord } from "@/lib/server/repository";
import { eventLabel } from "./ActivityList";
import type { IndexEntryData } from "./IndexEntry";
import { humanizeType, priorityReason, shortAddress } from "./ui";

export function toIndexEntry(record: ProspectRecord, rank: number): IndexEntryData {
  const { prospect } = record;
  return {
    id: record.id,
    rank,
    name: prospect.name,
    place: shortAddress(prospect.address),
    category: humanizeType(prospect.primaryType),
    rating: prospect.rating,
    userRatingCount: prospect.userRatingCount,
    hasPhone: Boolean(prospect.phone),
    hasWebsite: Boolean(prospect.website),
    score: prospect.qualification.score,
    priority: prospect.qualification.priority,
    reason: priorityReason(prospect.qualification.summary),
    status: record.status,
    lastActivityLabel: record.lastActivity ? eventLabel(record.lastActivity.type) : null,
    lastActivityAt: record.lastActivity?.at ?? null,
  };
}
