"use client";

import { useState } from "react";
import type { Prospect } from "@/lib/types";

/**
 * Sección de prospecting dentro de /report. Deliberadamente independiente
 * del estado del MarketingStrategy de la página (ReportState): no depende
 * de que la estrategia haya cargado ni de que haya tenido éxito — solo
 * necesita category/area, que ya están en QuestionnaireAnswers. Mantiene la
 * separación arquitectónica acordada entre Prospecting y MarketingAgent
 * también en la UI: ni el fetch, ni el estado, ni los componentes se
 * comparten.
 *
 * La búsqueda es manual (botón), no automática al entrar a la página: cada
 * búsqueda es un request real y facturable a Google Places, así que no
 * conviene dispararla sola en cada carga/recarga de /report.
 */
type ProspectsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; prospects: Prospect[] };

interface ProspectsSectionProps {
  /** businessCategoryToTarget del cuestionario. Solo existe si businessType === "b2b". */
  category?: string;
  area: string;
}

export function ProspectsSection({ category, area }: ProspectsSectionProps) {
  const [state, setState] = useState<ProspectsState>({ status: "idle" });

  async function handleSearch() {
    if (!category) return;

    setState({ status: "loading" });
    try {
      const response = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, area }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Error ${response.status} buscando prospectos.`);
      }

      const prospects = (await response.json()) as Prospect[];
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
              {state.prospects.map((prospect, index) => (
                <ProspectCard key={index} prospect={prospect} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Muestra únicamente los campos que Prospect efectivamente trae — nada se completa ni se inventa. */
function ProspectCard({ prospect }: { prospect: Prospect }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-medium text-black dark:text-white">{prospect.name}</p>
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
    </div>
  );
}
