"use client";

import { useReducer, useState } from "react";
import type {
  MarketingStrategy,
  ProspectPriority,
  QualifiedProspect,
  QuestionnaireAnswers,
} from "@/lib/types";
import {
  PROSPECT_STAGES,
  canMarkContacted,
  initialWorkspaceState,
  prospectStage,
  stageCounts,
  workFor,
  workspaceReducer,
  type ProspectStage,
  type WorkspaceAction,
  type WorkspaceState,
} from "@/lib/workspace/prospect-workspace";
import { SalesMessagePanel } from "./SalesMessagePanel";
import { SourceBadge } from "./SourceBadge";

/**
 * Espacio de trabajo de prospectos dentro de /report (núcleo del MVP).
 * Deliberadamente independiente del ESTADO del MarketingStrategy de la
 * página (ReportState): no depende de que la estrategia haya cargado ni de
 * que haya tenido éxito, por eso `strategy` es opcional acá — se la pasamos
 * al ProspectingAgent como contexto adicional cuando ya está lista, pero la
 * búsqueda funciona igual sin ella (el ProspectingAgent solo necesita
 * category/area, que ya están en `answers`).
 *
 * La búsqueda es manual (botón), no automática al entrar a la página: cada
 * búsqueda dispara al ProspectingAgent (Claude + Google Places), ambos
 * facturables, así que no conviene dispararla sola en cada carga/recarga de
 * /report.
 *
 * Fase 7: cada prospecto llega calificado y ordenado por prioridad desde
 * /api/prospects. El score es prioridad de prospección según señales
 * observables, nunca una probabilidad de conversión — y así se muestra.
 *
 * Fase 13: la etapa de cada prospecto (Nuevo → … → Contactado) y la revisión
 * de su mensaje viven en un único reductor (lib/workspace/), en memoria: una
 * nueva búsqueda o una recarga los reinicia.
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

const PRIMARY_BUTTON =
  "rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200";
const LINK_BUTTON =
  "text-xs font-medium text-zinc-600 underline hover:text-black dark:text-zinc-400 dark:hover:text-white";

export function ProspectsSection({ answers, strategy }: ProspectsSectionProps) {
  const [state, setState] = useState<ProspectsState>({ status: "idle" });
  const [workspace, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const category = answers.businessCategoryToTarget;
  const area = answers.targetArea;
  const hasProgress = Object.keys(workspace).length > 0;

  async function handleSearch() {
    if (!category) return;

    // Una nueva búsqueda reemplaza la lista: sus etapas y mensajes se reinician.
    dispatch({ type: "reset" });
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
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-black dark:text-white">¿A quién contactar primero?</h2>
        {category && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Buscamos &quot;{category}&quot; en &quot;{area}&quot; en Google Maps y los ordenamos por prioridad.
          </p>
        )}
      </div>

      {!category ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Para buscar prospectos necesitamos el tipo de negocio que querés encontrar. Completalo en el
          cuestionario.
        </p>
      ) : (
        <>
          {state.status !== "loading" && (
            <div className="flex flex-col gap-1">
              <button type="button" onClick={handleSearch} className={`self-start ${PRIMARY_BUTTON}`}>
                {state.status === "idle" ? "Buscar prospectos" : "Buscar de nuevo"}
              </button>
              {state.status === "ready" && hasProgress && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Buscar de nuevo reinicia las etapas y los mensajes de esta lista.
                </p>
              )}
            </div>
          )}

          {state.status === "loading" && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Buscando negocios reales en Google Maps y calificándolos… suele tardar entre 10 y 30 segundos.
            </p>
          )}

          {state.status === "error" && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {state.message} Podés intentarlo de nuevo.
            </p>
          )}

          {state.status === "empty" && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No se encontraron negocios para &quot;{category}&quot; en &quot;{area}&quot;. Probá con una
              categoría más general o una zona más amplia.
            </p>
          )}

          {state.status === "ready" && (
            <div className="flex flex-col gap-3">
              <WorkspaceSummary prospects={state.prospects} workspace={workspace} />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                El score prioriza prospectos según señales observables disponibles. No representa
                una probabilidad de conversión.
              </p>
              {state.prospects.map((prospect, index) => (
                <ProspectCard
                  key={prospect.mapsUrl}
                  rank={index + 1}
                  prospect={prospect}
                  answers={answers}
                  strategy={strategy}
                  workspace={workspace}
                  dispatch={dispatch}
                />
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

const STAGE_LABEL: Record<ProspectStage, string> = {
  new: "Nuevo",
  reviewed: "Revisado",
  message: "Mensaje generado",
  approved: "Aprobado",
  contacted: "Contactado",
};

const STAGE_STYLE: Record<ProspectStage, string> = {
  new: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  reviewed: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  message: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  approved: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  contacted: "bg-green-600 text-white dark:bg-green-500 dark:text-black",
};

/** "¿A quién contacto primero?" de un vistazo: prioridades y en qué etapa está cada prospecto. */
function WorkspaceSummary({
  prospects,
  workspace,
}: {
  prospects: QualifiedProspect[];
  workspace: WorkspaceState;
}) {
  const priorities: Record<ProspectPriority, number> = { high: 0, medium: 0, low: 0 };
  for (const prospect of prospects) priorities[prospect.qualification.priority] += 1;
  const stages = stageCounts(
    workspace,
    prospects.map((prospect) => prospect.mapsUrl)
  );

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-black dark:text-white">
        {prospects.length} prospectos reales · {priorities.high} prioridad alta · {priorities.medium} media ·{" "}
        {priorities.low} baja. Están ordenados: empezá por el #1.
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {PROSPECT_STAGES.map((stage) => `${STAGE_LABEL[stage]}: ${stages[stage]}`).join(" · ")}
      </p>
    </div>
  );
}

