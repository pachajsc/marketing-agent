// Estados comerciales de un prospecto guardado (app SaaS) y qué transiciones
// manuales están permitidas. Módulo puro: lo usan las Server Actions para
// validar (la regla vive en el servidor) y la UI para mostrar solo las
// acciones posibles.
//
//   Nuevo ──(mensaje aprobado)──▶ Listo para contactar ──▶ Contactado ──▶ Respondió ──▶ Calificado
//      ▲                                                                      │
//      └──────────────── Restaurar ◀── Descartado ◀── (desde cualquiera) ────┘
//
// "Listo para contactar" lo pone la aprobación del mensaje (no es una marca
// manual) y se pierde si el mensaje se reabre. "Contactado" exige un mensaje
// aprobado. "Respondió" y "Calificado" son marcas manuales: sin integración de
// mensajería no hay forma de detectarlas, y nunca se infieren.
import type { ProspectStatus } from "@/lib/types";

export const STATUS_LABEL: Record<ProspectStatus, string> = {
  new: "Nuevo",
  ready: "Listo para contactar",
  contacted: "Contactado",
  replied: "Respondió",
  qualified: "Calificado",
  rejected: "Descartado",
};

/** Orden del embudo, para filtros y leyendas. */
export const STATUS_ORDER: readonly ProspectStatus[] = ["new", "ready", "contacted", "replied", "qualified", "rejected"];

/** Transiciones que el usuario puede hacer a mano desde cada estado. */
const MANUAL_TRANSITIONS: Record<ProspectStatus, readonly ProspectStatus[]> = {
  new: ["rejected"],
  ready: ["contacted", "rejected"],
  contacted: ["replied", "rejected"],
  replied: ["qualified", "rejected"],
  qualified: ["rejected"],
  rejected: ["new"],
};

/** Etiqueta del botón para cada transición manual (desde la perspectiva de la acción). */
export const TRANSITION_LABEL: Record<ProspectStatus, string> = {
  new: "Restaurar",
  ready: "Listo para contactar",
  contacted: "Marcar como contactado",
  replied: "Marcar que respondió",
  qualified: "Marcar como calificado",
  rejected: "Descartar",
};

export interface StatusContext {
  /** Hay un mensaje aprobado para este prospecto. */
  hasApprovedMessage: boolean;
}

export function manualTransitions(from: ProspectStatus, context: StatusContext): ProspectStatus[] {
  return MANUAL_TRANSITIONS[from].filter((to) => to !== "contacted" || context.hasApprovedMessage);
}

export function canTransition(from: ProspectStatus, to: ProspectStatus, context: StatusContext): boolean {
  return manualTransitions(from, context).includes(to);
}

/** Estado después de aprobar un mensaje: solo "Nuevo" avanza a "Listo para contactar". */
export function statusAfterApproval(current: ProspectStatus): ProspectStatus {
  return current === "new" ? "ready" : current;
}

/** Estado después de reabrir un mensaje aprobado: "Listo para contactar" vuelve a "Nuevo". */
export function statusAfterReopen(current: ProspectStatus): ProspectStatus {
  return current === "ready" ? "new" : current;
}

/** Con el prospecto contactado (o más adelante) el mensaje aprobado ya se usó: queda bloqueado. */
export function isMessageLocked(status: ProspectStatus): boolean {
  return status === "contacted" || status === "replied" || status === "qualified";
}
