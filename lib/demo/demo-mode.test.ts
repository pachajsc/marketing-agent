import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MarketingStrategy, Prospect, QuestionnaireAnswers, SalesMessageDraft } from "@/lib/types";

// En modo demo nada puede llamar a Claude ni a la búsqueda real: si alguno se usa, el test falla.
const mockParse = vi.fn(() => {
  throw new Error("Claude no debe llamarse en modo demo");
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function MockAnthropic() {
    return { messages: { parse: mockParse } };
  }),
}));
const mockSearch = vi.fn(() => {
  throw new Error("La búsqueda real no debe llamarse en modo demo");
});
vi.mock("@/lib/tools/search-prospects-tool", () => ({ runSearchProspectsTool: mockSearch }));

const answers: QuestionnaireAnswers = {
  mainGoal: "first_customers",
  offering: "Plataforma para organizar eventos de pádel",
  problem: "Organizar torneos, canchas abiertas y eventos de pádel",
  businessType: "b2b",
  hasCustomersToday: "none",
  businessCategoryToTarget: "Clubes de pádel",
  targetArea: "Buenos Aires",
};

const strategy: MarketingStrategy = {
  idealCustomerProfile: [{ text: "Clubes de pádel de Buenos Aires.", source: "fact" }],
  problemOrNeed: [{ text: "Organizar torneos.", source: "fact" }],
  valueProposition: [{ text: "Plataforma para organizar torneos, canchas abiertas y eventos de pádel.", source: "fact" }],
  acquisitionChannels: [{ text: "Contacto directo.", source: "inference" }],
  initialStrategy: [{ text: "Armar una lista.", source: "inference" }],
  nextBestAction: { action: "a", goal: "b", metricToWatch: "c", reason: "d", source: "inference" },
};

const avant: Prospect = {
  name: "AVANT CLUB Gym & Padel",
  address: "Av. Cabildo 2160, C1428AAQ Cdad. Autónoma de Buenos Aires, Argentina",
  phone: "011 3126-0677",
  website: "https://avantclub.com.ar/",
  rating: 4.4,
  userRatingCount: 270,
  mapsUrl: "https://maps.google.com/?cid=1",
  primaryType: "sports_club",
};
const alma: Prospect = {
  name: "Alma Padel Club",
  address: "México 3526, C1223ABV Cdad. Autónoma de Buenos Aires, Argentina",
  mapsUrl: "https://maps.google.com/?cid=2",
  primaryType: "sports_activity_location",
};

const recorded: SalesMessageDraft = {
  message: "Hola! Les escribo por AVANT CLUB Gym & Padel, sobre Av. Cabildo. ¿Les muestro cómo funciona?",
  cta: "¿Les muestro cómo funciona?",
  claims: [{ quote: "AVANT CLUB Gym & Padel, sobre Av. Cabildo", about: "prospect", basedOn: ["prospect.name", "prospect.address"] }],
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-fixture-"));
const fixtureFile = path.join(dir, "fixture.json");

beforeAll(() => {
  fs.writeFileSync(fixtureFile, JSON.stringify({ strategy, prospects: [avant, alma], messages: { [avant.mapsUrl]: recorded } }));
  process.env.AI_MODE = "demo";
  process.env.DEMO_FIXTURE_PATH = fixtureFile;
  process.env.DEMO_DELAY_MS = "0";
});

afterAll(() => {
  delete process.env.AI_MODE;
  delete process.env.DEMO_FIXTURE_PATH;
  delete process.env.DEMO_DELAY_MS;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("modo demo (AI_MODE=demo)", () => {
  it("la estrategia es la grabada, sin llamar a Claude", async () => {
    const { runMarketingAgent } = await import("@/lib/agent/marketing-agent");
    expect(await runMarketingAgent(answers)).toEqual(strategy);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("los prospectos son los grabados, sin Claude ni búsqueda real", async () => {
    const { runProspectingAgent } = await import("@/lib/agent/prospecting-agent");
    expect(await runProspectingAgent(answers, strategy)).toEqual({ prospects: [avant, alma] });
    expect(mockParse).not.toHaveBeenCalled();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("usa el mensaje grabado cuando existe y el borrador mínimo cuando no; los dos pasan la validación de factualidad", async () => {
    const { runSalesMessageAgent } = await import("@/lib/agent/sales-message-agent");
    const { qualifyProspect } = await import("@/lib/qualification/qualify-prospects");

    const fromRecording = await runSalesMessageAgent(qualifyProspect(avant, answers), answers, strategy);
    expect(fromRecording.message).toBe(recorded.message);

    const fromTemplate = await runSalesMessageAgent(qualifyProspect(alma, answers), answers, strategy);
    expect(fromTemplate.message).toBe(
      "Hola, ¿cómo andan? Les escribo por Alma Padel Club. Trabajo en plataforma para organizar eventos de pádel. ¿Les muestro cómo funciona?"
    );
    expect(fromTemplate.claims.map((claim) => claim.basedOn)).toEqual([["prospect.name"], ["answers.offering"]]);
    expect(fromTemplate.claims.every((claim) => claim.source === "fact")).toBe(true);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("sin el archivo de respuestas grabadas falla con un mensaje claro", async () => {
    vi.resetModules();
    process.env.DEMO_FIXTURE_PATH = path.join(dir, "no-existe.json");
    const { loadDemoFixture } = await import("@/lib/demo/demo-mode");
    expect(() => loadDemoFixture()).toThrow(/Modo demo activo pero no existe/);
    process.env.DEMO_FIXTURE_PATH = fixtureFile;
  });
});
