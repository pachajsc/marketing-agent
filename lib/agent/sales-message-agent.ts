// Sales Message Agent — Fase 8.
//
// QualifiedProspect + QuestionnaireAnswers + MarketingStrategy
//   → buildSalesMessageContext()   (código: datos permitidos, cada uno con un id)
//   → UNA llamada a Claude con Structured Output (SalesMessageDraftSchema)
//   → validateSalesMessageDraft()  (código: factualidad, no solo prompt)
//   → SalesMessage
//
// Claude personaliza, pero no puede inventar: cada afirmación del mensaje
// tiene que citar por id los datos del contexto en los que se apoya, y el
// código rechaza el mensaje entero si:
//   - cita un id que no existe en el contexto;
//   - afirma algo sobre el prospecto citando algo que no sea un hecho real
//     del Prospect (Google Places) o evidencia "fact" de su qualification;
//   - el fragmento citado o el CTA no aparecen literalmente en el mensaje;
//   - contiene un número que no está en los datos (métricas, precios, %);
//   - usa frases de presión/promesas, o le atribuye al prospecto
//     necesidades, problemas o búsquedas que no conocemos.
// Los supuestos (assumption) de la estrategia ni siquiera entran al
// contexto: no pueden citarse.
//
// No envía nada: solo redacta. La generación es bajo demanda (un click en
// la UI = una llamada a Claude, sin reintentos automáticos).
//
// "server-only": misma barrera que los otros agentes — ANTHROPIC_API_KEY
// nunca puede llegar al navegador.
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  SalesMessageDraftSchema,
  SalesMessageSchema,
  type ClaimSource,
  type MarketingStrategy,
  type QualifiedProspect,
  type QuestionnaireAnswers,
  type SalesMessage,
  type SalesMessageClaim,
  type SalesMessageDraft,
} from "@/lib/types";

const client = new Anthropic();

const MODEL = "claude-opus-5";

// Un mensaje de WhatsApp de primer contacto: corto. Margen sobre lo que pide
// el prompt (~500) para no rechazar por unos pocos caracteres.
const MAX_MESSAGE_LENGTH = 700;

/** El mensaje generado no pasó la validación de factualidad del código. */
export class SalesMessageValidationError extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super(`El mensaje generado no pasó la validación: ${violations.join(" | ")}`);
    this.name = "SalesMessageValidationError";
    this.violations = violations;
  }
}

type ContextGroup = "prospect" | "questionnaire" | "strategy" | "qualification";

/** Un dato que Claude puede citar. `source` es la procedencia que ya traía en el sistema. */
export interface SalesContextItem {
  id: string;
  group: ContextGroup;
  source: ClaimSource;
  text: string;
}

export interface SalesMessageContext {
  items: SalesContextItem[];
  /** Lo que no sabemos del prospecto — nunca se puede afirmar. */
  unknowns: string[];
  /** Resumen de la qualification. Contexto para el tono; no es citable ni una probabilidad. */
  qualificationSummary: string;
}

const BUSINESS_TYPE_LABEL: Record<QuestionnaireAnswers["businessType"], string> = {
  b2b: "le vende a empresas/negocios (B2B)",
  b2c: "le vende a consumidores finales (B2C)",
};

// Secciones de la estrategia que sirven para describir el producto en un
// primer contacto. Canales, estrategia inicial y próxima acción son planes
// internos del usuario: no tienen lugar en un mensaje al prospecto.
const STRATEGY_SECTIONS = ["valueProposition", "idealCustomerProfile", "problemOrNeed"] as const;

/**
 * Arma el contexto permitido. Solo incluye campos que existen; los supuestos
 * de la estrategia quedan afuera. knownCompetitors, mainGoal y
 * hasCustomersToday no entran: son información interna del usuario, no
 * material para un mensaje al prospecto.
 */
