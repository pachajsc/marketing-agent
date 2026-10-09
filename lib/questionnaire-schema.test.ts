import { describe, expect, it } from "vitest";
import type { QuestionnaireAnswers } from "@/lib/types";
import {
  applyImpliedAnswers,
  completionPercent,
  getVisibleFields,
  isFieldRequired,
  isStepReachable,
  isStepValid,
  questionnaireSteps,
} from "./questionnaire-schema";

const complete: Partial<QuestionnaireAnswers> = {
  offering: "Plataforma para organizar eventos de pádel",
  problem: "Organizar torneos, canchas abiertas y eventos de pádel",
  mainGoal: "first_customers",
  businessCategoryToTarget: "Clubes de pádel",
  businessType: "b2b",
  targetArea: "Buenos Aires",
};

describe("questionnaireSteps — orden del producto (Fase 10)", () => {
  it("sigue el flujo ¿Qué vendés? → ¿A quién? → ¿Dónde? → contexto opcional", () => {
    expect(questionnaireSteps.map((step) => step.id)).toEqual(["offering", "target", "where", "context"]);
  });

  it("cada campo aparece una sola vez; la descripción libre del cliente ideal ya no se pregunta (repetía la categoría)", () => {
    const ids = questionnaireSteps.flatMap((step) => step.fields.map((field) => field.id));

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(
      [
        "businessCategoryToTarget",
        "businessType",
        "hasCustomersToday",
        "knownCompetitors",
        "mainGoal",
        "offering",
        "priceRange",
        "problem",
        "targetArea",
      ].sort()
    );
  });

  it("mantiene las reglas de obligatoriedad: el paso de contexto es enteramente opcional", () => {
    const required = questionnaireSteps.flatMap((step) =>
      step.fields.filter((field) => isFieldRequired(field, {})).map((field) => field.id)
    );

    expect(required.sort()).toEqual(
      ["businessCategoryToTarget", "businessType", "hasCustomersToday", "mainGoal", "offering", "problem", "targetArea"].sort()
    );
    expect(isStepValid(questionnaireSteps[3], {})).toBe(true);
    expect(isStepValid(questionnaireSteps[0], {})).toBe(false);
  });
});

describe("respuestas implícitas: no se pregunta dos veces lo mismo", () => {
  it("con 'Conseguir mis primeros clientes', '¿Ya tenés clientes?' no se muestra y queda 'none'", () => {
    const answers = applyImpliedAnswers(complete);
    const whereStep = questionnaireSteps[2];

    expect(answers.hasCustomersToday).toBe("none");
    expect(getVisibleFields(whereStep, answers).map((field) => field.id)).toEqual(["targetArea"]);
    expect(isStepValid(whereStep, answers)).toBe(true);
  });

  it("con otro objetivo la pregunta aparece y es obligatoria; no se pisa una respuesta ya dada", () => {
    const answers = applyImpliedAnswers({ ...complete, mainGoal: "increase_sales", hasCustomersToday: "some" });
    const whereStep = questionnaireSteps[2];

    expect(answers.hasCustomersToday).toBe("some");
    expect(getVisibleFields(whereStep, answers).map((field) => field.id)).toEqual(["targetArea", "hasCustomersToday"]);
    expect(isStepValid(whereStep, { ...answers, hasCustomersToday: undefined })).toBe(false);
  });

  it("no inventa nada si todavía no hay objetivo", () => {
    expect(applyImpliedAnswers({ offering: "x" })).toEqual({ offering: "x" });
  });
});

describe("stepper y progreso", () => {
  it("un paso es alcanzable solo si los anteriores están completos", () => {
    expect(isStepReachable(0, {})).toBe(true);
    expect(isStepReachable(1, {})).toBe(false);
    expect(isStepReachable(1, complete)).toBe(true);
    expect(isStepReachable(4, applyImpliedAnswers(complete))).toBe(true);
  });

  it("el avance cuenta las preguntas obligatorias visibles respondidas", () => {
    expect(completionPercent({})).toBe(0);
    expect(completionPercent({ offering: "x", problem: "y" })).toBeGreaterThan(0);
    expect(completionPercent(applyImpliedAnswers(complete))).toBe(100);
  });
});
