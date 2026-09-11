"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketingStrategy, QuestionnaireAnswers } from "@/lib/types";

/**
 * Antes: esta página llamaba a runMarketingAgent directamente (cálculo
 * local, instantáneo, sin red). Ahora runMarketingAgent llama a Claude y
 * necesita ANTHROPIC_API_KEY, que solo puede vivir en el servidor — por eso
 * este Client Component ya no la importa, y en cambio hace fetch a
 * /api/marketing-strategy. Eso agrega dos estados que antes no existían:
 * "loading" (la llamada ya no es instantánea) y "error" (antes la función
 * nunca fallaba; ahora puede fallar por red, rate limit, etc.).
 */
type ReportState =
  | { status: "no-answers" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; strategy: MarketingStrategy };

function readStoredAnswers(): QuestionnaireAnswers | null {
  // Durante el render en el servidor (SSR) no existe sessionStorage; en el
  // cliente sí. El efecto que llama a esta función solo corre en el
  // navegador, después de hidratarse.
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("questionnaireAnswers");
    if (!raw) return null;
    return JSON.parse(raw) as QuestionnaireAnswers;
  } catch {
    return null;
  }
}

export default function ReportPage() {
  // Se lee una sola vez, de forma perezosa, igual que antes: solo corre en
  // el navegador porque el componente no se ejecuta hasta hidratarse.
  const [answers] = useState<QuestionnaireAnswers | null>(readStoredAnswers);
  const [state, setState] = useState<ReportState>(
    answers ? { status: "loading" } : { status: "no-answers" }
  );

  useEffect(() => {
    // Si no hay respuestas guardadas, el estado inicial ya quedó en
    // "no-answers" — nada que buscar. Evitamos llamar a setState de forma
    // síncrona acá adentro (el linter de React lo desaconseja): el estado
    // ya refleja ese caso desde el render inicial.
    if (!answers) return;

    let cancelled = false;

    async function fetchStrategy() {
      try {
        const response = await fetch("/api/marketing-strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(answers),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Error ${response.status} generando la estrategia.`);
        }

        const strategy = (await response.json()) as MarketingStrategy;
        if (!cancelled) setState({ status: "ready", strategy });
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Error desconocido.";
          setState({ status: "error", message });
        }
      }
    }

    fetchStrategy();
    return () => {
      cancelled = true;
    };
  }, [answers]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <h1 className="text-2xl font-semibold text-black dark:text-white">
          Tu estrategia de marketing
        </h1>

        {state.status === "loading" && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Generando tu estrategia con el Marketing Intelligence Agent...
          </p>
        )}

        {state.status === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
        )}

        {state.status === "ready" && (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Esto es lo que armó el Marketing Intelligence Agent a partir de tus respuestas.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 text-sm text-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
              {JSON.stringify(state.strategy, null, 2)}
            </pre>
          </>
        )}

        {state.status === "no-answers" && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Todavía no completaste el cuestionario.{" "}
            <Link href="/questionnaire" className="underline">
              Empezar ahora
            </Link>
            .
          </p>
        )}
      </main>
    </div>
  );
}