export function buildSalesMessageContext(
  prospect: QualifiedProspect,
  answers: QuestionnaireAnswers,
  strategy: MarketingStrategy
): SalesMessageContext {
  const items: SalesContextItem[] = [];
  const add = (id: string, group: ContextGroup, source: ClaimSource, text: string | undefined) => {
    if (text !== undefined && text.trim() !== "") items.push({ id, group, source, text: text.trim() });
  };

  add("prospect.name", "prospect", "fact", prospect.name);
  add("prospect.address", "prospect", "fact", prospect.address);
  add("prospect.phone", "prospect", "fact", prospect.phone);
  add("prospect.website", "prospect", "fact", prospect.website);
  add("prospect.rating", "prospect", "fact", prospect.rating?.toString());
  add("prospect.userRatingCount", "prospect", "fact", prospect.userRatingCount?.toString());
  add("prospect.primaryType", "prospect", "fact", prospect.primaryType);
  add("prospect.types", "prospect", "fact", prospect.types?.join(", "));
  add("prospect.mapsUrl", "prospect", "fact", prospect.mapsUrl);

  add("answers.offering", "questionnaire", "fact", answers.offering);
  add("answers.problem", "questionnaire", "fact", answers.problem);
  add("answers.businessType", "questionnaire", "fact", BUSINESS_TYPE_LABEL[answers.businessType]);
  add("answers.idealCustomerDescription", "questionnaire", "fact", answers.idealCustomerDescription);
  add("answers.businessCategoryToTarget", "questionnaire", "fact", answers.businessCategoryToTarget);
  // Se aclara qué significa: es dónde el usuario BUSCA clientes, no dónde
  // está él (en la validación real, Claude lo usó como "les escribo desde
  // acá, en Córdoba").
  add(
    "answers.targetArea",
    "questionnaire",
    "fact",
    answers.targetArea?.trim() ? `Zona donde el usuario busca clientes: ${answers.targetArea.trim()}` : undefined
  );
  add("answers.priceRange", "questionnaire", "fact", answers.priceRange);

  for (const section of STRATEGY_SECTIONS) {
    strategy[section].forEach((claim, index) => {
      if (claim.source !== "assumption") {
        add(`strategy.${section}.${index}`, "strategy", claim.source, claim.text);
      }
    });
  }

  prospect.qualification.evidence.forEach((evidence, index) => {
    if (evidence.source !== "assumption") {
      add(`qualification.evidence.${index}`, "qualification", evidence.source, evidence.text);
    }
  });

  const { score, priority } = prospect.qualification;
  return {
    items,
    unknowns: prospect.qualification.unknowns,
    qualificationSummary: `Prioridad de prospección ${priority} (${score}/100), calculada con señales observables. No es una probabilidad de conversión.`,
  };
}

