"use client";

import { useState } from "react";
import type { MarketingStrategy, QualifiedProspect, QuestionnaireAnswers, SalesMessage } from "@/lib/types";
import {
  canApprove,
  canCopy,
  canGenerate,
  claimsWithPresence,
  reviewStatus,
  visibleText,
  type MessagePanelAction,
  type MessagePanelState,
  type ReviewStatus,
} from "@/lib/review/message-review";
import { SourceBadge } from "./SourceBadge";

/**
 * Mensaje comercial para UN prospecto (Fase 8) con revisión humana (Fase 9):
 * Generar → Revisar / Editar → Aprobar o Rechazar → Copiar (solo aprobado).
 *
 * Solo "Generar" llama a /api/sales-message (una llamada facturable a
 * Claude), y solo cuando el usuario hace click: nada se dispara al
 * renderizar, no hay reintentos automáticos ni generaciones en paralelo.
 * Editar, restaurar, aprobar, rechazar, reabrir y copiar son locales (ver
 * lib/review/message-review.ts). La revisión vive en memoria y no se envía
 * nada.
 *
 * Fase 13: el estado lo guarda ProspectsSection (lib/workspace/), para poder
 * derivar la etapa de cada prospecto; este componente lo recibe y despacha
 * acciones. `locked` = prospecto marcado como contactado: el mensaje aprobado
 * queda fijo.
 */
interface SalesMessagePanelProps {
  prospect: QualifiedProspect;
  answers: QuestionnaireAnswers;
  /** Necesaria para describir el producto. Si todavía no cargó, no se puede generar. */
  strategy?: MarketingStrategy;
  state: MessagePanelState;
  dispatch: (action: MessagePanelAction) => void;
  locked: boolean;
}

const MAX_UNKNOWNS = 3;

const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Borrador IA",
  edited: "Editado",
  approved: "Aprobado",
  rejected: "Rechazado",
};

const STATUS_STYLE: Record<ReviewStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  edited: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  approved: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  rejected: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const SECONDARY_BUTTON =
  "rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-black hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800";
const PRIMARY_BUTTON =
  "rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200";

export function SalesMessagePanel({ prospect, answers, strategy, state, dispatch, locked }: SalesMessagePanelProps) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const { review } = state;
  const status = review ? reviewStatus(review) : null;

  async function handleGenerate() {
    if (!strategy || locked || !canGenerate(state)) return;
    dispatch({ type: "generateStart" });
    setCopied("idle");
    try {
      const response = await fetch("/api/sales-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, strategy, prospect }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Error ${response.status} generando el mensaje.`);
      }

      const salesMessage = (await response.json()) as SalesMessage;
      dispatch({ type: "generateSuccess", salesMessage });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido.";
      dispatch({ type: "generateFailure", error: message });
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  if (!strategy) {
    return (
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        El mensaje se puede generar cuando la estrategia termine de cargar.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      {state.generating ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Generando mensaje con Claude...</p>
      ) : (
        !locked &&
        (!review || status === "draft" || status === "edited" || status === "rejected") && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate(state)}
              className={`self-start ${SECONDARY_BUTTON}`}
            >
              {review ? "Generar de nuevo" : "Generar mensaje"}
            </button>
            {status === "edited" && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Para generar de nuevo, primero restaurá el original: así no se pierde tu edición sin querer.
              </p>
            )}
          </div>
        )
      )}

      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}

      {review && status && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
              {STATUS_LABEL[status]}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Canal: WhatsApp</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            La revisión no se guarda: se pierde al recargar o volver a buscar. No se envía nada.
          </p>

          {status === "draft" || status === "edited" ? (
            <textarea
              value={visibleText(review)}
              onChange={(event) => dispatch({ type: "edit", text: event.target.value })}
              disabled={state.generating}
              rows={6}
              aria-label="Mensaje a revisar"
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
          ) : (
            <p
              className={`whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-sm dark:bg-zinc-950 ${
                status === "rejected" ? "text-zinc-400 line-through dark:text-zinc-500" : "text-black dark:text-white"
              }`}
            >
              {status === "approved" ? review.approvedText : visibleText(review)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {(status === "draft" || status === "edited") && (
              <>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "approve" })}
                  disabled={!canApprove(state)}
                  className={PRIMARY_BUTTON}
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "reject" })}
                  disabled={state.generating}
                  className={SECONDARY_BUTTON}
                >
                  Rechazar
                </button>
                {status === "edited" && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "restoreOriginal" })}
                    disabled={state.generating}
                    className={SECONDARY_BUTTON}
                  >
                    Restaurar original
                  </button>
                )}
              </>
            )}

            {canCopy(review) && (
              <button type="button" onClick={() => handleCopy(review.approvedText)} className={PRIMARY_BUTTON}>
                Copiar mensaje aprobado
              </button>
            )}

            {!locked && (status === "approved" || status === "rejected") && (
              <button
                type="button"
                onClick={() => {
                  setCopied("idle");
                  dispatch({ type: "reopen" });
                }}
                disabled={state.generating}
                className={SECONDARY_BUTTON}
              >
                Reabrir
              </button>
            )}

            {copied === "copied" && <span className="text-xs text-zinc-500 dark:text-zinc-400">Copiado.</span>}
            {copied === "failed" && (
              <span className="text-xs text-red-600 dark:text-red-400">No se pudo copiar; seleccioná el texto.</span>
            )}
          </div>

          {(status === "draft" || status === "edited") && visibleText(review).trim() === "" && (
            <p className="text-xs text-red-600 dark:text-red-400">No se puede aprobar un mensaje vacío.</p>
          )}

          <ul className="flex flex-col gap-1">
            {claimsWithPresence(review).map((claim, index) => (
              <li key={index} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <SourceBadge source={claim.source} />
                <span className={claim.stillPresent ? undefined : "line-through"}>
                  &quot;{claim.quote}&quot; — {claim.about === "prospect" ? "sobre el prospecto" : "sobre tu producto"};
                  basado en: {claim.basedOn.join(", ")}
                </span>
                {!claim.stillPresent && <span className="shrink-0">(modificado por vos)</span>}
              </li>
            ))}
          </ul>

          {review.editedText !== null && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Editaste el mensaje: lo que agregaste o cambiaste no fue verificado contra los datos.
            </p>
          )}

          {review.original.unknowns.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No afirmado por falta de datos: {review.original.unknowns.slice(0, MAX_UNKNOWNS).join(" ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
