"use client";

import { useState } from "react";
import type {
  MarketingStrategy,
  ProspectPriority,
  QualifiedProspect,
  QuestionnaireAnswers,
} from "@/lib/types";
import { SalesMessagePanel } from "./SalesMessagePanel";
import { SourceBadge } from "./SourceBadge";

/**
 * Sección de prospecting dentro de /report. Deliberadamente independiente
 * del ESTADO del MarketingStrategy de la página (ReportState): no depende
 * de que la estrategia haya cargado ni de que haya tenido éxito, por eso
 * `strategy` es opcional acá — se la pasamos al ProspectingAgent como
 * contexto adicional cuando ya está lista, pero la búsqueda funciona igual
 * sin ella (el ProspectingAgent solo necesita category/area, que ya están
 * en `answers`). Mantiene la separación arquitectónica acordada entre
 * Prospecting y MarketingAgent también en la UI: ni el fetch, ni el estado,
 * ni los componentes se comparten.
 *
 * La búsqueda es manual (botón), no automática al entrar a la página: cada
 * búsqueda dispara al ProspectingAgent (Claude + Google Places), ambos
 * facturables, así que no conviene dispararla sola en cada carga/recarga de
 * /report.
 *
 * Fase 7: cada prospecto llega calificado y ordenado por prioridad desde
 * /api/prospects. El score es prioridad de prospección según señales
 * observables, nunca una probabilidad de conversión — y así se muestra.
 */
type ProspectsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; prospects: QualifiedProspect[] };

interface ProspectsSectionProps {
  answers: QuestionnaireAnswers;
  /** MarketingStrategy ya generada, si terminó de cargar con éxito. Contexto opcional para el ProspectingAgent. */
  strategy?: MarketingStrategy;
}

export function ProspectsSection({ answers, strategy }: ProspectsSectionProps) {
  const [state, setState] = useState<ProspectsState>({ status: "idle" });
  const category = answers.businessCategoryToTarget;
  const area = answers.targetArea;

  async function handleSearch() {
    if (!category) return;

    setState({ status: "loading" });
    try {
      const response = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, strategy }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Error ${response.status} buscando prospectos.`);
      }

      const prospects = (await response.json()) as QualifiedProspect[];
      setState(prospects.length > 0 ? { status: "ready", prospects } : { status: "empty" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido.";
      setState({ status: "error", message });
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-black dark:text-white">Prospectos</h2>

      {!category ? (
        // No inventamos una categoría: si el usuario es B2C, el cuestionario
        // nunca le pidió businessCategoryToTarget (ver visibleIf en
        // questionnaire-schema.ts), así que no hay con qué buscar.
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Esta búsqueda está disponible cuando tu cliente ideal es un tipo de negocio (B2B). No
          completaste esa categoría en el cuestionario.
        </p>
      ) : (
        <>
          {state.status !== "loading" && (
            <button
              type="button"
              onClick={handleSearch}
              className="self-start rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {state.status === "idle" ? "Buscar prospectos" : "Buscar de nuevo"}
            </button>
          )}

          {state.status === "loading" && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Buscando negocios en Google Maps...
            </p>
          )}

          {state.status === "error" && (
            <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
          )}

          {state.status === "empty" && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No se encontraron negocios para &quot;{category}&quot; en &quot;{area}&quot;.
            </p>
          )}

          {state.status === "ready" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                El score prioriza prospectos según señales observables disponibles. No representa
                una probabilidad de conversión.
              </p>
              {state.prospects.map((prospect, index) => (
                <ProspectCard key={index} prospect={prospect} answers={answers} strategy={strategy} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const PRIORITY_LABEL: Record<ProspectPriority, string> = {
  high: "Prioridad alta",
  medium: "Prioridad media",
  low: "Prioridad baja",
};

const PRIORITY_STYLE: Record<ProspectPriority, string> = {
  high: "text-black dark:text-white",
  medium: "text-zinc-700 dark:text-zinc-300",
  low: "text-zinc-500 dark:text-zinc-400",
};

// Cuántas señales mostrar por tarjeta: las que suman puntos y las
// inferencias, en el mismo orden en que las generó la calificación.
const MAX_SIGNALS = 4;

/** Muestra únicamente los campos que Prospect efectivamente trae — nada se completa ni se inventa. */
function ProspectCard({
  prospect,
  answers,
  strategy,
}: {
  prospect: QualifiedProspect;
  answers: QuestionnaireAnswers;
  strategy?: MarketingStrategy;
}) {
  const { qualification } = prospect;
  const signals = qualification.evidence
    .filter((evidence) => evidence.points > 0 || evidence.source !== "fact")
    .slice(0, MAX_SIGNALS);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-medium text-black dark:text-white">{prospect.name}</p>
      <p className={`text-sm font-medium ${PRIORITY_STYLE[qualification.priority]}`}>
        {qualification.score}/100 — {PRIORITY_LABEL[qualification.priority]}
      </p>
      <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">{qualification.summary}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{prospect.address}</p>

      {prospect.phone && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{prospect.phone}</p>
      )}

      {prospect.website && (
        <a
          href={prospect.website}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-blue-600 underline dark:text-blue-400"
        >
          {prospect.website}
        </a>
      )}

      {typeof prospect.rating === "number" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Rating: {prospect.rating}</p>
      )}

      <a
        href={prospect.mapsUrl}
        target="_blank"
        rel="noreferrer"
        className="block text-sm text-blue-600 underline dark:text-blue-400"
      >
        Ver en Google Maps
      </a>

      {signals.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {signals.map((evidence, index) => (
            <li key={index} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <SourceBadge source={evidence.source} />
              <span>
                {evidence.text}
                {evidence.points > 0 && ` (+${evidence.points})`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer">Qué no sabemos</summary>
        <ul className="mt-1 list-disc pl-4">
          {qualification.unknowns.map((unknown, index) => (
            <li key={index}>{unknown}</li>
          ))}
        </ul>
      </details>

      <SalesMessagePanel prospect={prospect} answers={answers} strategy={strategy} />
    </div>
  );
}
