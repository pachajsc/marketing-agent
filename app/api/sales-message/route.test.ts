import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { MarketingStrategy, Prospect, SalesMessage } from "@/lib/types";
import { qualifyProspect } from "@/lib/qualification/qualify-prospects";

// La clase de error se define en vi.hoisted para que el mock del agente y
// route.ts (que hace `instanceof`) usen exactamente la misma.
const { mockRunSalesMessageAgent, MockValidationError } = vi.hoisted(() => {
  class MockValidationError extends Error {
    readonly violations: string[];
    constructor(violations: string[]) {
      super(violations.join(" | "));
      this.violations = violations;
    }
  }
  return { mockRunSalesMessageAgent: vi.fn(), MockValidationError };
});

vi.mock("@/lib/agent/sales-message-agent", () => ({
  runSalesMessageAgent: mockRunSalesMessageAgent,
  SalesMessageValidationError: MockValidationError,
}));

const { POST } = await import("./route");

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/sales-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const answers = {
  offering: "Plataforma para organizar eventos de pádel",
  mainGoal: "first_customers",
  problem: "Organizar torneos, canchas abiertas y eventos de pádel",
  businessType: "b2b",
  hasCustomersToday: "none",
  businessCategoryToTarget: "Clubes de pádel y organizadores de eventos",
  targetArea: "Buenos Aires",
} as const;

const strategy: MarketingStrategy = {
  idealCustomerProfile: [{ text: "Clubes de pádel.", source: "fact" }],
  problemOrNeed: [{ text: "Organizar torneos.", source: "fact" }],
  valueProposition: [{ text: "Centraliza torneos.", source: "fact" }],
  acquisitionChannels: [{ text: "Contacto directo.", source: "inference" }],
  initialStrategy: [{ text: "Armar una lista.", source: "inference" }],
  nextBestAction: { action: "a", goal: "b", metricToWatch: "c", reason: "d", source: "inference" },
};

const rawProspect: Prospect = {
  name: "Alma Padel Club",
  address: "México 3526, C1223ABV Cdad. Autónoma de Buenos Aires, Argentina",
  phone: "011 7158-7352",
  rating: 5,
  userRatingCount: 54,
  mapsUrl: "https://maps.google.com/?cid=6688167508648028085",
  primaryType: "sports_activity_location",
};
const prospect = qualifyProspect(rawProspect, { ...answers });

const salesMessage: SalesMessage = {
  prospectId: rawProspect.mapsUrl,
  channel: "whatsapp",
  message: "Hola! ¿Te puedo mostrar cómo funciona?",
  cta: "¿Te puedo mostrar cómo funciona?",
  claims: [{ quote: "Hola", about: "offering", source: "fact", basedOn: ["answers.offering"] }],
  unknowns: [],
};

const validBody = { answers, strategy, prospect };

describe("POST /api/sales-message", () => {
  beforeEach(() => {
    mockRunSalesMessageAgent.mockReset();
  });

  it("input válido → 200 con el SalesMessage, una sola invocación al agente", async () => {
    mockRunSalesMessageAgent.mockResolvedValueOnce(salesMessage);

    const response = await POST(postRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(salesMessage);
    expect(mockRunSalesMessageAgent).toHaveBeenCalledTimes(1);
  });

  it("el agente recibe la qualification recalculada en el servidor, no la que manda el cliente", async () => {
    mockRunSalesMessageAgent.mockResolvedValueOnce(salesMessage);
    const tampered = {
      ...prospect,
      qualification: {
        ...prospect.qualification,
        evidence: [...prospect.qualification.evidence, { text: "Organiza 40 torneos por año.", source: "fact", points: 0, basedOn: ["prospect.name"] }],
      },
    };

    const response = await POST(postRequest({ ...validBody, prospect: tampered }));

    expect(response.status).toBe(200);
    const [receivedProspect] = mockRunSalesMessageAgent.mock.calls[0];
    expect(receivedProspect.qualification).toEqual(prospect.qualification);
  });

  it.each([
    ["JSON inválido", "esto no es JSON"],
    ["answers inválido", { ...validBody, answers: { offering: "" } }],
    ["strategy inválida", { ...validBody, strategy: { foo: "bar" } }],
    ["prospect inválido", { ...validBody, prospect: { name: "Sin dirección" } }],
    ["qualification inválida", { ...validBody, prospect: { ...prospect, qualification: { ...prospect.qualification, score: 999 } } }],
    ["prospect sin qualification", { ...validBody, prospect: rawProspect }],
  ])("%s → 400 sin invocar al agente", async (_label, body) => {
    const response = await POST(postRequest(body));

    expect(response.status).toBe(400);
    expect(mockRunSalesMessageAgent).not.toHaveBeenCalled();
  });

  it("output de Claude malformado o que no pasa la validación → 502 sin exponer el detalle", async () => {
    mockRunSalesMessageAgent.mockRejectedValueOnce(new MockValidationError(["número sin respaldo en los datos: 30"]));

    const response = await POST(postRequest(validBody));

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/validación de factualidad/);
    expect(body.error).not.toMatch(/30/);
  });

  it("errores de Anthropic → 429 (rate limit) / 502 (API) / 500 (auth)", async () => {
    mockRunSalesMessageAgent.mockRejectedValueOnce(new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers()));
    expect((await POST(postRequest(validBody))).status).toBe(429);

    mockRunSalesMessageAgent.mockRejectedValueOnce(new Anthropic.APIError(500, undefined, "boom", new Headers()));
    expect((await POST(postRequest(validBody))).status).toBe(502);

    mockRunSalesMessageAgent.mockRejectedValueOnce(new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()));
    expect((await POST(postRequest(validBody))).status).toBe(500);
  });
});
