"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  Claim,
  ClaimSource,
  MarketingStrategy,
  NextBestAction,
  QuestionnaireAnswers,
} from "@/lib/types";
import { ProspectsSection } from "./components/ProspectsSection";
import { SourceBadgeRow } from "./components/SourceBadge";

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

// Las claves de MarketingStrategy cuyo valor es un Claim[] — se calcula a
// partir de la forma real del tipo (no listando nombres a mano), así que si
// mañana se agrega o saca un campo Claim[], este tipo se actualiza solo.
// nextBestAction queda afuera porque su valor es un NextBestAction, no un
// Claim[]: por eso no puede pasar por STRATEGY_SECTIONS ni por .map().
type ClaimSectionKey = {
  [K in keyof MarketingStrategy]: MarketingStrategy[K] extends Claim[] ? K : never;
}[keyof MarketingStrategy];

// Qué sección de MarketingStrategy corresponde a cada título visible.
const STRATEGY_SECTIONS: { key: ClaimSectionKey; title: string }[] = [
  { key: "idealCustomerProfile", title: "Cliente ideal" },
  { key: "problemOrNeed", title: "Problema o necesidad" },
  { key: "valueProposition", title: "Propuesta de valor" },
  { key: "acquisitionChannels", title: "Canales de adquisición" },
  { key: "initialStrategy", title: "Estrategia inicial" },
];

// Borde de la tarjeta según procedencia: neutro para hechos e inferencias,
// ámbar (sutil, no alarmista) para supuestos — para que se distingan de
// un vistazo sin depender solo de leer la etiqueta.
const CARD_BORDER: Record<ClaimSource, string> = {
  fact: "border-zinc-200 dark:border-zinc-800",
  inference: "border-blue-200 dark:border-blue-900",
  assumption: "border-amber-200 dark:border-amber-900",
};

/**
 * Tarjeta visual para un Claim individual. Local a esta página por ahora
 * (no es una abstracción global todavía) — si en el futuro otra pantalla
 * necesita mostrar Claims, ahí sí vale la pena moverla a components/.
 */
function ClaimCard({ claim }: { claim: Claim }) {
  const isAssumption = claim.source === "assumption";
  return (
    <div className={`rounded-lg border bg-white p-3 dark:bg-zinc-900 ${CARD_BORDER[claim.source]}`}>
      <SourceBadgeRow source={claim.source} confidence={claim.confidence} />

      <p className="text-sm text-black dark:text-white">{claim.text}</p>

      {isAssumption && (
        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
          Conviene validar esto antes de actuar.
        </p>
      )}
      {claim.basedOn && claim.basedOn.length > 0 && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Basado en tus respuestas</p>
      )}
    </div>
  );
}

// Etiquetas de cada campo de contenido de NextBestAction, en el orden en
// que se muestran.
const NEXT_BEST_ACTION_FIELDS: { key: keyof Pick<NextBestAction, "action" | "goal" | "metricToWatch" | "reason">; label: string }[] = [
  { key: "action", label: "Acción recomendada" },
  { key: "goal", label: "Objetivo" },
  { key: "metricToWatch", label: "Qué observar" },
  { key: "reason", label: "Por qué ahora" },
];

/**
 * Tarjeta para NextBestAction — a diferencia de ClaimCard, no muestra un
 * único `text` sino 4 campos etiquetados (acción/objetivo/qué observar/por
 * qué ahora). No pasa por .map() como un Claim[] porque no lo es: es un
 * objeto único (ver el comentario de ClaimSectionKey más arriba).
 */
function NextBestActionCard({ nextBestAction }: { nextBestAction: NextBestAction }) {
  const isAssumption = nextBestAction.source === "assumption";
  return (
    <div className={`rounded-lg border bg-white p-3 dark:bg-zinc-900 ${CARD_BORDER[nextBestAction.source]}`}>
      <SourceBadgeRow source={nextBestAction.source} confidence={nextBestAction.confidence} />

      <dl className="flex flex-col gap-2">
        {NEXT_BEST_ACTION_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {label}
            </dt>
            <dd className="text-sm text-black dark:text-white">{nextBestAction[key]}</dd>
          </div>
        ))}
      </dl>

      {isAssumption && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Conviene validar esto antes de actuar.
        </p>
      )}
      {nextBestAction.basedOn && nextBestAction.basedOn.length > 0 && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Basado en tus respuestas</p>
      )}
    </div>
  );
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
