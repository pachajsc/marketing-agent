// Línea de progreso del wizard: una barra fina, fija en la parte superior
// de la pantalla, que ocupa el 100% del ancho del viewport. Puramente
// presentacional: recibe el porcentaje ya calculado desde QuestionnairePage.

interface ProgressBarProps {
  /** Porcentaje de avance, entre 0 y 100. */
  percent: number;
}

export function ProgressBar({ percent }: ProgressBarProps) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-1.5 bg-zinc-200 dark:bg-zinc-800">
      <div
        className="h-full bg-black transition-all duration-300 ease-out dark:bg-white"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
