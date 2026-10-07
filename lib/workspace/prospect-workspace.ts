// Espacio de trabajo de prospectos — Fase 13.
//
// Estado por prospecto, derivado (no guardado aparte) de:
//   - la revisión de su mensaje (lib/review/message-review.ts), y
//   - dos marcas manuales del usuario: "revisado" y "contactado".
//
//   Nuevo → Revisado → Mensaje generado → Aprobado → Contactado
//
// "Contactado" lo marca el usuario después de usar el mensaje aprobado por
// fuera (la app no envía nada). Solo se puede marcar con el mensaje
// aprobado, y mientras está marcado el mensaje queda bloqueado (no se puede
// reabrir ni regenerar sin desmarcarlo antes).
//
// Módulo puro: sin React, sin red, sin Anthropic. Vive en memoria, igual que
// los prospectos: se pierde al recargar o al buscar de nuevo.
import {
  initialMessagePanelState,
  messagePanelReducer,
  reviewStatus,
  type MessagePanelAction,
  type MessagePanelState,
} from "@/lib/review/message-review";

export type ProspectStage = "new" | "reviewed" | "message" | "approved" | "contacted";

/** Orden del flujo, para conteos y leyendas. */
export const PROSPECT_STAGES: readonly ProspectStage[] = ["new", "reviewed", "message", "approved", "contacted"];

export interface ProspectWork {
  panel: MessagePanelState;
  reviewed: boolean;
  contacted: boolean;
}

/** Clave: prospectId (= mapsUrl, el identificador estable de Google). */
export type WorkspaceState = Readonly<Record<string, ProspectWork>>;

export type WorkspaceAction =
  | { type: "reset" }
  | { type: "panel"; prospectId: string; action: MessagePanelAction }
  | { type: "markReviewed"; prospectId: string }
  | { type: "markContacted"; prospectId: string }
  | { type: "unmarkContacted"; prospectId: string };

export const initialWorkspaceState: WorkspaceState = {};

const EMPTY_WORK: ProspectWork = { panel: initialMessagePanelState, reviewed: false, contacted: false };

export function workFor(state: WorkspaceState, prospectId: string): ProspectWork {
  return state[prospectId] ?? EMPTY_WORK;
}

export function prospectStage(work: ProspectWork): ProspectStage {
  if (work.contacted) return "contacted";
  const { review } = work.panel;
  if (review) {
    const status = reviewStatus(review);
    if (status === "approved") return "approved";
    if (status === "draft" || status === "edited") return "message";
    // Rechazado: el prospecto ya se miró, pero no tiene un mensaje utilizable.
    return "reviewed";
  }
  return work.reviewed ? "reviewed" : "new";
}

export function canMarkContacted(work: ProspectWork): boolean {
  return !work.contacted && prospectStage(work) === "approved";
}

function update(state: WorkspaceState, prospectId: string, work: ProspectWork): WorkspaceState {
  return { ...state, [prospectId]: work };
}

/** Una acción no permitida en el estado actual devuelve el mismo estado. */
export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  if (action.type === "reset") return initialWorkspaceState;

  const work = workFor(state, action.prospectId);
  switch (action.type) {
    case "panel": {
      // Contactado bloquea el mensaje: no se reabre ni se regenera algo que ya se usó.
      if (work.contacted) return state;
      const panel = messagePanelReducer(work.panel, action.action);
      return panel === work.panel ? state : update(state, action.prospectId, { ...work, panel });
    }
    case "markReviewed":
      return prospectStage(work) === "new" ? update(state, action.prospectId, { ...work, reviewed: true }) : state;
    case "markContacted":
      return canMarkContacted(work) ? update(state, action.prospectId, { ...work, contacted: true }) : state;
    case "unmarkContacted":
      return work.contacted ? update(state, action.prospectId, { ...work, contacted: false }) : state;
  }
}

/** Cuántos prospectos hay en cada etapa (los que no tienen trabajo cuentan como "Nuevo"). */
export function stageCounts(state: WorkspaceState, prospectIds: readonly string[]): Record<ProspectStage, number> {
  const counts: Record<ProspectStage, number> = { new: 0, reviewed: 0, message: 0, approved: 0, contacted: 0 };
  for (const id of prospectIds) counts[prospectStage(workFor(state, id))] += 1;
  return counts;
}