const SYSTEM_PROMPT = `Sos un redactor comercial. Escribís UN mensaje de primer contacto, en español rioplatense, para que el usuario lo copie y lo mande por WhatsApp a un negocio concreto. Vos no enviás nada.

Recibís una lista de DATOS, cada uno con un id entre corchetes. Es la ÚNICA información que existe. No uses conocimiento externo sobre el negocio, la zona ni el rubro.

Reglas estrictas:
1. Personalizá para ESTE negocio con lo que lo distingue en la sección PROSPECTO: lo que dice su nombre, su rubro según Google, su calle o zona, si tiene sitio web. Elegí UN ángulo; no arranques siempre por el rating o las reseñas, no repitas mecánicamente todos los datos ni uses una fórmula fija. Sin elogios ni exageraciones ("un golazo", "increíble").
2. Sobre el prospecto, solo afirmá hechos de la sección PROSPECTO o evidencia [fact] de CALIFICACIÓN. Nunca le atribuyas problemas, necesidades, intenciones, búsquedas, procesos actuales, herramientas, métricas, cantidad de canchas/clientes/eventos/reservas, facturación, crecimiento ni planes. Si no está en los datos, no existe.
3. Lo que el producto ofrece describilo con CUESTIONARIO o ESTRATEGIA, como propuesta general ("ayuda a organizar..."), nunca como algo que el prospecto necesita. No copies slogans de la estrategia, y no menciones herramientas o formas de trabajo que el producto reemplazaría (planillas, papel, mensajes sueltos, grupos de WhatsApp, "a mano"): eso insinúa cómo trabaja hoy el prospecto, y no lo sabemos. No le agregues al producto características que no estén en los datos (ej: "todo en un mismo lugar", "automático", "en minutos"), ni integraciones con el sitio, las redes o los sistemas del prospecto ("se puede sumar a su web", "se integra con...").
3b. No afirmes nada sobre clientes, usuarios, adopción o trayectoria del producto ("estamos sumando clubes", "ya lo usan", "trabajamos con..."): no hay datos de eso.
3c. No digas que entraste, visitaste, leíste o revisaste su sitio, redes o reseñas: solo sabemos que existen ("tienen sitio web", "figuran en Google").
3d. No sabés dónde está ni quién es el remitente: no escribas "desde acá", "acá en...", "estoy en..." ni "somos de...". La zona del CUESTIONARIO es dónde busca clientes, no dónde está.
4. Lo listado en NO SABEMOS no se puede afirmar ni insinuar.
5. No menciones el score ni la prioridad. Nunca hables de probabilidades.
6. Sin precios, descuentos, promociones, garantías, urgencia, porcentajes ni promesas de resultados o de tiempo ("en dos minutos"). No escribas números, ni en cifras ni en palabras, salvo que estén literalmente en los datos.
7. Formato WhatsApp: saludo breve, motivo del contacto, una personalización real, la propuesta en una frase, y un CTA final de baja fricción en forma de pregunta, con tus propias palabras (por ejemplo ofrecer mostrar cómo funciona o compartir un ejemplo). Máximo ~500 caracteres, sin listas, como mucho un emoji. Tono humano, no corporativo.

Salida:
- "message": el mensaje completo.
- "cta": la pregunta final, copiada EXACTAMENTE como aparece en "message".
- "claims": cada afirmación concreta del mensaje (sobre el prospecto o sobre el producto), con:
  - "quote": el fragmento copiado EXACTAMENTE del mensaje;
  - "about": "prospect" o "offering";
  - "basedOn": los ids de los datos que la respaldan.
  Saludo y CTA no son claims. Si una afirmación no se puede respaldar con ids, sacala del mensaje.`;

function buildPrompt(context: SalesMessageContext): string {
  const section = (title: string, group: ContextGroup) => {
    const lines = context.items
      .filter((item) => item.group === group)
      .map((item) => `[${item.id}] (${item.source}) ${item.text}`);
    return [title, ...(lines.length > 0 ? lines : ["(sin datos)"])].join("\n");
  };

  return [
    section("PROSPECTO (datos reales de Google Places):", "prospect"),
    section("CUESTIONARIO (lo que el usuario contó de su propio producto):", "questionnaire"),
    section("ESTRATEGIA (generada antes; solo describe el producto y su mercado en general, no a este prospecto):", "strategy"),
    section("CALIFICACIÓN (evidencia sobre este prospecto):", "qualification"),
    context.qualificationSummary,
    ["NO SABEMOS (prohibido afirmarlo):", ...context.unknowns.map((unknown) => `- ${unknown}`)].join("\n"),
    "Escribí el mensaje.",
  ].join("\n\n");
}

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

