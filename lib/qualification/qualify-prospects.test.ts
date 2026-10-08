import { describe, expect, it } from "vitest";
import {
  ProspectQualificationSchema,
  ProspectSchema,
  QualificationEvidenceSchema,
  QualifiedProspectSchema,
  type Prospect,
} from "@/lib/types";
import {
  PRIORITY_THRESHOLDS,
  priorityFromScore,
  qualifyProspect,
  qualifyProspects,
  type QualificationAnswers,
} from "./qualify-prospects";

const answers: QualificationAnswers = {
  businessCategoryToTarget: "Clubes de pádel y organizadores de eventos",
  targetArea: "Buenos Aires",
};

// Forma real devuelta por Google Places en la validación de Fase 6.
const fullProspect: Prospect = {
  name: "15CERO PADEL CLUB",
  address: "Antezana 47, C1414EEA Cdad. Autónoma de Buenos Aires, Argentina",
  phone: "011 3108-0203",
  website: "https://15cero.com/",
  rating: 4.8,
  userRatingCount: 146,
  mapsUrl: "https://maps.google.com/?cid=1",
  primaryType: "sports_club",
  types: ["sports_club", "association_or_organization", "point_of_interest", "establishment"],
};

// Solo los campos obligatorios de Prospect, sin ninguna coincidencia.
const minimalProspect: Prospect = {
  name: "Ferretería Central",
  address: "Av. Siempreviva 742, Springfield",
  mapsUrl: "https://maps.google.com/?cid=2",
};

const FORBIDDEN_CLAIMS =
  /factur|emplead|ingres|presupuest|intenci[oó]n de compra|conver|probab|\bkm\b|kil[oó]metro|metros|tamaño|autoridad|decisor/i;

describe("qualifyProspect — scoring determinista", () => {
  it("(1) score máximo: prospecto con todos los datos y coincidencias → 100", () => {
    const { qualification } = qualifyProspect(fullProspect, answers);

    expect(qualification.breakdown).toEqual({
      relevance: 30,
      location: 20,
      contact: 20,
      completeness: 15,
      signals: 15,
    });
    expect(qualification.score).toBe(100);
  });

  it("(2) score mínimo: sin coincidencias ni datos opcionales → 0", () => {
    const { qualification } = qualifyProspect(minimalProspect, answers);

    expect(qualification.score).toBe(0);
    expect(qualification.priority).toBe("low");
    expect(ProspectQualificationSchema.safeParse(qualification).success).toBe(true);
  });

  it("(3) sin teléfono: pierde exactamente los 10 puntos de teléfono y lo declara como desconocido", () => {
    const withoutPhone: Prospect = { ...fullProspect, phone: undefined };
    const { qualification } = qualifyProspect(withoutPhone, answers);

    expect(qualification.breakdown.contact).toBe(10);
    expect(qualification.score).toBe(90);
    expect(qualification.unknowns).toContain("Teléfono: no está disponible.");
    expect(qualification.evidence.some((e) => e.basedOn.includes("prospect.phone") && e.points > 0)).toBe(false);
    expect(qualification.summary).toContain("sin teléfono");
  });

  it("(4) sin website: pierde exactamente los 10 puntos de website y no hay inferencia de múltiples canales", () => {
    const withoutWebsite: Prospect = { ...fullProspect, website: undefined };
    const { qualification } = qualifyProspect(withoutWebsite, answers);

    expect(qualification.breakdown.contact).toBe(10);
    expect(qualification.score).toBe(90);
    expect(qualification.unknowns).toContain("Sitio web: no está disponible.");
    expect(qualification.evidence.some((e) => e.source === "inference")).toBe(false);
  });

  it("(5) con todos los datos: evidencia de cada criterio, contacto real y schema válido", () => {
    const qualified = qualifyProspect(fullProspect, answers);
    const { evidence } = qualified.qualification;

    expect(QualifiedProspectSchema.safeParse(qualified).success).toBe(true);
    for (const criterion of ["relevance", "location", "contact", "completeness", "signals"] as const) {
      expect(evidence.some((e) => e.criterion === criterion && e.points > 0)).toBe(true);
    }
    expect(evidence.some((e) => e.text.includes(fullProspect.phone!))).toBe(true);
    expect(evidence.find((e) => e.criterion === "location")?.text).toMatch(/coincidencia textual con la zona buscada/);
  });

  it("(6) datos incompletos: cada campo ausente resta lo suyo y queda listado en unknowns", () => {
    const partial: Prospect = {
      name: "Alma Padel Club",
      address: "México 3526, C1223ABV Cdad. Autónoma de Buenos Aires, Argentina",
      phone: "011 7158-7352",
      mapsUrl: "https://maps.google.com/?cid=3",
      primaryType: "sports_activity_location",
      types: ["sports_activity_location", "point_of_interest", "establishment"],
    };
    const { qualification } = qualifyProspect(partial, answers);

    // nombre 2 términos (padel, club) 20 + sin tipos coincidentes 0 + zona 20 + teléfono 10 + primaryType 5 + sin señales 0
    expect(qualification.breakdown).toEqual({ relevance: 20, location: 20, contact: 10, completeness: 5, signals: 0 });
    expect(qualification.score).toBe(55);
    expect(qualification.unknowns).toEqual(
      expect.arrayContaining([
        "Sitio web: no está disponible.",
        "Rating: no está disponible.",
        "Cantidad de reseñas: no está disponible.",
      ])
    );
  });
});

