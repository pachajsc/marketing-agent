import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { applyAppSchema } from "./db";
import { createRepository, RepositoryError, type Repository } from "./repository";
import { qualifyProspect } from "@/lib/qualification/qualify-prospects";
import type { MarketingStrategy, Prospect, QuestionnaireAnswers, SalesMessage } from "@/lib/types";

const answers: QuestionnaireAnswers = {
  mainGoal: "first_customers",
  offering: "Plataforma para organizar eventos de pádel",
  problem: "Organizar torneos, canchas abiertas y eventos de pádel",
  businessType: "b2b",
  hasCustomersToday: "none",
  businessCategoryToTarget: "Clubes de pádel y organizadores de eventos",
  targetArea: "Buenos Aires",
};

// Datos reales devueltos por Google Places en validaciones anteriores.
const firstPadel: Prospect = {
  name: "First Pádel Center",
  address: "Av. Francisco Beiró 2720, C1419HYO Cdad. Autónoma de Buenos Aires, Argentina",
  phone: "011 2758-9272",
  website: "https://instagram.com/firstpadelcenter?igshid=YmMyMTA2M2Y=",
  rating: 4.7,
  userRatingCount: 378,
  mapsUrl: "https://maps.google.com/?cid=12689615522674716320",
  primaryType: "sports_club",
};
const almaPadel: Prospect = {
  name: "Alma Padel Club",
  address: "México 3526, C1223ABV Cdad. Autónoma de Buenos Aires, Argentina",
  phone: "011 7158-7352",
  rating: 5,
  userRatingCount: 54,
  mapsUrl: "https://maps.google.com/?cid=6688167508648028085",
  primaryType: "sports_activity_location",
};

const salesMessage: SalesMessage = {
  prospectId: firstPadel.mapsUrl,
  channel: "whatsapp",
  message: "Hola! Les escribo por First Pádel Center. ¿Les muestro cómo funciona?",
  cta: "¿Les muestro cómo funciona?",
  claims: [{ quote: "Les escribo por First Pádel Center", about: "prospect", source: "fact", basedOn: ["prospect.name"] }],
  unknowns: [],
};

const strategy: MarketingStrategy = {
  idealCustomerProfile: [{ text: "Clubes de pádel.", source: "fact" }],
  problemOrNeed: [{ text: "Organizar torneos.", source: "fact" }],
  valueProposition: [{ text: "Centraliza torneos.", source: "fact" }],
  acquisitionChannels: [{ text: "Contacto directo.", source: "inference" }],
  initialStrategy: [{ text: "Armar una lista.", source: "inference" }],
  nextBestAction: { action: "a", goal: "b", metricToWatch: "c", reason: "d", source: "inference" },
};

const USER = "user-a";
const OTHER = "user-b";
let repo: Repository;

function idOf(name: string, userId = USER) {
  return repo.listProspects(userId).find((record) => record.prospect.name === name)!.id;
}

beforeEach(() => {
  const db = new DatabaseSync(":memory:");
  applyAppSchema(db);
  repo = createRepository(db);
  repo.upsertProspects(USER, [qualifyProspect(firstPadel, answers), qualifyProspect(almaPadel, answers)]);
});

describe("perfil de negocio", () => {
  it("guarda respuestas y estrategia; si las respuestas cambian, la estrategia anterior se descarta", () => {
    repo.saveProfileAnswers(USER, answers);
    repo.saveStrategy(USER, strategy);
    expect(repo.getProfile(USER)?.strategy).toEqual(strategy);

    repo.saveProfileAnswers(USER, answers);
    expect(repo.getProfile(USER)?.strategy).toEqual(strategy);

    repo.saveProfileAnswers(USER, { ...answers, targetArea: "Córdoba" });
    expect(repo.getProfile(USER)?.strategy).toBeNull();
  });

  it("no se puede guardar una estrategia sin cuestionario", () => {
    expect(() => repo.saveStrategy(OTHER, strategy)).toThrow(RepositoryError);
  });
});

