"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  questionnaireSteps,
  getVisibleFields,
  isFieldRequired,
  isStepValid,
  resolveLabel,
} from "@/lib/questionnaire-schema";
import type { QuestionnaireAnswers } from "@/lib/types";
import { QuestionField } from "./components/QuestionField";

const TOTAL_STEPS = questionnaireSteps.length;

export default function QuestionnairePage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuestionnaireAnswers>>({});
  const [showErrors, setShowErrors] = useState(false);

  const isSummary = stepIndex === TOTAL_STEPS;
  const currentStep = isSummary ? null : questionnaireSteps[stepIndex];
  const visibleFields = currentStep ? getVisibleFields(currentStep, answers) : [];

  function handleChange(fieldId: keyof QuestionnaireAnswers, value: string) {
    // Los campos "choice" guardan valores que en QuestionnaireAnswers son tipos
    // union (ej: MainGoal), pero acá los tratamos como string genérico porque
    // el formulario no necesita saberlo: los valores de las opciones ya
    // coinciden con esos literales. Simplifica el wizard a costa de un cast.
    setAnswers((prev) => ({ ...prev, [fieldId]: value }) as Partial<QuestionnaireAnswers>);
  }

  function handleNext() {
    if (!currentStep) return;
    if (!isStepValid(currentStep, answers)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStepIndex((i) => i + 1);
  }

  function handleBack() {
    setShowErrors(false);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function handleEditStep(index: number) {
    setShowErrors(false);
    setStepIndex(index);
  }

  function handleConfirm() {
    // Si llegamos hasta acá es porque cada paso ya pasó isStepValid, así que
    // los campos obligatorios de QuestionnaireAnswers están completos.
    try {
      sessionStorage.setItem("questionnaireAnswers", JSON.stringify(answers));
    } catch {
      // sessionStorage puede no estar disponible (ej: modo privado). No es
      // crítico para este paso: seguimos a /report igual.
    }
    router.push("/report");
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-8">
        {!isSummary && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Paso {stepIndex + 1} de {TOTAL_STEPS}
          </p>
        )}

        {currentStep && (
          <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-semibold text-black dark:text-white">
              {currentStep.title}
            </h1>

            {visibleFields.map((field) => (
              <QuestionField
                key={field.id}
                field={field}
                label={resolveLabel(field, answers)}
                value={(answers[field.id] as string) ?? ""}
                onChange={(value) => handleChange(field.id, value)}
                error={
                  showErrors && isFieldRequired(field, answers) && !answers[field.id]
                    ? "Este campo es obligatorio."
                    : undefined
                }
              />
            ))}

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={handleBack}
                disabled={stepIndex === 0}
                className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {isSummary && (
          <SummaryView answers={answers} onEditStep={handleEditStep} onConfirm={handleConfirm} />
        )}
      </main>
    </div>
  );
}

function SummaryView({
  answers,
  onEditStep,
  onConfirm,
}: {
  answers: Partial<QuestionnaireAnswers>;
  onEditStep: (index: number) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold text-black dark:text-white">Resumen</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Revisá tus respuestas antes de continuar. Podés editar cualquier sección.
      </p>

      {questionnaireSteps.map((step, index) => {
        const fields = getVisibleFields(step, answers);
        return (
          <div
            key={step.id}
            className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-black dark:text-white">{step.title}</h2>
              <button
                type="button"
                onClick={() => onEditStep(index)}
                className="text-sm font-medium text-zinc-500 underline hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Editar
              </button>
            </div>

            {fields.map((field) => {
              const rawValue = answers[field.id] as string | undefined;
              const displayValue =
                field.type === "choice"
                  ? field.options?.find((o) => o.value === rawValue)?.label
                  : rawValue;
              return (
                <div key={field.id} className="text-sm">
                  <p className="text-zinc-500 dark:text-zinc-400">
                    {resolveLabel(field, answers)}
                  </p>
                  <p className="text-black dark:text-white">
                    {displayValue && displayValue.trim() ? displayValue : "Sin especificar"}
                  </p>
                </div>
              );
            })}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onConfirm}
        className="self-start rounded-full bg-black px-6 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Confirmar y continuar
      </button>
    </div>
  );
}
