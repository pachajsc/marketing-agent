// Stepper del wizard: muestra los pasos y deja saltar a cualquiera que ya se
// pueda alcanzar (todos los anteriores completos). Los pasos futuros que
// todavía no se pueden alcanzar quedan deshabilitados.
//
// Cada paso es una columna del mismo ancho con el círculo centrado y su
// título debajo, centrado; la línea entre pasos va de centro a centro, por
// detrás de los círculos.

interface StepperProps {
  /** Títulos de los pasos, en orden (el último puede ser "Resumen"). */
  titles: string[];
  /** Índice del paso actual. */
  current: number;
  /** Índices completos (para el ícono de check). */
  isComplete: (index: number) => boolean;
  /** Si se puede ir a ese paso. */
  isReachable: (index: number) => boolean;
  onSelect: (index: number) => void;
}

export function Stepper({ titles, current, isComplete, isReachable, onSelect }: StepperProps) {
  return (
    <nav aria-label="Pasos del cuestionario" className="w-full">
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${titles.length}, minmax(0, 1fr))` }}>
        {titles.map((title, index) => {
          const active = index === current;
          const complete = !active && isComplete(index);
          const reachable = isReachable(index);
          return (
            <li key={title} className="relative flex flex-col items-center gap-1.5">
              {index < titles.length - 1 && (
                <span aria-hidden="true" className="absolute left-1/2 top-4 h-0.5 w-full -translate-y-1/2 overflow-hidden bg-zinc-200">
                  <span
                    className={`block h-full bg-zinc-800 transition-[width] duration-500 ease-out motion-reduce:transition-none ${
                      index < current ? "w-full" : "w-0"
                    }`}
                  />
                </span>
              )}
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={!reachable || active}
                aria-current={active ? "step" : undefined}
                aria-label={`Paso ${index + 1}: ${title}${complete ? " (completo)" : ""}`}
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 motion-reduce:transition-none ${
                  active
                    ? "bg-black text-white ring-4 ring-tapa"
                    : complete
                      ? "bg-zinc-800 text-white hover:bg-black"
                      : reachable
                        ? "border border-zinc-400 bg-white text-zinc-700 hover:border-black"
                        : "cursor-not-allowed border border-zinc-200 bg-white text-zinc-400"
                }`}
              >
                {complete ? (
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                    <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  index + 1
                )}
              </button>
              <span
                className={`hidden px-1 text-center text-xs leading-tight text-balance sm:block ${
                  active ? "font-medium text-black" : "text-zinc-500"
                }`}
              >
                {title}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-center text-xs font-medium text-zinc-700 sm:hidden">{titles[current]}</p>
    </nav>
  );
}
