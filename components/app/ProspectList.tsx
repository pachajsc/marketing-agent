"use client";

import { useMemo, useState } from "react";
import type { ProspectStatus } from "@/lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/workspace/prospect-status";
import { SearchIcon } from "./icons";
import { IndexEntry, type IndexEntryData } from "./IndexEntry";
import { StatusLegend } from "./StatusBadge";
import { ui } from "./ui";

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * El índice completo: pestañas de estado (como el canto de una guía), búsqueda
 * por nombre y, plegados, zona y categoría. Filtra en el cliente: los datos ya
 * son solo del usuario. El orden es siempre el de prioridad.
 */
export function ProspectList({ entries }: { entries: IndexEntryData[] }) {
  const [status, setStatus] = useState<ProspectStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("");
  const [category, setCategory] = useState("");

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ProspectStatus, number>;
    for (const entry of entries) byStatus[entry.status] += 1;
    return byStatus;
  }, [entries]);

  const categories = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.category).filter((c): c is string => Boolean(c)))).sort(),
    [entries]
  );

  const filtered = entries.filter(
    (entry) =>
      (status === "all" || entry.status === status) &&
      (!query || normalize(entry.name).includes(normalize(query))) &&
      (!place || normalize(entry.place).includes(normalize(place))) &&
      (!category || entry.category === category)
  );
  const hasFilters = status !== "all" || Boolean(query || place || category);

  const tabs: { value: ProspectStatus | "all"; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: entries.length },
    ...STATUS_ORDER.filter((s) => counts[s] > 0 || s === "ready").map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Filtrar por estado" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs.map((tab) => {
          const active = status === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(tab.value)}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-3 text-sm font-semibold transition-colors duration-150 ${
                active ? "border-tinta bg-tapa text-tinta" : "border-renglon bg-hoja text-grafito hover:border-tinta hover:text-tinta"
              }`}
            >
              {tab.label}
              <span className={`tabular-nums ${active ? "text-tinta" : "text-lapiz"}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Buscar por nombre</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grafito" width={18} height={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre"
            className={`${ui.input} pl-10`}
          />
        </label>
        <details className="group relative sm:w-auto">
          <summary className={`${ui.buttonSecondary} w-full cursor-pointer list-none sm:w-auto`}>
            Zona y categoría{place || category ? " ·  activos" : ""}
          </summary>
          <div className="mt-2 grid gap-2 sm:absolute sm:z-10 sm:w-72 sm:rounded-md sm:border sm:border-renglon sm:bg-hoja sm:p-3 sm:shadow-[0_8px_24px_-12px_rgba(20,20,20,0.35)]">
            <label className="flex flex-col gap-1">
              <span className={ui.label}>Zona</span>
              <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Calle, barrio o ciudad" className={ui.input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={ui.label}>Categoría</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className={ui.input}>
                <option value="">Todas</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-grafito" aria-live="polite">
        <span>
          {filtered.length} de {entries.length} · ordenados por prioridad
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setStatus("all");
              setQuery("");
              setPlace("");
              setCategory("");
            }}
            className={ui.link}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className={`${ui.hojaPadded} text-center ${ui.muted}`}>Ningún prospecto coincide con estos filtros.</p>
      ) : (
        <ol className={`${ui.hoja} divide-y divide-renglon overflow-hidden`}>
          {filtered.map((entry, index) => (
            <IndexEntry key={entry.id} entry={entry} order={index} />
          ))}
        </ol>
      )}

      <StatusLegend />
    </div>
  );
}