// Atribuciones al prospecto que nunca están respaldadas por los datos
// (Google Places no informa necesidades, búsquedas ni procesos internos).
const UNSUPPORTED_ATTRIBUTION_PATTERNS: RegExp[] = [
  // "Vi que tienen sitio web" es un hecho válido; "vi que necesitan..." no.
  /\b(vi|veo|noté|note|sé) que (necesit|les cuesta|buscan|gestionan|usan|quieren)/i,
  /\b(están|estan) (buscando|teniendo|necesitando)/i,
  /\b(tienen|tenés|tenes) (problemas|dificultades|inconvenientes)/i,
  /\b(les cuesta|les está costando|les esta costando)/i,
  /\b(gestionan|manejan|organizan)\b[^.?!]*\b(a mano|manual|manualmente|por whatsapp|en papel|planillas?)\b/i,
  // Herramientas o procesos que el producto "reemplazaría": aunque se
  // formulen como propuesta ("sin planillas..."), insinúan cómo trabaja hoy
  // el prospecto. En la validación real esto entraba vía una inferencia de
  // la estrategia construida sobre un supuesto.
  /\b(planillas?|excel|papel|mensajes sueltos|grupos? de (whatsapp|mensajer[ií]a)|a mano|manualmente)\b/i,
];

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /%/, reason: "porcentaje" },
  { pattern: /garantiz/i, reason: "garantía" },
  { pattern: /última oportunidad|ultima oportunidad|solo por hoy|por tiempo limitado/i, reason: "urgencia falsa" },
  { pattern: /probabilidad/i, reason: "probabilidad" },
  { pattern: /\b(score|puntaje)\b/i, reason: "menciona la calificación" },
  // Cantidades escritas en palabras ("en dos minutos", "diez clubes"): el
  // chequeo de números solo ve cifras.
  {
    pattern:
      /\b(dos|tres|cuatro|cinco|diez|quince|veinte|treinta|cien|mil)\s+(minutos?|horas?|d[ií]as?|semanas?|meses|clubes|canchas|torneos|eventos|reservas|clientes|jugadores)\b/i,
    reason: "cantidad sin respaldo en los datos",
  },
  // Acciones del remitente que no ocurrieron: solo sabemos que el sitio,
  // las redes o las reseñas existen, no que alguien los haya visitado.
  {
    pattern:
      // \s (no \b) después del verbo: en JS \b no considera "é"/"í" como letras.
      /\b(entr[eé]|visit[eé]|revis[eé]|le[ií]|estuve viendo|estuve mirando)\s[^.?!]{0,20}\b(sitio|web|p[aá]gina|instagram|redes|perfil|rese[nñ]as)\b/i,
    reason: "afirma que se visitó el sitio, redes o reseñas",
  },
  // Integraciones del producto con lo que tiene el prospecto: no hay datos de
  // eso. Caso real (MVP, nicho dental): "Como ya tienen sitio web, se puede
  // sumar ahí" — el hecho citado era real, la integración no.
  {
    pattern:
      /\b(se (puede|podr[ií]a) (sumar|integrar|conectar|agregar|instalar|incorporar)|se integra|integraci[oó]n con|se conecta con)\b/i,
    reason: "promete una integración del producto que no está en los datos",
  },
  // Ubicación del remitente: no hay datos de dónde está el usuario
  // (targetArea es dónde busca clientes). Casos reales: "les escribo desde
  // acá, en Córdoba", "acá en la Ciudad de Buenos Aires".
  {
    // Lookahead (no \b al final): en JS \b no reconoce "á" como letra.
    pattern: /\b(desde ac[aá]|ac[aá] en|estoy en|estamos en|soy de|somos de)(?=[\s,.;:!?]|$)/i,
    reason: "afirma la ubicación del remitente sin datos",
  },
  // Tracción del producto: el contexto no tiene datos de clientes ni adopción.
  {
    pattern:
      /\b(estamos sumando|ya (lo |la )?(usan|utilizan)|trabajamos con|nuestros clientes|otros clubes (ya )?(usan|est[aá]n|se sumaron)|muchos clubes)\b/i,
    reason: "afirma clientes o adopción del producto sin datos",
  },
];

/**
 * Validación de factualidad en código (no depende del prompt). Devuelve la
 * lista de violaciones; vacía = el borrador es aceptable.
 */
