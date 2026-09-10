"use client";

import { useState } from "react";
import Link from "next/link";

function readStoredAnswers(): string | null {
  // Durante el render en el servidor (SSR) no existe sessionStorage; en el
  // cliente sí. El inicializador perezoso de useState solo corre en el
  // navegador porque este componente no se ejecuta hasta hidratarse.
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("questionnaireAnswers");
  } catch {
    return null;
  }
}

export default function ReportPage() {
  const [rawAnswers] = useState<string | null>(readStoredAnswers);

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-6">
        <h1 className="text-2xl font-semibold text-black dark:text-white">
          Respuestas recibidas
        </h1>

        {rawAnswers ? (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Este es el contrato (<code>QuestionnaireAnswers</code>) que en el próximo paso se
              enviará a la IA para generar el análisis. Por ahora solo lo mostramos tal cual.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 text-sm text-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-white">
              {JSON.stringify(JSON.parse(rawAnswers), null, 2)}
            </pre>
          </>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Todavía no completaste el cuestionario.{" "}
            <Link href="/questionnaire" className="underline">
              Empezar ahora
            </Link>
            .
          </p>
        )}
      </main>
    </div>
  );
}
