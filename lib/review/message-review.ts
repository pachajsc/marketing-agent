// Revisión humana de mensajes comerciales — Fase 9.
//
// Generar → Revisar / Editar → Aprobar o Rechazar → (Copiar, solo aprobado).
//
// Módulo puro: sin React, sin red, sin Anthropic, sin persistencia. La UI
// (SalesMessagePanel) lo usa con useReducer; generar sigue siendo la única
// acción que llama a /api/sales-message (una llamada a Claude). Editar,
// restaurar, aprobar, rechazar y reabrir no hacen ninguna llamada.
//
// Modelo:
// - original: el SalesMessage completo que generó Claude. Nunca se modifica.
// - editedText: el texto editado por el usuario, o null si no hay edición.
// - el texto visible se deriva: editedText ?? original.message.
// - approvedText: se congela al aprobar; es exactamente el texto aprobado.
//
// La revisión vive solo en memoria (dura lo que duran los prospectos en
// pantalla): no se guarda ni se envía nada.
import type { SalesMessage, SalesMessageClaim } from "@/lib/types";

export type ReviewDecision = "pending" | "approved" | "rejected";

export interface MessageReview {
  original: SalesMessage;
  editedText: string | null;
  decision: ReviewDecision;
  approvedText: string | null;
}

/** Estado visible: "draft" y "edited" son la decisión "pending" con o sin edición. */
export type ReviewStatus = "draft" | "edited" | "approved" | "rejected";

export interface MessagePanelState {
  review: MessageReview | null;
  generating: boolean;
  error: string | null;
}

export type MessagePanelAction =
  | { type: "generateStart" }
  | { type: "generateSuccess"; salesMessage: SalesMessage }
  | { type: "generateFailure"; error: string }
  | { type: "edit"; text: string }
  | { type: "restoreOriginal" }
  | { type: "approve" }
  | { type: "reject" }
  | { type: "reopen" };

export const initialMessagePanelState: MessagePanelState = { review: null, generating: false, error: null };

export function visibleText(review: MessageReview): string {
  return review.editedText ?? review.original.message;
}

export function reviewStatus(review: MessageReview): ReviewStatus {
  if (review.decision !== "pending") return review.decision;
  return review.editedText === null ? "draft" : "edited";
}

/**
 * Generar (o regenerar) solo sin revisión, en borrador o rechazado. Con una
 * edición pendiente está bloqueado: primero hay que restaurar el original,
 * para no descartar en silencio lo que escribió el usuario. Aprobado
 * requiere reabrir primero.
 */
export function canGenerate(state: MessagePanelState): boolean {
  if (state.generating) return false;
  if (!state.review) return true;
  const status = reviewStatus(state.review);
  return status === "draft" || status === "rejected";
}

/** Nunca se aprueba un mensaje vacío o solo con espacios. */
export function canApprove(state: MessagePanelState): boolean {
  const { review } = state;
  return !state.generating && review !== null && review.decision === "pending" && visibleText(review).trim() !== "";
}

export function canCopy(review: MessageReview | null): review is MessageReview & { approvedText: string } {
  return review !== null && review.decision === "approved" && review.approvedText !== null;
}

/** Acciones de revisión: solo con una revisión pendiente y sin generación en curso. */
function pendingReview(state: MessagePanelState): MessageReview | null {
  return !state.generating && state.review?.decision === "pending" ? state.review : null;
}

/**
 * Transiciones. Una acción no permitida en el estado actual devuelve el
 * mismo estado (sin cambios), en vez de lanzar.
 */
export function messagePanelReducer(state: MessagePanelState, action: MessagePanelAction): MessagePanelState {
  switch (action.type) {
    case "generateStart":
      return canGenerate(state) ? { ...state, generating: true, error: null } : state;

    case "generateSuccess":
      if (!state.generating) return state;
      return {
        generating: false,
        error: null,
        review: { original: action.salesMessage, editedText: null, decision: "pending", approvedText: null },
      };

    case "generateFailure":
      // Un error al generar no pierde la revisión que ya existía.
      return state.generating ? { ...state, generating: false, error: action.error } : state;

    case "edit": {
      const review = pendingReview(state);
      if (!review) return state;
      // Volver exactamente al texto original deja de ser una edición.
      const editedText = action.text === review.original.message ? null : action.text;
      return { ...state, review: { ...review, editedText } };
    }

    case "restoreOriginal": {
      const review = pendingReview(state);
      return review ? { ...state, review: { ...review, editedText: null } } : state;
    }

    case "approve": {
      if (!canApprove(state) || !state.review) return state;
      return {
        ...state,
        review: { ...state.review, decision: "approved", approvedText: visibleText(state.review) },
      };
    }

    case "reject": {
      const review = pendingReview(state);
      return review ? { ...state, review: { ...review, decision: "rejected", approvedText: null } } : state;
    }

    case "reopen": {
      const { review } = state;
      if (state.generating || !review || review.decision === "pending") return state;
      // La edición se conserva: reabrir vuelve a "borrador" o "editado".
      return { ...state, review: { ...review, decision: "pending", approvedText: null } };
    }
  }
}

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Claims del mensaje original indicando si su fragmento sigue en el texto
 * visible. Si el usuario editó, lo que cambió o agregó no está verificado:
 * el validador de factualidad de la Fase 8 solo cubre el texto generado.
 */
export function claimsWithPresence(review: MessageReview): (SalesMessageClaim & { stillPresent: boolean })[] {
  const text = normalizeText(visibleText(review));
  return review.original.claims.map((claim) => ({
    ...claim,
    stillPresent: text.includes(normalizeText(claim.quote)),
  }));
}
