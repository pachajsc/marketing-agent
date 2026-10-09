"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { findProspectsAction } from "@/app/(app)/actions";
import {
  DEFAULT_RADIUS_KM,
  LOCATION_NOTE_MESSAGE,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  clampRadiusKm,
  readProximity,
  type LocationNote,
} from "@/lib/geolocation";
import { ui } from "./ui";

type SearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; inserted: number; updated: number; note: LocationNote }
  | { status: "error"; message: string };

/**
 * Busca prospectos reales con el perfil guardado (una llamada al plan de
 * Claude + Google Places). Manual a propósito: cada búsqueda tiene costo.
 * Va dentro de la tapa amarilla de /prospects.
 */
export function FindProspectsButton({ category, area }: { category: string; area: string }) {
  const router = useRouter();
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);

  async function handleSearch() {
    setState({ status: "searching" });
    const { proximity, note } = await readProximity(radiusKm);
    const result = await findProspectsAction(proximity);
    if (!result.ok) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "done", ...result.data, note });
    router.refresh();
  }

  const searching = state.status === "searching";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={handleSearch} disabled={searching} className={`${ui.buttonPrimary} flex-1 sm:flex-none`}>
          {searching ? "Buscando…" : "Buscar prospectos"}
        </button>
        <label className="flex items-center gap-1.5 rounded-md border border-tinta/30 bg-hoja/60 px-2.5 text-sm font-semibold text-tinta">
          <span className="sr-only">Radio de búsqueda en kilómetros</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_RADIUS_KM}
            max={MAX_RADIUS_KM}
            value={radiusKm}
            disabled={searching}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isNaN(value)) setRadiusKm(clampRadiusKm(value));
            }}
            className="w-10 bg-transparent text-right tabular-nums outline-none"
          />
          km
        </label>
      </div>

      <div aria-live="polite" className="text-sm text-tinta">
        {searching && <p>Buscando &quot;{category}&quot; cerca de {area} y calificándolos. Suele tardar entre 10 y 30 segundos.</p>}
        {state.status === "done" && (
          <p className="font-semibold">
            {state.inserted > 0
              ? `${state.inserted} prospecto${state.inserted === 1 ? "" : "s"} nuevo${state.inserted === 1 ? "" : "s"}`
              : "No aparecieron prospectos nuevos"}
            {state.updated > 0 ? ` · ${state.updated} actualizado${state.updated === 1 ? "" : "s"}` : ""}.
            {state.note && <span className="block font-normal text-tinta/80">{LOCATION_NOTE_MESSAGE[state.note]}</span>}
          </p>
        )}
        {state.status === "error" && <p className="rounded-md bg-hoja px-3 py-2 font-semibold text-avenida">{state.message}</p>}
      </div>
    </div>
  );
}
