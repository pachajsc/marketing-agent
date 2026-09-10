// Definición del cuestionario guiado (Paso 1) como datos, no como JSX.
//
// La idea: cada pregunta se declara una sola vez acá (label, tipo de input,
// si es obligatoria, si depende de una rama B2B/B2C, etc.) y tanto el wizard
// como el resumen final leen de esta misma fuente. Así evitamos duplicar la
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
  placeholder?: string;
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

export const questionnaireSteps: QuestionnaireStepDef[] = [
  {
    id: "product",
    title: "Tu producto o servicio",
    fields: [
      {
        id: "offering",
        type: "text",
        label: "¿Qué producto o servicio ofrecés?",
        placeholder: "Ej: contabilidad para pequeñas empresas",
        required: true,
      },
      {
        id: "mainGoal",
        type: "choice",
        label: "¿Qué querés conseguir principalmente con este producto o servicio?",
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
      {
        id: "problem",
        type: "textarea",
        label: "¿Qué problema o necesidad resuelve?",
        required: true,
      },
      {
        id: "businessType",
        type: "choice",
        label: "¿Le vendés a otras empresas (B2B) o a consumidores finales (B2C)?",
        required: true,
        options: [
          { value: "b2b", label: "Empresas (B2B)" },
          { value: "b2c", label: "Consumidores finales (B2C)" },
        ],
      },
      {
        id: "priceRange",
        type: "text",
        label: "¿Cuál es el precio o ticket promedio? (opcional)",
        placeholder: "Ej: $50.000 por mes",
        required: false,
      },
    ],
  },
  {
    id: "customer-status",
    title: "Tu cliente hoy",
    fields: [
      {
        id: "hasCustomersToday",
        type: "choice",
        label: "¿Ya le vendés a alguien hoy?",
        required: true,
        options: [
          { value: "yes", label: "Sí" },
          { value: "no", label: "No" },
          { value: "unsure", label: "No estoy seguro" },
        ],
      },
      {
        id: "idealCustomerDescription",
        type: "textarea",
        label: (answers) =>
          answers.hasCustomersToday === "yes"
            ? "Describí brevemente a tu cliente típico actual"
            : "¿A quién te imaginás vendiéndole?",
        required: false,
      },
    ],
  },
  {
    id: "customer-profile",
    title: "Perfil de cliente ideal",
    fields: [
      {
        id: "businessCategoryToTarget",
        type: "text",
        label: "¿Qué tipo de negocio sería tu cliente ideal?",
        placeholder: "Ej: gimnasios, estudios contables",
        required: (answers) => answers.businessType === "b2b",
        visibleIf: (answers) => answers.businessType === "b2b",
      },
      {
        id: "idealCustomerTraits",
        type: "textarea",
        label: "¿Qué características tiene tu cliente ideal?",
        placeholder: "Edad, situación, intereses...",
        required: false,
        visibleIf: (answers) => answers.businessType === "b2c",
      },
    ],
  },
  {
    id: "market",
    title: "Zona de adquisición",
    fields: [
      {
        id: "targetArea",
        type: "text",
        label: "¿Dónde querés conseguir nuevos clientes?",
        placeholder: "Ej: Ciudad de Buenos Aires, zona norte del GBA",
        required: true,
      },
    ],
  },
  {
    id: "competition",
    title: "Competencia",
    fields: [
      {
        id: "knownCompetitors",
        type: "textarea",
        label: "¿Conocés competidores directos? Nombralos si querés",
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