export function validateSalesMessageDraft(draft: SalesMessageDraft, context: SalesMessageContext): string[] {
  const violations: string[] = [];
  const itemsById = new Map(context.items.map((item) => [item.id, item]));
  const message = normalizeText(draft.message);

  if (draft.message.length > MAX_MESSAGE_LENGTH) {
    violations.push(`mensaje demasiado largo (${draft.message.length} caracteres)`);
  }
  if (!message.includes(normalizeText(draft.cta))) {
    violations.push("el CTA no aparece en el mensaje");
  }
  if (!draft.cta.includes("?")) {
    violations.push("el CTA no es una pregunta");
  }

  for (const claim of draft.claims) {
    if (!message.includes(normalizeText(claim.quote))) {
      violations.push(`el fragmento "${claim.quote}" no aparece en el mensaje`);
    }
    for (const id of claim.basedOn) {
      const item = itemsById.get(id);
      if (!item) {
        violations.push(`"${claim.quote}" cita un dato inexistente (${id})`);
        continue;
      }
      if (item.source === "assumption") {
        violations.push(`"${claim.quote}" se apoya en un supuesto (${id})`);
      }
      const isProspectFact =
        item.source === "fact" && (item.group === "prospect" || item.group === "qualification");
      if (claim.about === "prospect" && !isProspectFact) {
        violations.push(`"${claim.quote}" afirma algo del prospecto sin un hecho real del prospecto (${id})`);
      }
    }
  }

  // Todo número del mensaje tiene que estar en los datos: sin métricas,
  // precios ni cantidades inventadas.
  const contextText = context.items.map((item) => item.text).join(" ").replace(/,/g, ".");
  for (const number of draft.message.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    if (!contextText.includes(number.replace(",", "."))) {
      violations.push(`número sin respaldo en los datos: ${number}`);
    }
  }

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(draft.message)) violations.push(`contenido no permitido: ${reason}`);
  }
  for (const pattern of UNSUPPORTED_ATTRIBUTION_PATTERNS) {
    if (pattern.test(draft.message)) {
      violations.push("le atribuye al prospecto una necesidad, problema o proceso que no conocemos");
    }
  }

  return violations;
}

/** Procedencia de un claim, derivada de lo que cita: nunca la declara Claude. */
function claimSource(basedOn: string[], context: SalesMessageContext): SalesMessageClaim["source"] {
  const cited = context.items.filter((item) => basedOn.includes(item.id));
  return cited.every((item) => item.source === "fact") ? "fact" : "inference";
}

/**
 * Genera un mensaje para un prospecto ya calificado. Exactamente una llamada
 * a Claude; si el resultado no pasa la validación, se rechaza (no se
 * reintenta automáticamente: el usuario decide si vuelve a generar).
 */
export async function runSalesMessageAgent(
  prospect: QualifiedProspect,
  answers: QuestionnaireAnswers,
  strategy: MarketingStrategy
): Promise<SalesMessage> {
  const context = buildSalesMessageContext(prospect, answers, strategy);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(context) }],
    output_config: {
      format: zodOutputFormat(SalesMessageDraftSchema),
      effort: "low",
    },
  });

  if (!response.parsed_output) {
    throw new SalesMessageValidationError([
      `Claude no devolvió un mensaje con el formato esperado (stop_reason: ${response.stop_reason})`,
    ]);
  }

  const draft = response.parsed_output;
  const violations = validateSalesMessageDraft(draft, context);
  if (violations.length > 0) throw new SalesMessageValidationError(violations);

  return SalesMessageSchema.parse({
    prospectId: prospect.mapsUrl,
    channel: "whatsapp",
    message: draft.message.trim(),
    cta: draft.cta.trim(),
    claims: draft.claims.map((claim) => ({
      quote: claim.quote,
      about: claim.about,
      source: claimSource(claim.basedOn, context),
      basedOn: claim.basedOn,
    })),
    unknowns: context.unknowns,
  });
}