describe("priorityFromScore — thresholds fijos", () => {
  it("(7) HIGH desde 75", () => {
    expect(PRIORITY_THRESHOLDS.high).toBe(75);
    expect(priorityFromScore(100)).toBe("high");
    expect(priorityFromScore(75)).toBe("high");
    expect(qualifyProspect(fullProspect, answers).qualification.priority).toBe("high");
  });

  it("(8) MEDIUM de 50 a 74 — y un prospecto sin coincidencia con la categoría nunca pasa de 70", () => {
    expect(priorityFromScore(74)).toBe("medium");
    expect(priorityFromScore(50)).toBe("medium");

    const unrelatedButComplete: Prospect = { ...fullProspect, name: "Pasaje Del Sol", primaryType: "service", types: ["service"] };
    const { qualification } = qualifyProspect(unrelatedButComplete, answers);
    expect(qualification.breakdown.relevance).toBe(0);
    expect(qualification.score).toBe(70);
    expect(qualification.priority).toBe("medium");
  });

  it("(9) LOW por debajo de 50", () => {
    expect(priorityFromScore(49)).toBe("low");
    expect(priorityFromScore(0)).toBe("low");
    expect(qualifyProspect(minimalProspect, answers).qualification.priority).toBe("low");
  });
});

describe("fact / inference / assumption", () => {
  it("(10) solo los hechos suman: inferencias y supuestos con puntos son inválidos y nunca se generan", () => {
    const base = { text: "x", basedOn: ["prospect.phone"], criterion: "contact" as const };
    expect(QualificationEvidenceSchema.safeParse({ ...base, source: "assumption", points: 10 }).success).toBe(false);
    expect(QualificationEvidenceSchema.safeParse({ ...base, source: "inference", points: 10 }).success).toBe(false);
    expect(QualificationEvidenceSchema.safeParse({ ...base, source: "fact", points: 10 }).success).toBe(true);

    for (const prospect of [fullProspect, minimalProspect]) {
      const { qualification } = qualifyProspect(prospect, answers);
      const nonFacts = qualification.evidence.filter((e) => e.source !== "fact");
      expect(nonFacts.every((e) => e.points === 0)).toBe(true);
      const factPoints = qualification.evidence
        .filter((e) => e.source === "fact")
        .reduce((sum, e) => sum + e.points, 0);
      expect(qualification.score).toBe(factPoints);
    }

    // Una calificación adulterada para que un supuesto "explique" puntos no pasa el schema.
    const { qualification } = qualifyProspect(minimalProspect, answers);
    const tampered = {
      ...qualification,
      score: 15,
      breakdown: { ...qualification.breakdown, relevance: 15 },
      evidence: [
        ...qualification.evidence,
        { text: "Probablemente organiza torneos.", source: "assumption", criterion: "relevance", points: 15, basedOn: ["prospect.name"] },
      ],
    };
    expect(ProspectQualificationSchema.safeParse(tampered).success).toBe(false);
  });

  it("(11) determinista: mismos datos → mismo resultado, sin mutar la entrada", () => {
    const snapshot = structuredClone(fullProspect);

    const first = qualifyProspects([fullProspect, minimalProspect], answers);
    const second = qualifyProspects([structuredClone(fullProspect), structuredClone(minimalProspect)], answers);

    expect(second).toEqual(first);
    expect(fullProspect).toEqual(snapshot);
    expect(fullProspect).not.toHaveProperty("qualification");
  });

  it("(12) no inventa: sin claims comerciales no respaldados y solo cita datos presentes", () => {
    for (const prospect of [fullProspect, minimalProspect]) {
      const { qualification } = qualifyProspect(prospect, answers);
      const claimedText = [qualification.summary, ...qualification.evidence.map((e) => e.text)].join("\n");

      expect(claimedText).not.toMatch(FORBIDDEN_CLAIMS);
      expect(claimedText).not.toMatch(/torneo|organiza /i);
      for (const evidence of qualification.evidence) {
        for (const path of evidence.basedOn) {
          expect(path).toMatch(/^(prospect|answers)\./);
          if (evidence.points > 0 && path.startsWith("prospect.")) {
            expect(prospect[path.slice("prospect.".length) as keyof Prospect]).toBeDefined();
          }
        }
      }
    }

    // Los números que aparecen en la evidencia salen del prospecto, no se estiman.
    const { qualification } = qualifyProspect(fullProspect, answers);
    expect(qualification.evidence.map((e) => e.text).join(" ")).toContain("146 reseñas");
  });
});

