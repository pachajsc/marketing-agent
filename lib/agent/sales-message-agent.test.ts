import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SalesMessageSchema,
  type MarketingStrategy,
  type Prospect,
  type QuestionnaireAnswers,
  type SalesMessageDraft,
} from "@/lib/types";
import { qualifyProspect } from "@/lib/qualification/qualify-prospects";

const mockParse = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  // `function` (no arrow): sales-message-agent.ts hace `new Anthropic()`.
  default: vi.fn(function MockAnthropic() {
    return { messages: { parse: mockParse } };
  }),
}));

const { buildSalesMessageContext, runSalesMessageAgent, validateSalesMessageDraft, SalesMessageValidationError } =
  await import("./sales-message-agent");

const answers: QuestionnaireAnswers = {
  mainGoal: "first_customers",
  offering: "Plataforma para organizar eventos de pádel",
  problem: "Organizar torneos, canchas abiertas y eventos de pádel",
  businessType: "b2b",
  hasCustomersToday: "none",
  businessCategoryToTarget: "Clubes de pádel y organizadores de eventos",
  targetArea: "Buenos Aires",
  knownCompetitors: "CompetidorSecreto",
};

const strategy: MarketingStrategy = {
  idealCustomerProfile: [{ text: "Clubes de pádel de Buenos Aires.", source: "fact" }],
  problemOrNeed: [{ text: "Organizar torneos insume tiempo de coordinación.", source: "inference" }],
  valueProposition: [
    { text: "Centraliza la organización de torneos y canchas abiertas.", source: "fact" },
    { text: "Ahorra tiempo de coordinación a los clubes.", source: "inference" },
    { text: "Los clubes pagarían por esto.", source: "assumption" },
  ],
  acquisitionChannels: [{ text: "Contacto directo.", source: "inference" }],
  initialStrategy: [{ text: "Armar una lista.", source: "inference" }],
  nextBestAction: { action: "a", goal: "b", metricToWatch: "c", reason: "d", source: "inference" },
};

// Datos reales devueltos por Google Places (validación Fase 7).
const realProspect: Prospect = {
  name: "First Pádel Center",
  address: "Av. Francisco Beiró 2720, C1419HYO Cdad. Autónoma de Buenos Aires, Argentina",
  phone: "011 2758-9272",
  website: "https://instagram.com/firstpadelcenter?igshid=YmMyMTA2M2Y=",
  rating: 4.7,
  userRatingCount: 378,
  mapsUrl: "https://maps.google.com/?cid=12689615522674716320",
  primaryType: "sports_club",
  types: ["sports_club", "association_or_organization", "point_of_interest", "establishment"],
};
const prospect = qualifyProspect(realProspect, answers);

const validDraft: SalesMessageDraft = {
  message:
    "Hola, ¿cómo están? Vi que First Pádel Center tiene muy buenas reseñas en Google (4.7). Estoy desarrollando una plataforma para organizar eventos de pádel que centraliza la organización de torneos y canchas abiertas. ¿Te puedo mostrar cómo funciona?",
  cta: "¿Te puedo mostrar cómo funciona?",
  claims: [
    {
      quote: "First Pádel Center tiene muy buenas reseñas en Google (4.7)",
      about: "prospect",
      basedOn: ["prospect.name", "prospect.rating"],
    },
    {
      quote: "una plataforma para organizar eventos de pádel",
      about: "offering",
      basedOn: ["answers.offering"],
    },
    {
      quote: "centraliza la organización de torneos y canchas abiertas",
      about: "offering",
      basedOn: ["strategy.valueProposition.0"],
    },
  ],
};

const context = buildSalesMessageContext(prospect, answers, strategy);
const withDraft = (overrides: Partial<SalesMessageDraft>): SalesMessageDraft => ({ ...validDraft, ...overrides });

