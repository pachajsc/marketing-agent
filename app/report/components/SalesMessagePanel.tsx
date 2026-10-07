"use client";

import { useState } from "react";
import type { MarketingStrategy, QualifiedProspect, QuestionnaireAnswers, SalesMessage } from "@/lib/types";
import { SourceBadge } from "./SourceBadge";

/**
 * Mensaje comercial para UN prospecto (Fase 8). Se genera solo cuando el
 * usuario hace click: cada generación es una llamada facturable a Claude,
 * así que nada se dispara al renderizar, no hay reintentos automáticos y el
 * botón se oculta mientras hay una generación en curso (sin llamadas
 * duplicadas). El mensaje no se envía: solo se muestra y se puede copiar.
 */
type MessageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; salesMessage: SalesMessage };

interface SalesMessagePanelProps {
  prospect: QualifiedProspect;
  answers: QuestionnaireAnswers;
  /** Necesaria para describir el producto. Si todavía no cargó, no se puede generar. */
  strategy?: MarketingStrategy;
}

const MAX_UNKNOWNS = 3;

export function SalesMessagePanel({ prospect, answers, strategy }: SalesMessagePanelProps) {
  const [state, setState] = useState<MessageState>({ status: "idle" });
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  async function handleGenerate() {
    if (!strategy) return;
    setState({ status: "loading" });
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
      setState({ status: "ready", salesMessage });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido.";
      setState({ status: "error", message });
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
      {state.status === "loading" ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Generando mensaje con Claude...</p>
      ) : (
        <button
          type="button"
          onClick={handleGenerate}
          className="self-start rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-black hover:bg-zinc-100 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-800"
        >
          {state.status === "ready" ? "Generar de nuevo" : "Generar mensaje"}
        </button>
      )}

      {state.status === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.message}</p>
      )}

      {state.status === "ready" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Canal: WhatsApp — borrador para revisar y copiar. No se envía.
          </p>
          <p className="whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-sm text-black dark:bg-zinc-950 dark:text-white">
            {state.salesMessage.message}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy(state.salesMessage.message)}
              className="rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Copiar mensaje
            </button>
            {copied === "copied" && <span className="text-xs text-zinc-500 dark:text-zinc-400">Copiado.</span>}
            {copied === "failed" && (
              <span className="text-xs text-red-600 dark:text-red-400">No se pudo copiar; seleccioná el texto.</span>
            )}
          </div>

          <ul className="flex flex-col gap-1">
            {state.salesMessage.claims.map((claim, index) => (
              <li key={index} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <SourceBadge source={claim.source} />
                <span>
                  &quot;{claim.quote}&quot; — {claim.about === "prospect" ? "sobre el prospecto" : "sobre tu producto"};
                  basado en: {claim.basedOn.join(", ")}
                </span>
              </li>
            ))}
          </ul>

          {state.salesMessage.unknowns.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No afirmado por falta de datos: {state.salesMessage.unknowns.slice(0, MAX_UNKNOWNS).join(" ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
