"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateStrategyAction } from "@/app/(app)/actions";
import type { QuestionnaireAnswers } from "@/lib/types";
import { ui } from "./ui";

/**
 * Abre el cuestionario precargado con las respuestas guardadas. Usa la misma
 * clave de sessionStorage que el flujo público, así el wizard no necesita un
 * mecanismo nuevo para precargar.
 */
export function EditProfileButton({ answers, label = "Editar respuestas" }: { answers: QuestionnaireAnswers; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        try {
          sessionStorage.setItem("questionnaireAnswers", JSON.stringify(answers));
        } catch {
          // Sin sessionStorage el cuestionario arranca vacío: no es crítico.
        }
        router.push("/questionnaire?destino=app");
      }}
      className={ui.buttonSecondary}
    >
      {label}
    </button>
  );
}

/** Genera (o regenera) la estrategia con el perfil guardado: 1 llamada a Claude, ~30 s. */
export function GenerateStrategyButton({ hasStrategy }: { hasStrategy: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await generateStrategyAction();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={handleClick} disabled={pending} className={hasStrategy ? ui.buttonSecondary : ui.buttonPrimary}>
        {pending ? "Generando…" : hasStrategy ? "Generar de nuevo" : "Generar estrategia"}
      </button>
      <p aria-live="polite" className="text-xs">
        {pending && <span className="text-tinta">Generando tu estrategia con IA. Suele tardar unos 30 segundos.</span>}
        {error && <span className="rounded-md bg-hoja px-2 py-1 font-semibold text-avenida">{error}</span>}
      </p>
    </div>
  );
}
