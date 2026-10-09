"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketingStrategy, QuestionnaireAnswers } from "@/lib/types";
import { ProspectsSection } from "./components/ProspectsSection";
import { ClaimCard, NextBestActionCard, STRATEGY_SECTIONS } from "./components/StrategyCards";

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
  // Estado inicial universal: el mismo en el servidor y en el primer
  // render del cliente, porque no depende de sessionStorage ni de
  // `window`. Recién en el efecto de abajo (que nunca corre durante SSR
  // ni durante la hidratación, solo después) se lee sessionStorage y se
  // decide el estado real. Esto evita el hydration mismatch: server y
  // cliente arrancan mostrando exactamente lo mismo.
  const [state, setState] = useState<ReportState>({ status: "loading" });
  // Independiente de ReportState a propósito: Prospecting no depende de que
  // el MarketingStrategy haya cargado ni de que haya tenido éxito, solo de
  // tener las respuestas del cuestionario (category/area).
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<QuestionnaireAnswers | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    // Todo el trabajo (incluido el primer setState, para "no-answers")
    // vive dentro de esta función async en vez de directamente en el
    // cuerpo del efecto: es el mismo patrón que ya usa el resto de la
    // función para el fetch, y evita el aviso de React de no llamar a
    // setState de forma síncrona en el cuerpo del efecto.
    async function run() {
      const answers = readStoredAnswers();
      if (!answers) {
        if (!cancelled) setState({ status: "no-answers" });
        return;
      }
      if (!cancelled) setQuestionnaireAnswers(answers);

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

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-black dark:text-white">Tu plan de prospección</h1>
          {questionnaireAnswers && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Vendés <span className="text-black dark:text-white">{questionnaireAnswers.offering}</span>
              {questionnaireAnswers.businessCategoryToTarget && (
                <>
                  {" "}a <span className="text-black dark:text-white">{questionnaireAnswers.businessCategoryToTarget}</span>
                </>
              )}{" "}
              en <span className="text-black dark:text-white">{questionnaireAnswers.targetArea}</span>.{" "}
              <Link href="/questionnaire" className="underline">
                Empezar de nuevo
              </Link>
            </p>
          )}
        </div>

        {state.status === "no-answers" && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Todavía no completaste el cuestionario.{" "}
            <Link href="/questionnaire" className="underline">
              Empezar ahora
            </Link>
            .
          </p>
        )}

        {state.status !== "no-answers" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-black dark:text-white">Tu estrategia</h2>

            {state.status === "loading" && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Generando tu estrategia con IA… suele tardar unos 30 segundos. Mientras tanto ya podés
                buscar prospectos más abajo.
              </p>
            )}

            {state.status === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.message} Podés buscar prospectos igual; para generar mensajes hace falta la
                estrategia, así que recargá la página para reintentar.
              </p>
            )}

            {state.status === "ready" && (
              <>
                <NextBestActionCard nextBestAction={state.strategy.nextBestAction} />

                <details className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <summary className="cursor-pointer text-sm font-medium text-black dark:text-white">
                    Ver estrategia completa: cliente ideal, problema, propuesta de valor, canales y estrategia inicial
                  </summary>
                  <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
                    Hecho = viene de tus respuestas. Inferencia = una conclusión razonable. Supuesto = una
                    hipótesis que conviene validar.
                  </p>
                  <div className="mt-3 flex flex-col gap-6">
                    {STRATEGY_SECTIONS.map(({ key, title }) => (
                      <section key={key} className="flex flex-col gap-2">
                        <h3 className="text-base font-semibold text-black dark:text-white">{title}</h3>
                        <div className="flex flex-col gap-2">
                          {state.strategy[key].map((claim, index) => (
                            <ClaimCard key={index} claim={claim} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </details>
              </>
            )}
          </section>
        )}

        {questionnaireAnswers && (
          <ProspectsSection
            answers={questionnaireAnswers}
            strategy={state.status === "ready" ? state.strategy : undefined}
          />
        )}
      </main>
    </div>
  );
}
