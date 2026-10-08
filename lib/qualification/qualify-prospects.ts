// Calificación de prospectos — Fase 7.
//
// Etapa posterior a la búsqueda: recibe los Prospect[] reales que ya
// devolvió Google Places (vía Agent → Tool → MCP) y los prioriza. No llama a
// Claude, ni a Google, ni a ningún servicio: es una función pura y
// determinista — mismos Prospect + QuestionnaireAnswers producen siempre el
// mismo score, la misma prioridad y la misma evidencia. Por eso tampoco
// importa "server-only": no maneja secretos y su costo no crece con la
// cantidad de prospectos más allá de un cálculo local.
//
// Fórmula (máximo 100):
//
//   score = relevance (0–30) + location (0–20) + contact (0–20)
//         + completeness (0–15) + signals (0–15)
//
//   relevance    = nombre: 2+ términos de la categoría → 20, 1 → 15, 0 → 0
//                + primaryType coincide → 10 (los types secundarios no suman)
//   location     = términos de targetArea en address: todos → 20, algunos → 10
//   contact      = phone → 10, website → 10
//   completeness = rating → 5, userRatingCount → 5, primaryType → 5
//   signals      = userRatingCount ≥ 100 → 10, ≥ 20 → 5
//                + rating ≥ 4.0 con ≥ 20 reseñas → 5
//
//   priority: high ≥ 75, medium ≥ 50, low < 50 (thresholds fijos).
//
// Consecuencia de los pesos: un prospecto sin ninguna coincidencia con la
// categoría suma como máximo 70, así que nunca llega a prioridad alta solo
// por tener datos completos.
//
// Solo los hechos observables (source "fact") suman puntos. Las inferencias
// se muestran como contexto, siempre con 0 puntos y apoyadas en hechos
// (basedOn). Este módulo no genera supuestos. El schema
// (ProspectQualificationSchema en lib/types.ts) valida esas invariantes.
//
// "Coincidencia" es siempre textual: texto normalizado (minúsculas, sin
// acentos, sin conectores, plural simple a singular), con tokens iguales o
// con un prefijo común de al menos 4 letras (ej: "evento" ~ "event"). No hay
// interpretación semántica ni geográfica.
import type {
  ProspectPriority,
  ProspectQualification,
  Prospect,
  QualificationBreakdown,
  QualificationCriterion,
  QualificationEvidence,
  QualifiedProspect,
  QuestionnaireAnswers,
} from "@/lib/types";

export type QualificationAnswers = Pick<QuestionnaireAnswers, "businessCategoryToTarget" | "targetArea">;

/** Thresholds fijos de prioridad. Ningún modelo puede modificarlos. */
export const PRIORITY_THRESHOLDS = { high: 75, medium: 50 } as const;

const PRIORITY_LABEL: Record<ProspectPriority, string> = {
  high: "alta",
  medium: "media",
  low: "baja",
};

// Lo que nunca sabemos con los datos de Google Places, para cualquier
// prospecto. Se declara explícitamente en vez de dejar que se suponga.
const ALWAYS_UNKNOWN = [
  "Si tiene la necesidad que resuelve tu producto o servicio.",
  "Quién toma las decisiones de compra.",
  "Presupuesto disponible e intención de compra.",
  "Tamaño del negocio, facturación y cantidad de clientes.",
  "Actividad reciente: la cantidad de reseñas es acumulada.",
  "Distancia geográfica: no hay coordenadas, solo la dirección publicada.",
];

const STOPWORDS = new Set([
  "a", "al", "con", "de", "del", "e", "el", "en", "la", "las", "lo", "los",
  "o", "para", "por", "que", "u", "un", "una", "unas", "unos", "y",
]);

