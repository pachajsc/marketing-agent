import type { ReactNode } from "react";

/** Estado vacío: qué pasa, por qué, y la acción para salir de ahí. Una hoja en blanco de la guía, con filete punteado. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border-2 border-dashed border-renglon bg-hoja px-5 py-8 sm:items-center sm:text-center">
      <p className="indice text-xl font-bold text-tinta">{title}</p>
      <p className="max-w-md text-sm text-grafito">{description}</p>
      {action}
    </div>
  );
}
