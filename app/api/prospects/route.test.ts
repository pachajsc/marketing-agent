import { beforeEach, describe, expect, it, vi } from "vitest";
import { QualifiedProspectSchema, type Prospect, type QualifiedProspect } from "@/lib/types";

const mockRunProspectingAgent = vi.fn();

vi.mock("@/lib/agent/prospecting-agent", () => ({
  runProspectingAgent: mockRunProspectingAgent,
}));

const { POST } = await import("./route");

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/prospects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validAnswers = {
  offering: "plataforma para anotarte en eventos de padel",
  mainGoal: "first_customers",
  problem: "la desorganización a la hora de anotarse a un evento de padel",
  businessType: "b2b",
  hasCustomersToday: "none",
  businessCategoryToTarget: "clubes de padel",
  targetArea: "Ciudad de Buenos Aires",
};

describe("POST /api/prospects", () => {
  beforeEach(() => {
    mockRunProspectingAgent.mockReset();
  });

  it("(11) body sin JSON válido -> 400, sin invocar al Agent", async () => {
    const request = new Request("http://localhost/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "esto no es JSON",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockRunProspectingAgent).not.toHaveBeenCalled();
  });

  it("(11) answers vacío ({}) -> 400 en vez de 500, sin invocar al Agent", async () => {
    const response = await POST(postRequest({ answers: {} }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/inválido/i);
    expect(mockRunProspectingAgent).not.toHaveBeenCalled();
  });

  it("(11) falta 'answers' directamente -> 400, sin invocar al Agent", async () => {
    const response = await POST(postRequest({}));

    expect(response.status).toBe(400);
    expect(mockRunProspectingAgent).not.toHaveBeenCalled();
  });

  it("(11) strategy con forma inválida -> 400, sin invocar al Agent", async () => {
    const response = await POST(
      postRequest({ answers: validAnswers, strategy: { foo: "bar" } })
    );

    expect(response.status).toBe(400);
    expect(mockRunProspectingAgent).not.toHaveBeenCalled();
  });

  it("(12) input válido -> 200 con los prospects del Agent intactos, cada uno con su qualification (Fase 7)", async () => {
    const prospects: Prospect[] = [
      { name: "Club Norte", address: "Calle 1, CABA", mapsUrl: "https://maps.google.com/?cid=1" },
    ];
    mockRunProspectingAgent.mockResolvedValueOnce({ prospects });

    const response = await POST(postRequest({ answers: validAnswers }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as QualifiedProspect[];
    expect(body).toHaveLength(prospects.length);
    const { qualification, ...prospectFields } = body[0];
    expect(prospectFields).toEqual(prospects[0]);
    expect(QualifiedProspectSchema.safeParse(body[0]).success).toBe(true);
    expect(qualification.score).toBeGreaterThanOrEqual(0);
    expect(mockRunProspectingAgent).toHaveBeenCalledTimes(1);
  });
});