// Cuántas señales mostrar por tarjeta: las que suman puntos y las
// inferencias, en el mismo orden en que las generó la calificación.
const MAX_SIGNALS = 4;

/** Muestra únicamente los campos que Prospect efectivamente trae — nada se completa ni se inventa. */
function ProspectCard({
  rank,
  prospect,
  answers,
  strategy,
  workspace,
  dispatch,
}: {
  rank: number;
  prospect: QualifiedProspect;
  answers: QuestionnaireAnswers;
  strategy?: MarketingStrategy;
  workspace: WorkspaceState;
  dispatch: (action: WorkspaceAction) => void;
}) {
  const { qualification } = prospect;
  const prospectId = prospect.mapsUrl;
  const work = workFor(workspace, prospectId);
  const stage = prospectStage(work);
  const signals = qualification.evidence
    .filter((evidence) => evidence.points > 0 || evidence.source !== "fact")
    .slice(0, MAX_SIGNALS);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-black dark:text-white">
          <span className="text-zinc-400 dark:text-zinc-500">#{rank}</span> {prospect.name}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_STYLE[stage]}`}>
          {STAGE_LABEL[stage]}
        </span>
      </div>
      <p className={`text-sm font-medium ${PRIORITY_STYLE[qualification.priority]}`}>
        {qualification.score}/100 — {PRIORITY_LABEL[qualification.priority]}
      </p>
      <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">{qualification.summary}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{prospect.address}</p>

      {prospect.primaryType && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Tipo en Google: {prospect.primaryType.replaceAll("_", " ")}
        </p>
      )}

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
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Rating: {prospect.rating}
          {typeof prospect.userRatingCount === "number" && ` (${prospect.userRatingCount} reseñas)`}
        </p>
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
        <details className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400">Por qué esta prioridad</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {signals.map((evidence, index) => (
              <li key={index} className="flex items-start gap-2">
                <SourceBadge source={evidence.source} />
                <span>
                  {evidence.text}
                  {evidence.points > 0 && ` (+${evidence.points})`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer">Qué no sabemos</summary>
        <ul className="mt-1 list-disc pl-4">
          {qualification.unknowns.map((unknown, index) => (
            <li key={index}>{unknown}</li>
          ))}
        </ul>
      </details>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {stage === "new" && (
          <button type="button" onClick={() => dispatch({ type: "markReviewed", prospectId })} className={LINK_BUTTON}>
            Marcar como revisado
          </button>
        )}
        {canMarkContacted(work) && (
          <button type="button" onClick={() => dispatch({ type: "markContacted", prospectId })} className={LINK_BUTTON}>
            Ya lo contacté: marcar como contactado
          </button>
        )}
        {stage === "contacted" && (
          <button type="button" onClick={() => dispatch({ type: "unmarkContacted", prospectId })} className={LINK_BUTTON}>
            Desmarcar contactado
          </button>
        )}
      </div>

      <SalesMessagePanel
        prospect={prospect}
        answers={answers}
        strategy={strategy}
        state={work.panel}
        dispatch={(action) => dispatch({ type: "panel", prospectId, action })}
        locked={work.contacted}
      />
    </div>
  );
}