const MIN_PREFIX_LENGTH = 4;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Plural simple del español a singular: "clubes" → "club", "eventos" → "evento". */
function singularize(word: string): string {
  if (/[^aeiou]es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Tokens normalizados, sin conectores ni repetidos, en orden de aparición. Separa también "_" (tipos de Google). */
function tokenize(text: string | undefined): string[] {
  if (!text) return [];
  const tokens = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .map(singularize);
  return Array.from(new Set(tokens));
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= MIN_PREFIX_LENGTH && longer.startsWith(shorter);
}

/** Términos de `wanted` que aparecen (textualmente) en `candidates`. */
function matchedTerms(wanted: string[], candidates: string[]): string[] {
  return wanted.filter((term) => candidates.some((candidate) => tokensMatch(term, candidate)));
}

export function priorityFromScore(score: number): ProspectPriority {
  if (score >= PRIORITY_THRESHOLDS.high) return "high";
  if (score >= PRIORITY_THRESHOLDS.medium) return "medium";
  return "low";
}

/** Canales de contacto directo publicados (address y mapsUrl siempre existen, no diferencian). */
function contactChannels(prospect: Prospect): number {
  return (prospect.phone ? 1 : 0) + (prospect.website ? 1 : 0);
}

function fact(
  text: string,
  basedOn: string[],
  criterion?: QualificationCriterion,
  points = 0
): QualificationEvidence {
  return { text, source: "fact", criterion, points, basedOn };
}

function relevanceEvidence(prospect: Prospect, answers: QualificationAnswers): QualificationEvidence[] {
  const category = answers.businessCategoryToTarget?.trim();
  const categoryTerms = tokenize(category);
  if (!category || categoryTerms.length === 0) {
    return [fact("No se indicó una categoría de cliente a buscar: la relevancia no se puede evaluar.", ["answers.businessCategoryToTarget"])];
  }

  const evidence: QualificationEvidence[] = [];

  const nameHits = matchedTerms(categoryTerms, tokenize(prospect.name));
  if (nameHits.length > 0) {
    evidence.push(
      fact(
        `El nombre "${prospect.name}" coincide textualmente con la categoría buscada ("${category}") en: ${nameHits.join(", ")}.`,
        ["prospect.name", "answers.businessCategoryToTarget"],
        "relevance",
        nameHits.length >= 2 ? 20 : 15
      )
    );
  }

  // Los `types` secundarios no se evalúan: describen el lugar de forma
  // amplia (ej. "event_venue" = un espacio para eventos, no alguien que los
  // organiza), así que una coincidencia textual ahí no alcanza para sumar
  // relevancia.
  const primaryTypeHits = matchedTerms(categoryTerms, tokenize(prospect.primaryType));
  if (prospect.primaryType && primaryTypeHits.length > 0) {
    evidence.push(
      fact(
        `El tipo de negocio ("${prospect.primaryType}") coincide textualmente con la categoría buscada en: ${primaryTypeHits.join(", ")}.`,
        ["prospect.primaryType", "answers.businessCategoryToTarget"],
        "relevance",
        10
      )
    );
  }

  if (evidence.length === 0) {
    evidence.push(
      fact(
        `Ni el nombre ni el tipo de negocio coinciden textualmente con la categoría buscada ("${category}"): con estos datos no se puede confirmar su relevancia.`,
        ["prospect.name", "prospect.primaryType", "answers.businessCategoryToTarget"]
      )
    );
  }

  return evidence;
}

function locationEvidence(prospect: Prospect, answers: QualificationAnswers): QualificationEvidence {
  const area = answers.targetArea?.trim();
  const areaTerms = tokenize(area);
  const basedOn = ["prospect.address", "answers.targetArea"];
  if (!area || areaTerms.length === 0) {
    return fact("No se indicó una zona buscada: no hay coincidencia textual con la zona buscada que evaluar.", basedOn);
  }

  const hits = matchedTerms(areaTerms, tokenize(prospect.address));
  if (hits.length === areaTerms.length) {
    return fact(
      `La dirección incluye la zona buscada ("${area}"): coincidencia textual con la zona buscada, no una medición de distancia geográfica.`,
      basedOn,
      "location",
      20
    );
  }
  if (hits.length > 0) {
    return fact(
      `La dirección incluye parte de la zona buscada ("${area}"; términos: ${hits.join(", ")}): coincidencia textual parcial con la zona buscada, no una medición de distancia geográfica.`,
      basedOn,
      "location",
      10
    );
  }
  return fact(
    `La dirección no incluye la zona buscada ("${area}"): no hay coincidencia textual con la zona buscada. Esto no mide distancia geográfica.`,
    basedOn
  );
}

function contactEvidence(prospect: Prospect): QualificationEvidence[] {
  const evidence: QualificationEvidence[] = [];
  if (prospect.phone) {
    evidence.push(fact(`Teléfono publicado: ${prospect.phone}.`, ["prospect.phone"], "contact", 10));
  }
  if (prospect.website) {
    evidence.push(fact("Sitio web publicado.", ["prospect.website"], "contact", 10));
  }
  evidence.push(fact("Dirección y ubicación disponibles.", ["prospect.address", "prospect.mapsUrl"]));
  if (prospect.phone && prospect.website) {
    evidence.push({
      text: "Al tener teléfono y sitio web publicados, hay más de una vía para un primer contacto.",
      source: "inference",
      points: 0,
      basedOn: ["prospect.phone", "prospect.website"],
    });
  }
  return evidence;
}

function completenessEvidence(prospect: Prospect): QualificationEvidence {
  const fields: { present: boolean; label: string; path: string }[] = [
    { present: prospect.rating !== undefined, label: "rating", path: "prospect.rating" },
    { present: prospect.userRatingCount !== undefined, label: "cantidad de reseñas", path: "prospect.userRatingCount" },
    { present: prospect.primaryType !== undefined, label: "tipo principal", path: "prospect.primaryType" },
  ];
  const present = fields.filter((field) => field.present);
  const text =
    present.length > 0
      ? `Tenemos ${present.length} de 3 datos comerciales complementarios: ${present.map((field) => field.label).join(", ")}.`
      : "No tenemos rating, cantidad de reseñas ni tipo principal.";
  return fact(text, fields.map((field) => field.path), "completeness", present.length * 5);
}

function signalsEvidence(prospect: Prospect): QualificationEvidence[] {
  const evidence: QualificationEvidence[] = [];
  const count = prospect.userRatingCount;
  if (count !== undefined) {
    const points = count >= 100 ? 10 : count >= 20 ? 5 : 0;
    evidence.push(
      fact(
        `Tiene ${count} reseñas acumuladas (no indica actividad reciente).`,
        ["prospect.userRatingCount"],
        "signals",
        points
      )
    );
  }
  if (prospect.rating !== undefined) {
    const qualifies = prospect.rating >= 4 && (count ?? 0) >= 20;
    evidence.push(
      fact(
        qualifies
          ? `Rating ${prospect.rating} con al menos 20 reseñas.`
          : `Rating ${prospect.rating}${(count ?? 0) < 20 ? ", con menos de 20 reseñas" : ""}.`,
        ["prospect.rating", "prospect.userRatingCount"],
        "signals",
        qualifies ? 5 : 0
      )
    );
  }
  return evidence;
}

function unknownsFor(prospect: Prospect): string[] {
  const missing: string[] = [];
  if (!prospect.phone) missing.push("Teléfono: no está disponible.");
  if (!prospect.website) missing.push("Sitio web: no está disponible.");
  if (prospect.rating === undefined) missing.push("Rating: no está disponible.");
  if (prospect.userRatingCount === undefined) missing.push("Cantidad de reseñas: no está disponible.");
  if (prospect.primaryType === undefined) missing.push("Tipo principal del negocio: no está disponible.");
  if (prospect.phone || prospect.website) missing.push("Si el teléfono o el sitio web publicados están activos.");
  return [...missing, ...ALWAYS_UNKNOWN];
}

function summaryFor(
  score: number,
  priority: ProspectPriority,
  evidence: QualificationEvidence[],
  prospect: Prospect
): string {
  const relevanceSources = evidence
    .filter((item) => item.criterion === "relevance" && item.points > 0)
    .map((item) => (item.basedOn.includes("prospect.name") ? "el nombre" : "el tipo de negocio"));
  const relevance =
    relevanceSources.length > 0
      ? `coincide textualmente con la categoría buscada en ${relevanceSources.join(" y ")}`
      : "sin coincidencia textual con la categoría buscada";

  const contact =
    prospect.phone && prospect.website
      ? "teléfono y sitio web disponibles"
      : prospect.phone
        ? "teléfono disponible, sin sitio web"
        : prospect.website
          ? "sitio web disponible, sin teléfono"
          : "sin teléfono ni sitio web publicados";

  return `Prioridad ${PRIORITY_LABEL[priority]} (${score}/100): ${relevance}; ${contact}.`;
}

/** Califica un único prospecto. Pura: no muta `prospect` ni depende de nada externo. */
export function qualifyProspect(prospect: Prospect, answers: QualificationAnswers): QualifiedProspect {
  const evidence = [
    ...relevanceEvidence(prospect, answers),
    locationEvidence(prospect, answers),
    ...contactEvidence(prospect),
    completenessEvidence(prospect),
    ...signalsEvidence(prospect),
  ];

  // El breakdown se deriva de la evidencia (solo puntos de hechos), nunca
  // al revés: el score no puede tener un número que la evidencia no explique.
  const breakdown: QualificationBreakdown = {
    relevance: 0,
    location: 0,
    contact: 0,
    completeness: 0,
    signals: 0,
  };
  for (const item of evidence) {
    if (item.source === "fact" && item.criterion) breakdown[item.criterion] += item.points;
  }

  const score = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  const priority = priorityFromScore(score);

  const qualification: ProspectQualification = {
    score,
    priority,
    breakdown,
    evidence,
    unknowns: unknownsFor(prospect),
    summary: summaryFor(score, priority, evidence, prospect),
  };

  return { ...prospect, qualification };
}

/**
 * Califica y ordena prospectos reales: score descendente → más canales de
 * contacto → orden original de Google. No descarta ninguno: la calificación
 * prioriza, no oculta resultados.
 */
export function qualifyProspects(prospects: Prospect[], answers: QualificationAnswers): QualifiedProspect[] {
  return prospects
    .map((prospect, index) => ({ qualified: qualifyProspect(prospect, answers), index }))
    .sort(
      (a, b) =>
        b.qualified.qualification.score - a.qualified.qualification.score ||
        contactChannels(b.qualified) - contactChannels(a.qualified) ||
        a.index - b.index
    )
    .map(({ qualified }) => qualified);
}
