// Definición del cuestionario guiado (Paso 1) como datos, no como JSX.
//
// La idea: cada pregunta se declara una sola vez acá (label, tipo de input,
// si es obligatoria, ejemplo, ayuda adicional, etc.) y tanto el wizard como
// el resumen final leen de esta misma fuente. Así evitamos duplicar la
// lógica de "qué se ve" y "qué es obligatorio" en varios componentes.

import type { QuestionnaireAnswers } from "./types";

export type FieldType = "text" | "textarea" | "choice";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionFieldDef {
  /** Debe coincidir con una clave de QuestionnaireAnswers. */
  id: keyof QuestionnaireAnswers;
  /** Texto fijo, o una función si el enunciado cambia según respuestas previas. */
  label: string | ((answers: Partial<QuestionnaireAnswers>) => string);
  type: FieldType;
  /** Ejemplo de respuesta, visible dentro del input mientras está vacío. Solo aplica a "text"/"textarea". */
  placeholder?: string;
  /**
   * Ayuda adicional (por qué preguntamos esto, cómo interpretarlo, o un
   * ejemplo cuando el campo no tiene placeholder por ser "choice").
   * Se muestra detrás de un ícono informativo, no ocupa espacio fijo.
   */
  helpText?: string;
  /** Solo para type "choice". */
  options?: QuestionOption[];
  /** Booleano fijo, o condicional (ej: obligatorio solo si es B2B). */
  required?: boolean | ((answers: Partial<QuestionnaireAnswers>) => boolean);
  /** Si no está definido, el campo siempre es visible dentro de su paso. */
  visibleIf?: (answers: Partial<QuestionnaireAnswers>) => boolean;
}

export interface QuestionnaireStepDef {
  id: string;
  title: string;
  description?: string;
  fields: QuestionFieldDef[];
}

// Orden del producto (Fase 10): ¿Qué vendés? → ¿A quién? → ¿Dónde? →
// contexto opcional. Mismos campos y mismas reglas que antes; solo cambia
// en qué paso aparece cada uno.
export const questionnaireSteps: QuestionnaireStepDef[] = [
  {
    id: "offering",
    title: "¿Qué vendés?",
    fields: [
      {
        id: "offering",
        type: "text",
        label: "¿Qué producto o servicio ofrecés?",
        placeholder: "Ej: plataforma para organizar eventos de pádel",
        required: true,
      },
      {
        id: "problem",
        type: "textarea",
        label: "¿Qué problema concreto resolvés o qué necesidad cubre tu producto o servicio?",
        placeholder: "Ej: los clubes tardan mucho tiempo en organizar las inscripciones y pagos de sus torneos",
        required: true,
      },
      {
        id: "mainGoal",
        type: "choice",
        label: "¿Qué querés lograr principalmente con este producto o servicio?",
        helpText: "Ej: conseguir mis primeros clientes durante el próximo mes.",
        required: true,
        options: [
          { value: "first_customers", label: "Conseguir mis primeros clientes" },
          { value: "increase_sales", label: "Aumentar mis ventas actuales" },
          { value: "recurring_customers", label: "Conseguir clientes recurrentes" },
          {
            value: "higher_value_upsell",
            label: "Vender servicios de mayor valor a los clientes que ya tengo",
          },
        ],
      },
    ],
  },
  {
    id: "target",
    title: "¿A quién querés venderle?",
    fields: [
      {
        id: "businessCategoryToTarget",
        type: "text",
        label: "¿Qué tipo de negocios, profesionales o personas querés encontrar para ofrecerles tu producto?",
        placeholder: "Ej: clubes de pádel, organizadores de torneos, complejos deportivos",
        helpText:
          "Una categoría corta: es lo que vamos a usar para encontrarte prospectos reales cerca de la zona que elijas.",
        required: true,
      },
      {
        id: "businessType",
        type: "choice",
        label: "¿A quién le vendés?",
        required: true,
        options: [
          { value: "b2c", label: "Personas (B2C)" },
          { value: "b2b", label: "Empresas (B2B)" },
        ],
      },
      // "¿Quién es el cliente ideal? Describilo" se sacó del formulario: en la
      // práctica se respondía igual que la categoría de arriba. El campo
      // (idealCustomerDescription) sigue siendo opcional en QuestionnaireAnswers,
      // así que los perfiles que ya lo tienen no pierden el dato.
    ],
  },
  {
    id: "where",
    title: "¿Dónde?",
    fields: [
      {
        id: "targetArea",
        type: "text",
        label: "¿En qué zona querés conseguir clientes?",
        placeholder: "Ej: Ciudad de Buenos Aires",
        helpText:
          "Puede ser una ciudad, una región o un país (ej: \"Buenos Aires y alrededores\", \"Argentina\", \"Estados Unidos\"). Contanos un lugar geográfico, no un canal — no \"Instagram\" o \"redes sociales\".",
        required: true,
      },
      {
        id: "hasCustomersToday",
        type: "choice",
        label: "¿Ya tenés clientes actualmente?",
        required: true,
        // Si el objetivo es conseguir los primeros clientes, la respuesta ya
        // está dada ("No, todavía no"): no se pregunta y se completa sola
        // (ver applyImpliedAnswers).
        visibleIf: (answers) => answers.mainGoal !== "first_customers",
        options: [
          { value: "none", label: "No, todavía no" },
          { value: "some", label: "Sí, algunos" },
          { value: "stable", label: "Sí, tengo una base de clientes estable" },
        ],
      },
    ],
  },
  {
    id: "context",
    title: "Contexto (opcional)",
    fields: [
      {
        id: "knownCompetitors",
        type: "textarea",
        label: "¿Conocés productos o servicios similares que tus clientes podrían elegir en lugar del tuyo?",
        placeholder: "Ej: Canva, Wix y agencias de diseño web (o \"no conozco competidores directos\")",
        required: false,
      },
      {
        id: "priceRange",
        type: "text",
        label: "¿Cuánto cobrás o cuánto pensás cobrar por tu producto o servicio?",
        placeholder: "Ej: USD 300 por sitio web (o \"todavía no definí el precio\")",
        required: false,
      },
    ],
  },
];

