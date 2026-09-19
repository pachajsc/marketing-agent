import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prospect, ProspectingSearch, QuestionnaireAnswers } from "@/lib/types";

const mockParse = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  // Función `function` (no arrow) a propósito: prospecting-agent.ts hace
  // `new Anthropic()`, y una arrow function no es invocable con `new`.
  default: vi.fn(function MockAnthropic() {
    return { messages: { parse: mockParse } };
  }),
}));

const mockRunSearchProspectsTool = vi.fn();

vi.mock("@/lib/tools/search-prospects-tool", () => ({
  runSearchProspectsTool: mockRunSearchProspectsTool,
}));

const { runProspectingAgent } = await import("./prospecting-agent");

const baseAnswers: QuestionnaireAnswers = {
  offering: "plataforma para anotarte en eventos de padel",
  mainGoal: "first_customers",
  problem: "la desorganización a la hora de anotarse a un evento de padel",
  businessType: "b2b",
  hasCustomersToday: "none",
  businessCategoryToTarget: "clubes de padel",
  targetArea: "Ciudad de Buenos Aires",
  idealCustomerDescription:
    "clubes de padel o comunidades de canchas abiertas y torneos de padel",
};

function planResponse(searches: ProspectingSearch[], rationale = "plan de prueba") {
  return { parsed_output: { searches, rationale }, stop_reason: "end_turn" };
}

function factSearch(overrides: Partial<ProspectingSearch> = {}): ProspectingSearch {
  return {
    category: baseAnswers.businessCategoryToTarget!,
    area: baseAnswers.targetArea,
    source: "fact",
    basedOnField: "businessCategoryToTarget+targetArea",
    rationale: "búsqueda principal",
    ...overrides,
  };
}

const mockProspects: Prospect[] = [
  { name: "Club Norte", address: "Calle 1, CABA", mapsUrl: "https://maps.google.com/?cid=1" },
];

