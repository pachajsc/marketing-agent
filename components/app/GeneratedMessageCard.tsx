"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateMessageAction, reviewMessageAction } from "@/app/(app)/actions";
import { SourceBadge } from "@/app/report/components/SourceBadge";
import {
  canGenerate,
  claimsWithPresence,
  reviewStatus,
  visibleText,
  type MessageReview,
  type ReviewStatus,
} from "@/lib/review/message-review";
import { ui } from "./ui";

const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Borrador de la IA",
  edited: "Editado por vos",
  approved: "Aprobado",
  rejected: "Rechazado",
};

type ReviewAction = { type: "edit"; text: string } | { type: "restoreOriginal" } | { type: "approve" } | { type: "reject" } | { type: "reopen" };

// Barra de acciones: fija abajo en el celular (sobre la navegación) para
// aprobar o copiar con el pulgar; en escritorio vuelve al flujo.
const ACTION_BAR =
  "sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-renglon bg-hoja/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none lg:bottom-auto";

/**
 * El mensaje de un prospecto, persistido: generar (1 llamada a Claude),
 * editar, aprobar, rechazar, reabrir y copiar (solo aprobado). Las reglas son
 * las de lib/review/message-review.ts y el servidor las vuelve a aplicar.
 * Aprobar solo cambia el estado: no se envía nada.
 */
export function GeneratedMessageCard({
  prospectId,
  initialReview,
  hasStrategy,
  locked,
}: {
  prospectId: string;
  initialReview: MessageReview | null;
  hasStrategy: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [review, setReview] = useState(initialReview);
  const [draft, setDraft] = useState(initialReview ? visibleText(initialReview) : "");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  const status = review ? reviewStatus(review) : null;
  const editable = status === "draft" || status === "edited";
  const dirty = Boolean(review && editable && draft !== visibleText(review));
  const generationAllowed = !locked && canGenerate({ review, generating: false, error: null });

  function applyReview(next: MessageReview) {
    setReview(next);
    setDraft(visibleText(next));
    router.refresh();
  }

  async function run(label: string, action: () => Promise<{ ok: true; data: MessageReview } | { ok: false; error: string }>) {
    setPending(label);
    setError(null);
    setCopied("idle");
    const result = await action();
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    applyReview(result.data);
    return true;
  }

  const reviewAction = (action: ReviewAction) => () => reviewMessageAction(prospectId, action);

  async function handleApprove() {
    // Si hay cambios sin guardar, primero se guardan: se aprueba exactamente lo que se ve.
    if (dirty && !(await run("save", reviewAction({ type: "edit", text: draft })))) return;
    await run("approve", reviewAction({ type: "approve" }));
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section className={`${ui.hojaPadded} flex flex-col gap-4`} aria-labelledby="mensaje-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mensaje-titulo" className={ui.sectionTitle}>
          Mensaje
        </h2>
        {status && (
          <span
            className={`text-xs font-bold uppercase tracking-[0.06em] ${
              status === "approved" ? "text-plaza" : status === "rejected" ? "text-avenida" : "text-grafito"
            }`}
          >
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>

      {!hasStrategy && !review ? (
        <p className={ui.muted}>
          Para escribir mensajes primero generá tu{" "}
          <Link href="/strategy" className={ui.link}>
            estrategia
          </Link>
          : el mensaje describe tu producto con ella.
        </p>
      ) : !review ? (
        <div className="flex flex-col gap-3">
          <p className={ui.muted}>
            Un primer mensaje para WhatsApp, escrito solo con datos reales de este negocio y tu estrategia. Lo revisás antes de usarlo.
          </p>
          <div className={ACTION_BAR}>
            <button
              type="button"
              onClick={() => run("generate", () => generateMessageAction(prospectId))}
              disabled={pending !== null || !hasStrategy}
              className={`${ui.buttonPrimary} flex-1 sm:flex-none`}
            >
              {pending === "generate" ? "Escribiendo… unos segundos" : "Escribir mensaje"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {editable ? (
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">Mensaje</span>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={8}
                disabled={pending !== null}
                className={`${ui.input} min-h-48 leading-relaxed`}
              />
            </label>
          ) : (
            <p
              className={`whitespace-pre-wrap rounded-md border border-renglon bg-plano p-4 text-base leading-relaxed ${
                status === "rejected" ? "text-lapiz line-through" : "text-tinta"
              }`}
            >
              {status === "approved" ? review.approvedText : visibleText(review)}
            </p>
          )}

          {status === "edited" && (
            <p className="text-xs text-grafito">
              Lo que cambiaste no fue verificado contra los datos. Para escribir uno nuevo, primero restaurá el original.
            </p>
          )}
          {locked && <p className="text-xs text-grafito">Ya lo contactaste: el mensaje aprobado queda fijo.</p>}

          <div className={ACTION_BAR}>
            {editable && (
              <>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={pending !== null || draft.trim() === ""}
                  className={`${ui.buttonPrimary} flex-1 sm:flex-none`}
                >
                  {pending === "approve" || pending === "save" ? "Aprobando…" : "Aprobar"}
                </button>
                {dirty && (
                  <button
                    type="button"
                    onClick={() => run("save", reviewAction({ type: "edit", text: draft }))}
                    disabled={pending !== null}
                    className={ui.buttonSecondary}
                  >
                    Guardar
                  </button>
                )}
                <button type="button" onClick={() => run("reject", reviewAction({ type: "reject" }))} disabled={pending !== null} className={ui.buttonGhost}>
                  Rechazar
                </button>
                {status === "edited" && (
                  <button
                    type="button"
                    onClick={() => run("restore", reviewAction({ type: "restoreOriginal" }))}
                    disabled={pending !== null}
                    className={ui.buttonGhost}
                  >
                    Restaurar original
                  </button>
                )}
              </>
            )}

            {status === "approved" && review.approvedText && (
              <button type="button" onClick={() => handleCopy(review.approvedText!)} className={`${ui.buttonPrimary} flex-1 sm:flex-none`}>
                {copied === "copied" ? "Copiado" : "Copiar para WhatsApp"}
              </button>
            )}

            {!locked && (status === "approved" || status === "rejected") && (
              <button type="button" onClick={() => run("reopen", reviewAction({ type: "reopen" }))} disabled={pending !== null} className={ui.buttonSecondary}>
                Reabrir
              </button>
            )}

            {!locked && (status === "draft" || status === "edited" || status === "rejected") && (
              <button
                type="button"
                onClick={() => run("generate", () => generateMessageAction(prospectId))}
                disabled={pending !== null || !generationAllowed || dirty}
                className={ui.buttonGhost}
              >
                {pending === "generate" ? "Escribiendo…" : "Escribir otro"}
              </button>
            )}

            {copied === "failed" && <span className="text-xs font-semibold text-avenida">No se pudo copiar: seleccioná el texto.</span>}
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-grafito">De dónde sale cada afirmación</summary>
            <ul className="mt-3 flex flex-col gap-2">
              {claimsWithPresence(review).map((claim, index) => (
                <li key={index} className="flex items-start gap-2 text-grafito">
                  <SourceBadge source={claim.source} />
                  <span className={claim.stillPresent ? "text-tinta" : "line-through"}>
                    &quot;{claim.quote}&quot; — {claim.about === "prospect" ? "sobre el negocio" : "sobre tu producto"}
                    {!claim.stillPresent && <span className="no-underline"> (lo cambiaste vos)</span>}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <p className="text-xs text-grafito">Aprobar solo lo deja listo para copiar. La app no envía nada.</p>
        </>
      )}

      {error && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}
    </section>
  );
}