export function resolveLabel(
  field: QuestionFieldDef,
  answers: Partial<QuestionnaireAnswers>
): string {
  return typeof field.label === "function" ? field.label(answers) : field.label;
}

export function isFieldVisible(
  field: QuestionFieldDef,
  answers: Partial<QuestionnaireAnswers>
): boolean {
  return field.visibleIf ? field.visibleIf(answers) : true;
}

export function isFieldRequired(
  field: QuestionFieldDef,
  answers: Partial<QuestionnaireAnswers>
): boolean {
  return typeof field.required === "function" ? field.required(answers) : !!field.required;
}

export function getVisibleFields(
  step: QuestionnaireStepDef,
  answers: Partial<QuestionnaireAnswers>
): QuestionFieldDef[] {
  return step.fields.filter((field) => isFieldVisible(field, answers));
}

function hasValue(answers: Partial<QuestionnaireAnswers>, id: keyof QuestionnaireAnswers): boolean {
  const value = answers[id];
  return typeof value === "string" && value.trim().length > 0;
}

/** Un paso es válido si todo campo visible y obligatorio tiene un valor cargado. */
export function isStepValid(
  step: QuestionnaireStepDef,
  answers: Partial<QuestionnaireAnswers>
): boolean {
  return getVisibleFields(step, answers).every(
    (field) => !isFieldRequired(field, answers) || hasValue(answers, field.id)
  );
}

/**
 * Completa las respuestas que se deducen de otras, para no preguntarlas dos
 * veces: con el objetivo "Conseguir mis primeros clientes", "¿Ya tenés
 * clientes?" es "No, todavía no". Si el objetivo cambia a otro, la pregunta
 * vuelve a aparecer con ese valor precargado y se puede corregir.
 */
export function applyImpliedAnswers(answers: Partial<QuestionnaireAnswers>): Partial<QuestionnaireAnswers> {
  if (answers.mainGoal === "first_customers" && answers.hasCustomersToday !== "none") {
    return { ...answers, hasCustomersToday: "none" };
  }
  return answers;
}

/** Un paso es alcanzable si todos los anteriores están completos (para el stepper). */
export function isStepReachable(index: number, answers: Partial<QuestionnaireAnswers>): boolean {
  return questionnaireSteps.slice(0, index).every((step) => isStepValid(step, answers));
}

/** Avance según preguntas obligatorias visibles ya respondidas (0–100). */
export function completionPercent(answers: Partial<QuestionnaireAnswers>): number {
  const required = questionnaireSteps.flatMap((step) =>
    getVisibleFields(step, answers).filter((field) => isFieldRequired(field, answers))
  );
  if (required.length === 0) return 100;
  const answered = required.filter((field) => hasValue(answers, field.id)).length;
  return Math.round((answered / required.length) * 100);
}