describe("runProspectingAgent", () => {
  beforeEach(() => {
    mockParse.mockReset();
    mockRunSearchProspectsTool.mockReset();
  });

  it("(8) si el plan no tiene ninguna búsqueda, no ejecuta el tool y devuelve prospects vacío", async () => {
    mockParse.mockResolvedValueOnce(planResponse([], "no hay información suficiente"));

    const result = await runProspectingAgent(baseAnswers);

    expect(result).toEqual({ prospects: [] });
    expect(mockRunSearchProspectsTool).not.toHaveBeenCalled();
  });

  it("(7) si falta businessCategoryToTarget, descarta la búsqueda principal aunque Claude la proponga igual (adversarial)", async () => {
    mockParse.mockResolvedValueOnce(
      planResponse([factSearch({ category: "una categoría inventada por Claude" })])
    );

    const result = await runProspectingAgent({
      ...baseAnswers,
      businessCategoryToTarget: undefined,
    });

    expect(result).toEqual({ prospects: [] });
    expect(mockRunSearchProspectsTool).not.toHaveBeenCalled();
  });

  it("(5) grounding: ignora la category que proponga Claude y usa siempre answers.businessCategoryToTarget", async () => {
    mockParse.mockResolvedValueOnce(
      planResponse([factSearch({ category: "una categoría distinta que Claude inventó" })])
    );
    mockRunSearchProspectsTool.mockResolvedValueOnce([]);

    await runProspectingAgent(baseAnswers);

    expect(mockRunSearchProspectsTool).toHaveBeenCalledWith({
      category: "clubes de padel",
      area: "Ciudad de Buenos Aires",
      limit: undefined,
    });
  });

  it("(6) grounding: ignora el area que proponga Claude y usa siempre answers.targetArea", async () => {
    mockParse.mockResolvedValueOnce(
      planResponse([factSearch({ area: "Una zona distinta que Claude inventó" })])
    );
    mockRunSearchProspectsTool.mockResolvedValueOnce([]);

    await runProspectingAgent(baseAnswers);

    expect(mockRunSearchProspectsTool).toHaveBeenCalledWith({
      category: "clubes de padel",
      area: "Ciudad de Buenos Aires",
      limit: undefined,
    });
  });

  it("(9)(10) con una búsqueda fact válida, ejecuta el tool y el resultado final es exactamente lo que devolvió (misma referencia)", async () => {
    mockParse.mockResolvedValueOnce(planResponse([factSearch()]));
    mockRunSearchProspectsTool.mockResolvedValueOnce(mockProspects);

    const result = await runProspectingAgent(baseAnswers);

    expect(mockRunSearchProspectsTool).toHaveBeenCalledTimes(1);
    expect(result.prospects).toEqual(mockProspects);
    // Solo una llamada a Claude (planning) — nunca una segunda para
    // reconstruir el resultado.
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it("nunca ejecuta una búsqueda con basedOnField='idealCustomerDescription' marcada como 'fact' (inválida por diseño)", async () => {
    mockParse.mockResolvedValueOnce(
      planResponse([
        factSearch({
          category: "comunidades de padel",
          basedOnField: "idealCustomerDescription",
          source: "fact",
        }),
      ])
    );

    const result = await runProspectingAgent(baseAnswers);

    expect(result).toEqual({ prospects: [] });
    expect(mockRunSearchProspectsTool).not.toHaveBeenCalled();
  });

  it("una búsqueda 'inference' basada en idealCustomerDescription se groundea pero NO se ejecuta automáticamente", async () => {
    mockParse.mockResolvedValueOnce(
      planResponse([
        factSearch(),
        {
          category: "comunidades de canchas abiertas de padel",
          area: "una zona distinta inventada",
          source: "inference",
          basedOnField: "idealCustomerDescription",
          rationale: "el usuario mencionó comunidades de canchas abiertas",
        },
      ])
    );
    mockRunSearchProspectsTool.mockResolvedValueOnce(mockProspects);

    const result = await runProspectingAgent(baseAnswers);

    // Solo se ejecuta la búsqueda fact — la inference queda groundeada
    // (rechazamos su area inventada) pero nunca dispara una llamada real.
    expect(mockRunSearchProspectsTool).toHaveBeenCalledTimes(1);
    expect(mockRunSearchProspectsTool).toHaveBeenCalledWith({
      category: "clubes de padel",
      area: "Ciudad de Buenos Aires",
      limit: undefined,
    });
    expect(result.prospects).toEqual(mockProspects);
  });

  it("descarta una búsqueda basada en idealCustomerDescription si ese campo no fue provisto", async () => {
    mockParse.mockResolvedValueOnce(
      planResponse([
        {
          category: "torneos de padel",
          area: baseAnswers.targetArea,
          source: "inference",
          basedOnField: "idealCustomerDescription",
          rationale: "inventado sin respaldo",
        },
      ])
    );

    const result = await runProspectingAgent({
      ...baseAnswers,
      idealCustomerDescription: undefined,
    });

    expect(result).toEqual({ prospects: [] });
    expect(mockRunSearchProspectsTool).not.toHaveBeenCalled();
  });

  it("de-duplica búsquedas groundeadas que colapsan al mismo category+area", async () => {
    mockParse.mockResolvedValueOnce(planResponse([factSearch(), factSearch({ rationale: "duplicada" })]));
    mockRunSearchProspectsTool.mockResolvedValueOnce(mockProspects);

    await runProspectingAgent(baseAnswers);

    expect(mockRunSearchProspectsTool).toHaveBeenCalledTimes(1);
  });

  it("respeta un limit numérico dentro de una búsqueda groundeada", async () => {
    mockParse.mockResolvedValueOnce(planResponse([factSearch({ limit: 5 })]));
    mockRunSearchProspectsTool.mockResolvedValueOnce([]);

    await runProspectingAgent(baseAnswers);

    expect(mockRunSearchProspectsTool).toHaveBeenCalledWith({
      category: "clubes de padel",
      area: "Ciudad de Buenos Aires",
      limit: 5,
    });
  });

  it("lanza un error legible si Claude no devuelve un plan parseable", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null, stop_reason: "max_tokens" });

    await expect(runProspectingAgent(baseAnswers)).rejects.toThrow(/formato esperado/i);
    expect(mockRunSearchProspectsTool).not.toHaveBeenCalled();
  });
});