describe("buildSalesMessageContext", () => {
  it("incluye solo campos existentes, deja afuera supuestos y datos internos, y expone los unknowns", () => {
    const ids = context.items.map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining(["prospect.name", "prospect.website", "prospect.rating", "answers.offering"]));
    expect(ids).not.toContain("answers.priceRange"); // no fue respondido
    expect(ids).not.toContain("strategy.valueProposition.2"); // assumption
    expect(context.items.some((item) => item.source === "assumption")).toBe(false);
    expect(context.items.some((item) => item.text.includes("CompetidorSecreto"))).toBe(false);
    expect(ids.some((id) => id.startsWith("strategy.acquisitionChannels"))).toBe(false);
    expect(context.unknowns).toEqual(prospect.qualification.unknowns);
    expect(context.qualificationSummary).toMatch(/No es una probabilidad de conversión/);

    const withoutWebsite: Prospect = { ...realProspect, website: undefined };
    const noWebsite = buildSalesMessageContext(qualifyProspect(withoutWebsite, answers), answers, strategy);
    expect(noWebsite.items.map((item) => item.id)).not.toContain("prospect.website");
  });
});

describe("validateSalesMessageDraft — anti-hallucination en código", () => {
  it("acepta un borrador cuyo contenido está respaldado", () => {
    expect(validateSalesMessageDraft(validDraft, context)).toEqual([]);
  });

  it("rechaza claims que citan datos inexistentes o supuestos", () => {
    const draft = withDraft({
      claims: [{ quote: "centraliza la organización de torneos y canchas abiertas", about: "offering", basedOn: ["strategy.valueProposition.2"] }],
    });
    expect(validateSalesMessageDraft(draft, context).join(" ")).toMatch(/dato inexistente/);
  });

  it("rechaza afirmaciones sobre el prospecto que no se apoyan en hechos del prospecto", () => {
    for (const id of ["strategy.problemOrNeed.0", "answers.problem", "strategy.valueProposition.0"]) {
      const draft = withDraft({
        claims: [{ quote: "First Pádel Center tiene muy buenas reseñas en Google (4.7)", about: "prospect", basedOn: [id] }],
      });
      expect(validateSalesMessageDraft(draft, context).join(" ")).toMatch(/sin un hecho real del prospecto/);
    }
  });

  it("rechaza fragmentos o CTA que no están en el mensaje, y CTA que no es pregunta", () => {
    const draft = withDraft({
      cta: "Llamame hoy.",
      claims: [{ quote: "tienen 12 canchas", about: "prospect", basedOn: ["prospect.name"] }],
    });
    const violations = validateSalesMessageDraft(draft, context).join(" ");
    expect(violations).toMatch(/no aparece en el mensaje/);
    expect(violations).toMatch(/CTA no aparece/);
    expect(violations).toMatch(/no es una pregunta/);
  });

  it("rechaza números que no están en los datos (métricas, precios, porcentajes)", () => {
    const invented = withDraft({ message: `${validDraft.message} Clubes como el suyo ahorran 30 horas por mes.` });
    expect(validateSalesMessageDraft(invented, context).join(" ")).toMatch(/número sin respaldo en los datos: 30/);

    const percent = withDraft({ message: `${validDraft.message} Sube la ocupación.%` });
    expect(validateSalesMessageDraft(percent, context).join(" ")).toMatch(/porcentaje/);
  });

  it("rechaza necesidades, problemas o procesos atribuidos al prospecto; acepta hechos observables", () => {
    for (const sentence of [
      "Vi que necesitan ordenar sus torneos.",
      "Sé que están buscando una solución.",
      "Seguro tienen problemas con las inscripciones.",
      "Hoy gestionan los torneos a mano.",
      "Te garantizo más reservas.",
      // Caso real de la validación de Fase 8: slogan de una inferencia de la
      // estrategia que insinúa cómo trabaja hoy el prospecto.
      "Organiza torneos y canchas abiertas, sin planillas ni mensajes sueltos.",
      // Casos reales de la segunda ronda: tracción inventada y promesa de tiempo.
      "Estamos sumando clubes de Buenos Aires.",
      "¿Te muestro en dos minutos cómo funciona?",
      // Caso real de la tercera ronda: acción del remitente que no ocurrió.
      "Entré al sitio pasajedelsol.com.ar y me gustó.",
    ]) {
      const draft = withDraft({ message: `${validDraft.message} ${sentence}` });
      expect(validateSalesMessageDraft(draft, context).length, sentence).toBeGreaterThan(0);
    }

    const factual = withDraft({ message: validDraft.message.replace("Hola, ¿cómo están?", "Hola! Vi que tienen sitio web.") });
    expect(validateSalesMessageDraft(factual, context)).toEqual([]);
  });
});

