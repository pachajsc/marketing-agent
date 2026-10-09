// Barra de progreso del wizard: fija arriba, ocupa todo el ancho. Avanza con
// cada pregunta obligatoria respondida (no solo al cambiar de paso), con una
// transición suave del ancho y un brillo que recorre el tramo completado.
// Ambas animaciones se desactivan si el sistema pide reducir movimiento.

interface ProgressBarProps {
  /** Porcentaje de avance, entre 0 y 100. */
  percent: number;
}

export function ProgressBar({ percent }: ProgressBarProps) {
  const value = Math.min(Math.max(Math.round(percent), 0), 100);
  return (
    <div
      role="progressbar"
      aria-label="Avance del cuestionario"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="fixed inset-x-0 top-0 z-50 h-1.5 overflow-hidden bg-zinc-200 dark:bg-zinc-800"
    >
      <div
        className="relative h-full overflow-hidden bg-black transition-[width] duration-500 ease-out motion-reduce:transition-none dark:bg-white"
        style={{ width: `${value}%` }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 -left-1/2 w-1/2 animate-[progress-shine_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent motion-reduce:hidden dark:via-black/30"
        />
      </div>
    </div>
  );
}