describe("prospectos", () => {
  it("guarda prospectos reales como Nuevo, con evento 'found', ordenados por score", () => {
    const records = repo.listProspects(USER);
    expect(records.map((record) => record.prospect.name)).toEqual(["First Pádel Center", "Alma Padel Club"]);
    expect(records.every((record) => record.status === "new")).toBe(true);
    expect(records[0].lastActivity?.type).toBe("found");
    expect(records[0].prospect).toEqual(qualifyProspect(firstPadel, answers));
  });

  it("una nueva búsqueda actualiza datos sin duplicar ni perder estado", () => {
    repo.changeStatus(USER, idOf("Alma Padel Club"), "rejected");
    const result = repo.upsertProspects(USER, [qualifyProspect({ ...almaPadel, rating: 4.9 }, answers)]);

    expect(result).toEqual({ inserted: 0, updated: 1 });
    expect(repo.listProspects(USER)).toHaveLength(2);
    const alma = repo.getProspect(USER, idOf("Alma Padel Club"))!;
    expect(alma.status).toBe("rejected");
    expect(alma.prospect.rating).toBe(4.9);
  });

  it("aísla usuarios: nadie ve ni modifica prospectos de otro", () => {
    const id = idOf("First Pádel Center");
    expect(repo.listProspects(OTHER)).toEqual([]);
    expect(repo.getProspect(OTHER, id)).toBeNull();
    expect(() => repo.changeStatus(OTHER, id, "rejected")).toThrow(RepositoryError);
    expect(repo.listRecentEvents(OTHER, 10)).toEqual([]);
  });
});

describe("estados y mensajes", () => {
  it("flujo completo: generar → aprobar (Listo) → contactado → respondió → calificado, con línea de tiempo", () => {
    const id = idOf("First Pádel Center");
    expect(() => repo.changeStatus(USER, id, "contacted")).toThrow(RepositoryError); // sin mensaje aprobado

    repo.saveGeneratedMessage(USER, id, salesMessage);
    repo.applyReviewAction(USER, id, { type: "approve" });
    expect(repo.getProspect(USER, id)?.status).toBe("ready");

    repo.changeStatus(USER, id, "contacted");
    repo.changeStatus(USER, id, "replied");
    repo.changeStatus(USER, id, "qualified");

    const prospect = repo.getProspect(USER, id)!;
    expect(prospect.status).toBe("qualified");
    expect(prospect.events.map((event) => event.type)).toEqual([
      "status_changed",
      "status_changed",
      "status_changed",
      "status_changed",
      "message_approved",
      "message_generated",
      "found",
    ]);
    expect(repo.getStats(USER)).toEqual({ total: 2, newCount: 1, contacted: 1, responses: 1 });
  });

  it("las reglas de revisión se aplican en el servidor: no se aprueba vacío ni se regenera con edición pendiente", () => {
    const id = idOf("First Pádel Center");
    repo.saveGeneratedMessage(USER, id, salesMessage);

    repo.applyReviewAction(USER, id, { type: "edit", text: "   " });
    expect(() => repo.applyReviewAction(USER, id, { type: "approve" })).toThrow(RepositoryError);
    expect(() => repo.saveGeneratedMessage(USER, id, salesMessage)).toThrow(RepositoryError);

    repo.applyReviewAction(USER, id, { type: "restoreOriginal" });
    expect(repo.getProspect(USER, id)?.review?.editedText).toBeNull();
    expect(() => repo.saveGeneratedMessage(USER, id, salesMessage)).not.toThrow();
  });

  it("reabrir un mensaje aprobado devuelve el prospecto a Nuevo; contactado bloquea el mensaje", () => {
    const id = idOf("First Pádel Center");
    repo.saveGeneratedMessage(USER, id, salesMessage);
    repo.applyReviewAction(USER, id, { type: "approve" });
    repo.applyReviewAction(USER, id, { type: "reopen" });
    expect(repo.getProspect(USER, id)?.status).toBe("new");

    repo.applyReviewAction(USER, id, { type: "approve" });
    repo.changeStatus(USER, id, "contacted");
    expect(() => repo.applyReviewAction(USER, id, { type: "reopen" })).toThrow(RepositoryError);
    expect(() => repo.saveGeneratedMessage(USER, id, salesMessage)).toThrow(RepositoryError);
    expect(repo.getProspect(USER, id)?.review?.approvedText).toBe(salesMessage.message);
  });

  it("actividad reciente: eventos reales del usuario, del más nuevo al más viejo, con el nombre del prospecto", () => {
    const id = idOf("Alma Padel Club");
    repo.changeStatus(USER, id, "rejected");
    const events = repo.listRecentEvents(USER, 2);
    expect(events[0]).toMatchObject({ type: "status_changed", detail: "new→rejected", prospectName: "Alma Padel Club" });
    expect(events).toHaveLength(2);
  });
});
