import { describe, expect, it } from "vitest";
import { isFieldRequired, isStepValid, questionnaireSteps } from "./questionnaire-schema";

describe("questionnaireSteps — orden del producto (Fase 10)", () => {
  it("sigue el flujo ¿Qué vendés? → ¿A quién? → ¿Dónde? → contexto opcional", () => {
    expect(questionnaireSteps.map((step) => step.id)).toEqual(["offering", "target", "where", "context"]);
  });

  it("cada campo de QuestionnaireAnswers aparece exactamente una vez", () => {
    const ids = questionnaireSteps.flatMap((step) => step.fields.map((field) => field.id));

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(
      [
        "businessCategoryToTarget",
        "businessType",
        "hasCustomersToday",
        "idealCustomerDescription",
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