describe("runSalesMessageAgent", () => {
  beforeEach(() => {
    mockParse.mockReset();
  });

  it("una sola llamada a Claude y devuelve un SalesMessage válido con procedencia derivada por el código", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: validDraft, stop_reason: "end_turn" });

    const result = await runSalesMessageAgent(prospect, answers, strategy);

    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(SalesMessageSchema.safeParse(result).success).toBe(true);
    expect(result.prospectId).toBe(realProspect.mapsUrl);
    expect(result.channel).toBe("whatsapp");
    expect(result.claims.map((claim) => claim.source)).toEqual(["fact", "fact", "fact"]);
    expect(result.unknowns).toEqual(prospect.qualification.unknowns);

    const prompt = mockParse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("[prospect.name] (fact) First Pádel Center");
    expect(prompt).toContain("NO SABEMOS");
    expect(prompt).not.toContain("Los clubes pagarían por esto."); // assumption
    expect(prompt).not.toContain("CompetidorSecreto");
  });

  it("un claim que cita una inferencia queda marcado como inference", async () => {
    const draft = withDraft({
      message: `${validDraft.message.replace(" ¿Te puedo mostrar cómo funciona?", "")} Ahorra tiempo de coordinación a los clubes. ¿Te puedo mostrar cómo funciona?`,
      claims: [{ quote: "Ahorra tiempo de coordinación a los clubes", about: "offering", basedOn: ["strategy.valueProposition.1"] }],
    });
    mockParse.mockResolvedValueOnce({ parsed_output: draft, stop_reason: "end_turn" });

    const result = await runSalesMessageAgent(prospect, answers, strategy);
    expect(result.claims[0].source).toBe("inference");
  });

  it("output malformado de Claude (parsed_output null) → SalesMessageValidationError", async () => {
    mockParse.mockResolvedValueOnce({ parsed_output: null, stop_reason: "max_tokens" });

    await expect(runSalesMessageAgent(prospect, answers, strategy)).rejects.toBeInstanceOf(SalesMessageValidationError);
  });

  it("borrador que inventa → SalesMessageValidationError, sin reintentar", async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: withDraft({ message: `${validDraft.message} Vi que necesitan más reservas.` }),
      stop_reason: "end_turn",
    });

    await expect(runSalesMessageAgent(prospect, answers, strategy)).rejects.toBeInstanceOf(SalesMessageValidationError);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });
});

describe("SalesMessageSchema — contrato estricto", () => {
  const valid = {
    prospectId: realProspect.mapsUrl,
    channel: "whatsapp",
    message: "Hola",
    cta: "¿Te muestro?",
    claims: [{ quote: "Hola", about: "offering", source: "fact", basedOn: ["answers.offering"] }],
    unknowns: [],
  };

  it("acepta un mensaje válido y rechaza canales, claves extra, supuestos y claims vacíos", () => {
    expect(SalesMessageSchema.safeParse(valid).success).toBe(true);
    expect(SalesMessageSchema.safeParse({ ...valid, channel: "email" }).success).toBe(false);
    expect(SalesMessageSchema.safeParse({ ...valid, sent: true }).success).toBe(false);
    expect(SalesMessageSchema.safeParse({ ...valid, claims: [] }).success).toBe(false);
    expect(
      SalesMessageSchema.safeParse({ ...valid, claims: [{ ...valid.claims[0], source: "assumption" }] }).success
    ).toBe(false);
  });
});