describe("qualifyProspects — ordenamiento", () => {
  it("(13) ordena por score descendente sin eliminar ninguno", () => {
    const result = qualifyProspects([minimalProspect, fullProspect], answers);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name)).toEqual([fullProspect.name, minimalProspect.name]);
  });

  it("(14) empate de score → más canales de contacto primero; empate total → orden original", () => {
    const common = { address: "Calle 1, Buenos Aires", mapsUrl: "https://maps.google.com/?cid=9" };
    // 20 de contacto (teléfono + web), sin completitud ni señales.
    const twoChannels: Prospect = { ...common, name: "Padel Uno", phone: "1", website: "https://uno.example" };
    // Sin contacto, pero completitud 10 + señales 10 → mismo score.
    const noChannels: Prospect = { ...common, name: "Padel Dos", rating: 4.5, userRatingCount: 30 };
    const twinA: Prospect = { ...common, name: "Padel Tres" };
    const twinB: Prospect = { ...common, name: "Padel Cuatro" };

    const result = qualifyProspects([noChannels, twoChannels, twinA, twinB], answers);
    const scores = new Map(result.map((p) => [p.name, p.qualification.score]));

    expect(scores.get("Padel Uno")).toBe(scores.get("Padel Dos"));
    expect(scores.get("Padel Tres")).toBe(scores.get("Padel Cuatro"));
    expect(result.map((p) => p.name)).toEqual(["Padel Uno", "Padel Dos", "Padel Tres", "Padel Cuatro"]);
  });

  it("(15) compatible con Prospect: todos los campos originales intactos, solo se agrega qualification", () => {
    const [qualified] = qualifyProspects([fullProspect], answers);
    const { qualification, ...prospectFields } = qualified;

    expect(prospectFields).toEqual(fullProspect);
    expect(ProspectSchema.parse(qualified)).toEqual(fullProspect);
    expect(qualification).toBeDefined();
  });
});

