import type { ReactNode } from "react";

/**
 * Tapa de la guía: la cabecera amarilla de cada pantalla de la app. Lleva el
 * título en el índice condensado, una línea de referencia y, si hace falta,
 * la acción principal. Ocupa todo el ancho; el contenido va debajo, sobre el
 * papel de plano.
 */
export function Tapa({
  title,
  reference,
  aside,
  children,
}: {
  title: ReactNode;
  /** Línea de referencia bajo el título (zona, categoría, conteos). */
  reference?: ReactNode;
  /** Elemento a la derecha del título (sello, placa). */
  aside?: ReactNode;
  /** Acciones o contenido extra dentro de la tapa. */
  children?: ReactNode;
}) {
  return (
    <header className="border-b-2 border-tinta bg-tapa">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-5 pt-5 sm:px-6 lg:max-w-5xl lg:pt-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="indice text-[1.85rem] font-extrabold leading-[1.02] text-tinta text-balance sm:text-4xl">{title}</h1>
            {reference && <div className="text-sm font-medium text-tinta/80">{reference}</div>}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </header>
  );
}

/** Placa de referencia: el número de orden en negro, como en el índice de la guía. */
export function Placa({ rank, size = "md" }: { rank: number; size?: "md" | "lg" }) {
  return (
    <span
      aria-label={`Prioridad número ${rank}`}
      className={`indice inline-flex shrink-0 items-center justify-center rounded-[3px] bg-tinta font-extrabold tabular-nums text-tapa ${
        size === "lg" ? "h-12 min-w-12 px-2 text-2xl" : "h-8 min-w-8 px-1.5 text-base"
      }`}
    >
      {rank}
    </span>
  );
}