describe("relevancia — los types secundarios no suman puntos", () => {
  // Datos reales devueltos por Google Places para "Pasaje Del Sol" en la validación de Fase 7.
  const pasajeDelSol: Prospect = {
    name: "Pasaje Del Sol (Sede Del Carril)",
    address: "Av. Salvador María del Carril 2172, C1419 C1419GZN, Cdad. Autónoma de Buenos Aires, Argentina",
    phone: "011 5836-7213",
    website: "https://pasajedelsol.com.ar/",
    rating: 4.4,
    userRatingCount: 243,
    mapsUrl: "https://maps.google.com/?cid=12406326054384897795",
    primaryType: "service",
    types: ["stadium", "sports_complex", "event_venue", "sports_activity_location", "service", "point_of_interest", "establishment"],
  };

  const relevanceEvidence = (prospect: Prospect) =>
    qualifyProspect(prospect, answers).qualification.evidence.filter((e) => e.criterion === "relevance" && e.points > 0);

  it("(caso 1) falso positivo: name y primaryType no coinciden, un type secundario sí → sin puntos por ese type", () => {
    const { qualification } = qualifyProspect(pasajeDelSol, answers);

    expect(qualification.breakdown.relevance).toBe(0);
    expect(qualification.evidence.some((e) => e.basedOn.includes("prospect.types") && e.points > 0)).toBe(false);
    expect(qualification.evidence.some((e) => e.text.includes("event_venue"))).toBe(false);
    expect(qualification.priority).not.toBe("high");
  });

  it("(caso 2) coincidencia en name sigue sumando sus puntos", () => {
    const nameOnly: Prospect = { ...minimalProspect, name: "Lasaigues Padel" };
    const evidence = relevanceEvidence(nameOnly);

    expect(evidence).toHaveLength(1);
    expect(evidence[0].basedOn).toContain("prospect.name");
    expect(qualifyProspect(nameOnly, answers).qualification.breakdown.relevance).toBe(15);
  });

  it("(caso 3) coincidencia en primaryType sigue sumando sus puntos", () => {
    const primaryTypeOnly: Prospect = { ...minimalProspect, primaryType: "sports_club", types: ["sports_club"] };
    const evidence = relevanceEvidence(primaryTypeOnly);

    expect(evidence).toHaveLength(1);
    expect(evidence[0].basedOn).toContain("prospect.primaryType");
    expect(qualifyProspect(primaryTypeOnly, answers).qualification.breakdown.relevance).toBe(10);
  });

  it("(caso 4) único match en types secundarios → relevance 0; con name válido, solo suma el name", () => {
    const secondaryOnly: Prospect = { ...minimalProspect, primaryType: "service", types: ["service", "sports_club", "event_venue"] };
    expect(qualifyProspect(secondaryOnly, answers).qualification.breakdown.relevance).toBe(0);

    const nameAndSecondary: Prospect = { ...secondaryOnly, name: "Padel Norte" };
    const evidence = relevanceEvidence(nameAndSecondary);
    expect(qualifyProspect(nameAndSecondary, answers).qualification.breakdown.relevance).toBe(15);
    expect(evidence.every((e) => !e.basedOn.includes("prospect.types"))).toBe(true);
  });

  it("(caso 5) regresión: location, contact, completeness, signals, priority y orden no cambian", () => {
    const { qualification } = qualifyProspect(pasajeDelSol, answers);

    expect(qualification.breakdown).toEqual({ relevance: 0, location: 20, contact: 20, completeness: 15, signals: 15 });
    expect(qualification.score).toBe(70);
    expect(qualification.priority).toBe("medium");
    expect(ProspectQualificationSchema.safeParse(qualification).success).toBe(true);

    // Con los mismos datos de contacto/completitud, la coincidencia en el nombre sigue ordenando primero.
    const padelClub: Prospect = { ...pasajeDelSol, name: "Padel Club Del Carril" };
    const ordered = qualifyProspects([pasajeDelSol, padelClub], answers);
    expect(ordered.map((p) => p.name)).toEqual([padelClub.name, pasajeDelSol.name]);
    expect(ordered[0].qualification.score).toBe(90);
  });
});
